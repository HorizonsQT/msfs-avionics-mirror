import { MapSystemController, MapSystemKeys, Subscription } from '@microsoft/msfs-sdk';

import { GarminMapKeys } from '../GarminMapKeys';
import { MapGarminFlightPlanModule } from '../modules/MapGarminFlightPlanModule';
import { MapGarminDataIntegrityModule } from '../modules/MapGarminDataIntegrityModule';

/**
 * Modules required for {@link TrafficMapFlightPlanVisController}.
 */
export interface TrafficMapFlightPlanVisControllerModules {
  /** Garmin flight plan module. */
  [GarminMapKeys.FlightPlan]: MapGarminFlightPlanModule;

  /** Data integrity module. */
  [MapSystemKeys.DataIntegrity]: MapGarminDataIntegrityModule;
}

/**
 * Controls the visibility of the flight plan on traffic maps.
 */
export class TrafficMapFlightPlanVisController extends MapSystemController<TrafficMapFlightPlanVisControllerModules> {
  private readonly flightPlanModule = this.context.model.getModule(GarminMapKeys.FlightPlan);
  private readonly dataIntegrityModule = this.context.model.getModule(MapSystemKeys.DataIntegrity);

  private gpsSignalValidSub?: Subscription;

  /** @inheritDoc */
  public onAfterMapRender(): void {
    this.gpsSignalValidSub = this.dataIntegrityModule.gpsSignalValid.sub(this.onGpsDataValidChanged.bind(this), true);
  }

  /**
   * Responds to when GPS data validity changes.
   * @param isValid Whether GPS data is valid.
   */
  private onGpsDataValidChanged(isValid: boolean): void {
    for (const entry of this.flightPlanModule.entries) {
      entry.show.set(isValid);
    }
  }

  /** @inheritDoc */
  public onMapDestroyed(): void {
    this.destroy();
  }

  /** @inheritDoc */
  public destroy(): void {
    this.gpsSignalValidSub?.destroy();

    super.destroy();
  }
}
