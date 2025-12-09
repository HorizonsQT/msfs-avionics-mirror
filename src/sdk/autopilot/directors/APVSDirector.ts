import { MathUtils } from '../../math/MathUtils';
import { UnitType } from '../../math/NumberUnit';
import { APValues } from '../APValues';
import { DirectorState, PlaneDirector } from './PlaneDirector';

/**
 * An autopilot director that generates flight director pitch commands to hold an indicated vertical speed.
 * 
 * The director requires valid pitch and indicated vertical speed data to arm or activate.
 */
export class APVSDirector implements PlaneDirector {

  /** @inheritDoc */
  public state: DirectorState;

  /** @inheritDoc */
  public onActivate?: () => void;

  /** @inheritDoc */
  public onArm?: () => void;

  /** @inheritDoc */
  public onDeactivate?: () => void;

  /** @inheritDoc */
  public drivePitch?: (pitch: number, adjustForAoa?: boolean, adjustForVerticalWind?: boolean) => void;

  private readonly pitch = this.apValues.dataProvider.getItem('pitch');
  private readonly verticalSpeed = this.apValues.dataProvider.getItem('indicated_vertical_speed');
  private readonly tas = this.apValues.dataProvider.getItem('tas');

  /**
   * Creates a new instance of APVSDirector.
   * @param apValues are the ap selected values for the autopilot.
   * @param vsIncrement The number that vertical speed can be incremented by, in feet per minute.
   * Upon activation, the actual vs will be rounded using this increment.
   * If undefined, the value will not be rounded before passed to the sim. Defaults to undefined.
   */
  public constructor(protected readonly apValues: APValues, protected readonly vsIncrement: number | undefined = undefined) {
    this.state = DirectorState.Inactive;
  }

  /**
   * Checks whether the data required for this director to function are valid.
   * @returns Whether the data required for this director to function are valid.
   */
  private isDataValid(): boolean {
    return this.pitch.isValueValid() && this.verticalSpeed.isValueValid();
  }

  /** @inheritDoc */
  public activate(): void {
    if (this.state === DirectorState.Active || !this.isDataValid()) {
      return;
    }

    this.state = DirectorState.Active;

    if (this.onActivate !== undefined) {
      this.onActivate();
    }

    const currentVs = this.vsIncrement === undefined
      ? this.verticalSpeed.getValue()
      : MathUtils.round(this.verticalSpeed.getValue(), this.vsIncrement);
    Coherent.call('AP_VS_VAR_SET_ENGLISH', 1, currentVs);
    SimVar.SetSimVarValue('AUTOPILOT VERTICAL HOLD', 'Bool', true);
  }

  /**
   * Arms this director. If the director is not already active, then this will immediately attempt to activate the
   * director.
   */
  public arm(): void {
    if (this.state === DirectorState.Inactive) {
      this.activate();
    }
  }

  /** @inheritDoc */
  public deactivate(): void {
    if (this.state === DirectorState.Inactive) {
      return;
    }

    this.state = DirectorState.Inactive;

    if (this.onDeactivate !== undefined) {
      this.onDeactivate();
    }

    SimVar.SetSimVarValue('AUTOPILOT VERTICAL HOLD', 'Bool', false);
  }

  /** @inheritDoc */
  public update(): void {
    if (this.state !== DirectorState.Active) {
      return;
    }

    if (this.isDataValid()) {
      this.drivePitch && this.drivePitch(this.getDesiredPitch(), true, true);
    } else {
      this.deactivate();
    }
  }

  /**
   * Gets a desired pitch from the selected vs value.
   * @returns The desired pitch angle.
   */
  protected getDesiredPitch(): number {
    const tas = this.tas.getActualValue();
    const desiredPitch = this.getFpa(UnitType.NMILE.convertTo(tas / 60, UnitType.FOOT), this.apValues.selectedVerticalSpeed.get());
    return -MathUtils.clamp(isNaN(desiredPitch) ? 0 : desiredPitch, -15, 15);
  }

  /**
   * Gets a desired fpa.
   * @param distance is the distance traveled per minute.
   * @param altitude is the vertical speed per minute.
   * @returns The desired pitch angle.
   */
  private getFpa(distance: number, altitude: number): number {
    return UnitType.RADIAN.convertTo(Math.atan(altitude / distance), UnitType.DEGREE);
  }
}
