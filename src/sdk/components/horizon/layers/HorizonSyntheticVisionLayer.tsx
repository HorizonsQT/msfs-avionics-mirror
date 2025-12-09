import { SimAltitudeReference } from '../../../geo/SimAltitudeReference';
import { BitFlags } from '../../../math/BitFlags';
import { ReadonlyFloat64Array, Vec2Math, Vec3Math } from '../../../math/VecMath';
import { Vec2Subject } from '../../../math/VectorSubject';
import { AccessibleUtils } from '../../../sub/AccessibleUtils';
import { MappedSubject } from '../../../sub/MappedSubject';
import { ObjectSubject } from '../../../sub/ObjectSubject';
import { Subject } from '../../../sub/Subject';
import { Subscribable } from '../../../sub/Subscribable';
import { SubscribableArray } from '../../../sub/SubscribableArray';
import { SubscribableSet } from '../../../sub/SubscribableSet';
import { SubscribableUtils } from '../../../sub/SubscribableUtils';
import { Subscription } from '../../../sub/Subscription';
import { BingCameraRotationReference, BingComponent } from '../../bing/BingComponent';
import { FSComponent, ToggleableClassNameRecord, VNode } from '../../FSComponent';
import { SynVisComponent } from '../../synvis/SynVisComponent';
import { HorizonLayer, HorizonLayerProps } from '../HorizonLayer';
import { HorizonProjection, HorizonProjectionChangeType } from '../HorizonProjection';

/**
 * Modes of behavior used by {@link HorizonSyntheticVisionLayer} to control camera parameters for its underlying Bing
 * instance.
 */
export enum HorizonSyntheticVisionCameraParamMode {
  /** The default behavior of the Bing instance camera for the parameter will be used. */
  Default = 0,

  /** The parameter will be set from the state of the layer's horizon projection. */
  Auto,

  /** The parameter will be set using custom parameter values passed to the layer's props. */
  Custom,
}

/**
 * Component props for {@link HorizonSyntheticVisionLayer}.
 */
export interface HorizonSyntheticVisionLayerProps extends HorizonLayerProps {
  /** The string ID to assign to the layer's bound Bing instance. */
  bingId: string;

  /** The amount of time, in milliseconds, to delay binding the layer's Bing instance. Defaults to 0. */
  bingDelay?: number;

  /** Whether to skip unbinding the layer's bound Bing instance when the layer is destroyed. Defaults to `false`. */
  bingSkipUnbindOnDestroy?: boolean;

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
   * The mode used to control the position of the camera of the layer's underlying Bing instance. If
   * {@link HorizonSyntheticVisionCameraParamMode.Auto} is used, then the position of the camera will be set to the
   * position and altitude of the layer's projection (note that this does _not_ include the projection's camera
   * offset). If {@link HorizonSyntheticVisionCameraParamMode.Custom} is used, then the position will be set using the
   * `cameraPosition` and `cameraAltitudeReference` props. If `cameraPosition` is not defined, then
   * `HorizonSyntheticVisionCameraParamMode.Custom` will behave like
   * {@link HorizonSyntheticVisionCameraParamMode.Default}. Defaults to
   * `HorizonSyntheticVisionCameraParamMode.Default`.
   */
  cameraPositionMode?: HorizonSyntheticVisionCameraParamMode | Subscribable<HorizonSyntheticVisionCameraParamMode>;

  /**
   * The position to set for the camera of the layer's underlying Bing instance, as
   * `[longitude (degrees), latitude (degrees), altitude (meters)]`. Ignored if `cameraPositionMode` is not
   * {@link HorizonSyntheticVisionCameraParamMode.Custom}.
   */
  cameraPosition?: Subscribable<ReadonlyFloat64Array>;

  /**
   * The reference to use when defining the altitude for the camera of the layer's underlying Bing instance. Ignored if
   * `cameraPositionMode` is not {@link HorizonSyntheticVisionCameraParamMode.Custom}. Defaults to
   * {@link SimAltitudeReference.Geoid}.
   */
  cameraAltitudeReference?: SimAltitudeReference.Ellipsoid | SimAltitudeReference.Geoid | Subscribable<SimAltitudeReference.Ellipsoid | SimAltitudeReference.Geoid>;

  /**
   * The mode used to control the rotation of the camera of the layer's underlying Bing instance. If
   * {@link HorizonSyntheticVisionCameraParamMode.Auto} is used, then the rotation of the camera will be set to the
   * pitch, roll, and heading of the layer's projection. If {@link HorizonSyntheticVisionCameraParamMode.Custom} is
   * used, then the rotation will be set using the `cameraRotation` and `cameraRotationReference` props. If
   * `cameraRotation` is not defined, then `HorizonSyntheticVisionCameraParamMode.Custom` will behave like
   * {@link HorizonSyntheticVisionCameraParamMode.Default}. Defaults to
   * `HorizonSyntheticVisionCameraParamMode.Default`.
   */
  cameraRotationMode?: HorizonSyntheticVisionCameraParamMode | Subscribable<HorizonSyntheticVisionCameraParamMode>;

  /**
   * The rotation to set for the camera of the layer's underlying Bing instance, as
   * `[pitch, roll, heading]` in degrees. The sign conventions for pitch and roll are the same as those used by the
   * layer's horizon projection: positive pitch up and positive roll to the right. Ignored if `cameraRotationMode` is
   * not {@link HorizonSyntheticVisionCameraParamMode.Custom}.
   */
  cameraRotation?: Subscribable<ReadonlyFloat64Array>;

  /**
   * The reference to use when defining the rotation for the camera of the layer's underlying Bing instance. Ignored if
   * `cameraRotationMode` is not {@link HorizonSyntheticVisionCameraParamMode.Custom}. Defaults to
   * {@link BingCameraRotationReference.World}.
   */
  cameraRotationReference?: BingCameraRotationReference | Subscribable<BingCameraRotationReference>;

  /**
   * The mode used to control the offset of the camera of the layer's underlying Bing instance. If
   * {@link HorizonSyntheticVisionCameraParamMode.Auto} is used, then the offset of the camera will be set to the
   * camera offset of the layer's projection. If {@link HorizonSyntheticVisionCameraParamMode.Custom} is
   * used, then the offset will be set using the `cameraOffset` prop. If `cameraOffset` is not defined, then
   * `HorizonSyntheticVisionCameraParamMode.Custom` will behave like
   * {@link HorizonSyntheticVisionCameraParamMode.Default}. Defaults to
   * `HorizonSyntheticVisionCameraParamMode.Default`.
   */
  cameraOffsetMode?: HorizonSyntheticVisionCameraParamMode | Subscribable<HorizonSyntheticVisionCameraParamMode>;

  /**
   * The offset to set for the camera of the layer's underlying Bing instance, as `[x, y, z]` in meters in the camera's
   * coordinate system. The positive z axis points in the forward direction of the camera, the positive x
   * axis points in the upward direction, and the positive y axis points to the right. Ignored if `cameraOffsetMode` is
   * not {@link HorizonSyntheticVisionCameraParamMode.Custom}.
   */
  cameraOffset?: ReadonlyFloat64Array | Subscribable<ReadonlyFloat64Array>;

  /** CSS class(es) to apply to the layer's root element. */
  class?: string | SubscribableSet<string> | ToggleableClassNameRecord;
}

/**
 * A horizon layer that renders a synthetic vision display using a Bing instance.
 */
export class HorizonSyntheticVisionLayer extends HorizonLayer<HorizonSyntheticVisionLayerProps> {
  private static readonly PROJECTION_UPDATE_CHANGE_FLAGS
    = HorizonProjectionChangeType.ProjectedSize
    | HorizonProjectionChangeType.ProjectedOffset
    | HorizonProjectionChangeType.Fov
    | HorizonProjectionChangeType.ScaleFactor;

  private static readonly CAMERA_POSITION_UPDATE_CHANGE_FLAGS
    = HorizonProjectionChangeType.Position
    | HorizonProjectionChangeType.Altitude;

  private static readonly CAMERA_ROTATION_UPDATE_CHANGE_FLAGS
    = HorizonProjectionChangeType.Pitch
    | HorizonProjectionChangeType.Roll
    | HorizonProjectionChangeType.Heading;

  private static readonly CAMERA_OFFSET_UPDATE_CHANGE_FLAGS
    = HorizonProjectionChangeType.Offset;

  private readonly synVisRef = FSComponent.createRef<SynVisComponent>();

  private readonly rootStyle = ObjectSubject.create({
    position: 'absolute',
    display: '',
    left: '0',
    top: '0',
    width: '100%',
    height: '100%'
  });

  private readonly resolution = Vec2Subject.create(Vec2Math.create(100, 100));
  private readonly fov = Subject.create(BingComponent.DEFAULT_3D_FOV);

  private readonly cameraPositionMode = SubscribableUtils.toSubscribable(this.props.cameraPositionMode ?? HorizonSyntheticVisionCameraParamMode.Default, true);
  private readonly cameraRotationMode = SubscribableUtils.toSubscribable(this.props.cameraRotationMode ?? HorizonSyntheticVisionCameraParamMode.Default, true);
  private readonly cameraOffsetMode = SubscribableUtils.toSubscribable(this.props.cameraOffsetMode ?? HorizonSyntheticVisionCameraParamMode.Default, true);

  private readonly updateCameraParamChangeFlags = MappedSubject.create(
    ([positionMode, rotationMode, offsetMode]) => {
      return (positionMode === HorizonSyntheticVisionCameraParamMode.Auto ? HorizonSyntheticVisionLayer.CAMERA_POSITION_UPDATE_CHANGE_FLAGS : 0)
        | (rotationMode === HorizonSyntheticVisionCameraParamMode.Auto ? HorizonSyntheticVisionLayer.CAMERA_ROTATION_UPDATE_CHANGE_FLAGS : 0)
        | (offsetMode === HorizonSyntheticVisionCameraParamMode.Auto ? HorizonSyntheticVisionLayer.CAMERA_OFFSET_UPDATE_CHANGE_FLAGS : 0);
    },
    this.cameraPositionMode,
    this.cameraRotationMode,
    this.cameraOffsetMode
  );

  private readonly cameraPosition = new LatLongAlt(0, 0, 0);
  private readonly cameraRotation = new PitchBankHeading({ pitchDegree: 0, bankDegree: 0, headingDegree: 0 });
  private readonly cameraOffset = Vec3Math.create();

  private readonly customCameraAltitudeReference = AccessibleUtils.toAccessible(this.props.cameraAltitudeReference ?? SimAltitudeReference.Geoid, true);
  private readonly customCameraRotationReference = AccessibleUtils.toAccessible(this.props.cameraRotationReference ?? BingCameraRotationReference.World, true);
  private readonly customCameraOffset = this.props.cameraOffset ? AccessibleUtils.toAccessible(this.props.cameraOffset, true) : undefined;

  private customCameraPositionSub?: Subscription;
  private customCameraAltitudeReferenceSub?: Subscription;
  private customCameraRotationSub?: Subscription;
  private customCameraRotationReferenceSub?: Subscription;
  private customCameraOffsetSub?: Subscription;

  private needUpdateVisibility = false;
  private needUpdateProjection = false;
  private needUpdateCameraParams = false;

  private readonly subscriptions: Subscription[] = [
    this.updateCameraParamChangeFlags
  ];

  /** @inheritDoc */
  protected onVisibilityChanged(): void {
    this.needUpdateVisibility = true;
  }

  /** @inheritDoc */
  public onAttached(): void {
    super.onAttached();

    const scheduleCameraParamsUpdate = (): void => { this.needUpdateCameraParams = true; };

    if (this.props.cameraPosition) {
      this.subscriptions.push(this.customCameraPositionSub = this.props.cameraPosition.sub(scheduleCameraParamsUpdate, false, true));
    }
    if (SubscribableUtils.isSubscribable(this.props.cameraAltitudeReference)) {
      this.subscriptions.push(this.customCameraAltitudeReferenceSub = this.props.cameraAltitudeReference.sub(scheduleCameraParamsUpdate, false, true));
    }

    if (this.props.cameraRotation) {
      this.subscriptions.push(this.customCameraRotationSub = this.props.cameraRotation.sub(scheduleCameraParamsUpdate, false, true));
    }
    if (SubscribableUtils.isSubscribable(this.props.cameraRotationReference)) {
      this.subscriptions.push(this.customCameraRotationReferenceSub = this.props.cameraRotationReference.sub(scheduleCameraParamsUpdate, false, true));
    }

    if (SubscribableUtils.isSubscribable(this.props.cameraOffset)) {
      this.subscriptions.push(this.customCameraOffsetSub = this.props.cameraOffset.sub(scheduleCameraParamsUpdate, false, true));
    }

    this.subscriptions.push(
      this.cameraPositionMode.sub(mode => {
        if (mode === HorizonSyntheticVisionCameraParamMode.Custom) {
          this.customCameraPositionSub?.resume();
          this.customCameraAltitudeReferenceSub?.resume();
        } else {
          this.customCameraPositionSub?.pause();
          this.customCameraAltitudeReferenceSub?.pause();
        }
        scheduleCameraParamsUpdate();
      }, true),

      this.cameraRotationMode.sub(mode => {
        if (mode === HorizonSyntheticVisionCameraParamMode.Custom) {
          this.customCameraRotationSub?.resume();
          this.customCameraRotationReferenceSub?.resume();
        } else {
          this.customCameraRotationSub?.pause();
          this.customCameraRotationReferenceSub?.pause();
        }
        scheduleCameraParamsUpdate();
      }, true),

      this.cameraOffsetMode.sub(mode => {
        if (mode === HorizonSyntheticVisionCameraParamMode.Custom) {
          this.customCameraOffsetSub?.resume();
        } else {
          this.customCameraOffsetSub?.pause();
        }
        scheduleCameraParamsUpdate();
      }, true),
    );

    this.needUpdateVisibility = true;
    this.needUpdateProjection = true;
    this.needUpdateCameraParams = true;
  }

  /** @inheritDoc */
  public onProjectionChanged(projection: HorizonProjection, changeFlags: number): void {
    if (BitFlags.isAny(changeFlags, HorizonSyntheticVisionLayer.PROJECTION_UPDATE_CHANGE_FLAGS)) {
      this.needUpdateProjection = true;
    }

    if (BitFlags.isAny(changeFlags, this.updateCameraParamChangeFlags.get())) {
      this.needUpdateCameraParams = true;
    }
  }

  /** @inheritDoc */
  public onWake(): void {
    this.synVisRef.instance.wake();
  }

  /** @inheritDoc */
  public onSleep(): void {
    this.synVisRef.instance.sleep();
  }

  /** @inheritDoc */
  public onUpdated(): void {
    const isVisible = this.isVisible();

    if (this.needUpdateVisibility) {
      this.rootStyle.set('display', isVisible ? '' : 'none');
    }

    if (!isVisible) {
      return;
    }

    if (this.needUpdateProjection) {
      this.updateProjection();
      this.needUpdateProjection = false;
    }

    if (this.needUpdateCameraParams) {
      this.updateCameraParams();
      this.needUpdateCameraParams = false;
    }
  }

  /**
   * Updates this layer's projection-related properties.
   */
  private updateProjection(): void {
    const projectedSize = this.props.projection.getProjectedSize();
    const projectedOffset = this.props.projection.getProjectedOffset();
    const offsetCenterProjected = this.props.projection.getOffsetCenterProjected();
    const fov = this.props.projection.getFov();
    const scaleFactor = this.props.projection.getScaleFactor();

    // We need to move the Bing texture such that its center lies at the center of the projection, including offset.
    // If there is an offset, we need to overdraw the Bing texture in order to fill the entire projection window.

    const xOverdraw = Math.abs(projectedOffset[0]);
    const yOverdraw = Math.abs(projectedOffset[1]);

    const bingWidth = projectedSize[0] + xOverdraw * 2;
    const bingHeight = projectedSize[1] + yOverdraw * 2;

    // Set the FOV of the Bing component such that it aligns with the FOV of the horizon projection.
    const bingFov = 2 * Math.atan(bingHeight / scaleFactor * Math.tan(fov * 0.5 * Avionics.Utils.DEG2RAD)) * Avionics.Utils.RAD2DEG;

    this.resolution.set(bingWidth, bingHeight);
    this.fov.set(bingFov);

    this.rootStyle.set('left', `${offsetCenterProjected[0] - bingWidth / 2}px`);
    this.rootStyle.set('top', `${offsetCenterProjected[1] - bingHeight / 2}px`);
    this.rootStyle.set('width', `${bingWidth}px`);
    this.rootStyle.set('height', `${bingHeight}px`);
  }

  /**
   * Updates the camera parameters of this layer's Bing instance.
   */
  private updateCameraParams(): void {
    let position: LatLongAlt | null = null;
    let altitudeReference: SimAltitudeReference.Geoid | SimAltitudeReference.Ellipsoid | null = null;
    let rotation: PitchBankHeading | null = null;
    let rotationReference: BingCameraRotationReference | null = null;
    let offset: ReadonlyFloat64Array | null = null;

    switch (this.cameraPositionMode.get()) {
      case HorizonSyntheticVisionCameraParamMode.Auto: {
        const projectionPosition = this.props.projection.getPosition();
        this.cameraPosition.lat = projectionPosition.lat;
        this.cameraPosition.long = projectionPosition.lon;
        this.cameraPosition.alt = this.props.projection.getAltitude();
        position = this.cameraPosition;
        altitudeReference = SimAltitudeReference.Geoid;
        break;
      }

      case HorizonSyntheticVisionCameraParamMode.Custom: {
        if (this.props.cameraPosition) {
          const customPosition = this.props.cameraPosition.get();
          this.cameraPosition.lat = customPosition[1];
          this.cameraPosition.long = customPosition[0];
          this.cameraPosition.alt = customPosition[2];
          position = this.cameraPosition;
          altitudeReference = this.customCameraAltitudeReference.get();
        }
        break;
      }
    }

    switch (this.cameraRotationMode.get()) {
      case HorizonSyntheticVisionCameraParamMode.Auto: {
        this.cameraRotation.pitchDegree = -this.props.projection.getPitch();
        this.cameraRotation.bankDegree = -this.props.projection.getRoll();
        this.cameraRotation.headingDegree = this.props.projection.getHeading();
        rotation = this.cameraRotation;
        rotationReference = BingCameraRotationReference.World;
        break;
      }

      case HorizonSyntheticVisionCameraParamMode.Custom: {
        if (this.props.cameraRotation) {
          const customRotation = this.props.cameraRotation.get();
          this.cameraRotation.pitchDegree = -customRotation[0];
          this.cameraRotation.bankDegree = -customRotation[1];
          this.cameraRotation.headingDegree = customRotation[2];
          rotation = this.cameraRotation;
          rotationReference = this.customCameraRotationReference.get();
        }
        break;
      }
    }

    switch (this.cameraOffsetMode.get()) {
      case HorizonSyntheticVisionCameraParamMode.Auto: {
        const projectionOffset = this.props.projection.getOffset();
        this.cameraOffset[0] = -projectionOffset[1];
        this.cameraOffset[1] = projectionOffset[0];
        this.cameraOffset[2] = projectionOffset[2];
        offset = this.cameraOffset;
        break;
      }

      case HorizonSyntheticVisionCameraParamMode.Custom: {
        if (this.customCameraOffset) {
          const customOffset = this.customCameraOffset.get();
          this.cameraOffset[0] = -customOffset[1];
          this.cameraOffset[1] = customOffset[0];
          this.cameraOffset[2] = customOffset[2];
          offset = this.cameraOffset;
        }
        break;
      }
    }

    this.synVisRef.instance.set3DMapCameraTransform(position, altitudeReference, offset, rotation, rotationReference);
  }

  /** @inheritDoc */
  public render(): VNode {
    return (
      <div class={this.props.class ?? ''} style={this.rootStyle}>
        <SynVisComponent
          ref={this.synVisRef}
          bingId={this.props.bingId}
          bingDelay={this.props.bingDelay}
          bingSkipUnbindOnDestroy={this.props.bingSkipUnbindOnDestroy}
          resolution={this.resolution}
          earthColors={this.props.earthColors}
          earthColorsElevationRange={this.props.earthColorsElevationRange}
          skyColor={this.props.skyColor}
          fov={this.fov}
        />
      </div>
    );
  }

  /** @inheritDoc */
  public destroy(): void {
    this.synVisRef.getOrDefault()?.destroy();

    for (const sub of this.subscriptions) {
      sub.destroy();
    }

    super.destroy();
  }
}
