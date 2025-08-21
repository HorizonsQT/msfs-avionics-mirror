import { GeoCircle } from '../../geo/GeoCircle';
import { GeoMath } from '../../geo/GeoMath';
import { GeoPoint } from '../../geo/GeoPoint';
import { BitFlags } from '../../math/BitFlags';
import { MathUtils } from '../../math/MathUtils';
import { ReadonlyFloat64Array, Vec3Math } from '../../math/VecMath';
import { Subscribable } from '../../sub/Subscribable';
import { Subscription } from '../../sub/Subscription';
import { ArrayUtils } from '../../utils/datastructures/ArrayUtils';
import { AbstractTransformingPathStream, PathStream } from './PathStream';

/**
 * Bitflags describing the relative location of a geographic point with respect to cylindrical bounds.
 */
enum Outcode {
  /** The point is outside the minimum longitude bound. */
  MinLon = 1 << 0,

  /** The point is outside the maximum longitude bound. */
  MaxLon = 1 << 1,

  /** The point is below the minimum latitude bound. */
  MinLat = 1 << 2,

  /** The point is above the maximum latitude bound. */
  MaxLat = 1 << 3,
}

/**
 * A boundary-crossing point on an arc along a geo circle.
 */
type BoundCrossing = {
  /** The cartesian representation of this point. */
  vec: Float64Array;

  /** The angular offset, in radians, from the start of the arc to this point. */
  angularOffset: number;

  /** Whether the arc crosses from inside to outside the boundary at this point. */
  isToOutside: boolean;

  /** The outcode of the boundary that is crossed. */
  outcode: number;
};

/**
 * A path stream which performs clipping of geographical spherical coordinates to a cylindrical area defined by minimum
 * and maximum longitudes and latitudes before sending the clipped path (still in spherical coordinates) to another
 * stream.
 */
export class GeoCylindricalClippedPathStream extends AbstractTransformingPathStream {
  private static readonly SOUTH_POLE = Vec3Math.create(0, 0, -1);

  private static readonly vec3Cache = ArrayUtils.create(2, () => Vec3Math.create());
  private static readonly geoPointCache = ArrayUtils.create(3, () => new GeoPoint(0, 0));
  private static readonly geoCircleCache = ArrayUtils.create(1, () => new GeoCircle(Vec3Math.create(), 0));

  private static readonly intersectionCache = ArrayUtils.create(1, () => [Vec3Math.create(), Vec3Math.create()]);

  // NOTE: there can be a maximum of eight boundary crossings for any given path (two per boundary times four boundaries).
  private static readonly crossings = ArrayUtils.create(8, (): BoundCrossing => {
    return {
      vec: Vec3Math.create(),
      angularOffset: 0,
      isToOutside: false,
      outcode: 0,
    };
  });

  private minLon = 0;
  private maxLon = 0;
  private lonRange = 0;
  private minLat = 0;
  private maxLat = 0;
  private isBoundsValid = false;
  private hasLonBounds = false;
  /**
   * If true, then a point is considered to be within the longitude bounds if and only if it is within both the
   * minimum and maximum longitude bounds. If false, then a point is considered to be within the longitude bounds if
   * and only if is within at least one of the minimum and maximum longitude bounds.
   */
  private areLonBoundsIntersection = false;
  private hasMinLatBound = false;
  private hasMaxLatBound = false;

  // Geo circles that define this stream's boundaries. All circle are oriented such that they encircle all points that
  // lie inside their respective boundaries.
  private readonly minLonCircle = new GeoCircle(Vec3Math.create(), 0);
  private readonly minLatCircle = new GeoCircle(Vec3Math.create(), 0);
  private readonly maxLonCircle = new GeoCircle(Vec3Math.create(), 0);
  private readonly maxLatCircle = new GeoCircle(Vec3Math.create(), 0);

  private readonly firstPoint = new GeoPoint(NaN, NaN);
  private readonly prevPoint = new GeoPoint(NaN, NaN);
  private readonly prevVec = Vec3Math.create(NaN, NaN, NaN);
  private prevPointOutcode = 0;

  private readonly boundsSub: Subscription;

  /**
   * Creates a new instance of GeoCylindricalClippedPathStream.
   * @param consumer The path stream that consumes this stream's transformed output.
   * @param bounds A subscribable which provides the clipping bounds for this stream, as
   * `[minLongitude, minLatitude, maxLongitude, maxLatitude]`, in degrees. Longitude values will be normalized to the
   * range `[-180, 180)` and latitude values will be clamped to the range `[-90, 90]`. Whenever the clipping bounds
   * change, the state of this stream will be reset, as if `beginPath()` were called.
   */
  public constructor(consumer: PathStream, private readonly bounds: Subscribable<ReadonlyFloat64Array>) {
    super(consumer);

    this.boundsSub = bounds.sub(this.onBoundsChanged.bind(this), true);
  }

  /** @inheritDoc */
  public beginPath(): void {
    this.reset();
    this.consumer.beginPath();
  }

  /**
   * Moves to a specified point.
   * @param lon The longitude of the point to which to move, in degrees.
   * @param lat The latitude of the point to which to move, in degrees.
   */
  public moveTo(lon: number, lat: number): void {
    if (!this.isBoundsValid) {
      return;
    }

    if (!(isFinite(lon) && isFinite(lat))) {
      return;
    }

    if (!this.firstPoint.isValid()) {
      this.firstPoint.set(lat, lon);
    }

    this.prevPoint.set(lat, lon);
    this.prevPoint.toCartesian(this.prevVec);
    this.prevPointOutcode = this.getOutcode(this.prevVec);
    if (this.isInsideBounds(this.prevPointOutcode)) {
      this.consumer.moveTo(lon, lat);
    }
  }

  /**
   * Paths a great-circle arc from the current point to a specified point.
   * @param lon The longitude of the end point, in degrees.
   * @param lat The latitude of the end point, in degrees.
   * @throws Error if the specified point is antipodal to the last pathed point.
   */
  public lineTo(lon: number, lat: number): void {
    if (!this.isBoundsValid) {
      return;
    }

    if (!(isFinite(lon) && isFinite(lat))) {
      return;
    }

    if (!this.prevPoint.isValid()) {
      this.moveTo(lon, lat);
      return;
    }

    if (this.prevPoint.equals(lat, lon)) {
      return;
    }


    const startVec = this.prevVec;
    const endVec = GeoPoint.sphericalToCartesian(lat, lon, GeoCylindricalClippedPathStream.vec3Cache[0]);

    const circle = GeoCylindricalClippedPathStream.geoCircleCache[0].setAsGreatCircle(startVec, endVec);

    if (!isFinite(circle.center[0])) {
      throw new Error(`GeoCylindricalClippedPathStream::lineTo(): cannot unambiguously path a great circle from ${this.prevPoint.lat} lat, ${this.prevPoint.lon} lon to ${lat} lat, ${lon} lon`);
    }

    const outcode = this.clipPath(
      circle,
      endVec,
      lat,
      lon
    );

    this.prevPoint.set(lat, lon);
    Vec3Math.copy(endVec, this.prevVec);
    this.prevPointOutcode = outcode;
  }

  /**
   * Not supported by this path stream.
   * @throws Error when called.
   */
  public bezierCurveTo(): void {
    throw new Error('GeoCylindricalClippedPathStream: bezierCurveTo() is not supported');
  }

  /**
   * Not supported by this path stream.
   * @throws Error when called.
   */
  public quadraticCurveTo(): void {
    throw new Error('GeoCylindricalClippedPathStream: quadraticCurveTo() is not supported');
  }

  /**
   * Paths a small-circle arc.
   * @param lon The longitude of the center of the circle containing the arc, in degrees.
   * @param lat The latitude of the center of the circle containing the arc, in degrees.
   * @param radius The radius of the arc, in great-arc radians.
   * @param startAngle If the center of the circle containing the arc is not one of the poles, the true bearing, in
   * degrees, from the center of the circle to the start of the arc; otherwise the longitude, in degrees, of the start
   * of the arc.
   * @param endAngle If the center of the circle containing the arc is not one of the poles, the true bearing, in
   * degrees, from the center of the circle to the end of the arc; otherwise the longitude, in degrees, of the end of
   * the arc.
   * @param counterClockwise Whether the arc should be drawn counterclockwise (when viewed from above the center of the
   * circle containing the arc). Defaults to `false`.
   */
  public arc(lon: number, lat: number, radius: number, startAngle: number, endAngle: number, counterClockwise?: boolean): void {
    if (!(isFinite(lon) && isFinite(lat) && isFinite(radius) && isFinite(startAngle) && isFinite(endAngle))) {
      return;
    }

    if (radius === 0 || Math.abs(startAngle - endAngle) <= GeoCircle.ANGULAR_TOLERANCE * Avionics.Utils.RAD2DEG) {
      return;
    }

    if (MathUtils.diffAngle(startAngle * Avionics.Utils.DEG2RAD, endAngle * Avionics.Utils.DEG2RAD, false) <= GeoCircle.ANGULAR_TOLERANCE) {
      // Since we early return above if startAngle and endAngle are equal, hitting this case means they are a multiple
      // of 360 degrees apart. The resampler will interpret them as being the same point and won't draw a full circle
      // so we will split the arc into two.
      const midAngle = startAngle + 180 * Math.sign(endAngle - startAngle);
      this.arc(lon, lat, radius, startAngle, midAngle, counterClockwise);
      this.arc(lon, lat, radius, midAngle, endAngle, counterClockwise);
      return;
    }

    const center = GeoCylindricalClippedPathStream.geoPointCache[0].set(lat, lon);

    const start = GeoCylindricalClippedPathStream.geoPointCache[1];
    const end = GeoCylindricalClippedPathStream.geoPointCache[2];

    if (Math.abs(lat) >= 90 - GeoCircle.ANGULAR_TOLERANCE * Avionics.Utils.RAD2DEG) {
      // The center of the arc circle is one of the poles
      const circleLat = Math.sign(lat) * (MathUtils.HALF_PI - radius) * Avionics.Utils.RAD2DEG;
      start.set(circleLat, startAngle);
      end.set(circleLat, endAngle);
    } else {
      center.offset(startAngle, radius, start);
      center.offset(endAngle, radius, end);
    }

    if (isNaN(start.lat) || isNaN(start.lon) || isNaN(end.lat) || isNaN(end.lon)) {
      return;
    }

    // Save lat/lon coordinates locally because the cached GeoPoint may get overwritten by the call to `lineTo()`.
    const endLat = end.lat;
    const endLon = end.lon;

    if (!this.prevPoint.isValid()) {
      this.moveTo(start.lon, start.lat);
    } else if (!start.equals(this.prevPoint)) {
      this.lineTo(start.lon, start.lat);
    }

    const circle = GeoCylindricalClippedPathStream.geoCircleCache[0].set(
      // Need to reset the center point because the cached GeoPoint may have been overwritten by the call to `lineTo()`.
      GeoCylindricalClippedPathStream.geoPointCache[0].set(lat, lon),
      radius
    );
    if (!counterClockwise) {
      circle.reverse();
    }

    const endVec = GeoPoint.sphericalToCartesian(endLat, endLon, GeoCylindricalClippedPathStream.vec3Cache[0]);

    const outcode = this.clipPath(
      circle,
      endVec,
      endLat,
      endLon
    );

    this.prevPoint.set(endLat, endLon);
    Vec3Math.copy(endVec, this.prevVec);
    this.prevPointOutcode = outcode;
  }

  /** @inheritDoc */
  public closePath(): void {
    if (this.firstPoint.isValid()) {
      this.lineTo(this.firstPoint.lon, this.firstPoint.lat);
    }
  }

  /**
   * Resets the state of this stream.
   */
  private reset(): void {
    this.firstPoint.set(NaN, NaN);
    this.prevPoint.set(NaN, NaN);
    Vec3Math.set(NaN, NaN, NaN, this.prevVec);
    this.prevPointOutcode = 0;
  }

  /**
   * Clips a path using this stream's clipping boundaries and sends the result to this stream's consumer. The start of
   * the path is assumed to be this stream's last pathed point.
   * @param circle The geo circle along which the path lies.
   * @param endVec The cartesian representation of the end of the path.
   * @param endLat The latitude of the end of the path, in degrees.
   * @param endLon The longitude of the end of the path, in degrees.
   * @returns The outcode of the end of the path.
   */
  private clipPath(
    circle: GeoCircle,
    endVec: ReadonlyFloat64Array,
    endLat: number,
    endLon: number,
  ): number {
    const crossings = GeoCylindricalClippedPathStream.crossings;

    const startVec = this.prevVec;
    const startOutcode = this.prevPointOutcode;

    const endAngularOffset = circle.angleAlong(startVec, endVec, Math.PI, GeoMath.ANGULAR_TOLERANCE);
    if (endAngularOffset === 0) {
      return startOutcode;
    }

    const endAngularOffsetWithTol = endAngularOffset + GeoMath.ANGULAR_TOLERANCE;
    const endOutcode = this.getOutcode(endVec);

    let count = 0;

    if (this.hasLonBounds) {
      const minLonCrossVecs = GeoCylindricalClippedPathStream.intersectionCache[0];
      const minLonCrossCount = this.getBoundCrossingPoints(this.minLonCircle, circle, minLonCrossVecs);
      for (let i = 0; i < minLonCrossCount; i++) {
        count = this.processCandidateCrossing(
          this.minLonCircle,
          Outcode.MinLon,
          circle,
          startVec,
          endAngularOffsetWithTol,
          minLonCrossVecs[i],
          crossings,
          count
        );
      }

      const maxLonCrossVecs = GeoCylindricalClippedPathStream.intersectionCache[0];
      const maxLonCrossCount = this.getBoundCrossingPoints(this.maxLonCircle, circle, maxLonCrossVecs);
      for (let i = 0; i < maxLonCrossCount; i++) {
        count = this.processCandidateCrossing(
          this.maxLonCircle,
          Outcode.MaxLon,
          circle,
          startVec,
          endAngularOffsetWithTol,
          maxLonCrossVecs[i],
          crossings,
          count
        );
      }
    }

    if (this.hasMinLatBound) {
      const crossVecs = GeoCylindricalClippedPathStream.intersectionCache[0];
      const crossCount = this.getBoundCrossingPoints(this.minLatCircle, circle, crossVecs);
      for (let i = 0; i < crossCount; i++) {
        count = this.processCandidateCrossing(
          this.minLatCircle,
          Outcode.MinLat,
          circle,
          startVec,
          endAngularOffsetWithTol,
          crossVecs[i],
          crossings,
          count
        );
      }
    }

    if (this.hasMaxLatBound) {
      const crossVecs = GeoCylindricalClippedPathStream.intersectionCache[0];
      const crossCount = this.getBoundCrossingPoints(this.maxLatCircle, circle, crossVecs);
      for (let i = 0; i < crossCount; i++) {
        count = this.processCandidateCrossing(
          this.maxLatCircle,
          Outcode.MaxLat,
          circle,
          startVec,
          endAngularOffsetWithTol,
          crossVecs[i],
          crossings,
          count
        );
      }
    }

    if (count === 0) {
      // The path does not cross any boundaries. In this case, either the entire path is visible or the entire path is
      // hidden. We will consider the entire path to be visible if and only if both the start and end are within
      // bounds. Note that the start and end outcodes are not necessarily equal even though no boundary crossings were
      // detected - this is due to possible floating point error. If the path is visible, then send it to the consumer.
      // Otherwise, move the consumer to the end point if it is within bounds.

      const isEndInsideBounds = this.isInsideBounds(endOutcode);
      const isPathToEndVisible = isEndInsideBounds && this.isInsideBounds(startOutcode);
      if (isPathToEndVisible) {
        this.sendPathToConsumer(circle, startVec, endVec);
      } else if (isEndInsideBounds) {
        this.consumer.moveTo(endLon, endLat);
      }
    } else {
      // The path crosses at least one boundary. In this case, we will sort the crossings in the order in which they
      // appear along the path. Then, we will iterate through the crossings and evaluate what to do at each one.

      // Set the angular offset of all unused crossings to infinity in order to ensure they are sorted to the end of
      // the array.
      for (let i = count; i < crossings.length; i++) {
        crossings[i].angularOffset = Infinity;
      }

      crossings.sort(GeoCylindricalClippedPathStream.compareCrossings);

      // Save the path radius to a const so that we don't evaluate the `circle.radius` getter multiple times.
      const radius = circle.radius;

      let lastOutcode = startOutcode;
      let isLastOutcodeInsideBounds = this.isInsideBounds(lastOutcode);
      let lastPathedVec = startVec;
      let lastPathedAngularOffset = 0;
      let visibleSegmentStartVec = isLastOutcodeInsideBounds ? lastPathedVec : undefined;

      for (let i = 0; i < count; i++) {
        const crossing = crossings[i];

        const outcode = BitFlags.set(lastOutcode, crossing.isToOutside ? crossing.outcode : 0, crossing.outcode);
        const isOutcodeInsideBounds = this.isInsideBounds(outcode);

        // Check whether the current point is sufficiently different from the last point that was pathed. If not, then
        // we will treat the current point as equivalent to the last pathed point and only update the outcode.
        // Otherwise, the current will be treated as a pathed point.

        if ((crossing.angularOffset - lastPathedAngularOffset) * radius > GeoMath.ANGULAR_TOLERANCE) {
          if (isLastOutcodeInsideBounds) {
            // The last point was within bounds. Therefore, if the current point is still within bounds, then we will
            // do nothing (it is not the end of a path segment). However, if the current point is not within bounds,
            // then it is the end of the current visible path segment and we need to send a path to the consumer that
            // starts at the last pathed point and ends at the current point.

            if (!isOutcodeInsideBounds) {
              if (!visibleSegmentStartVec) {
                // If the last *pathed* point was not within bounds, then the consumer state will not be set to the
                // last pathed point. Since we need the path to start at the last pathed point, we must move the
                // consumer to the last pathed point.
                const lastPathedPoint = GeoCylindricalClippedPathStream.geoPointCache[0].setFromCartesian(lastPathedVec);
                this.consumer.moveTo(lastPathedPoint.lon, lastPathedPoint.lat);
                visibleSegmentStartVec = lastPathedVec;
              }
              this.sendPathToConsumer(circle, visibleSegmentStartVec, crossing.vec);
            }
          } else {
            // The last point was not within bounds. Therefore, if the current point is also not within bounds, then we
            // we will do nothing (it is not the end of a path segment). However, if the current is within bounds, then
            // it is the end of the current hidden path segment and we need to move the consumer to the current point.

            if (isOutcodeInsideBounds) {
              const crossingPoint = GeoCylindricalClippedPathStream.geoPointCache[0].setFromCartesian(crossing.vec);
              this.consumer.moveTo(crossingPoint.lon, crossingPoint.lat);
              visibleSegmentStartVec = crossing.vec;
            }
          }

          lastPathedVec = crossing.vec;
          lastPathedAngularOffset = crossing.angularOffset;
        }

        lastOutcode = outcode;
        isLastOutcodeInsideBounds = isOutcodeInsideBounds;
      }

      // Here, we need to handle the part of the path from the last pathed point (which is either the start point or a
      // boundary crossing point) to the end point. We will consider this part of the path to be visible if and only if
      // both the last point (which is either the last pathed point or a point whose location is equivalent to the last
      // pathed point) and the end point are within bounds. Note that the outcodes of the last point and end point are
      // not necessarily equal even though no boundary crossings were detected between the two - this is due to
      // possible floating point error. If the path is visible, then send it to the consumer. Otherwise, move the
      // consumer to the end point if it is within bounds.

      const isEndInsideBounds = this.isInsideBounds(endOutcode);
      const isPathToEndVisible = isEndInsideBounds && isLastOutcodeInsideBounds;
      if (isPathToEndVisible && (endAngularOffset - lastPathedAngularOffset) * radius > GeoMath.ANGULAR_TOLERANCE) {
        if (!visibleSegmentStartVec) {
          // If the last *pathed* point was not within bounds, then the consumer state will not be set to the last
          // pathed point. Since we need the path to start at the last pathed point, we must move the consumer to the
          // last pathed point.
          const lastPathedPoint = GeoCylindricalClippedPathStream.geoPointCache[0].setFromCartesian(lastPathedVec);
          this.consumer.moveTo(lastPathedPoint.lon, lastPathedPoint.lat);
          visibleSegmentStartVec = lastPathedVec;
        }
        this.sendPathToConsumer(circle, visibleSegmentStartVec, endVec);
      } else if (isEndInsideBounds) {
        this.consumer.moveTo(endLon, endLat);
      }
    }

    return endOutcode;
  }

  /**
   * Gets the outcode for a point.
   * @param vec The cartesian representation of the point.
   * @returns The outcode for the specified point.
   */
  private getOutcode(vec: ReadonlyFloat64Array): number {
    let code = 0;

    if (this.hasLonBounds) {
      if (!this.minLonCircle.encircles(vec, true)) {
        code |= Outcode.MinLon;
      }
      if (!this.maxLonCircle.encircles(vec, true)) {
        code |= Outcode.MaxLon;
      }
    }

    if (this.hasMinLatBound) {
      if (!this.minLatCircle.encircles(vec, true)) {
        code |= Outcode.MinLat;
      }
    }
    if (this.hasMaxLatBound) {
      if (!this.maxLatCircle.encircles(vec, true)) {
        code |= Outcode.MaxLat;
      }
    }

    return code;
  }

  /**
   * Checks if an outcode represents a point that is within this stream's bounds.
   * @param outcode The outcode to check.
   * @returns Whether the specified outcode represents a point that is within this stream's bounds.
   */
  private isInsideBounds(outcode: number): boolean {
    return !BitFlags.isAny(outcode, Outcode.MinLat | Outcode.MaxLat)
      && (
        this.areLonBoundsIntersection
          ? !BitFlags.isAny(outcode, Outcode.MinLon | Outcode.MaxLon)
          : !BitFlags.isAll(outcode, Outcode.MinLon | Outcode.MaxLon)
      );
  }

  /**
   * Gets the points at which a geo circle crosses one of this stream's boundaries.
   * @param bound The boundary to check.
   * @param circle The geo circle to check.
   * @param out An array in which to store the results. The results will be stored at indexes 0 and 1. If these indexes
   * are empty, then new Float64Array objects will be created and inserted into the array.
   * @returns The number of crossing points that were found.
   */
  private getBoundCrossingPoints(bound: GeoCircle, circle: GeoCircle, out: Float64Array[]): number {
    const intersectionCount = circle.intersection(bound, out);

    // If there is one intersection point, then that means circle is tangent to the bound. Since the circle does not
    // actually cross the bound at a tangent point, we can discard the tangent point immediately.
    if (intersectionCount < 2) {
      return 0;
    }

    return intersectionCount;
  }

  private static readonly processCandidateCrossingCache = {
    vec3: ArrayUtils.create(1, () => Vec3Math.create()),
  };

  /**
   * Processes a candidate boundary crossing point on a path. If the candidate point is found to lie between the start
   * and end of the path (inclusive), then the candidate will be added as a boundary crossing point to an array.
   * @param bound A geo circle that describes the boundary that is crossed. The circle should be oriented such that it
   * encircles all points that lie inside the boundary (i.e. points inside the boundary lie on the same side of the
   * circle as the circle's center).
   * @param boundOutcode The outcode of the boundary that is crossed.
   * @param circle The geo circle along which the path lies.
   * @param start The start of the path.
   * @param endAngularOffset The angular offset of the end of the path relative to the start of the path, in radians.
   * @param candidate The candidate boundary crossing point.
   * @param crossings An array of boundary crossing points to which to add the candidate point if it is determined to
   * be a valid crossing point.
   * @param count The number of existing boundary crossing points in the `crossings` array.
   * @returns The total number of boundary crossing points in the `crossings` array after the specified candidate point
   * was processed.
   */
  private processCandidateCrossing(
    bound: GeoCircle,
    boundOutcode: number,
    circle: GeoCircle,
    start: ReadonlyFloat64Array,
    endAngularOffset: number,
    candidate: ReadonlyFloat64Array,
    crossings: BoundCrossing[],
    count: number
  ): number {
    const angularOffset = circle.angleAlong(start, candidate, Math.PI, GeoMath.ANGULAR_TOLERANCE);
    if (angularOffset <= endAngularOffset) {
      const crossing = crossings[count++];
      Vec3Math.copy(candidate, crossing.vec);
      crossing.angularOffset = angularOffset;
      crossing.isToOutside = Vec3Math.dot(
        Vec3Math.cross(candidate, circle.center, GeoCylindricalClippedPathStream.processCandidateCrossingCache.vec3[0]),
        bound.center
      ) > 0;
      crossing.outcode = boundOutcode;
    }

    return count;
  }

  private static readonly sendPathToConsumerCache = {
    geoPoint: ArrayUtils.create(2, () => new GeoPoint(0, 0)),
  };

  /**
   * Sends a path to this stream's consumer.
   * @param circle The geo circle along which the path lies.
   * @param startVec The cartesian representation of the start of the path.
   * @param endVec The cartesian representation of the end of the path.
   */
  private sendPathToConsumer(circle: GeoCircle, startVec: ReadonlyFloat64Array, endVec: ReadonlyFloat64Array): void {
    if (circle.isGreatCircle()) {
      // Check if start and end are antipodal or nearly antipodal. If they are, then we need to split the path into
      // halves before calling lineTo() on the consumer. This is because there is no unique great-circle path between
      // antipodal endpoints.

      const angle = Vec3Math.unitAngle(startVec, endVec);

      if (angle >= Math.PI - 10 * GeoMath.ANGULAR_TOLERANCE) {
        const midPoint = circle.offsetAngleAlong(startVec, 0.5 * angle, GeoCylindricalClippedPathStream.sendPathToConsumerCache.geoPoint[0], Math.PI);
        this.consumer.lineTo(midPoint.lon, midPoint.lat);
      }

      const endPoint = GeoCylindricalClippedPathStream.sendPathToConsumerCache.geoPoint[0].setFromCartesian(endVec);
      this.consumer.lineTo(endPoint.lon, endPoint.lat);
    } else {
      const center = GeoCylindricalClippedPathStream.sendPathToConsumerCache.geoPoint[0].setFromCartesian(circle.center);
      if (Math.abs(center.lat) >= 90 - GeoCircle.ANGULAR_TOLERANCE * Avionics.Utils.RAD2DEG) {
        // The center of the path circle is one of the poles. We need to encode the start and end angles passed to
        // arc() as the longitude of the start and end points.

        const centerLat = center.lat > 0 ? 90 : -90;
        const startLon = GeoCylindricalClippedPathStream.sendPathToConsumerCache.geoPoint[1].setFromCartesian(startVec).lon;
        const endLon = GeoCylindricalClippedPathStream.sendPathToConsumerCache.geoPoint[1].setFromCartesian(endVec).lon;
        // In order to follow the direction of the path circle, the counterClockwise argument needs to be set to true,
        // because the direction of a geo circle is defined to be counterclockwise (when viewed from above its center).
        this.consumer.arc(0, centerLat, circle.radius, startLon, endLon, true);
      } else {
        // The center of the path circle is not one of the poles. We need to encode the start and end angles passed to
        // arc() as the true bearing from the center to the start and end points.

        const startAngle = center.bearingTo(GeoCylindricalClippedPathStream.sendPathToConsumerCache.geoPoint[1].setFromCartesian(startVec));
        const endAngle = center.bearingTo(GeoCylindricalClippedPathStream.sendPathToConsumerCache.geoPoint[1].setFromCartesian(endVec));
        // In order to follow the direction of the path circle, the counterClockwise argument needs to be set to true,
        // because the direction of a geo circle is defined to be counterclockwise (when viewed from above its center).
        this.consumer.arc(center.lon, center.lat, circle.radius, startAngle, endAngle, true);
      }
    }
  }

  /**
   * Handles when this stream's clipping boundaries change.
   */
  private onBoundsChanged(): void {
    const bounds = this.bounds.get();

    this.minLon = MathUtils.normalizeAngleDeg(bounds[0], -180);
    this.maxLon = MathUtils.normalizeAngleDeg(bounds[2], -180);
    this.lonRange = MathUtils.angularDistanceDeg(this.minLon, this.maxLon, 1);

    this.minLat = MathUtils.clamp(bounds[1], -90, 90);
    this.maxLat = MathUtils.clamp(bounds[3], -90, 90);

    const angularTolDeg = GeoMath.ANGULAR_TOLERANCE * Avionics.Utils.RAD2DEG;

    this.isBoundsValid
      = isFinite(this.minLon)
      && isFinite(this.maxLon)
      && isFinite(this.minLat)
      && isFinite(this.maxLat)
      && this.lonRange > angularTolDeg
      && this.maxLat - this.minLat > angularTolDeg;

    this.hasLonBounds = this.lonRange < 360 - angularTolDeg;
    this.hasMinLatBound = this.minLat > -90 + angularTolDeg;
    this.hasMaxLatBound = this.maxLat < 90 - angularTolDeg;

    if (this.isBoundsValid) {
      if (this.hasLonBounds) {
        this.minLonCircle.setAsGreatCircle(
          GeoCylindricalClippedPathStream.SOUTH_POLE,
          GeoCylindricalClippedPathStream.geoPointCache[0].set(0, this.minLon)
        ).reverse();

        this.maxLonCircle.setAsGreatCircle(
          GeoCylindricalClippedPathStream.SOUTH_POLE,
          GeoCylindricalClippedPathStream.geoPointCache[0].set(0, this.maxLon)
        );

        // Because each longitude boundary (min and max) covers one hemisphere, whether a point is considered to be
        // inside the overall longitude bounds depends on the orientation of the two boundaries relative to each other.
        // Specifically, if the angle sweeping from the minimum longitude boundary to the maximum longitude boundary is
        // less than 180 degrees, then a point needs to be within *both* boundaries to be inside the overall longitude
        // bounds. If the sweeping angle is greater than 180 degrees , then a point only needs to be within one of the
        // two boundaries to be inside the overall longitude bounds. If the sweeping angle is exactly 180 degrees, then
        // the distinction is moot since the insides of the two boundaries exactly overlap.
        this.areLonBoundsIntersection = this.lonRange < 180;
      }

      if (this.hasMinLatBound) {
        this.minLatCircle.set(GeoCylindricalClippedPathStream.SOUTH_POLE, (this.minLat + 90) * Avionics.Utils.DEG2RAD).reverse();
      }
      if (this.hasMaxLatBound) {
        this.maxLatCircle.set(GeoCylindricalClippedPathStream.SOUTH_POLE, (this.maxLat + 90) * Avionics.Utils.DEG2RAD);
      }
    }

    this.beginPath();
  }

  /**
   * Destroys this stream.
   */
  public destroy(): void {
    this.boundsSub.destroy();
  }

  /**
   * Compares two boundary crossing points and returns a value that indicates the relative ordering of the two points
   * with respect to their angular offsets.
   * @param a The first boundary crossing point.
   * @param b The second boundary crossing point.
   * @returns A negative number if the first point has a smaller angular offset than the second, a positive number if
   * the first point has a greater angular offset than the second, or zero if both points have the same angular offset.
   */
  private static compareCrossings(a: BoundCrossing, b: BoundCrossing): number {
    return a.angularOffset - b.angularOffset;
  }
}
