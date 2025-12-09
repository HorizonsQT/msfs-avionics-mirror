/// <reference types="@microsoft/msfs-types/js/common" preserve="true" />
/// <reference types="@microsoft/msfs-types/js/types" preserve="true" />
/// <reference types="@microsoft/msfs-types/js/netbingmap" preserve="true" />

import { SimAltitudeReference } from '../../geo/SimAltitudeReference';
import { ReadonlyFloat64Array } from '../../math/VecMath';
import { Subscribable, SubscribableArray, SubscribableSet } from '../../sub';
import { BingCameraRotationReference, BingComponent } from '../bing/BingComponent';
import { ComponentProps, DisplayComponent, FSComponent, VNode } from '../FSComponent';

/**
 * Component props for the SynVisComponent.
 */
export interface SynVisProps extends ComponentProps {
  /** The unique ID to assign to the component's bound Bing instance. */
  bingId: string;

  /** The amount of time, in milliseconds, to delay binding the component's Bing instance. Defaults to 0. */
  bingDelay?: number;

  /** Whether to skip unbinding the component's bound Bing instance when the component is destroyed. Defaults to `false`. */
  bingSkipUnbindOnDestroy?: boolean;

  /** The internal resolution for the component, as `[width, height]` in pixels. */
  resolution: Subscribable<ReadonlyFloat64Array>;

  /**
   * The earth colors for the Bing component. Index 0 defines the water color, and indexes 1 to the end of the array
   * define the terrain colors. Each color should be expressed as `R + G * 256 + B * 256^2`. If not defined, all colors
   * default to black.
   */
  earthColors?: SubscribableArray<number>;

  /**
   * The elevation range over which to assign the earth terrain colors, as `[minimum, maximum]` in feet. The terrain
   * colors are assigned at regular intervals over the entire elevation range, starting with the first terrain color at
   * the minimum elevation and ending with the last terrain color at the maximum elevation. Terrain below and above the
   * minimum and maximum elevation are assigned the first and last terrain colors, respectively. Defaults to
   * `[0, 30000]`.
   */
  earthColorsElevationRange?: Subscribable<ReadonlyFloat64Array>;

  /** The sky color for the component. The color should be expressed as `R + G * 256 + B * 256^2`. */
  skyColor: Subscribable<number>;

  /**
   * The field of view for the component, in degrees. The field of view is measured vertically from the top of the
   * rendered viewport to the bottom. Defaults to 50 degrees.
   */
  fov?: Subscribable<number>;

  /**
   * A callback to call when the underlying Bing component is bound.
   */
  onBoundCallback?: (component: SynVisComponent) => void;

  /** CSS class(es) to add to the root of the component. */
  class?: string | SubscribableSet<string>;
}

/**
 * A synthetic vision display.
 */
export class SynVisComponent extends DisplayComponent<SynVisProps> {
  protected readonly bingRef = FSComponent.createRef<BingComponent>();

  protected isRendered = false;
  protected _isAwake = true;

  /**
   * A callback which is called when the Bing component is bound.
   */
  protected onBingBound = (): void => {
    this.props.onBoundCallback && this.props.onBoundCallback(this);
  };

  /** @inheritDoc */
  public onAfterRender(): void {
    this.isRendered = true;

    if (!this._isAwake) {
      this.bingRef.instance.sleep();
    }
  }

  /**
   * Checks whether this display is awake.
   * @returns whether this display is awake.
   */
  public isAwake(): boolean {
    return this._isAwake;
  }

  /**
   * Checks whether this display is bound to a Bing map instance.
   * @returns whether this display is bound to a Bing map instance.
   */
  public isBound(): boolean {
    return this.isRendered && this.bingRef.instance.isBound();
  }

  /**
   * Wakes this display. Upon awakening, this display will synchronize its state to the Bing instance to which it is
   * bound.
   */
  public wake(): void {
    this._isAwake = true;

    if (this.isRendered) {
      this.bingRef.instance.wake();
    }
  }

  /**
   * Puts this display to sleep. While asleep, this display cannot make changes to the Bing instance to which it is
   * bound.
   */
  public sleep(): void {
    this._isAwake = false;

    if (this.isRendered) {
      this.bingRef.instance.sleep();
    }
  }

  /**
   * Sets this display's camera transform parameters.
   * @param pos The camera's nominal position. If null, then the nominal position will sync to the aircraft's position.
   * @param altitudeRef The altitude reference to use for the camera's nominal position. If null, then the default
   * reference ({@link SimAltitudeReference.Geoid}) is used. Ignored if `pos` is null.
   * @param offset The camera's offset from its nominal position, as `[x, y, z]` in meters in the camera's reference
   * frame after rotation is applied. The positive x axis points to the left. The positive y axis points upward. The
   * positive z axis points forward. If null, then no offset is applied.
   * @param rotation The camera's rotation, whose reference frame depends on the value of `rotationRef`. If null, then
   * the rotation will sync to the aircraft's attitude.
   * @param rotationRef The reference frame for the camera rotation. If null, then the default reference
   * ({@link BingCameraRotationReference.World}) is used. Ignored if `rotation` is null.
   */
  public set3DMapCameraTransform(
    pos: LatLongAlt | null,
    altitudeRef: SimAltitudeReference.Ellipsoid | SimAltitudeReference.Geoid | null,
    offset: ReadonlyFloat64Array | null,
    rotation: PitchBankHeading | null,
    rotationRef: BingCameraRotationReference | null,
  ): void {
    if (this.isRendered) {
      this.bingRef.instance.set3DMapCameraTransform(pos, altitudeRef, offset, rotation, rotationRef);
    }
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <BingComponent
        ref={this.bingRef}
        id={this.props.bingId}
        mode={EBingMode.HORIZON}
        onBoundCallback={this.onBingBound}
        resolution={this.props.resolution}
        earthColors={this.props.earthColors}
        earthColorsElevationRange={this.props.earthColorsElevationRange}
        skyColor={this.props.skyColor}
        fov={this.props.fov}
        delay={this.props.bingDelay}
        skipUnbindOnDestroy={this.props.bingSkipUnbindOnDestroy}
        class={this.props.class}
      />
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.bingRef.getOrDefault()?.destroy();

    super.destroy();
  }
}
