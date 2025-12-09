import { ExtendedApproachType, RnavTypeFlags, VorFacility } from '@microsoft/msfs-sdk';

/**
 * Interface used to group together flight plan index-related types
 */
export interface FlightPlanIndexTypes<T extends number, U extends T> {
  /** The type of flight plan indices */
  index: T;

  /** The type of main flight plan indices. See {@link WTLineFlightPlanRepository}. */
  main: U;
}

/**
 * Utility type to get the flight plan index type from a flight plan repository type
 */
export type FlightPlanIndexType<T extends FlightPlanIndexTypes<number, number>> = T['index']

/**
 * Utility type to get the main flight plan index type from a flight plan repository type
 */
export type MainFlightPlanIndexType<T extends FlightPlanIndexTypes<number, number>> = T['main']

/**
 * Legacy flight plan index types
 *
 * Note: This should only be used if your FMS uses {@link WTLineLegacyDefaultFlightPlanRepository}. If you have your own
 * implementation of the flight plan repository, use your own types.
 */
export type WTLineLegacyFlightPlanIndexTypes = FlightPlanIndexTypes<WTLineLegacyFlightPlans, WTLineLegacyMainFlightPlan>

/**
 * WTLine FMS flight plan indices
 *
 * Note: This should only be used if your FMS uses {@link WTLineLegacyDefaultFlightPlanRepository}. If you have your own
 * implementation of the flight plan repository, use your own types.
 */
export enum WTLineLegacyFlightPlans {
  Active = 0,
  Mod = 1,
  Secondary = 10,
}

/**
 * WTLine FMS flight plan indices which can be the target of an edit
 *
 * Note: This should only be used if your FMS uses {@link WTLineLegacyDefaultFlightPlanRepository}. If you have your own
 * implementation of the flight plan repository, use your own types.
 */
export type WTLineLegacyMainFlightPlan = WTLineLegacyFlightPlans.Active | WTLineLegacyFlightPlans.Secondary;

/**
 * The FMS POS state events.
 *
 * @deprecated this is the WT21 types - this is only here for backwards compatibility purposes
 */
export interface WTLineLegacyFmsPosEvents {
  /** Indicating if FMS pos has been initialized */
  fms_pos_initialized: boolean,
  /** Indicating if the FMS pos is valid */
  fms_pos_valid: boolean,
}

/** FMS Approach Details */
export type ApproachDetails = {
  /** Whether an approach is loaded. */
  approachLoaded: boolean,
  /** The Approach Type */
  approachType: ExtendedApproachType,
  /** The Approach RNAV Type */
  approachRnavType: RnavTypeFlags,
  /** Whether the approach is active */
  approachIsActive: boolean,
  /** Whether the approach is circling */
  approachIsCircling: boolean,
  /** The reference navaid for the approach */
  referenceFacility: VorFacility | null,
}

/**
 * Procedure ident object for the WTLine FMS
 */
export interface WTLineFlightPlanProcedureIdents {
  /** The identifier of the departure procedure, or null if there isn't one selected */
  departureIdent: string | null;

  /** The identifier of the departure enroute transition, or null if there isn't one selected */
  departureEnrouteTransitionIdent: string | null;

  /** The identifier of the arrival procedure, or null if there isn't one selected */
  arrivalIdent: string | null;

  /** The identifier of the arrival enroute transition, or null if there isn't one selected */
  arrivalEnrouteTransitionIdent: string | null;

  /** The identifier of the approach procedure, or null if there isn't one selected */
  approachIdent: string | null;

  /** The identifier of the approach transition, or null if there isn't one selected */
  approachTransitionIdent: string | null;
}
