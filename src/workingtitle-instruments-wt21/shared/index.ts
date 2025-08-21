/// <reference types="@microsoft/msfs-types/js/avionics" preserve="true" />

// Backwards compatibility export aliases - DO NOT REMOVE UNUSED EXPORTS (until we decide to get rid of the aliases)!

// wtlinesdk/autopilot/
export { CDIScaleLabel } from '@microsoft/msfs-wtlinesdk';
export type { WTLineLNavDataEvents as WT21LNavDataEvents } from '@microsoft/msfs-wtlinesdk';

// wtlinesdk/fms/
export {
  AirwayLegType,
  type ApproachDetails,
  type ApproachNameParts,
  type CoordinatesInput,
  DirectToState,
  type FacilityInfo,
  type TransitionListItem,
  WT21LegDefinitionFlags,
} from '@microsoft/msfs-wtlinesdk';
export { WTLineFmsUtils as WT21FmsUtils } from '@microsoft/msfs-wtlinesdk';
export { WTLinePilotWaypointUtils as WT21PilotWaypointUtils } from '@microsoft/msfs-wtlinesdk';
export { WTLineAlternatePredictor as WT21AlternatePredictor } from '@microsoft/msfs-wtlinesdk';
export { WTLineCoordinatesUtils as WT21CoordinatesUtils } from '@microsoft/msfs-wtlinesdk';
export { WTLineFixInfoCalculator as WT21FixInfoCalculator } from '@microsoft/msfs-wtlinesdk';
export { WTLineFixInfoConfig as WT21FixInfoConfig } from '@microsoft/msfs-wtlinesdk';
export type { WTLineFixInfoCalculatedData as WT21FixInfoCalculatedData } from '@microsoft/msfs-wtlinesdk';
export type { WTLineFixInfoMarker as WT21FixInfoMarker } from '@microsoft/msfs-wtlinesdk';
export type { WTLineFixInfoWaypoint as WT21FixInfoWaypoint } from '@microsoft/msfs-wtlinesdk';
export type { WTLineFixInfoFlightPlanData as WT21FixInfoFlightPlanData } from '@microsoft/msfs-wtlinesdk';
export type { WTLineFixInfoData as WT21FixInfoData } from '@microsoft/msfs-wtlinesdk';
export type { WTLineFixInfoEvents as WT21FixInfoEvents } from '@microsoft/msfs-wtlinesdk';
export type { WTLineFixInfoOptions as WT21FixInfoOptions } from '@microsoft/msfs-wtlinesdk';
export { WTLineFixInfoManager as WT21FixInfoManager } from '@microsoft/msfs-wtlinesdk';
export { WTLineFlightPlanRouteUtils as WT21FlightPlanRouteUtils } from '@microsoft/msfs-wtlinesdk';

// wtlinesdk/navigation/
export {
  AdfRadioSource,
  AlongTrackOffsetError,
  type AlongTrackOffsetInput,
  GpsSource,
  NavBase,
  NavBaseFields,
  NavIndicator,
  NavIndicators,
  type NavIndicatorControlEvents,
  type NavIndicatorControlFields,
  type NavIndicatorEvents,
  NavRadioNavSource,
  NavSourceBase,
  ATO_REGEX,
  PBD_REGEX,
  PBPB_REGEX,
  PilotWaypointError,
  type PilotWaypointResult,
  PilotWaypointType,
  type PlaceBearingDistanceInput,
  type PlaceBearingPlaceBearingInput,
  type WT21VNavDataEvents,
} from '@microsoft/msfs-wtlinesdk';
export type { WTLineNavigationSettings as WT21NavigationSettings } from '@microsoft/msfs-wtlinesdk';
export { WTLineNavigationUserSettings as WT21NavigationUserSettings } from '@microsoft/msfs-wtlinesdk';
export type { WTLineNavSourceNames as WT21NavSourceNames } from '@microsoft/msfs-wtlinesdk';
export type { WTLineNavSourceName as WT21NavSourceName } from '@microsoft/msfs-wtlinesdk';
export type { WTLineCourseNeedleNavSourceNames as WT21CourseNeedleNavSourceNames } from '@microsoft/msfs-wtlinesdk';
export type { WTLineCourseNeedleNavSourceName as WT21CourseNeedleNavSourceName } from '@microsoft/msfs-wtlinesdk';
export type { WTLineNavSource as WT21NavSource } from '@microsoft/msfs-wtlinesdk';
export type { WTLineNavSources as WT21NavSources } from '@microsoft/msfs-wtlinesdk';
export type { WTLineCourseNeedleNavSources as WT21CourseNeedleNavSources } from '@microsoft/msfs-wtlinesdk';
export type { WTLineCourseNeedleNavSource as WT21CourseNeedleNavSource } from '@microsoft/msfs-wtlinesdk';
export type { WTLineNavIndicatorNames as WT21NavIndicatorNames } from '@microsoft/msfs-wtlinesdk';
export type { WTLineNavIndicatorName as WT21NavIndicatorName } from '@microsoft/msfs-wtlinesdk';
export type { WTLineNavIndicator as WT21NavIndicator } from '@microsoft/msfs-wtlinesdk';
export type { WTLineNavIndicators as WT21NavIndicators } from '@microsoft/msfs-wtlinesdk';
export type { WTLineNavSourceEvents as WT21NavSourceEvents } from '@microsoft/msfs-wtlinesdk';
export type { WTLineNavIndicatorEvents as WT21NavIndicatorEvents } from '@microsoft/msfs-wtlinesdk';
export { WTLineCourseNeedleNavIndicator as WT21CourseNeedleNavIndicator } from '@microsoft/msfs-wtlinesdk';
export type { WTLineGhostNeedleControlEvents as WT21GhostNeedleControlEvents } from '@microsoft/msfs-wtlinesdk';
export { WTLineGhostNeedleNavIndicator as WT21GhostNeedleNavIndicator } from '@microsoft/msfs-wtlinesdk';
export type { WTLineBearingPointerControlEvents as WT21BearingPointerControlEvents } from '@microsoft/msfs-wtlinesdk';
export { WTLineBearingPointerNavIndicator as WT21BearingPointerNavIndicator } from '@microsoft/msfs-wtlinesdk';

// wtlinesdk/performance/
export {
  type ApproachPerformanceResults,
  BasePerformanceDataManager,
  PerformancePlan,
  type PerformancePlanData,
  PerformancePlanProxy,
  PerformancePlanRepository,
  ProxiedPerformancePlanProperty,
  ReadonlyPerformanceVariable,
  type TakeoffPerformanceCalculatorResults,
} from '@microsoft/msfs-wtlinesdk';

// wtlinesdk/publishers/
export {
  type FmaData,
  type FmcSimVarEvents,
  FmcSimVars,
  FmcSimVarPublisher,
} from '@microsoft/msfs-wtlinesdk';
export type { WTLineControlEvents as WT21ControlEvents } from '@microsoft/msfs-wtlinesdk';
export { WTLineControlPublisher as WT21ControlPublisher } from '@microsoft/msfs-wtlinesdk';

// wtlinesdk/settings/
export {
  type DefaultsSettings,
  DefaultsUserSettings,
} from '@microsoft/msfs-wtlinesdk';

export * from './ReferenceSpeeds';
export * from './Types';
export * from './WT21AvionicsPlugin';
export * from './WT21ControlVarEvents';
export * from './WT21DisplayUnitFsInstrument';
export * from './WT21FlightPlanPredictorConfiguration';
export * from './WT21MfdTextPageEvents';
export * from './WT21UnitsUtils';
export * from './WT21XmlAuralsConfig';
export * from './WT21_Colors';
export * from './BottomSection';
export * from './Config';
export * from './DCP';
export * from './LowerSection';
export * from './Map';
export * from './Menus';
export * from './MessageSystem';
export * from './Navigation';
export * from './Profiles';
export * from './Systems';
export * from './Traffic';
export * from './UI';
export * from './Checklist';
