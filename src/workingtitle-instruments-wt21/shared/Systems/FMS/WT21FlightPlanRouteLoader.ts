import {
  WTLineFlightPlanRouteLoader, WTLineLegacyFlightPlanIndexTypes, WTLineLegacyFlightPlans, WTLineLegacyMainFlightPlan
} from '@microsoft/msfs-wtlinesdk';
import { WT21Fms } from './WT21Fms';

/**
 * WTLineFlightPlanRouteLoader for the WT12
 */
export class WT21FlightPlanRouteLoader extends WTLineFlightPlanRouteLoader<WTLineLegacyFlightPlanIndexTypes> {
  /** @inheritDoc */
  constructor(protected readonly fms: WT21Fms) {
    super(fms, WTLineLegacyFlightPlans.Active);
  }

  /** @inheritDoc */
  public setCruiseAltitude(mainPlanIndex: WTLineLegacyMainFlightPlan, cruiseAlt: number): void {
    // FIXME handle other plans
    this.fms.performancePlanProxy.cruiseAltitude.set(cruiseAlt);
  }
}
