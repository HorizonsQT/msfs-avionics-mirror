import {
  DefaultTcasIntruder, EventBus, MappedSubject, SubscribableUtils, Tcas, TcasIISensitivity, TcasOperatingMode,
  TrafficContact, TrafficInstrument, UnitType
} from '@microsoft/msfs-sdk';

import { TcasOperatingModeSetting, TrafficUserSettings } from './TrafficUserSettings';

/**
 * A TCAS II implementation for the WT21.
 */
export class WT21TCAS extends Tcas<DefaultTcasIntruder, TcasIISensitivity> {
  private static readonly MAX_INTRUDER_COUNT = 30;
  private static readonly REAL_TIME_UPDATE_FREQ = 2; // Hz
  private static readonly SIM_TIME_UPDATE_FREQ = 1; // Hz

  private readonly settings = TrafficUserSettings.getManager(this.bus);

  private readonly raAltitudeInhibitFlag = MappedSubject.create(
    ([radarAlt, isClimbing]): boolean => {
      return isFinite(radarAlt) && radarAlt < (isClimbing ? 900 : 1100);
    },
    this.ownAirplaneDataProvider.radarAltitude.map(radarAlt => Math.round(radarAlt.asUnit(UnitType.FOOT)), SubscribableUtils.NUMERIC_NAN_EQUALITY),
    this.ownAirplaneDataProvider.verticalSpeed.map(verticalSpeed => verticalSpeed.number >= 0)
  );

  /**
   * Constructor.
   * @param bus The event bus.
   * @param tfcInstrument The traffic instrument which provides traffic contacts for this TCAS.
   */
  constructor(bus: EventBus, tfcInstrument: TrafficInstrument) {
    super(bus, tfcInstrument, {
      maxIntruderCount: WT21TCAS.MAX_INTRUDER_COUNT,
      realTimeUpdateFreq: WT21TCAS.REAL_TIME_UPDATE_FREQ,
      simTimeUpdateFreq: WT21TCAS.SIM_TIME_UPDATE_FREQ,
      hasActiveSurveillance: true,
    });
  }

  /** @inheritdoc */
  public init(): void {
    super.init();

    this.settings.getSetting('trafficOperatingMode').sub(mode => {
      switch (mode) {
        case TcasOperatingModeSetting.Standby:
          this.setOperatingMode(TcasOperatingMode.Standby);
          break;
        case TcasOperatingModeSetting.TAOnly:
          this.setOperatingMode(TcasOperatingMode.TAOnly);
          break;
        case TcasOperatingModeSetting.TA_RA:
          if (this.raAltitudeInhibitFlag.get()) {
            this.setOperatingMode(TcasOperatingMode.TAOnly);
          } else {
            this.setOperatingMode(TcasOperatingMode.TA_RA);
          }
          break;
      }
    }, true);

    this.raAltitudeInhibitFlag.sub(inhibit => {
      if (this.settings.getSetting('trafficOperatingMode').value === TcasOperatingModeSetting.TA_RA) {
        this.setOperatingMode(inhibit ? TcasOperatingMode.TAOnly : TcasOperatingMode.TA_RA);
      }
    });
  }

  /** @inheritdoc */
  protected createSensitivity(): TcasIISensitivity {
    return new TcasIISensitivity();
  }

  /** @inheritdoc */
  protected createIntruderEntry(contact: TrafficContact): DefaultTcasIntruder {
    return new DefaultTcasIntruder(contact);
  }

  /** @inheritdoc */
  protected updateSensitivity(): void {
    this.sensitivity.updateLevel(this.ownAirplaneDataProvider.pressureAltitude.get(), this.ownAirplaneDataProvider.radarAltitude.get());
  }
}
