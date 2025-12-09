import { AdcEvents, AhrsEvents, ComponentProps, DisplayComponent, EventBus, FSComponent, GNSSEvents, MappedSubject, Subject, Subscription, VNode } from '@microsoft/msfs-sdk';

import { NavIndicatorAnimator } from './NavIndicatorAnimator';

import './WindVector.css';

/**
 * The properties for the WindVector component.
 */
interface WindVectorProps extends ComponentProps {
  /** An instance of the event bus. */
  bus: EventBus;
}

/**
 * The WindVector component.
 */
export class WindVector extends DisplayComponent<WindVectorProps> {
  private readonly windContainerRef = FSComponent.createRef<HTMLDivElement>();
  private readonly windArrowRef = FSComponent.createRef<HTMLDivElement>();

  private currentHeading = 0;
  private currentWindSpeed = 0;
  private currentWindDirection = 0;
  private isVisible = false;

  private readonly windArrowRotation = Subject.create(0);
  private readonly windSpeedText = Subject.create('');
  private readonly groundSpeedValid = Subject.create(false);
  private readonly windSpeedValid = Subject.create(false);

  /** The array of subscriptions which are to be paused when the wind vector is not visible. */
  private readonly visibleSubs: Subscription[] = [];

  private readonly windArrowAnimator = new NavIndicatorAnimator();

  /** @inheritdoc */
  public onAfterRender(): void {
    MappedSubject.create(this.windSpeedValid, this.groundSpeedValid).sub(([windSpeedValid, groundSpeedValid]) => {
      this.updateVisibility(windSpeedValid && groundSpeedValid);
    }, true);

    const sub = this.props.bus.getSubscriber<AdcEvents & AhrsEvents & GNSSEvents>();

    const headingSub = sub.on('hdg_deg')
      .withPrecision(0)
      .handle((value) => {
        this.currentHeading = value;
        this.updateRotation();
      }, true);

    this.visibleSubs.push(headingSub);

    const windDirectionSub = sub.on('ambient_wind_direction')
      .withPrecision(0)
      .handle((value) => {
        this.currentWindDirection = value;
        this.updateRotation();
      }, true);

    this.visibleSubs.push(windDirectionSub);

    sub.on('ambient_wind_velocity')
      .withPrecision(0)
      .handle((value) => {
        this.currentWindSpeed = value;

        const speedThresh = this.windSpeedValid.get() ? 5 : 7;
        this.windSpeedValid.set(value >= speedThresh);

        if (this.isVisible) {
          this.windSpeedText.set(value.toString());
        }
      });

    sub.on('ground_speed')
      .withPrecision(0)
      .handle((value) => {
        const groundSpeedThresh = this.groundSpeedValid.get() ? 36 : 40;
        this.groundSpeedValid.set(value >= groundSpeedThresh);
      });

    this.windArrowRotation.sub(this.windArrowAnimator.setTargetValue, true);

    this.windArrowAnimator.output.sub(rotation => {
      this.windArrowRef.instance.style.transform = `rotate3d(0,0,1, ${rotation}deg)`;
    }, true);

    this.windArrowAnimator.start();
  }

  /**
   * Sets the visibility of the wind container.
   * @param isVisible the isVisible flag
   */
  private updateVisibility(isVisible: boolean): void {
    this.windContainerRef.instance.classList.toggle('hidden', !isVisible);

    for (const sub of this.visibleSubs) {
      isVisible ? sub.resume() : sub.pause();
    }

    if (isVisible) {
      // Update the wind speed text immediately when becoming visible so that we don't show an outdated (or 0) value until the next wind
      // speed update.
      this.windSpeedText.set(this.currentWindSpeed.toString());
    }

    this.isVisible = isVisible;
  }

  /**
   * Updates the wind vector arrow.
   */
  private updateRotation(): void {
    let rotate = this.currentWindDirection - this.currentHeading;
    if (rotate > 180) {
      rotate = rotate - 360;
    } else if (rotate < -180) {
      rotate = rotate + 360;
    }
    rotate = (rotate + 180) % 360;

    this.windArrowRotation.set(rotate);
  }

  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class="hsi-wind-container" ref={this.windContainerRef}>
        <div class="hsi-wind-speed">{this.windSpeedText}</div>
        <div class="hsi-wind-arrow" ref={this.windArrowRef}>
          <svg width="12" height="42">
            <path d="m 6 41 l 0 -40 l -5 13 m 5 -13 l 5 13" stroke="var(--wt21-colors-magenta)" stroke-width="2" stroke-linecap="round" />
          </svg>
        </div>
      </div>
    );
  }
}
