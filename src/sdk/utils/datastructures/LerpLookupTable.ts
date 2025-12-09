import { MathUtils } from '../../math/MathUtils';
import { SortedArray } from './SortedArray';

/**
 * A lookup table breakpoint in a single dimension.
 */
type DimensionalBreakpoint = {
  /** The key of this breakpoint. */
  key: number,

  /** A sorted array of dimensional breakpoints, that fall under this breakpoint, in the next lower dimension. */
  array?: SortedArray<DimensionalBreakpoint>;

  /** The value of this breakpoint, if this breakpoint is in the lowest dimension. */
  value?: number;
};

/**
 * A linearly interpolated N-dimensional lookup table.
 * 
 * The table linearly interpolates numeric values using a set of defined breakpoints. Each breakpoint has one numeric
 * key for each table dimension (the ordered N-tuple of all dimension keys forms the full key for the breakpoint), as
 * well as one numeric value. The full key of a breakpoint determines its position in N-dimensional space, and the
 * value of a breakpoint determines the value that is output by the table for a query point at the breakpoint's
 * position. For query points that lie "between" breakpoints, the output is interpolated.
 * 
 * The table does _not_ support extrapolation. When asked to get a value for which two surrounding breakpoints along a
 * dimension cannot be found, the value of the nearest breakpoint along that dimension will be selected.
 * 
 * The table supports breakpoints that are irregularly spaced along each dimension. Sparse-grid breakpoints are
 * supported for tables with more than one dimension. Breakpoints form a sparse grid if and only if the following
 * condition is _not_ satisfied: for any two table dimensions `m` and `n`, if there exists any breakpoint `X` with keys
 * `a` and `b` in dimensions `m` and `n`, respectively, and at least one other breakpoint `Y` with key `c != a` in
 * dimension `m`, then there must exist a breakpoint with key `c` in dimension `m` and `b` in dimension `n` (which may
 * or may not be `Y`).
 * 
 * For non-sparse-grid (full-grid) breakpoints, the table outputs values consistent with standard linear, bilinear,
 * trilinear, etc., interpolation. In this case the ordering of dimensions does not affect the output.
 * 
 * For sparse-grid breakpoints, the ordering of dimensions does affect the output. The algorithm for interpolating a
 * value in the sparse-grid case is as follows. Breakpoints are grouped into a series of nested buckets, with one level
 * per table dimension. The first level of buckets groups all breakpoints by their keys in dimension 1 (all breakpoints
 * with key `a` in dimension 1 are grouped into bucket `a`, breakpoints with key `b` are grouped into bucket `b`,
 * etc.). The second level of buckets groups all breakpoints within each first-level bucket by their keys in dimension
 * 2, and so on. When a value lookup is requested for a query point with keys `i, j, k...` in dimensions 1, 2, 3..., we
 * start the interpolation process with the first bucket level. The two buckets with keys most closely surrounding the
 * query point in dimension 1 are selected. If a bucket has a key exactly equal to the query point's position, then
 * only that one bucket is selected. If the query point lies outside of the minimum and maximum keys in dimension 1,
 * then the one bucket corresponding to the closest key to the query point is selected. Then, for each selected bucket,
 * the bucket selection process repeats for the next level of buckets, then the next level, until the last level is
 * reached. When the last level is reached, each selected bucket represents a single breakpoint in the table, and the
 * selected breakpoints are used to interpolate a value along the last dimension. These interpolated values are passed
 * back up the selection tree and are used to interpolate values along the second-to-last dimension, which are in turn
 * used to interpolate values along the third-to-last-dimension, and so on all the way back to the first dimension. At
 * the first dimension, a single value is interpolated and this becomes the final interpolated value that the table
 * outputs for the query point.
 */
export class LerpLookupTable {
  private static readonly BREAKPOINT_COMPARATOR = (a: DimensionalBreakpoint, b: DimensionalBreakpoint): number => a.key - b.key;

  private static readonly tempBreakpoint: DimensionalBreakpoint = { key: 0 };

  private readonly _dimensionCount: number;
  // eslint-disable-next-line jsdoc/require-returns
  /** The number of dimensions in this table. */
  public get dimensionCount(): number {
    return this._dimensionCount;
  }

  private readonly table = new SortedArray<DimensionalBreakpoint>(LerpLookupTable.BREAKPOINT_COMPARATOR);

  /**
   * Creates a lookup table of a specified dimension.
   * @param dimensionCount The number of dimensions in the new table. Values less than 0 will be clamped to 0.
   * @deprecated Please use the constructor that accepts an array of breakpoints.
   */
  public constructor(dimensionCount: number);
  /**
   * Creates a lookup table initialized with an array of breakpoints.
   * @param breakpoints An array of breakpoints with which to initialize the new table. Each breakpoint should be
   * expressed as a number array, where the first element represents the breakpoint value, and the next N elements
   * represent the breakpoint key in each dimension. If not all breakpoint arrays have the same length, the dimension
   * of the table will be set equal to `L - 1`, where `L` is the length of the shortest array. For arrays with length
   * greater than `L`, all keys after index `L - 1` will be ignored. If the table ends up with zero dimensions, it will
   * be initialized to an empty table.
   */
  public constructor(breakpoints: readonly (readonly number[])[]);
  // eslint-disable-next-line jsdoc/require-jsdoc
  public constructor(arg: readonly (readonly number[])[] | number) {
    if (typeof arg === 'number') {
      this._dimensionCount = isFinite(arg) ? Math.max(0, arg) : 0;
      return;
    }

    const leastDimension = arg.reduce((accum, current) => (current.length < accum.length) ? current : accum);
    this._dimensionCount = Math.max(0, leastDimension ? (leastDimension.length - 1) : 0);
    if (this._dimensionCount === 0) {
      return;
    }

    for (let i = 0; i < arg.length; i++) {
      this.insertBreakpoint(arg[i]);
    }
  }

  /**
   * Inserts a breakpoint into this table. If the breakpoint has more dimensions than this table, only the first `N`
   * keys of the breakpoint will be used, where `N` is the dimension count of this table.
   * @param breakpoint A breakpoint, as a number array with the value at index 0 followed by the keys for each
   * dimension.
   * @returns This table, after the breakpoint has been inserted.
   * @throws Error if this table has zero dimensions, or the breakpoint has fewer dimensions than this table.
   * @deprecated It is recommended to define all breakpoints at instantiation time.
   */
  public insertBreakpoint(breakpoint: readonly number[]): this {
    if (this._dimensionCount === 0) {
      throw new Error('LerpLookupTable: cannot insert a breakpoint into a 0-dimensional table');
    }

    if (breakpoint.length - 1 < this._dimensionCount) {
      throw new Error(`LerpLookupTable: cannot insert a ${breakpoint.length - 1}-dimensional breakpoint into a ${this._dimensionCount}-dimensional table`);
    }

    this.insertBreakpointHelper(breakpoint, 0, this.table);
    return this;
  }

  /**
   * Helper method for inserting a breakpoint into this table.
   * @param breakpoint The breakpoint to insert.
   * @param dimension The current dimension being evaluated.
   * @param array The array of dimensional breakpoints into which the breakpoint should be inserted.
   */
  private insertBreakpointHelper(breakpoint: readonly number[], dimension: number, array: SortedArray<DimensionalBreakpoint>): void {
    const dimensionKey = breakpoint[dimension + 1];
    const query = LerpLookupTable.tempBreakpoint;
    query.key = dimensionKey;

    if (dimension === this._dimensionCount - 1) {
      let match = array.match(query);
      if (!match) {
        match = { key: dimensionKey, value: breakpoint[0] };
        array.insert(match);
      }
    } else {
      let next = array.match(query);
      if (!next) {
        array.insert(next = { key: dimensionKey, array: new SortedArray<DimensionalBreakpoint>(LerpLookupTable.BREAKPOINT_COMPARATOR) });
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.insertBreakpointHelper(breakpoint, dimension + 1, next.array!);
    }
  }

  /**
   * Looks up a value in this table using a specified key. The returned value will be linearly interpolated from
   * surrounding breakpoints if the key is not an exact match for any of the table's breakpoints.
   * @param key The lookup key, as an ordered N-tuple of numbers.
   * @returns The value corresponding to the specified key.
   * @throws Error if this table has zero dimensions, the key has fewer dimensions than this table, or a value could
   * not be retrieved.
   */
  public get(...key: number[]): number {
    if (this._dimensionCount === 0) {
      throw new Error('LerpLookupTable: cannot look up a key in a 0-dimensional table');
    }

    if (key.length < this._dimensionCount) {
      throw new Error(`LerpLookupTable: cannot look up a ${key.length}-dimensional key in a ${this._dimensionCount}-dimensional table`);
    }

    const value = this.lookupHelper(key, 0, this.table);

    if (value === undefined) {
      throw new Error(`LerpLookupTable: could not retrieve value for key ${key}`);
    }

    return value;
  }

  /**
   * Helper method for looking up a key in this table.
   * @param key The key to look up.
   * @param dimension The current dimension being evaluated.
   * @param lookupArray The array containing breakpoints in the next lower dimension in which to search for the key.
   * @returns The interpolated value of the key at the specified dimension.
   */
  private lookupHelper(key: number[], dimension: number, lookupArray: SortedArray<DimensionalBreakpoint>): number | undefined {
    const dimensionKey = key[dimension];
    const query = LerpLookupTable.tempBreakpoint;
    query.key = dimensionKey;

    const index = lookupArray.matchIndex(query);
    let start: DimensionalBreakpoint | undefined;
    let end: DimensionalBreakpoint | undefined;
    if (index >= 0) {
      start = lookupArray.peek(index);
      end = start;
    } else {
      start = lookupArray.peek(-index - 2);
      end = lookupArray.peek(-index - 1);
      if (!start) {
        start = end;
      }
      if (!end) {
        end = start;
      }
    }

    if (!start || !end) {
      return undefined;
    }

    let startValue;
    let endValue;
    if (dimension === this.dimensionCount - 1) {
      startValue = start.value;
      endValue = end.value;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      startValue = this.lookupHelper(key, dimension + 1, start.array!);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      endValue = this.lookupHelper(key, dimension + 1, end.array!);
    }

    if (startValue === undefined || endValue === undefined) {
      return undefined;
    }

    if (startValue === endValue) {
      return startValue;
    }

    return MathUtils.lerp(dimensionKey, start.key, end.key, startValue, endValue);
  }
}
