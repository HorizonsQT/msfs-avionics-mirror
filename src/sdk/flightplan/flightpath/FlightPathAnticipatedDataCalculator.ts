import { LegDefinition } from '../FlightPlanning';
import { FlightPathCalculatorFacilityCache } from './FlightPathCalculatorFacilityCache';

/**
 * A context which provides information for a {@link FlightPathAnticipatedDataCalculator}.
 */
export interface FlightPathAnticipatedDataContext {
  /**
   * A cache of facilities. When accessed in
   * {@link FlightPathAnticipatedDataCalculator.getAnticipatedData | FlightPathAnticipatedDataCalculator.getAnticipatedData()},
   * the cache contains facilities referenced by the flight plan legs for which anticipated data are requested.
   */
  readonly facilityCache: FlightPathCalculatorFacilityCache;

  /** The index of the active flight plan leg. */
  readonly activeLegIndex: number;

  /** The current altitude of the airplane, in feet, or `NaN` if altitude data are not available. */
  readonly altitude: number;

  /** The current vertical speed of the airplane, in feet per minute, or `NaN` if vertical speed data are not available. */
  readonly verticalSpeed: number;

  /** The current true airspeed of the airplane, in knots, or `NaN` if true airspeed data are not available. */
  readonly tas: number;

  /** The current ground speed of the airplane, in knots, or `NaN` if ground speed data are not available. */
  readonly gs: number;

  /** The current altitude of the airplane to use for flight path calculations, in feet. */
  readonly planeAltitude: number;

  /** The current climb rate of the airplane to use for flight path calculations, in feet per minute. */
  readonly planeClimbRate: number;

  /** The current ground speed of the airplane to use for flight path calculations, in knots. */
  readonly planeSpeed: number;

  /** The current true airspeed of the airplane to use for flight path calculations, in knots. */
  readonly planeTrueAirspeed: number;

  /**
   * The wind direction at the airplane's current position to use for flight path calculations, in degrees relative to
   * true north. Wind direction is defined as the bearing from which the wind is blowing.
   */
  readonly planeWindDirection: number;

  /** The wind speed at the airplane's current position to use for flight path calculations, in knots. */
  readonly planeWindSpeed: number;
}

/**
 * Anticipated data for a flight plan leg to be used in lateral flight path calculations.
 */
export interface FlightPathAnticipatedData {
  /**
   * The anticipated altitude of the airplane during these data's associated leg, in feet. If not defined, then the
   * airplane's current altitude will be used instead.
   */
  altitude: number | undefined;

  /**
   * The anticipated climb rate of the airplane during these data's associated leg, in feet per minute. If not defined,
   * then the airplane's current climb rate will be used instead.
   */
  climbRate: number | undefined;

  /**
   * The airplane's anticipated ground speed during these data's associated leg, in knots. If not defined, then the
   * airplane's current ground speed will be used instead.
   */
  gs: number | undefined;

  /**
   * The airplane's anticipated true airspeed during these data's associated leg, in knots. If not defined, then the
   * airplane's current true airspeed will be used instead.
   */
  tas: number | undefined;

  /**
   * The anticipated wind direction during these data's associated leg, in degrees relative to true north. Wind
   * direction is defined as the bearing from which the wind is blowing. If not defined, then the wind direction at the
   * airplane's current position will be used instead.
   */
  windDirection: number | undefined;

  /**
   * The anticipated wind speed during these data's associated leg, in knots. If not defined, then the wind speed at
   * the airplane's current position will be used instead.
   */
  windSpeed: number | undefined;

  /**
   * The maximum along-track distance, in meters, that can be anticipated for a leg-to-leg turn at the end of these
   * data's associated leg. If not defined, then turn anticipation distance will be unlimited.
   */
  turnAnticipationLimit: number | undefined;
}

/**
 * A calculator that provides anticipated data to be used in lateral flight path calculations.
 */
export interface FlightPathAnticipatedDataCalculator {
  /**
   * Gets anticipated data for a sequence of flight plan legs to be used in lateral flight path calculations.
   * @param legs The flight plan legs for which to get anticipated data.
   * @param startIndex The index of the first leg for which to get anticipated data, inclusive.
   * @param endIndex The index of the last leg for which to get anticipated data, exclusive.
   * @param out The array to which to write the results. Anticipated data for each flight plan leg should be written
   * to the data at index `i` in this array, where `i` is the index of the flight plan leg in the `legs` array.
   * Initially, all fields of every anticipated data object in the array are set to `undefined`.
   * @returns The anticipated data for the specified sequence of flight plan legs.
   */
  getAnticipatedData(
    legs: LegDefinition[],
    startIndex: number,
    endIndex: number,
    context: FlightPathAnticipatedDataContext,
    out: readonly FlightPathAnticipatedData[]
  ): readonly FlightPathAnticipatedData[];
}
