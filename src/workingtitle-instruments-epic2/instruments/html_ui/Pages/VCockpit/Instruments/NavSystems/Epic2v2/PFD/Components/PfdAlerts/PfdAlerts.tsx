import { ComponentProps, DisplayComponent, EventBus, FSComponent, MappedSubject, SetSubject, Subject, VNode } from '@microsoft/msfs-sdk';

import { AirspeedDataProvider, PfdAlertCategories, PfdAlertControlEvents } from '@microsoft/msfs-epic2-shared';

import './PfdAlerts.css';

/** PFD Alerts props. */
export interface PfdAlertsProps extends ComponentProps {
  /** The instrument event bus. */
  bus: EventBus;
  /** Airspeed data provider */
  airspeedDataProvider: AirspeedDataProvider;
}

/**
 * PFD Alerts:
 * - CAB ALT
 * - GEAR
 * - OVER SPEED
 * - CAB PRESS
 */
export class PfdAlerts extends DisplayComponent<PfdAlertsProps> {
  private readonly sub = this.props.bus.getSubscriber<PfdAlertControlEvents>();

  private readonly activeAlerts = SetSubject.create<PfdAlertCategories>([]);
  private readonly alertText = Subject.create('');

  /** @inheritdoc */
  public onAfterRender(): void {
    this.sub.on('add_pfd_alert').handle((alert) => this.activeAlerts.toggle(alert, true));
    this.sub.on('remove_pfd_alert').handle((alert) => this.activeAlerts.toggle(alert, false));

    this.activeAlerts.sub((set) => {
      if (set.has(PfdAlertCategories.CabinAltitude)) {
        this.alertText.set('CAB ALT');
      } else if (set.has(PfdAlertCategories.LandingGear)) {
        this.alertText.set('GEAR');
      } else if (set.has(PfdAlertCategories.Overspeed)) {
        this.alertText.set('OVERSPEED');
      } else if (set.has(PfdAlertCategories.CabinPressure)) {
        this.alertText.set('CAB PRESS');
      } else {
        this.alertText.set('');
      }
    });

    MappedSubject.create(([cas, maxCas]) => cas !== null && cas > maxCas + 5, this.props.airspeedDataProvider.cas, this.props.airspeedDataProvider.maxSpeed)
      .sub((v) => this.activeAlerts.toggle(PfdAlertCategories.Overspeed, v));
  }

  /** @inheritdoc */
  public render(): VNode | null {
    return (
      <div
        class={{
          'pfd-alert': true,
          'hidden': this.alertText.map((v) => v.length <= 0),
        }}
      >
        {this.alertText}
      </div>
    );
  }
}
