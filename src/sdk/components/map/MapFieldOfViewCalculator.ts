import { LatLonInterface } from '../../geo/GeoInterfaces';
import { GeoPoint } from '../../geo/GeoPoint';
import { MathUtils } from '../../math/MathUtils';
import { ReadonlyFloat64Array, Vec2Math, Vec3Math } from '../../math/VecMath';
import { ArrayUtils } from '../../utils/datastructures/ArrayUtils';
import { MapProjection } from './MapProjection';

/**
 * A map range and target solution describing a field of view.
 */
export type MapFieldOfView = {
  /** The range of the field of view, in great-arc radians. */
  range: number;

  /** The target location of the field of view. */
  target: GeoPoint;
}

/**
 * A map scale factor and target solution describing a field of view.
 */
export type MapScaleFactorFieldOfView = {
  /** The nominal scale factor of the field of view. */
  scaleFactor: number;

  /** The target location of the field of view. */
  target: GeoPoint;
}

/**
 * Calculates map projection parameters for fields of view which encompass sets of geographic points.
 */
export class MapFieldOfViewCalculator {
  private static readonly geoPointCache = [new GeoPoint(0, 0)];
  private static readonly vec2Cache = [Vec2Math.create()];
  private static readonly vec3Cache = [Vec3Math.create(), Vec3Math.create()];

  private readonly tempProjection = new MapProjection(100, 100);
  private readonly tempFocus: Readonly<LatLonInterface>[] = [];

  /**
   * Calculates a map field of view, consisting of a range and target location, which encompasses a given set of
   * geographic points (the focus) with the smallest possible range. If there is only one point in the specified focus,
   * then the calculated range will be equal to 0. If the specified focus contains zero points or a field of view could
   * not be calculated, `NaN` will be written to the results.
   * @param mapProjection The projection of the map for which to calculate the field of view.
   * @param focus An array of points comprising the focus of the field of view.
   * @param margins The margins around the projected map boundaries to respect, as `[left, top, right, bottom]` in
   * pixels. The field of view will be calculated in order to avoid placing any points in the focus outside of the
   * margins.
   * @param out The object to which to write the results.
   * @returns The calculated field of view for the specified focus.
   */
  public calculateFov(
    mapProjection: MapProjection,
    focus: readonly Readonly<LatLonInterface>[],
    margins: ReadonlyFloat64Array,
    out: MapFieldOfView
  ): MapFieldOfView;
  /**
   * Calculates a map field of view, consisting of a scale factor and target location, which encompasses a given set of
   * geographic points (the focus) with the largest possible scale factor. If there is only one point in the specified
   * focus, then the calculated scale factor will be equal to `Infinity`. If the specified focus contains zero points
   * or a field of view could not be calculated, `NaN` will be written to the results.
   * @param mapProjection The projection of the map for which to calculate the field of view.
   * @param focus An array of points comprising the focus of the field of view.
   * @param margins The margins around the projected map boundaries to respect, as `[left, top, right, bottom]` in
   * pixels. The field of view will be calculated in order to avoid placing any points in the focus outside of the
   * margins.
   * @param out The object to which to write the results.
   * @returns The calculated field of view for the specified focus.
   */
  public calculateFov(
    mapProjection: MapProjection,
    focus: readonly Readonly<LatLonInterface>[],
    margins: ReadonlyFloat64Array,
    out: MapScaleFactorFieldOfView
  ): MapScaleFactorFieldOfView
  // eslint-disable-next-line jsdoc/require-jsdoc
  public calculateFov<T extends MapFieldOfView | MapScaleFactorFieldOfView>(
    mapProjection: MapProjection,
    focus: readonly Readonly<LatLonInterface>[],
    margins: ReadonlyFloat64Array,
    out: T
  ): T {
    const hasScaleFactor = 'scaleFactor' in out;
    const hasRange = 'range' in out;

    if (hasScaleFactor) {
      out.scaleFactor = NaN;
    }
    if (hasRange) {
      out.range = NaN;
    }
    out.target.set(NaN, NaN);

    if (focus.length === 0) {
      return out;
    }

    const projectedSize = mapProjection.getProjectedSize();

    const targetWidth = projectedSize[0] - margins[0] - margins[2];
    const targetHeight = projectedSize[1] - margins[1] - margins[3];

    if (targetWidth * targetHeight <= 0) {
      return out;
    }

    // We want to find the longitude value that lies in the middle of the focus. To do this, we must find the longitude
    // span of shortest possible length that includes the longitudes of all the points in the focus ("minimum span").
    // The midpoint of this minimum span then defines the middle longitude. To find the minimum span, we will first
    // sort all the focus points in order of increasing longitude. Then we will find the largest gap in longitude
    // between two consecutive sorted points. The minimum span is then the complement of that gap.

    ArrayUtils.shallowCopy(focus, this.tempFocus).sort(MapFieldOfViewCalculator.sortIncreasingLongitude);

    let minSpanLon1 = this.tempFocus[0].lon;
    let minSpanLon2 = this.tempFocus[this.tempFocus.length - 1].lon;
    let bestGapSize = MathUtils.angularDistanceDeg(minSpanLon2, minSpanLon1, 1);
    for (let i = 0; i < this.tempFocus.length - 1; i++) {
      const lon1 = this.tempFocus[i + 1].lon;
      const lon2 = this.tempFocus[i].lon;
      const gapSize = MathUtils.angularDistanceDeg(lon2, lon1, 1);
      if (gapSize > bestGapSize) {
        minSpanLon1 = lon1;
        minSpanLon2 = lon2;
        bestGapSize = gapSize;
      }
    }
    // Clear the temporary array so that we don't leak the elements stored inside.
    this.tempFocus.length = 0;

    minSpanLon2 = MathUtils.normalizeAngleDeg(minSpanLon2, minSpanLon1);
    const midLon = MathUtils.normalizeAngleDeg(0.5 * (minSpanLon1 + minSpanLon2), -180);

    // Initialize our working projection to use the same projected size, rotation, and range endpoints as the map
    // projection for which we are calculating the field of view. Also initialize the scale factor to 1.

    // Then, set the target offset of our working projection such that the target is projected to the middle of the
    // margin boundaries, and set the target to the middle longitude of the focus. Setting an initial target this way
    // mitigates issues with anti-meridian wraparound. Finally, use this projection to find the top-left and
    // bottom-right corners of the projected focus, thus defining the minimal axis-aligned bounding box of the
    // projected focus.

    this.tempProjection.set({
      projectedSize: mapProjection.getProjectedSize(),
      rotation: mapProjection.getRotation(),
      scaleFactor: 1,
      target: MapFieldOfViewCalculator.geoPointCache[0].set(0, midLon),
      targetProjectedOffset: Vec2Math.set(
        margins[0] + (targetWidth - projectedSize[0]) / 2,
        margins[1] + (targetHeight - projectedSize[1]) / 2,
        MapFieldOfViewCalculator.vec2Cache[0]
      ),
      rangeEndpoints: mapProjection.getRangeEndpoints(),
    });

    let minX: number | undefined;
    let minY: number | undefined;
    let maxX: number | undefined;
    let maxY: number | undefined;

    for (let i = 0; i < focus.length; i++) {
      const projected = this.tempProjection.project(focus[i], MapFieldOfViewCalculator.vec2Cache[0]);

      minX = Math.min(projected[0], minX ?? Infinity);
      minY = Math.min(projected[1], minY ?? Infinity);
      maxX = Math.max(projected[0], maxX ?? -Infinity);
      maxY = Math.max(projected[1], maxY ?? -Infinity);
    }

    if (minX === undefined || minY === undefined || maxX === undefined || maxY === undefined) {
      return out;
    }

    const focusWidth = maxX - minX;
    const focusHeight = maxY - minY;

    if (focusWidth === 0 && focusHeight === 0) {
      out.target.set(focus[0]);
      if (hasScaleFactor) {
        out.scaleFactor = Infinity;
      }
      if (hasRange) {
        out.range = 0;
      }
      return out;
    }

    // Fix the target of our working projection (which we have already defined to be projected to the middle of the
    // margin boundaries) to the center of the focus. Due to the properties of the Mercator projection, this point is
    // invariant (it is always projected to the same coordinates) for every possible scale factor when selecting a
    // field of view that maximizes the distance between the bounding box of the projected focus and the margin
    // boundaries.

    this.tempProjection.invert(Vec2Math.set((minX + maxX) / 2, (minY + maxY) / 2, MapFieldOfViewCalculator.vec2Cache[0]), out.target);
    this.tempProjection.set({
      target: out.target
    });

    // Next, find the largest scale factor that projects the focus within the margin boundaries. The scale factor
    // scales all projected points uniformly. Therefore, we can calculate what factor would scale the currently
    // projected focus such that its bounding box is the largest possible size while still remaining within the margin
    // boundaries. We then multiply this factor by the current scaling factor of the working projection (which is 1) to
    // obtain the desired scale factor.

    const widthRatio = targetWidth / focusWidth;
    const heightRatio = targetHeight / focusHeight;

    const constrainedRatio = Math.min(widthRatio, heightRatio);
    const scaleFactor = constrainedRatio;

    this.tempProjection.set({ scaleFactor });

    // Now that the appropriate field of view has been found using our working projection, back-calculate the map
    // target required to achieve this field of view in the map projection for which the field of view is being
    // calculated.

    this.tempProjection.invert(mapProjection.getTargetProjected(), out.target);

    if (hasScaleFactor) {
      out.scaleFactor = scaleFactor;
    }
    if (hasRange) {
      out.range = this.tempProjection.getRange();
    }

    return out;
  }

  /**
   * Compares the longitude of two sets of latitude/longitude coordinates.
   * @param a The first set of coordinates to compare.
   * @param b The second set of coordinates to compare.
   * @returns A negative number if `a.lon` is less than `b.lon`, a positive number if `a.lon` is greater than `b.lon`,
   * or zero if `a.lon` is equal to `b.lon`.
   */
  private static sortIncreasingLongitude(a: Readonly<LatLonInterface>, b: Readonly<LatLonInterface>): number {
    return MathUtils.normalizeAngleDeg(a.lon, -180) - MathUtils.normalizeAngleDeg(b.lon, -180);
  }
}
