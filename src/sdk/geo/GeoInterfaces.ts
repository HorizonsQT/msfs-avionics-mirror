/**
 * A set of latitude/longitude coordinates.
 */
export interface LatLonInterface {
  /** The latitude, in degrees. */
  lat: number;

  /** The longitude, in degrees. */
  lon: number;
}

/**
 * A set of latitude/longitude coordinates.
 */
export interface LatLongInterface {
  /** The latitude, in degrees. */
  lat: number;

  /** The longitude, in degrees. */
  long: number;
}

/**
 * A set of latitude/longitude coordinates with altitude.
 */
export interface LatLonAltInterface {
  /** The latitude, in degrees. */
  lat: number;

  /** The longitude, in degrees. */
  lon: number;

  /** The altitude, in meters. */
  alt: number;
}
