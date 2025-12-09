import {
  ArraySubject, BingComponent, ColorUtils, FSComponent, HorizonLayer, HorizonLayerProps, HorizonProjection,
  HorizonSyntheticVisionLayer, Subject, Subscribable, Subscription, Vec2Subject, VNode
} from '@microsoft/msfs-sdk';

import { MapUtils } from '../../map/MapUtils';

/**
 * Component props for SyntheticVision.
 */
export interface SyntheticVisionProps extends HorizonLayerProps {
  /** The string ID to assign to the layer's bound Bing instance. */
  bingId: string;

  /** The amount of time, in milliseconds, to delay binding the layer's Bing instance. Defaults to 0. */
  bingDelay?: number;

  /** Whether to skip unbinding the layer's bound Bing instance when the layer is destroyed. Defaults to `false`. */
  bingSkipUnbindOnDestroy?: boolean;

  /** Whether synthetic vision is enabled. */
  isEnabled: Subscribable<boolean>;
}

/**
 * A synthetic vision technology (SVT) display terrain colors object.
 */
type TerrainColors = {
  /**
   * The earth colors array. Index 0 defines the water color, and indexes 1 to the end of the array define the terrain
   * colors.
   */
  colors: number[];

  /** The elevation range over which the terrain colors are applied, as `[minimum, maximum]` in feet. */
  elevationRange: Float64Array;
};

/**
 * A synthetic vision technology (SVT) display.
 */
export class SyntheticVision extends HorizonLayer<SyntheticVisionProps> {
  private static readonly SKY_COLOR = '#0033E6';

  private readonly synVisRef = FSComponent.createRef<HorizonSyntheticVisionLayer>();

  private isEnabledSub?: Subscription;

  /** @inheritDoc */
  protected onVisibilityChanged(isVisible: boolean): void {
    this.synVisRef.instance.setVisible(isVisible);
  }

  /** @inheritDoc */
  public onAttached(): void {
    super.onAttached();

    this.isEnabledSub = this.props.isEnabled.sub(this.setVisible.bind(this), true);

    this.synVisRef.instance.onAttached();
  }

  /** @inheritDoc */
  public onProjectionChanged(projection: HorizonProjection, changeFlags: number): void {
    this.synVisRef.instance.onProjectionChanged(projection, changeFlags);
  }

  /** @inheritDoc */
  public onWake(): void {
    this.synVisRef.instance.onWake();
  }

  /** @inheritDoc */
  public onSleep(): void {
    this.synVisRef.instance.onSleep();
  }

  /** @inheritDoc */
  public onUpdated(): void {
    this.synVisRef.instance.onUpdated();
  }

  /** @inheritDoc */
  public onDetached(): void {
    super.onDetached();

    this.destroy();
  }

  /** @inheritDoc */
  public render(): VNode {
    const colorsDef = SyntheticVision.createEarthColors();

    return (
      <HorizonSyntheticVisionLayer
        ref={this.synVisRef}
        projection={this.props.projection}
        bingId={this.props.bingId}
        bingDelay={this.props.bingDelay}
        bingSkipUnbindOnDestroy={this.props.bingSkipUnbindOnDestroy}
        earthColors={ArraySubject.create(colorsDef.colors)}
        earthColorsElevationRange={Vec2Subject.create(colorsDef.elevationRange)}
        skyColor={Subject.create(BingComponent.hexaToRGBColor(SyntheticVision.SKY_COLOR))}
      />
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.synVisRef.getOrDefault()?.destroy();

    this.isEnabledSub?.destroy();

    super.destroy();
  }

  /**
   * Creates an object containing an earth color array and elevation range for an SVT display.
   * @returns An object containing an earth color array and elevation range for an SVT display.
   */
  private static createEarthColors(): TerrainColors {
    // Get absolute map terrain colors and scale lightness by 0.8.

    const def = MapUtils.absoluteTerrainEarthColors();

    const cache = new Float64Array(3);

    return {
      colors: def.colors.map(color => {
        const hsl = ColorUtils.hexToHsl(color, cache, true);
        hsl[2] *= 0.8;

        return ColorUtils.hslToHex(hsl, true);
      }),

      elevationRange: def.elevationRange.slice()
    };
  }
}
