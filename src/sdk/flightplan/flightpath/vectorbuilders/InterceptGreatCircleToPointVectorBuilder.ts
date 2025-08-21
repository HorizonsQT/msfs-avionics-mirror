import { ReadonlyGeoCircle } from '../../../geo/GeoCircle';
import { LatLonInterface } from '../../../geo/GeoInterfaces';
import { UnitType } from '../../../math/NumberUnit';
import { ReadonlyFloat64Array } from '../../../math/VecMath';
import { FlightPathVector, VectorTurnDirection } from '../FlightPathVector';
import { InterceptCircleToPointVectorBuilder } from './InterceptCircleToPointVectorBuilder';

/**
 * Builds vectors representing paths connecting initial great-circle paths to final great-circle paths via a turn
 * starting at the start point followed by a path that intercepts the final path at a certain angle.
 * @deprecated Please use {@link InterceptCircleToPointVectorBuilder} instead.
 */
export class InterceptGreatCircleToPointVectorBuilder {
  private static readonly HALF_EARTH_CIRCUMFERENCE = UnitType.GA_RADIAN.convertTo(Math.PI, UnitType.METER);

  private readonly interceptCircleToPointVectorBuilder = new InterceptCircleToPointVectorBuilder();

  /**
   * Builds a sequence of flight path vectors representing a path from a defined start point and initial course which
   * turns and intercepts a final course at a specified angle using a great-circle path. Optionally includes a final
   * turn from the intercept path to the final course and/or restricts the intercept path to intercept the final course
   * within a certain distance before an end point.
   *
   * If a path cannot be found that intercepts the final path while meeting the specified requirements, then no vectors
   * will be built.
   *
   * If the initial and final courses are parallel, then no vectors will be built.
   * @param vectors The flight path vector array to which to add the vectors.
   * @param index The index in the array at which to add the vectors.
   * @param start The start point.
   * @param startPath A GeoCircle that defines the initial course. Must be a great circle.
   * @param startTurnRadius The radius of the initial turn, in meters.
   * @param startTurnDirection The direction of the initial turn. If not defined, then a direction will be
   * automatically chosen based on the geometry of the path to build.
   * @param interceptAngle The angle at which to intercept the final path, in degrees. Will be clamped to the range
   * `[0, 90]`.
   * @param end The end point. If defined, then the path to build is restricted to intercepting the final course on the
   * half of the great circle defining the final course that comes before the end point (i.e. the semi-circular arc
   * along the final course that begins at the antipode of the end point and ends at the end point). Otherwise, any
   * intercept point on the final course will be considered valid.
   * @param endPath A GeoCircle that defines the final course. Must be a great circle.
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
   * @throws Error if `startPath` or `endPath` is not a great circle.
   */
  public build(
    vectors: FlightPathVector[],
    index: number,
    start: ReadonlyFloat64Array | LatLonInterface,
    startPath: ReadonlyGeoCircle,
    startTurnRadius: number,
    startTurnDirection: VectorTurnDirection | undefined,
    interceptAngle: number,
    end: ReadonlyFloat64Array | LatLonInterface | undefined,
    endPath: ReadonlyGeoCircle,
    endTurnRadius?: number,
    startTurnVectorFlags = 0,
    interceptVectorFlags = 0,
    endTurnVectorFlags = 0,
    heading: number | null = null,
    isHeadingTrue = false
  ): number {
    if (!endPath.isGreatCircle()) {
      throw new Error('InterceptGreatCircleToPointVectorBuilder::build(): end path is not a great circle');
    }

    return this.interceptCircleToPointVectorBuilder.build(
      vectors, index,
      start, startPath,
      startTurnRadius, startTurnDirection,
      interceptAngle,
      endPath,
      end, InterceptGreatCircleToPointVectorBuilder.HALF_EARTH_CIRCUMFERENCE,
      endTurnRadius,
      startTurnVectorFlags, interceptVectorFlags, endTurnVectorFlags,
      heading, isHeadingTrue
    );
  }
}
