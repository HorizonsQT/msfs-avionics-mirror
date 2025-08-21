import { LatLonInterface } from '../geo/GeoInterfaces';
import { LambertConformalConicProjection } from '../geo/GeoProjection';
import { Vec2Math, Vec3Math } from '../math/VecMath';
import { GeoReferencedChartArea } from './ChartTypes';

/**
 * A utility class for working with charts.
 */
export class ChartUtils {
  private static readonly setProjectionCache = {
    center: { lat: 0, lon: 0 } satisfies LatLonInterface,
    preRotation: Vec3Math.create(),
    postTranslation: Vec2Math.create(),
    evaluation: Vec2Math.create(),
  };

  /**
   * Sets the parameters of a Lambert conformal conic projection such that the projection is equivalent to that of a
   * given georeferenced chart area. After the projection parameters have been set, the projection can be used to
   * project world coordinates within the georeferenced area to their corresponding chart coordinates.
   * @param projection The projection to set.
   * @param area The georeferenced chart area whose projection is the one to which the given projection should be
   * matched.
   * @returns The specified projection, after it has been set to be equivalent to the projection of the specified
   * georeferenced chart area.
   */
  public static setGeoProjectionFromChartArea(projection: LambertConformalConicProjection, area: GeoReferencedChartArea): LambertConformalConicProjection {
    const topLeftLatLon = area.worldRectangle.upperLeft;
    const topLeftXY = area.chartRectangle.upperLeft;

    const bottomRightLatLon = area.worldRectangle.lowerRight;
    const bottomRightXY = area.chartRectangle.lowerRight;

    const { center, preRotation, postTranslation, evaluation } = ChartUtils.setProjectionCache;

    // Pre-rotate the central meridian to 0 deg longitude.
    preRotation[0] = -area.projection.centralMeridian * Avionics.Utils.DEG2RAD;

    // Set the center of the projection to the top-left corner and reset the post-projection translation so that the
    // the top-left corner is projected to (0, 0).
    center.lat = topLeftLatLon[1];
    center.lon = topLeftLatLon[0];
    Vec2Math.set(0, 0, postTranslation);

    projection
      .setScaleFactor(1)
      .setStandardParallels(area.projection.standardParallel1, area.projection.standardParallel2)
      .setPreRotation(preRotation)
      .setCenter(center)
      .setPostRotation(-area.worldRectangle.orientation * Avionics.Utils.DEG2RAD)
      .setTranslation(postTranslation)
      .setReflectY(true);

    evaluation.set(bottomRightLatLon);
    const bottomRightProjected = projection.project(evaluation, evaluation);

    // Solve for the scale factor by comparing the projected distance between top-left and bottom-right with scale
    // factor of 1 to the desired projected distance (from the georeferenced area specs). Remember that the top-left
    // corner is guaranteed to be projected to (0, 0).
    const scaleFactor = Math.hypot(bottomRightXY[0] - topLeftXY[0], bottomRightXY[1] - topLeftXY[1])
      / Math.hypot(bottomRightProjected[0], bottomRightProjected[1]);

    // Add post-projection translation so that the top-left corner is projected to the correct coordinates.
    postTranslation.set(topLeftXY);

    projection
      .setScaleFactor(scaleFactor)
      .setTranslation(postTranslation);

    return projection;
  }
}
