/**
 * An altitude reference.
 */
// NOTE: These values must match those defined on the sim-side.
export enum SimAltitudeReference {
  /**
   * No altitude reference is specified.
   */
  Unspecified = 0,
  /**
   * Altitude above the terrain (ignoring buildings, trees and other objects).
   */
  Terrain,
  /**
   * Altitude above the WGS-84 ellipsoid.
   */
  Ellipsoid,
  /**
   * Altitude above the WGS-84 ellipsoid corrected for geoid undulation using the EGM2008 (Earth Gravitational Model 2008).
   */
  Geoid,
  /**
   * Altitude above the ground, including buildings, trees and other objects.
   */
  Surface,
}
