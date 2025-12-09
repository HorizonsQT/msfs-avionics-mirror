import { ComponentProps, ConsumerSubject, DisplayComponent, EventBus, FSComponent, VNode } from '@microsoft/msfs-sdk';

import { TakeoffConfigPublisherEvents } from '@microsoft/msfs-epic2-shared';

import './NoTakeoffAlert.css';

/** PFD Alerts props. */
export interface NoTakeoffAlertProps extends ComponentProps {
  /** The instrument event bus. */
  bus: EventBus;
}

/**
 * PFD No Takeoff Alert
 */
export class NoTakeoffAlert extends DisplayComponent<NoTakeoffAlertProps> {
  private readonly sub = this.props.bus.getSubscriber<TakeoffConfigPublisherEvents>();

  private readonly noTakeoff = ConsumerSubject.create(this.sub.on('takeoff_config_no_takeoff'), false);

  /** @inheritdoc */
  public render(): VNode | null {
    return (
      <div class={{ 'no-takeoff-alert': true, 'hidden': this.noTakeoff.map((v) => !v) }}>
        NO TAKEOFF
      </div>
    );
  }
}
