import { GeoPoint, GeoPointReadOnly } from '../../geo/GeoPoint';
import { NumberUnitReadOnly, UnitFamily } from '../../math/NumberUnit';

/**
 * A description of the state of a lateral flight path during flight path calculations.
 */
export interface FlightPathState {
  /** The current position of the flight path. */
  readonly currentPosition: GeoPoint;

  /** The current true course bearing of the flight path. */
  currentCourse: number | undefined;

  /** Whether there is a discontinuity at the flight path's current position. */
  isDiscontinuity: boolean;

  /** Whether the flight path is in a fallback state. */
  isFallback: boolean;

  /**
   * The current position of the airplane. If position data are not available, then both latitude and longitude will be
   * equal to `NaN`.
   */
  readonly planePosition: GeoPointReadOnly;

  /** The current true heading of the airplane, in degrees, or `NaN` if heading data are not available. */
  readonly planeHeading: number;

  /** The current altitude of the airplane to use for flight path calculations. */
  readonly planeAltitude: NumberUnitReadOnly<UnitFamily.Distance>;

  /** The current climb rate of the airplane to use for flight path calculations. */
  readonly planeClimbRate: NumberUnitReadOnly<UnitFamily.Speed>;

  /** The current ground speed of the airplane to use for flight path calculations. */
  readonly planeSpeed: NumberUnitReadOnly<UnitFamily.Speed>;

  /** The current true airspeed of the airplane to use for flight path calculations. */
  readonly planeTrueAirspeed: NumberUnitReadOnly<UnitFamily.Speed>;

  /**
   * The wind direction at the airplane's current position to use for flight path calculations, in degrees relative to
   * true north. Wind direction is defined as the bearing from which the wind is blowing.
   */
  readonly planeWindDirection: number;

  /** The wind speed at the airplane's current position to use for flight path calculations. */
  readonly planeWindSpeed: NumberUnitReadOnly<UnitFamily.Speed>;

  /** The desired radius for general turns. @deprecated Please use `getDesiredTurnRadius(..)` instead */
  readonly desiredTurnRadius: NumberUnitReadOnly<UnitFamily.Distance>;

  /** The desired radius for turns in holds. @deprecated Please use `getDesiredHoldTurnRadius(..)` instead */
  readonly desiredHoldTurnRadius: NumberUnitReadOnly<UnitFamily.Distance>;

  /** The desired radius for turns in course reversals. @deprecated Please use `getDesiredCourseReversalTurnRadius(..)` instead */
  readonly desiredCourseReversalTurnRadius: NumberUnitReadOnly<UnitFamily.Distance>;

  /** The desired radius for anticipated leg-to-leg turns. @deprecated Please use `getDesiredTurnAnticipationTurnRadius(..)` instead */
  readonly desiredTurnAnticipationTurnRadius: NumberUnitReadOnly<UnitFamily.Distance>;

  /**
   * Gets the airplane's altitude to use for flight path calculations, in feet, at a given flight plan leg.
   * @param legIndex The global index of the flight plan leg for which to get the plane's altitude.
   * @returns The plane's altitude, in feet, at the specified flight plan leg.
   */
  getPlaneAltitude(legIndex: number): number;

  /**
   * Gets the airplane's climb rate to use for flight path calculations, in feet per minute, at a given flight plan
   * leg.
   * @param legIndex The global index of the flight plan leg for which to get the plane's climb rate.
   * @returns The plane's climb rate, in feet per minute, at the specified flight plan leg.
   */
  getPlaneClimbRate(legIndex: number): number;

  /**
   * Gets the airplane's ground speed to use for flight path calculations, in knots, at a given flight plan leg.
   * @param legIndex The global index of the flight plan leg for which to get the plane's ground speed.
   * @returns The plane's ground speed, in knots, at the specified flight plan leg.
   */
  getPlaneSpeed(legIndex: number): number;

  /**
   * Gets the airplane's true airspeed to use for flight path calculations, in knots, at a given flight plan leg.
   * @param legIndex The global index of the flight plan leg for which to get the plane's true airspeed.
   * @returns The plane's true airspeed, in knots, at the specified flight plan leg.
   */
  getPlaneTrueAirspeed(legIndex: number): number;

  /**
   * Gets the wind direction to use for flight path calculations, in degrees relative to true north, at a given flight
   * plan leg. Wind direction is defined as the bearing from which the wind is blowing.
   * @param legIndex The global index of the flight plan leg for which to get the wind direction.
   * @returns The wind direction, in degrees relative to true north, at the specified flight plan leg.
   */
  getWindDirection(legIndex: number): number;

  /**
   * Gets the wind speed to use for flight path calculations, in knots, at a given flight plan leg.
   * @param legIndex The global index of the flight plan leg for which to get the wind speed.
   * @returns The wind speed, in knots, at the specified flight plan leg.
   */
  getWindSpeed(legIndex: number): number;

  /**
   * The maximum along-track distance, in meters, that can be anticipated for a leg-to-leg turn at the end of a given
   * flight plan leg.
   * @param legIndex The global index of the flight plan leg for which to get the limit.
   * @returns The maximum along-track distance, in meters, that can be anticipated for a leg-to-leg turn at the end of
   * the specified flight plan leg.
   */
  getTurnAnticipationLimit(legIndex: number): number;

  /**
   * Returns the desired turn radius based on the current speed or the anticipated speed (if enabled and index is provided):
   * @param legIndex waypoint index.
   * @returns the desired turn radius in Meters.
   */
  getDesiredTurnRadius(legIndex: number): number;

  /**
   * Returns the desired hold radius based on the current speed or the anticipated speed (if enabled and index is provided):
   * @param legIndex waypoint index.
   * @returns the desired turn radius in Meters.
   */
  getDesiredHoldTurnRadius(legIndex: number): number;

  /**
   * Returns the desired course reversal radius based on the current speed or the anticipated speed (if enabled and index is provided):
   * @param legIndex waypoint index.
   * @returns the desired turn radius in Meters.
   */
  getDesiredCourseReversalTurnRadius(legIndex: number): number;

  /**
   * Returns the desired turn anticipation radius based on the current speed or the anticipated speed (if enabled and index is provided):
   * @param legIndex waypoint index.
   * @returns the desired turn radius in Meters.
   */
  getDesiredTurnAnticipationTurnRadius(legIndex: number): number;
}

/**
 * A description of an airplane state used during lateral flight path calculations.
 */
export type FlightPathPlaneState = Pick<
  FlightPathState,
  'planePosition'
  | 'planeHeading'
  | 'planeAltitude'
  | 'planeSpeed'
  | 'planeClimbRate'
  | 'planeWindDirection'
  | 'planeWindSpeed'
  | 'desiredTurnRadius'
  | 'desiredHoldTurnRadius'
  | 'desiredCourseReversalTurnRadius'
  | 'desiredTurnAnticipationTurnRadius'
  | 'getPlaneAltitude'
  | 'getPlaneClimbRate'
  | 'getPlaneSpeed'
  | 'getPlaneTrueAirspeed'
  | 'getWindSpeed'
  | 'getWindDirection'
  | 'getTurnAnticipationLimit'
  | 'getDesiredTurnRadius'
  | 'getDesiredHoldTurnRadius'
  | 'getDesiredCourseReversalTurnRadius'
  | 'getDesiredTurnAnticipationTurnRadius'
>;
