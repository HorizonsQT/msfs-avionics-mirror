import { GeoCircle, ReadonlyGeoCircle } from '../../../geo/GeoCircle';
import { LatLonInterface } from '../../../geo/GeoInterfaces';
import { GeoMath } from '../../../geo/GeoMath';
import { GeoPoint } from '../../../geo/GeoPoint';
import { MathUtils } from '../../../math/MathUtils';
import { UnitType } from '../../../math/NumberUnit';
import { ReadonlyFloat64Array, Vec3Math } from '../../../math/VecMath';
import { ArrayUtils } from '../../../utils/datastructures/ArrayUtils';
import { FlightPathCircleToCircleTurn } from '../FlightPathCircleToCircleTurn';
import { FlightPathUtils } from '../FlightPathUtils';
import { FlightPathVector, VectorTurnDirection } from '../FlightPathVector';
import { CircleVectorBuilder } from './CircleVectorBuilder';

/**
 * A solution describing a path that turns from a start point and intercepts a final path.
 */
type InterceptSolution = {
  /** The end of the starting turn. */
  startTurnEndVec: Float64Array;

  /** Whether this solution includes a great-circle intercept path to connect the starting turn to the final path. */
  hasInterceptPath: boolean;

  /**
   * A GeoCircle that defines the great-circle intercept path that connects the starting turn to the final path. Only
   * meaningful if `hasInterceptPath` is `true`.
   */
  interceptPath: GeoCircle;

  /**
   * The point where the great-circle intercept path that connects the starting turn to the final path intercepts the
   * final path. Only meaningful if `hasInterceptPath` is `true`.
   */
  interceptVec: Float64Array;

  /**
   * Whether this solution includes a final turn from the starting turn (if `hasInterceptPath` is `false`) or the
   * great-circle intercept path (if `hasInterceptPath` is `true`) onto the final path.
   */
  hasEndTurn: boolean;

  /** A GeoCircle that defines the final turn onto the final path. Only meaningful if `hasEndTurn` is `true`. */
  endTurnCircle: GeoCircle;

  /** The start of the final turn. Only meaningful if `hasEndTurn` is `true`. */
  endTurnStartVec: Float64Array;

  /** The end of the final turn. Only meaningful if `hasEndTurn` is `true`. */
  endTurnEndVec: Float64Array;
};

/**
 * Builds vectors representing paths connecting initial great-circle paths to final paths via a turn starting at the
 * start point followed by a path that intercepts the final path at a certain angle.
 */
export class InterceptCircleToPointVectorBuilder {
  private static readonly vec3Cache = ArrayUtils.create(6, () => Vec3Math.create());
  private static readonly geoCircleCache = ArrayUtils.create(3, () => new GeoCircle(Vec3Math.create(), 0));
  private static readonly intersectionCache = ArrayUtils.create(1, () => [Vec3Math.create(), Vec3Math.create()]);
  private static readonly turnCache = ArrayUtils.create(1, () => new FlightPathCircleToCircleTurn());

  private readonly circleVectorBuilder = new CircleVectorBuilder();

  private readonly interceptSolution: InterceptSolution = {
    startTurnEndVec: Vec3Math.create(),
    hasInterceptPath: false,
    interceptPath: new GeoCircle(Vec3Math.create(), 0),
    interceptVec: Vec3Math.create(),
    hasEndTurn: false,
    endTurnCircle: new GeoCircle(Vec3Math.create(), 0),
    endTurnStartVec: Vec3Math.create(),
    endTurnEndVec: Vec3Math.create(),
  };

  /**
   * Builds a sequence of flight path vectors representing a path from a defined start point and initial course which
   * turns and intercepts a final path at a specified angle using a great-circle path. Optionally includes a final turn
   * from the intercept path to the final path and/or restricts the intercept path to intercept the final path within
   * a certain distance before an end point.
   *
   * If a path cannot be found that intercepts the final path while meeting the specified requirements, then no vectors
   * will be built.
   *
   * If the initial and final paths are parallel at the start point, then no vectors will be built.
   * @param vectors The flight path vector array to which to add the vectors.
   * @param index The index in the array at which to add the vectors.
   * @param start The start point.
   * @param startPath A GeoCircle that defines the initial course. Must be a great circle.
   * @param startTurnRadius The radius of the initial turn, in meters.
   * @param startTurnDirection The direction of the initial turn. If not defined, then a direction will be
   * automatically chosen based on the geometry of the path to build.
   * @param interceptAngle The angle at which to intercept the final path, in degrees. Will be clamped to the range
   * `[0, 90]`.
   * @param endPath A GeoCircle that defines the final path.
   * @param end The end point. If both this and `maxInterceptDistanceFromEnd` are defined, then the path to build is
   * restricted to intercepting the final path within `maxInterceptDistanceFromEnd` of the end point. Otherwise, any
   * intercept point on the final path will be considered valid.
   * @param maxInterceptDistanceFromEnd The maximum distance before the end point, in meters as measured along the
   * final path, that the path to build is allowed to intercept the final path. Ignored if `end` is not defined. If
   * not defined, then any intercept point on the final path will be considered valid.
   * @param endTurnRadius The radius of the final turn, in meters. If not defined, then vectors will not be built for
   * the final turn.
   * @param startTurnVectorFlags The flags to set on the initial turn vector. Defaults to none (0).
   * @param interceptVectorFlags The flags to set on the intercept path vector. Defaults to none (0).
   * @param endTurnVectorFlags The flags to set on the final turn vector. Defaults to none (0). Ignored if a turn to
   * join the final path is not calculated.
   * @param heading The heading-to-fly to assign to all built vectors, in degrees, or `null` if no heading is to be
   * assigned. Defaults to `null`.
   * @param isHeadingTrue Whether the heading-to-fly assigned to built vectors is relative to true north instead of
   * magnetic north. Defaults to `false`.
   * @returns The number of vectors that were built and added to the array.
   * @throws Error if `startPath` is not a great circle.
   */
  public build(
    vectors: FlightPathVector[],
    index: number,
    start: ReadonlyFloat64Array | LatLonInterface,
    startPath: ReadonlyGeoCircle,
    startTurnRadius: number,
    startTurnDirection: VectorTurnDirection | undefined,
    interceptAngle: number,
    endPath: ReadonlyGeoCircle,
    end?: ReadonlyFloat64Array | LatLonInterface,
    maxInterceptDistanceFromEnd?: number,
    endTurnRadius?: number,
    startTurnVectorFlags = 0,
    interceptVectorFlags = 0,
    endTurnVectorFlags = 0,
    heading: number | null = null,
    isHeadingTrue = false
  ): number {
    if (!startPath.isGreatCircle()) {
      throw new Error('InterceptCircleToPointVectorBuilder::build(): start path is not a great circle');
    }

    if (!(start instanceof Float64Array)) {
      start = GeoPoint.sphericalToCartesian(start as LatLonInterface, InterceptCircleToPointVectorBuilder.vec3Cache[0]);
    }
    if (end && !(end instanceof Float64Array)) {
      end = GeoPoint.sphericalToCartesian(end as LatLonInterface, InterceptCircleToPointVectorBuilder.vec3Cache[1]);
    }

    const maxInterceptAngularOffsetFromEnd = maxInterceptDistanceFromEnd === undefined
      ? Infinity
      : endPath.angularWidth(UnitType.METER.convertTo(maxInterceptDistanceFromEnd, UnitType.GA_RADIAN));

    // Check whether the start path overlaps and runs in the same direction as the end path at the start point. If so,
    // then we have already "intercepted" the end path at the start point, and therefore will not write any vectors.
    let greatCircleParallelToEndPathAtStart: ReadonlyGeoCircle;
    if (endPath.isGreatCircle()) {
      greatCircleParallelToEndPathAtStart = endPath;
    } else {
      greatCircleParallelToEndPathAtStart = InterceptCircleToPointVectorBuilder.geoCircleCache[0].setAsGreatCircle(
        start,
        endPath
      );
    }
    if (
      greatCircleParallelToEndPathAtStart.isValid()
      && Vec3Math.unitAngle(startPath.center, greatCircleParallelToEndPathAtStart.center) <= GeoMath.ANGULAR_TOLERANCE
    ) {
      return 0;
    }

    if (startTurnDirection === undefined) {
      // The direction of the initial turn is not defined, so we have to choose one ourselves.
      startTurnDirection = this.selectStartTurnDirection(start, startPath, endPath);
    }

    const interceptAngleRad = MathUtils.clamp(interceptAngle * Avionics.Utils.DEG2RAD, 0, MathUtils.HALF_PI);

    // The set of great circles that intercept any given geo circle C with radius R at an angle 0 <= theta <= pi/2 is
    // equivalent to the set of great circles that are tangent to another geo circle C' concentric to C (i.e. C and C'
    // share the same center) and with radius R'. The values R, R', and theta are related by the following equation
    // (courtesy of the spherical "sine rule"):
    // sin R' = sin R * sin(pi/2 - theta) = sin R * cos(theta)

    // The locus of the centers of all circles of radius r that are tangent to a circle c with radius r_0 is equivalent
    // to the set of circles S(c) with the same center as c and positive radius |r +/- r_0|. If we further restrict the
    // set of tangent circles to those where both the original and tangent circle run in the same direction at the
    // tangent point, then the locus of centers can be further reduced to the single circle Sd(c) with the same center
    // as c with positive radius |r - r_0|.

    // Therefore, the set of centers of great circles (radius = pi/2) that are tangent to the circle C' (see above) is
    // the circle with the same center as C' and with radius |pi/2 - R'|. This circle is then also equivalent to the
    // set of centers of great circles that intercept circle C at the angle theta. Note that if C is a great circle
    // (R = pi/2), then the equation for R' reduces to R' = pi/2 - theta, and the set of centers of great circles
    // tangent to C' has radius equal to |pi/2 - (pi/2 - theta)| = theta.

    // The set of centers of great circles that intersect the end path at the desired intercept angle.
    const interceptPathCandidateCenters = InterceptCircleToPointVectorBuilder.geoCircleCache[1];

    if (endPath.isGreatCircle()) {
      interceptPathCandidateCenters.set(endPath.center, interceptAngleRad);
    } else {
      const interceptTangentCircleRadius = Math.asin(Math.sin(endPath.radius) * Math.cos(interceptAngleRad));
      interceptPathCandidateCenters.set(
        endPath.center,
        Math.abs(MathUtils.HALF_PI - interceptTangentCircleRadius)
      );
    }

    let vectorIndex = index;

    const startTurnRadiusRad = UnitType.METER.convertTo(startTurnRadius, UnitType.GA_RADIAN);
    const endTurnRadiusRad = endTurnRadius === undefined ? 0 : UnitType.METER.convertTo(endTurnRadius, UnitType.GA_RADIAN);

    const startTurnCircle = FlightPathUtils.getTurnCircleStartingFromPath(
      start, startPath,
      startTurnRadiusRad, startTurnDirection,
      InterceptCircleToPointVectorBuilder.geoCircleCache[0]
    );

    const endPathAngularTolerance = endPath.angularWidth(GeoMath.ANGULAR_TOLERANCE);

    if (endPath.isGreatCircle() && interceptAngleRad <= GeoMath.ANGULAR_TOLERANCE) {
      // If the end path is a great circle and the desired intercept angle is 0 degrees, then the only valid path is
      // when the starting turn ends exactly on the path to intercept.

      if (Math.abs(Vec3Math.unitAngle(startTurnCircle.center, endPath.center) - Math.abs(MathUtils.HALF_PI - startTurnCircle.radius)) > GeoMath.ANGULAR_TOLERANCE) {
        // The starting turn is not tangent to path to intercept.
        return 0;
      }

      const startTurnEnd = endPath.closest(
        startTurnCircle.closest(endPath.center, InterceptCircleToPointVectorBuilder.vec3Cache[2]),
        InterceptCircleToPointVectorBuilder.vec3Cache[2]
      );

      // Check whether the end of the starting turn is outside the region where the end path is allowed to be
      // intercepted. If so, then we will not write any vectors.
      if (end && maxInterceptAngularOffsetFromEnd < MathUtils.TWO_PI) {
        if (endPath.angleAlong(startTurnEnd, end, Math.PI, endPathAngularTolerance) > maxInterceptAngularOffsetFromEnd + endPathAngularTolerance) {
          return 0;
        }
      }

      return this.circleVectorBuilder.build(
        vectors, vectorIndex,
        startTurnCircle,
        start, startTurnEnd,
        startTurnVectorFlags,
        heading, isHeadingTrue
      );
    }

    // Find the great-circle path that intersects the end path at the desired intercept angle and is tangent to the
    // starting turn.

    // The set of centers of great circles that are tangent to the starting turn.
    const startTurnInterceptTangentCenters = InterceptCircleToPointVectorBuilder.geoCircleCache[2].set(
      startTurnCircle.center,
      Math.abs(MathUtils.HALF_PI - startTurnCircle.radius)
    );

    const interceptPathCenters = InterceptCircleToPointVectorBuilder.intersectionCache[0];
    let interceptPathCount = interceptPathCandidateCenters.intersection(
      startTurnInterceptTangentCenters,
      interceptPathCenters,
      GeoMath.ANGULAR_TOLERANCE
    );

    if (interceptPathCount === 0) {
      // There are either no possible intercept paths that are tangent to the starting turn or an infinite number of
      // them.

      const endPathTurnRadiusRad = FlightPathUtils.getTurnRadiusFromCircle(endPath);
      if (
        startTurnRadiusRad <= endPathTurnRadiusRad + GeoMath.ANGULAR_TOLERANCE
        && Vec3Math.unitAngle(startTurnCircle.center, endPath.center) <= GeoMath.ANGULAR_TOLERANCE
      ) {
        // The starting turn is concentric to the end path and the *turn* radius of the starting turn is less than or
        // equal to the *turn* radius of the end path. In this case, there are an infinite number of possible intercept
        // paths because any great-circle path that is tangent to the starting turn will intercept the end path at the
        // desired intercept angle.

        // The distance from the start point to the point where the start path intercepts the end path.
        let startToInterceptDistance: number;
        // The point where the start path intercepts the end path.
        let startPathInterceptVec: ReadonlyFloat64Array;

        let endTurnCircle: GeoCircle | undefined = undefined;
        let endTurnStartPathAnticipationDistance = 0;
        let endTurnEndPathAnticipationAngle = 0;

        if (startTurnRadiusRad < endPathTurnRadiusRad - GeoMath.ANGULAR_TOLERANCE) {
          // The turn radius of the starting turn is less than the turn radius of the end path. Therefore, we require
          // a great-circle intercept path of non-zero length to connect the starting turn with the end path.

          startToInterceptDistance = endPathTurnRadiusRad === MathUtils.HALF_PI
            ? MathUtils.HALF_PI
            : Math.atan(Math.sin(interceptAngleRad) * Math.tan(endPathTurnRadiusRad));
          startPathInterceptVec = startPath.offsetDistanceAlong(start, startToInterceptDistance, InterceptCircleToPointVectorBuilder.vec3Cache[2]);

          if (endTurnRadiusRad > GeoMath.ANGULAR_TOLERANCE) {
            // If we are building an ending turn, then we need to find whether an ending turn that is tangent to both
            // the start path and the end path is possible.

            const endTurnCircleRadius = endPath.radius > MathUtils.HALF_PI ? Math.PI - endTurnRadiusRad : endTurnRadiusRad;

            // The set of centers of circles with radius equal to the desired ending turn radius that are tangent to
            // the start path.
            const startPathEndTurnTangentCenters = InterceptCircleToPointVectorBuilder.geoCircleCache[1].set(
              startPath.center,
              Math.abs(endTurnCircleRadius - startPath.radius)
            );
            // The set of centers of circles with radius equal to the desired ending turn radius that are tangent to
            // the end path.
            const endPathEndTurnTangentCenters = InterceptCircleToPointVectorBuilder.geoCircleCache[1].set(
              startPath.center,
              Math.abs(endTurnCircleRadius - startPath.radius)
            );

            const endTurnCount = startPathEndTurnTangentCenters.intersection(
              endPathEndTurnTangentCenters,
              interceptPathCenters,
              GeoMath.ANGULAR_TOLERANCE
            );

            // If an ending turn is not possible, then we will not build any vectors.
            if (endTurnCount === 0) {
              return 0;
            }

            // There can be up to two possible ending turn circles. Due to the way we have set up the math, the center
            // of the circle that we want is always the first point in the intersections array.
            endTurnCircle = InterceptCircleToPointVectorBuilder.geoCircleCache[1].set(interceptPathCenters[0], endTurnCircleRadius);
            const endTurnCenterVec = FlightPathUtils.getTurnCenterFromCircle(endTurnCircle, InterceptCircleToPointVectorBuilder.vec3Cache[3]);

            const endTurnStartVec = startPath.closest(endTurnCenterVec, InterceptCircleToPointVectorBuilder.vec3Cache[4]);
            // The distance along the start path from the start point to the start of the ending turn.
            const startToEndTurnStartDistance = startPath.distanceAlong(start, endTurnStartVec, Math.PI, GeoMath.ANGULAR_TOLERANCE);

            // The start of the ending turn lies *before* the start point. This would require us to track backward
            // along the start path (or forward for a distance greater than half the circumference of the earth) to
            // travel from the start point to the start of the ending turn. In this case we consider the path to be
            // invalid and will not build any vectors.
            if (startToEndTurnStartDistance > startToInterceptDistance + GeoMath.ANGULAR_TOLERANCE) {
              return 0;
            }

            endTurnStartPathAnticipationDistance = Math.max(0, startToInterceptDistance - startToEndTurnStartDistance);

            const endTurnEndVec = endPath.closest(endTurnCenterVec, InterceptCircleToPointVectorBuilder.vec3Cache[4]);

            endTurnEndPathAnticipationAngle = endPath.angleAlong(startPathInterceptVec, endTurnEndVec, Math.PI, endPathAngularTolerance);
            if (endTurnEndPathAnticipationAngle > endPath.arcLength(Math.PI)) {
              endTurnEndPathAnticipationAngle = 0;
            }
          }
        } else {
          // The turn radius of the starting turn is equal to the turn radius of the end path. In other words, the
          // starting turn is coincident with the end path. Therefore, any path along the starting turn already
          // "intercepts" the end path, so there is never a need for a separate intercept path that connects the
          // starting turn with the end path. There is also never a need for an ending turn.

          startToInterceptDistance = 0;
          startPathInterceptVec = start;
        }

        // At this point, we can "exit" the starting turn at any point and the resulting path would intercept the end
        // path as desired. However, we also need to check whether we are restricted in where we can intercept the end
        // path. If not, then we can skip the starting turn and intercept the end path directly from the start path.
        // If we are restricted, then we need to ensure that we intercept the end path in the allowed region. If
        // intercepting from the start path does not meet the requirements, then we will path a turn along the starting
        // turn for the smallest distance such that when we exit the starting turn the resulting intercept path
        // intercepts the end path in the allowed region.

        let startTurnAngularWidth = 0;

        if (end && maxInterceptAngularOffsetFromEnd < MathUtils.TWO_PI) {
          const interceptToEndAngle = MathUtils.normalizeAngle(endPath.angleAlong(startPathInterceptVec, end, Math.PI) - endTurnEndPathAnticipationAngle);
          if (interceptToEndAngle > maxInterceptAngularOffsetFromEnd + endPathAngularTolerance) {
            startTurnAngularWidth = interceptToEndAngle - maxInterceptAngularOffsetFromEnd;
          }
        }

        let interceptPath: ReadonlyGeoCircle;
        let startTurnEndVec: ReadonlyFloat64Array;

        if (startTurnAngularWidth === 0) {
          startTurnEndVec = start;
          interceptPath = startPath;
        } else {
          startTurnEndVec = startTurnCircle.offsetAngleAlong(start, startTurnAngularWidth, InterceptCircleToPointVectorBuilder.vec3Cache[3], Math.PI);
          interceptPath = InterceptCircleToPointVectorBuilder.geoCircleCache[1].setAsGreatCircle(
            startTurnEndVec,
            startTurnCircle
          );

          // Starting turn.
          if (startTurnAngularWidth > GeoMath.ANGULAR_TOLERANCE) {
            vectorIndex += this.circleVectorBuilder.build(
              vectors, vectorIndex,
              startTurnCircle,
              start, startTurnEndVec,
              startTurnVectorFlags,
              heading, isHeadingTrue
            );
          }
        }

        if (endTurnCircle) {
          // There is an ending turn onto the end path.

          const interceptPathDistance = startToInterceptDistance - endTurnStartPathAnticipationDistance;

          const endTurnStartVec = interceptPath.offsetDistanceAlong(startTurnEndVec, interceptPathDistance, InterceptCircleToPointVectorBuilder.vec3Cache[4], Math.PI);
          const endTurnEndVec = endPath.offsetAngleAlong(
            startPathInterceptVec,
            startTurnAngularWidth + endTurnEndPathAnticipationAngle,
            InterceptCircleToPointVectorBuilder.vec3Cache[5],
            Math.PI
          );

          // Intercept path.
          if (interceptPathDistance > GeoMath.ANGULAR_TOLERANCE) {
            vectorIndex += this.circleVectorBuilder.build(
              vectors, vectorIndex,
              interceptPath,
              startTurnEndVec, endTurnStartVec,
              interceptVectorFlags,
              heading, isHeadingTrue
            );
          }

          // Ending turn.
          if (
            endTurnStartPathAnticipationDistance > GeoMath.ANGULAR_TOLERANCE
            || endTurnEndPathAnticipationAngle > endPathAngularTolerance
          ) {
            vectorIndex += this.circleVectorBuilder.build(
              vectors, vectorIndex,
              endTurnCircle,
              endTurnStartVec, endTurnEndVec,
              endTurnVectorFlags,
              heading, isHeadingTrue
            );
          }
        } else {
          // There is no ending turn onto the end path.

          // Intercept path.
          if (startToInterceptDistance > GeoMath.ANGULAR_TOLERANCE) {
            const interceptVec = startTurnAngularWidth === 0
              ? startPathInterceptVec
              : endPath.offsetAngleAlong(startPathInterceptVec, startTurnAngularWidth, InterceptCircleToPointVectorBuilder.vec3Cache[4], Math.PI);

            vectorIndex += this.circleVectorBuilder.build(
              vectors, vectorIndex,
              interceptPath,
              startTurnEndVec, interceptVec,
              interceptVectorFlags,
              heading, isHeadingTrue
            );
          }
        }

        return vectorIndex - index;
      } else {
        // In this case, there are no possible intercept paths, so we will not write any vectors.

        return 0;
      }
    }

    // The distance between the centers of the starting turn circle and the end path at which the the start turn
    // intersects the end path at the desired intercept angle. Derivation is from the spherical cosine rule.
    const startTurnEndPathInterceptAtDesiredAngleDistance = endPath.isGreatCircle()
      ? Math.acos(Math.sin(startTurnCircle.radius) * Math.cos(interceptAngleRad))
      : Math.acos(
        Math.cos(startTurnCircle.radius) * Math.cos(endPath.radius)
        + Math.sin(startTurnCircle.radius) * Math.sin(endPath.radius) * Math.cos(interceptAngleRad)
      );

    const startTurnEndPathDistance = Vec3Math.unitAngle(startTurnCircle.center, endPath.center);
    // Whether the distance between the centers of the starting turn circle and the end path is less than or equal to
    // the distance at which they intersect each other at the desired intercept angle.
    const isStartTurnEndPathDistanceBelowInterceptThreshold = startTurnEndPathDistance <= startTurnEndPathInterceptAtDesiredAngleDistance + GeoMath.ANGULAR_TOLERANCE;

    // Find the intersections between the starting turn and the end path where the intersection occurs at an angle less
    // than or equal to the desired intercept angle.

    const startTurnEndPathTurn = InterceptCircleToPointVectorBuilder.turnCache[0];
    if (isStartTurnEndPathDistanceBelowInterceptThreshold) {
      startTurnEndPathTurn
        .setFromCircle(startTurnCircle)
        .setToCircle(endPath)
        .updateAnchors(GeoMath.ANGULAR_TOLERANCE);
    } else {
      const nanVector = Vec3Math.set(NaN, NaN, NaN, InterceptCircleToPointVectorBuilder.vec3Cache[2]);
      startTurnEndPathTurn
        .setFromCircle(nanVector, NaN)
        .setToCircle(nanVector, NaN)
        .updateAnchors(GeoMath.ANGULAR_TOLERANCE);
    }

    if (interceptPathCount === 2) {
      // There are two valid intercept paths connecting the starting turn to the end path. We need to potentially
      // eliminate one of them based on the distance along the intercept path from the starting turn to the end path.

      if (Math.abs(startTurnEndPathDistance - startTurnEndPathInterceptAtDesiredAngleDistance) <= GeoMath.ANGULAR_TOLERANCE) {
        // If the distance between the centers of the starting turn circle and the end path is equal to the distance
        // at which the two paths intersect at the desired intercept angle, then both intercept paths are equivalent
        // in terms of distance traveled along them from the starting turn to the end path. Therefore, we will keep
        // both paths.
      } else {
        // If the distance between the centers of the starting turn circle and the end path is not equal to the
        // distance at which the two paths intersect at the desired intercept angle, then the distance traveled along
        // one intercept path from the starting turn to the end path will be less than the distance along the other.
        // If the distance between the centers is less than the threshold, then the desired intercept path is always
        // the first solution in the array (this is a consequence of how we set up the math). Otherwise, the desired
        // path is always the second solution in the array.

        if (!isStartTurnEndPathDistanceBelowInterceptThreshold) {
          // We want to choose the second intercept path in the array, so copy the second vector into the first one.
          Vec3Math.copy(interceptPathCenters[1], interceptPathCenters[0]);
        }

        interceptPathCount = 1;
      }
    }

    const selectedIntercept = this.selectInterceptSolution(
      start,
      startTurnCircle,
      startTurnEndPathTurn,
      interceptPathCenters, interceptPathCount,
      endPath,
      end,
      maxInterceptAngularOffsetFromEnd,
      endTurnRadiusRad,
      this.interceptSolution
    );

    if (!selectedIntercept) {
      return 0;
    }

    // Starting turn.
    if (Vec3Math.unitAngle(start, selectedIntercept.startTurnEndVec) > GeoMath.ANGULAR_TOLERANCE) {
      vectorIndex += this.circleVectorBuilder.build(
        vectors, vectorIndex,
        startTurnCircle,
        start, selectedIntercept.startTurnEndVec,
        startTurnVectorFlags,
        heading, isHeadingTrue
      );
    }

    // Intercept path.
    if (selectedIntercept.hasInterceptPath) {
      const interceptPathEndVec = selectedIntercept.hasEndTurn ? selectedIntercept.endTurnStartVec : selectedIntercept.interceptVec;
      if (Vec3Math.unitAngle(selectedIntercept.startTurnEndVec, interceptPathEndVec) > GeoMath.ANGULAR_TOLERANCE) {
        vectorIndex += this.circleVectorBuilder.build(
          vectors, vectorIndex,
          selectedIntercept.interceptPath,
          selectedIntercept.startTurnEndVec, interceptPathEndVec,
          interceptVectorFlags,
          heading, isHeadingTrue
        );
      }
    }

    // Ending turn.
    if (selectedIntercept.hasEndTurn && Vec3Math.unitAngle(selectedIntercept.endTurnStartVec, selectedIntercept.endTurnEndVec) > GeoMath.ANGULAR_TOLERANCE) {
      vectorIndex += this.circleVectorBuilder.build(
        vectors, vectorIndex,
        selectedIntercept.endTurnCircle,
        selectedIntercept.endTurnStartVec, selectedIntercept.endTurnEndVec,
        endTurnVectorFlags,
        heading, isHeadingTrue
      );
    }

    return vectorIndex - index;
  }

  private static readonly selectStartTurnDirectionCache = {
    vec3: ArrayUtils.create(1, () => Vec3Math.create()),
    geoCircle: ArrayUtils.create(1, () => new GeoCircle(Vec3Math.create(), 0)),
    intersection: ArrayUtils.create(1, () => [Vec3Math.create(), Vec3Math.create()]),
  };

  /**
   * Selects an appropriate direction for a turn starting from a defined start point and initial course and ending on
   * an intercept course toward a final path. If the start point also lies on the final path, then the final path
   * cannot be parallel to the initial course at the start point.
   * @param start The start point.
   * @param startPath A GeoCircle that defines the initial course. Must be a great circle.
   * @param endPath A GeoCircle that defines the final path.
   * @returns An appropriate direction for a turn starting from the specified start point and initial course and ending
   * on an intercept course toward the specified final path.
   */
  private selectStartTurnDirection(start: ReadonlyFloat64Array, startPath: ReadonlyGeoCircle, endPath: ReadonlyGeoCircle): VectorTurnDirection {
    const intersections = InterceptCircleToPointVectorBuilder.selectStartTurnDirectionCache.intersection[0];

    // Find the intersections of the start path with the end path.
    const intersectionCount = startPath.intersection(endPath, intersections, GeoMath.ANGULAR_TOLERANCE);

    if (intersectionCount < 2) {
      // The end path is either tangent to the start path or does not intersect the start path. In this case, the
      // entire end path lies on one side of the start path. Therefore, we will turn toward the side that includes
      // the end path.

      return startPath.encircles(endPath.center, false) === endPath.radius < MathUtils.HALF_PI
        ? 'left'
        : 'right';
    } else {
      // The end path is secant to the start path. In this case, we will choose the intersection point that is
      // closest to the start point. Then we will determine the direction in which the end path crosses the start
      // path at that intersection (i.e. at the intersection looking in the direction of the start path, is the
      // direction of the end path to the left or the right?). We will turn toward the crossing direction.

      const firstIntersectionOffset = MathUtils.normalizeAngle(
        startPath.angleAlong(start, intersections[0], Math.PI, GeoMath.ANGULAR_TOLERANCE),
        -Math.PI
      );
      const secondIntersectionOffset = MathUtils.normalizeAngle(
        startPath.angleAlong(start, intersections[1], Math.PI, GeoMath.ANGULAR_TOLERANCE),
        -Math.PI
      );
      const closestIntersection = intersections[Math.abs(firstIntersectionOffset) <= Math.abs(secondIntersectionOffset) ? 0 : 1];

      const isCrossingToOutsideOfStartPath = Vec3Math.dot(
        Vec3Math.cross(closestIntersection, endPath.center, InterceptCircleToPointVectorBuilder.selectStartTurnDirectionCache.vec3[0]),
        startPath.center
      ) >= 0;

      return isCrossingToOutsideOfStartPath ? 'right' : 'left';
    }
  }

  private static readonly selectInterceptCache = {
    vec3: ArrayUtils.create(1, () => Vec3Math.create()),
    turn: ArrayUtils.create(1, () => new FlightPathCircleToCircleTurn()),
    solution: {
      startTurnEndVec: Vec3Math.create(),
      hasInterceptPath: false,
      interceptPath: new GeoCircle(Vec3Math.create(), 0),
      interceptVec: Vec3Math.create(),
      hasEndTurn: false,
      endTurnCircle: new GeoCircle(Vec3Math.create(), 0),
      endTurnStartVec: Vec3Math.create(),
      endTurnEndVec: Vec3Math.create(),
    } as InterceptSolution,
  };

  /**
   * Selects a solution for a path that turns from a start point and intercepts a final path at a desired intercept
   * angle. The path may optionally include a final turn from the intercept path to the final path and/or be restricted
   * to intercepting the final path within a certain angular distance (as measured along the final path) from an end
   * point.
   * 
   * The solution is selected from up to four possible paths: up to two paths that intercept the final path directly
   * from the starting turn and up to two paths that intercept the final path using a great-circle path to connect the
   * starting turn and final path. The preferred solution is the one that requires traveling along the starting turn
   * for the shortest possible distance.
   * @param start The start point.
   * @param startTurnCircle A GeoCircle that defines the starting turn.
   * @param startTurnEndPathTurn A circle-to-circle turn object that defines possible turns from the starting turn
   * directly to the final path. Any intersections between the starting turn and the final path defined by the turn
   * object are guaranteed to occur at points where the starting turn crosses the final path at an angle less than or
   * equal to the desired intercept angle.
   * @param interceptPathCenters An array containing the center points of up to two intercept paths that connect the
   * starting turn and the final path.
   * @param interceptPathCount The number of intercept paths contained in the `interceptPathCenters` array.
   * @param endPath A GeoCircle that defines the final path.
   * @param end The end point. If both this and `maxInterceptAngularOffsetFromEnd` are defined, then the selected
   * solution is restricted to intercepting the final path within `maxInterceptAngularOffsetFromEnd` of the end point.
   * Otherwise, any intercept point on the final path will be considered valid.
   * @param maxInterceptAngularOffsetFromEnd The maximum angular offset before the end point, in radians, that the
   * selected solution is allowed to intercept the final path. Ignored if `end` is not defined. If not defined, then
   * any intercept point on the final path will be considered valid.
   * @param endTurnRadiusRad The radius of the final turn, in great-arc radians.
   * @param out The object to which to write the selected solution.
   * @returns The selected intercept solution, or `undefined` if no valid intercept solution exists.
   */
  private selectInterceptSolution(
    start: ReadonlyFloat64Array,
    startTurnCircle: ReadonlyGeoCircle,
    startTurnEndPathTurn: FlightPathCircleToCircleTurn,
    interceptPathCenters: readonly ReadonlyFloat64Array[],
    interceptPathCount: number,
    endPath: ReadonlyGeoCircle,
    end: ReadonlyFloat64Array | undefined,
    maxInterceptAngularOffsetFromEnd: number,
    endTurnRadiusRad: number,
    out: InterceptSolution
  ): InterceptSolution | undefined {
    const startTurnEndPathIntersections = startTurnEndPathTurn.getIntersections();
    const startTurnEndPathIntersectionCount = startTurnEndPathIntersections.length;

    if (startTurnEndPathIntersectionCount === 0 && interceptPathCount === 0) {
      return undefined;
    }

    const startTurnAngularTolerance = startTurnCircle.angularWidth(GeoMath.ANGULAR_TOLERANCE);
    const endPathAngularTolerance = endPath.angularWidth(GeoMath.ANGULAR_TOLERANCE);
    const isInterceptRestrictedByEnd = end && maxInterceptAngularOffsetFromEnd < MathUtils.TWO_PI;
    const needEndTurn = endTurnRadiusRad > GeoMath.ANGULAR_TOLERANCE;

    const currentSolution = InterceptCircleToPointVectorBuilder.selectInterceptCache.solution;

    let bestSolution: InterceptSolution | undefined;
    let bestSolutionStartTurnEndAngularOffset = 0;

    for (let i = 0; i < startTurnEndPathIntersectionCount; i++) {
      Vec3Math.copy(startTurnEndPathIntersections[i], currentSolution.startTurnEndVec);

      let startTurnEndAngularOffset: number | undefined;

      if (!needEndTurn) {
        // If we do not need an ending turn, then we are guaranteed that the end of the starting turn won't change from
        // this point on. Therefore, we can calculate how far along the starting turn we have to travel for the current
        // solution.

        startTurnEndAngularOffset = startTurnCircle.angleAlong(start, currentSolution.startTurnEndVec, Math.PI, startTurnAngularTolerance);

        // If there is already a valid selection and the current solution would require traveling an equal or greater
        // distance along the starting turn, then discard the solution.
        if (bestSolution && startTurnEndAngularOffset >= bestSolutionStartTurnEndAngularOffset - startTurnAngularTolerance) {
          continue;
        }
      }

      let hasEndTurn = false;

      if (needEndTurn) {
        const result = this.calculateEndTurnForSolution(startTurnEndPathTurn.selectAnchor(i), endTurnRadiusRad, currentSolution);

        // If we could not calculate an ending turn when one was necessary, then discard the solution.
        if (result === undefined) {
          continue;
        }

        hasEndTurn = result;
      }

      let interceptVec: ReadonlyFloat64Array;

      if (hasEndTurn) {
        Vec3Math.copy(currentSolution.endTurnStartVec, currentSolution.startTurnEndVec);

        interceptVec = currentSolution.endTurnEndVec;
      } else {
        interceptVec = currentSolution.startTurnEndVec;
      }

      // Check whether the solution intercepts the end path in the allowed region. If it does not, then discard it.
      if (isInterceptRestrictedByEnd) {
        if (endPath.angleAlong(interceptVec, end, Math.PI, endPathAngularTolerance) > maxInterceptAngularOffsetFromEnd + endPathAngularTolerance) {
          continue;
        }
      }

      // Check if we still need to calculate how far along the starting turn we have to travel for the current
      // solution.
      if (startTurnEndAngularOffset === undefined) {
        startTurnEndAngularOffset = startTurnCircle.angleAlong(start, currentSolution.startTurnEndVec, Math.PI, startTurnAngularTolerance);

        // If there is already a valid selection and the current solution would require traveling an equal or greater
        // distance along the starting turn, then discard the solution.
        if (bestSolution && startTurnEndAngularOffset >= bestSolutionStartTurnEndAngularOffset - startTurnAngularTolerance) {
          continue;
        }
      }

      // If we have reached this point, then either there is no existing valid solution or the current solution
      // requires traveling a shorter distance along the starting turn than the best existing solution. Either way, we
      // should make the current solution the best solution.

      bestSolution = out;
      bestSolutionStartTurnEndAngularOffset = startTurnEndAngularOffset;

      Vec3Math.copy(currentSolution.startTurnEndVec, out.startTurnEndVec);

      out.hasInterceptPath = false;

      out.hasEndTurn = hasEndTurn;
      if (hasEndTurn) {
        out.endTurnCircle.set(currentSolution.endTurnCircle.center, currentSolution.endTurnCircle.radius);
        Vec3Math.copy(currentSolution.endTurnStartVec, out.endTurnStartVec);
        Vec3Math.copy(currentSolution.endTurnEndVec, out.endTurnEndVec);
      }
    }
    for (let i = 0; i < interceptPathCount; i++) {
      currentSolution.interceptPath.set(interceptPathCenters[i], MathUtils.HALF_PI);

      FlightPathUtils.getTangentPointBetweenCircles(currentSolution.interceptPath, startTurnCircle, currentSolution.startTurnEndVec);

      if (!Vec3Math.isFinite(currentSolution.startTurnEndVec)) {
        continue;
      }

      let startTurnEndAngularOffset: number | undefined;

      if (!needEndTurn) {
        // If we do not need an ending turn, then we are guaranteed that the end of the starting turn won't change from
        // this point on. Therefore, we can calculate how far along the starting turn we have to travel for the current
        // solution.

        startTurnEndAngularOffset = startTurnCircle.angleAlong(start, currentSolution.startTurnEndVec, Math.PI, startTurnAngularTolerance);

        // If there is already a valid selection and the current solution would require traveling an equal or greater
        // distance along the starting turn, then discard the solution.
        if (bestSolution && startTurnEndAngularOffset >= bestSolutionStartTurnEndAngularOffset - startTurnAngularTolerance) {
          continue;
        }
      }

      // Find where the intercept path intercepts the end path.

      const endTurn = InterceptCircleToPointVectorBuilder.selectInterceptCache.turn[0]
        .setFromCircle(currentSolution.interceptPath)
        .setToCircle(endPath)
        .updateAnchors(GeoMath.ANGULAR_TOLERANCE);

      const interceptCandidates = endTurn.getIntersections();
      const interceptCount = interceptCandidates.length;

      // If we could not find the intercept point, then discard the solution.
      if (interceptCount === 0) {
        continue;
      }

      if (interceptCount === 2) {
        // There are two candidate intercept points. Choose the one that is closer to the end of the starting turn as
        // measured along the intercept path.

        const candidate1AngularDistance = currentSolution.interceptPath.angleAlong(
          currentSolution.startTurnEndVec,
          interceptCandidates[0],
          Math.PI,
          GeoMath.ANGULAR_TOLERANCE
        );
        const candidate2AngularDistance = currentSolution.interceptPath.angleAlong(
          currentSolution.startTurnEndVec,
          interceptCandidates[1],
          Math.PI,
          GeoMath.ANGULAR_TOLERANCE
        );

        endTurn.selectAnchor(candidate2AngularDistance < candidate1AngularDistance ? 1 : 0);
      } else {
        endTurn.selectAnchor(0);
      }

      Vec3Math.copy(endTurn.getSelectedAnchor()!, currentSolution.interceptVec);

      let hasInterceptPath = true;
      let hasEndTurn = false;

      if (needEndTurn) {
        const result = this.calculateEndTurnForSolution(endTurn, endTurnRadiusRad, currentSolution);

        // If we could not calculate an ending turn when one was necessary, then discard the solution.
        if (result === undefined) {
          continue;
        }

        hasEndTurn = result;
      }

      let interceptVec: ReadonlyFloat64Array;

      if (hasEndTurn) {
        // The distance along the intercept path from the end of the starting turn to where the intercept path
        // intercepts the end path.
        const interceptPathTotalDistance = currentSolution.interceptPath.angleAlong(
          currentSolution.startTurnEndVec,
          currentSolution.interceptVec,
          Math.PI,
          GeoMath.ANGULAR_TOLERANCE
        );
        // The distance along the intercept path from the end of the starting turn to the start of the ending turn.
        const interceptPathDistanceToEndTurnStart = currentSolution.interceptPath.angleAlong(
          currentSolution.startTurnEndVec,
          currentSolution.endTurnStartVec,
          Math.PI,
          GeoMath.ANGULAR_TOLERANCE
        );

        if (interceptPathDistanceToEndTurnStart > interceptPathTotalDistance) {
          // The start of the ending turn lies before the end of the starting turn. In this case, we will attempt to
          // skip the intercept path and recalculate the ending turn such that it starts from the starting turn.

          endTurn
            .setFromCircle(startTurnCircle)
            .setToCircle(endPath)
            .updateAnchors(GeoMath.ANGULAR_TOLERANCE);

          const anchorCandidates = endTurn.getAnchors();

          // If we could not calculate an ending turn when one was necessary, then discard the solution.
          if (anchorCandidates.length === 0) {
            continue;
          }

          if (anchorCandidates.length > 1) {
            // There are two candidate anchor points. Choose the one that is closer to the start of the intercept path
            // as measured along the starting turn.

            const candidate1AngularDistance = startTurnCircle.angleAlong(
              currentSolution.startTurnEndVec,
              anchorCandidates[0],
              Math.PI,
              GeoMath.ANGULAR_TOLERANCE
            );
            const candidate2AngularDistance = startTurnCircle.angleAlong(
              currentSolution.startTurnEndVec,
              anchorCandidates[1],
              Math.PI,
              GeoMath.ANGULAR_TOLERANCE
            );

            endTurn.selectAnchor(candidate2AngularDistance < candidate1AngularDistance ? 1 : 0);
          } else {
            endTurn.selectAnchor(0);
          }

          const result = this.calculateEndTurnForSolution(endTurn, endTurnRadiusRad, currentSolution);

          // If we could not calculate an ending turn when one was necessary, then discard the solution.
          if (result === undefined) {
            continue;
          }

          hasInterceptPath = false;

          if (result) {
            const interceptPathStartVec = Vec3Math.copy(currentSolution.startTurnEndVec, InterceptCircleToPointVectorBuilder.selectInterceptCache.vec3[0]);

            // The angular offset along the starting turn from the start of the newly calculated ending turn to the
            // start of the original intercept path.
            const startTurnEndTurnToInterceptPathOffset = startTurnCircle.angleAlong(
              currentSolution.endTurnStartVec,
              interceptPathStartVec,
              Math.PI,
              startTurnAngularTolerance
            );

            // If the newly calculated ending turn starts after the original intercept path, then discard the solution
            // because traveling along the starting turn to the start of the new ending turn will cause us to head
            // toward the end path at an angle greater than the desired intercept angle.
            if (startTurnEndTurnToInterceptPathOffset > Math.PI) {
              continue;
            }

            Vec3Math.copy(currentSolution.endTurnStartVec, currentSolution.startTurnEndVec);

            interceptVec = currentSolution.endTurnEndVec;
          } else {
            // No ending turn is needed between the starting turn and end path because they are tangent. Therefore, find
            // the tangent point and skip the ending turn.

            FlightPathUtils.getTangentPointBetweenCircles(startTurnCircle, endPath, currentSolution.startTurnEndVec);

            // If we could not calculate the tangent point, then discard the solution.
            if (!Vec3Math.isFinite(currentSolution.startTurnEndVec)) {
              continue;
            }

            hasEndTurn = false;
            interceptVec = currentSolution.startTurnEndVec;
          }
        } else {
          interceptVec = currentSolution.endTurnEndVec;
        }
      } else {
        interceptVec = currentSolution.interceptVec;
      }

      // Check whether the solution intercepts the end path in the allowed region. If it does not, then discard it.
      if (isInterceptRestrictedByEnd) {
        if (endPath.angleAlong(interceptVec, end, Math.PI, endPathAngularTolerance) > maxInterceptAngularOffsetFromEnd + endPathAngularTolerance) {
          continue;
        }
      }

      // Check if we still need to calculate how far along the starting turn we have to travel for the current
      // solution.
      if (startTurnEndAngularOffset === undefined) {
        startTurnEndAngularOffset = startTurnCircle.angleAlong(start, currentSolution.startTurnEndVec, Math.PI, startTurnAngularTolerance);

        // If there is already a valid selection and the current solution would require traveling an equal or greater
        // distance along the starting turn, then discard the solution.
        if (bestSolution && startTurnEndAngularOffset >= bestSolutionStartTurnEndAngularOffset - startTurnAngularTolerance) {
          continue;
        }
      }

      // If we have reached this point, then either there is no existing valid solution or the current solution
      // requires traveling a shorter distance along the starting turn than the best existing solution. Either way, we
      // should make the current solution the best solution.

      bestSolution = out;
      bestSolutionStartTurnEndAngularOffset = startTurnEndAngularOffset;

      Vec3Math.copy(currentSolution.startTurnEndVec, out.startTurnEndVec);

      out.hasInterceptPath = hasInterceptPath;
      if (hasInterceptPath) {
        out.interceptPath.set(currentSolution.interceptPath.center, currentSolution.interceptPath.radius);
        Vec3Math.copy(currentSolution.interceptVec, out.interceptVec);
      }

      out.hasEndTurn = hasEndTurn;
      if (hasEndTurn) {
        out.endTurnCircle.set(currentSolution.endTurnCircle.center, currentSolution.endTurnCircle.radius);
        Vec3Math.copy(currentSolution.endTurnStartVec, out.endTurnStartVec);
        Vec3Math.copy(currentSolution.endTurnEndVec, out.endTurnEndVec);
      }
    }

    return bestSolution;
  }

  /**
   * Calculates an anticipated turn onto the final path for a intercept path solution.
   * @param turn A circle-to-circle turn object that defines the anticipated turn. The turn must have a selected anchor
   * point.
   * @param endTurnRadiusRad The radius of the turn, in great-arc radians.
   * @param solution The solution to which to write the result.
   * @returns True if a turn was successfully calculated, false if a turn is not needed, or `undefined` if a turn is
   * needed but could not be calculated.
   */
  private calculateEndTurnForSolution(
    turn: FlightPathCircleToCircleTurn,
    endTurnRadiusRad: number,
    solution: InterceptSolution
  ): boolean | undefined {
    const angleDelta = turn.getAngleDelta()!;

    if (Math.abs(angleDelta) <= GeoMath.ANGULAR_TOLERANCE) {
      // The from path is tangent to the end path, so we don't need to calculate an ending turn.
      return false;
    }

    if (
      !turn.isTurnValid()
      || endTurnRadiusRad < turn.getMinTurnRadius() - GeoMath.ANGULAR_TOLERANCE
      || endTurnRadiusRad > turn.getMaxTurnRadius() + GeoMath.ANGULAR_TOLERANCE
    ) {
      return undefined;
    }

    turn.setTurnRadius(endTurnRadiusRad);

    turn.getTurnCircle(solution.endTurnCircle);
    turn.getTurnStart(solution.endTurnStartVec);
    turn.getTurnEnd(solution.endTurnEndVec);

    return true;
  }
}
