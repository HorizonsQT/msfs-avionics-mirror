/** A point along a weather path request. */
export interface WeatherPathRequestPoint {
  /** For coherent binding */
  __Type: 'JS_PathWeatherRequestPoint';

  /** The latitude of the point. */
  lat: number;

  /** The longitude of the point. */
  lon: number;

  /** The altitudes at which to get wind for, in feet. */
  altitudes: number[];
}

/** A path wind request. */
export interface WeatherPathRequest {
  /** For coherent binding */
  __Type: 'JS_PathWeatherRequest';

  /** The list of points along the path. */
  points: WeatherPathRequestPoint[];

  /** The start time, in ISO 8601 format */
  startTime: string;

  /** The end time, in ISO 8601 format */
  endTime: string;
}

/** A weather data sample. */
export interface WeatherSample {
  /** The direction of the wind, in true degrees. */
  windDirection: number;

  /** The magnitude of the wind, in knots. */
  windMagnitude: number;

  /** The pressure, in decapascal. */
  pressure: number;

  /** The outside air temperature, in degrees Celsius. */
  oat: number;
}

/** A point in time as part of an altitude point of a wind path response. */
export interface WeatherPathResponseTimePoint {
  /** The weather sample at a specific time offset. */
  sample: WeatherSample;

  /** The time offset from the start time, in hours. */
  timeOffset: number;
}

/** An altitude point of a wind path response. */
export interface WeatherPathResponseAltitudePoint {
  /** A list of time points at this altitude, in hours. */
  points: WeatherPathResponseTimePoint[];

  /** The altitude of this point, in feet. */
  altitude: number;
}

/** A path point of a wind response. */
export interface WeatherPathResponsePoint {
  /** The list of altitude points that are part of this path point. */
  points: WeatherPathResponseAltitudePoint[];

  /** The latitude of the point, in degrees. */
  lat: number;

  /** The longitude of the point, in degrees. */
  lon: number;

}

/** A wind path response. */
export interface WeatherPathResponse {
  /** The list of points in the path response. */
  points: WeatherPathResponsePoint[];
}
