import { MathUtils } from '../../math/MathUtils';
import { ReadonlyFloat64Array } from '../../math/VecMath';
import { ArrayUtils } from './ArrayUtils';

/**
 * A linearly interpolated N-dimensional lookup table of vectors optimized for full-grid breakpoints.
 * 
 * The table linearly interpolates values using a set of defined breakpoints. Each breakpoint has one numeric key for
 * each table dimension (the ordered N-tuple of all dimension keys forms the full key for the breakpoint), as well as
 * one vector value. The full key of a breakpoint determines its position in N-dimensional space, and the value of a
 * breakpoint determines the value that is output by the table for a query point at the breakpoint's position. For
 * query points that lie "between" breakpoints, the output is interpolated. Each component of the output vector is
 * interpolated independently of the others.
 * 
 * The table does _not_ support extrapolation. When asked to get a value for which two surrounding breakpoints along a
 * dimension cannot be found, the value of the nearest breakpoint along that dimension will be selected.
 * 
 * The table supports breakpoints that are irregularly spaced along each dimension. However, only full-grid breakpoints
 * are supported for tables with more than one dimension. Breakpoints form a full grid if and only if the following
 * condition is satisfied: for any two table dimensions `m` and `n`, if there exists any breakpoint `X` with keys `a`
 * and `b` in dimensions `m` and `n`, respectively, and at least one other breakpoint `Y` with key `c != a` in
 * dimension `m`, then there must exist a breakpoint with key `c` in dimension `m` and `b` in dimension `n` (which may
 * or may not be `Y`).
 * 
 * The ordering of dimensions does not affect the output of the table for any query point.
 */
export class FullGridLerpVectorLookupTable {
  private readonly keys: readonly Float64Array[];
  private readonly values: readonly ReadonlyFloat64Array[];

  private readonly keyIndexFinders: readonly ((query: number) => number)[];

  private readonly boundsKeyIndexCache: Float64Array;
  private readonly boundsWeightCache: Float64Array;

  private readonly lookupBoundsCodes: readonly Float64Array[];
  private readonly lookupCache: Float64Array;

  /** The number of dimensions in this table. */
  public readonly dimensionCount: number;

  /** The length of the vectors in this table. */
  public readonly vectorLength: number;

  /* eslint-disable jsdoc/check-indentation */
  /**
   * Creates a new instance of FullGridLerpVectorLookupTable.
   * @param values The values of the breakpoints for the new table. The values should be ordered such that the value
   * for the breakpoint with full key `[k_1, k_2, ..., k_n]` is positioned at index
   * `k_1 * product(2) + k_2 * product(3) + ... + k_n-1 * product(n) + k_n`, where
   * `product(x) = count(x) * count(x + 1) * ... * count(n)` and `count(x)` is the number of keys in dimension `x`. If
   * not all breakpoint vector values are of the same length, then the length of the shortest vector will be used as
   * the length of the vectors output by the table.
   * @param keys The keys of the breakpoints for the new table. The keys should be organized into one array for each
   * table dimension, with each array containing the keys along its associated dimension.
   * @throws Error if any dimension has zero breakpoint keys or if the provided number of values does not match the
   * product of the number of keys in each dimension.
   * 
   * @example
   * // Creates a 2D table with the following breakpoints:
   * //
   * //                Dimension 2 
   * //                     0       1
   * //                 |----------------
   * //               0 | [0, 0]  [1, 1]
   * // Dimension 1   1 | [2, 2]  [3, 3]
   * //               2 | [4, 4]  [5, 5]
   * //
   * new FullGridLerpLookupTable(
   *   [
   *     new Float64Array([0, 0]),
   *     new Float64Array([1, 1]),
   *     new Float64Array([2, 2]),
   *     new Float64Array([3, 3]),
   *     new Float64Array([4, 4]),
   *     new Float64Array([5, 5]),
   *   ],
   *   [0, 1, 2],
   *   [0, 1]
   * );
   */
  public constructor(values: readonly ReadonlyFloat64Array[], ...keys: (readonly number[])[]) {
    let valueCount = 0;
    if (keys.length > 0) {
      valueCount = keys.reduce((outputCount, dimension, index) => {
        if (dimension.length === 0) {
          throw new Error(`FullGridLerpVectorLookupTable: dimension ${index} has zero breakpoint keys`);
        }

        return outputCount * dimension.length;
      }, 1);
    }

    if (valueCount !== values.length) {
      throw new Error(`FullGridLerpVectorLookupTable: number of values (${values.length}) does not match the expected number of values from the provided breakpoint keys (${valueCount})`);
    }

    this.dimensionCount = keys.length;

    // For each dimension, sort keys such that they appear in increasing order.

    const sortedKeyIndexes = keys.map(dimensionKeys => {
      const indexes = ArrayUtils.range(dimensionKeys.length);
      indexes.sort((a, b) => {
        return dimensionKeys[a] - dimensionKeys[b];
      });
      return new Float64Array(indexes);
    });

    // Store keys such that they appear in increasing order in each dimension.

    this.keys = keys.map((dimensionKeys, dimension) => {
      const indexes = sortedKeyIndexes[dimension];
      const sorted = new Float64Array(dimensionKeys.length);
      for (let i = 0; i < dimensionKeys.length; i++) {
        sorted[i] = dimensionKeys[indexes[i]];
      }
      return sorted;
    });

    // Store values such that their order matches the order of the sorted keys.

    let vectorLength = Infinity;
    const sortedValues: ReadonlyFloat64Array[] = [];
    sortedValues.length = valueCount;
    for (let sortedIndex = 0; sortedIndex < valueCount; sortedIndex++) {
      let unsortedIndex = 0;

      let mod = 1;
      for (let dimension = this.dimensionCount - 1; dimension >= 0; dimension--) {
        const dimensionSortedKeyIndexes = sortedKeyIndexes[dimension];

        const lastMod = mod;
        mod *= dimensionSortedKeyIndexes.length;

        const sortedDimensionIndex = Math.trunc((sortedIndex % mod) / lastMod);
        const unsortedDimensionIndex = dimensionSortedKeyIndexes[sortedDimensionIndex];

        unsortedIndex += unsortedDimensionIndex * lastMod;
      }

      const vector = values[unsortedIndex];
      sortedValues[sortedIndex] = vector;
      vectorLength = Math.min(vectorLength, vector.length);
    }
    this.values = sortedValues;
    // NOTE: There is guaranteed to be at least one value, so vectorLength will have a finite value at this point.
    this.vectorLength = vectorLength;

    // For each dimension, select one of two algorithms to search for query keys in that dimension: a linear algorithm
    // or binary search.

    this.keyIndexFinders = this.keys.map(dimensionKeys => {
      // The additional complexity of binary search typically outweighs the time-complexity benefits over linear search
      // for small array sizes. Therefore we will stick with linear search unless array size is larger than 20.
      if (dimensionKeys.length <= 20) {
        return this.findKeyIndexLinear.bind(this, dimensionKeys);
      } else {
        return this.findKeyIndexBinary.bind(this, dimensionKeys);
      }
    });

    this.boundsKeyIndexCache = new Float64Array(2 * this.dimensionCount);
    this.boundsWeightCache = new Float64Array(this.dimensionCount);

    // Pre-compute and cache a series of codes that describe how to look up all the bounding breakpoints for a query
    // point. Each code is an n-tuple of binary values (0 or 1), where n = the number of table dimensions, that
    // describes how to look up a single bounding breakpoint. A 0 means to use the lower bounding key in that
    // dimension, and a 1 means to use the upper bounding key.

    this.lookupBoundsCodes = ArrayUtils.create(2 ** this.dimensionCount, index => {
      const code = new Float64Array(this.dimensionCount);
      for (let dimension = 0; dimension < this.dimensionCount; dimension++) {
        const dimensionSize = 2 ** (this.dimensionCount - dimension - 1);
        code[dimension] = Math.trunc((index % (dimensionSize * 2)) / dimensionSize);
      }
      return code;
    });

    // The lookup cache needs to store 2^N (where N is the number of table dimensions) vectors, and each vector has
    // this.vectorLength components.
    this.lookupCache = new Float64Array((2 ** this.dimensionCount) * this.vectorLength);
  }
  /* eslint-enable jsdoc/check-indentation */

  /**
   * Finds the index of the first key in an array whose value is equal to a given query key. If no such key in the
   * array exists, then `-(index + 1)` is returned, where `index` is the index at which the query key would be found if
   * it were to be inserted in the array. This method uses a simple linear search to find the key.
   * @param keys The array in which to search for the query key. The array must be sorted such that all keys appear in
   * increasing order.
   * @param query The key for which to search.
   * @returns The index of the first key in the specified array whose value is equal to the query. If there is no such
   * key in the array, then `-(index + 1)` is returned, where `index` is the index at which the query would be found if
   * it were to be inserted in the array.
   */
  private findKeyIndexLinear(keys: Float64Array, query: number): number {
    let index: number;

    const len = keys.length;
    for (index = 0; index < len; index++) {
      const key = keys[index];
      if (query < key) {
        break;
      } else if (query === key) {
        return index;
      }
    }

    return -(index + 1);
  }

  /**
   * Finds the index of the first key in an array whose value is equal to a given query key. If no such key in the
   * array exists, then `-(index + 1)` is returned, where `index` is the index at which the query key would be found if
   * it were to be inserted in the array. This method uses binary search to find the key.
   * @param keys The array in which to search for the query key. The array must be sorted such that all keys appear in
   * increasing order.
   * @param query The key for which to search.
   * @returns The index of the first key in the specified array whose value is equal to the query. If there is no such
   * key in the array, then `-(index + 1)` is returned, where `index` is the index at which the query would be found if
   * it were to be inserted in the array.
   */
  private findKeyIndexBinary(keys: Float64Array, query: number): number {
    return ArrayUtils.binarySearch(keys, query, FullGridLerpVectorLookupTable.keyComparator);
  }

  /**
   * Looks up a vector in this table using a specified key. The returned vector will be linearly interpolated from
   * surrounding breakpoints if the key is not an exact match for any of the table's breakpoints.
   * @param out The vector to which to write the result.
   * @param key The lookup key, as an ordered N-tuple of numbers.
   * @returns The vector corresponding to the specified key.
   * @throws Error if this table has zero dimensions or the key has fewer dimensions than this table.
   */
  public get(out: Float64Array, ...key: number[]): Float64Array {
    if (this.dimensionCount === 0) {
      throw new Error('FullGridLerpVectorLookupTable::get(): cannot look up a key in a 0-dimensional table');
    }

    if (key.length < this.dimensionCount) {
      throw new Error(`FullGridLerpVectorLookupTable::get(): cannot look up a ${key.length}-dimensional key in a ${this.dimensionCount}-dimensional table`);
    }

    // Only process the vector components that can fit in the output vector.
    const vectorLength = Math.min(this.vectorLength, out.length);

    if (vectorLength === 0) {
      return out;
    }

    // For each dimension, find the breakpoint keys that bound the query key on either side. Then find the weight
    // assigned to the query key along each dimension. The weight determines how the value of the query is interpolated
    // along the dimension, with 0 indicating the value should take the value of the lower bounding breakpoint and 1
    // indicating the value should take the value of the upper bounding breakpoint.

    for (let dimension = 0; dimension < this.dimensionCount; dimension++) {
      const dimensionKeys = this.keys[dimension];
      const dimensionKey = key[dimension];

      // Store the index of the lower bounding key in the cache at index (dimension * 2) and store the index of the
      // upper bounding key at index (dimension * 2 + 1).
      const boundsCacheIndex = 2 * dimension;

      const keyIndex = this.keyIndexFinders[dimension](dimensionKey);
      if (keyIndex >= 0) {
        // There is a breakpoint key that equals the query key. Therefore we set *both* bounding keys to be the
        // matching breakpoint key.
        this.boundsKeyIndexCache[boundsCacheIndex] = this.boundsKeyIndexCache[boundsCacheIndex + 1] = keyIndex;
        this.boundsWeightCache[dimension] = 0;
      } else {
        // There is no breakpoint key that equals the query key. Therefore we set the lower bounding key to be the
        // largest breakpoint key that is less than the query and the upper bounding key to be the smallest breakpoint
        // key that is greater than the query.

        // We will clamp the selected keys such that we don't attempt to select an out-of-bounds key. This will ensure
        // that if the query key is less than all existing keys, then both the upper and lower bounding keys will be
        // the smallest breakpoint key, and if the query key is greater than all existing keys, then both bounding keys
        // will be the largest breakpoint key. Note that there is guaranteed to be at least one breakpoint key in each
        // dimension, so we can always succesfully select the bounding keys.

        const keysLen = dimensionKeys.length;
        const lowerIndex = MathUtils.clamp(-keyIndex - 2, 0, keysLen - 1);
        const upperIndex = MathUtils.clamp(-keyIndex - 1, 0, keysLen - 1);

        this.boundsKeyIndexCache[boundsCacheIndex] = lowerIndex;
        this.boundsKeyIndexCache[boundsCacheIndex + 1] = upperIndex;

        if (upperIndex === lowerIndex) {
          this.boundsWeightCache[dimension] = 0;
        } else {
          this.boundsWeightCache[dimension] = MathUtils.lerp(
            dimensionKey,
            dimensionKeys[lowerIndex], dimensionKeys[upperIndex],
            0, 1,
            true, true
          );
        }
      }
    }

    // Populate the lookup cache with the values of all 2^N bounding breakpoints for the query.

    const codeCount = this.lookupBoundsCodes.length;
    for (let i = 0; i < codeCount; i++) {
      const code = this.lookupBoundsCodes[i];

      const vector = this.getBoundsBreakpointValue(this.boundsKeyIndexCache, code);

      const lookupCacheIndex = i * vectorLength;
      for (let vectorIndex = 0; vectorIndex < vectorLength; vectorIndex++) {
        this.lookupCache[lookupCacheIndex + vectorIndex] = vector[vectorIndex];
      }
    }

    // For each dimension starting with the last, interpolate each of the 2^(n+1) (where n = dimension index) pairs of
    // values along that dimension, and store the resulting 2^n interpolated values in the lookup cache so they can be
    // used as the interpolation inputs of the next dimension to be iterated. After all dimensions have been iterated,
    // the final interpolated value for the query is stored at index 0 in the lookup cache.

    let step = 2;
    for (let dimension = this.dimensionCount - 1; dimension >= 0; dimension--) {
      const count = this.lookupBoundsCodes.length / step;
      const weight = this.boundsWeightCache[dimension];

      for (let i = 0; i < count; i++) {
        const lookupCacheLowerIndex = i * step * vectorLength;
        const lookupCacheUpperIndex = (i + 0.5) * step * vectorLength;

        for (let vectorIndex = 0; vectorIndex < vectorLength; vectorIndex++) {
          const lower = this.lookupCache[lookupCacheLowerIndex + vectorIndex];
          const upper = this.lookupCache[lookupCacheUpperIndex + vectorIndex];
          this.lookupCache[lookupCacheLowerIndex + vectorIndex] = lower + (upper - lower) * weight;
        }
      }

      step *= 2;
    }

    for (let vectorIndex = 0; vectorIndex < vectorLength; vectorIndex++) {
      out[vectorIndex] = this.lookupCache[vectorIndex];
    }

    return out;
  }

  /**
   * Gets the value of a bounding breakpoint.
   * @param boundsKeyIndexes An array containing the indexes of the bounding breakpoint keys in each table dimension.
   * The index of the lower bounding key for dimension `d` is located at index `d * 2` in the array, and the index of
   * the upper bounding key is located at index `d * 2 + 1`.
   * @param boundsCode A code describing the bounding breakpoint for which to retrieve the value. The code is an
   * n-tuple of binary values (0 or 1), where n is the number of table dimensions. For each dimension, a 0 indicates
   * the lower bounding key in that dimension should be used, and a 1 indicates the upper bounding key should be used.
   * @returns The value of the specified bounding breakpoints.
   */
  private getBoundsBreakpointValue(boundsKeyIndexes: Float64Array, boundsCode: Float64Array): ReadonlyFloat64Array {
    let valueIndex = 0;
    let mod = 1;

    for (let dimension = this.dimensionCount - 1; dimension >= 0; dimension--) {
      valueIndex += boundsKeyIndexes[dimension * 2 + boundsCode[dimension]] * mod;

      mod *= this.keys[dimension].length;
    }

    return this.values[valueIndex];
  }

  /**
   * Compares two breakpoint keys and returns a number indicating their relative numeric ordering.
   * @param a The first breakpoint key to compare.
   * @param b The second breakpoint key to compare.
   * @returns A positive number if the first key is greater than the second, a negative number if the first key is less
   * than the second, or 0 if both keys are equal.
   */
  private static keyComparator(a: number, b: number): number {
    return a - b;
  }
}
