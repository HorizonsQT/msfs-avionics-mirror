import { MathUtils } from '../../math/MathUtils';
import { UnitType } from '../../math/NumberUnit';
import { APValues } from '../APValues';
import { VNavUtils } from '../vnav/VNavUtils';
import { DirectorState, PlaneDirector } from './PlaneDirector';

/**
 * An autopilot director that generates flight director pitch commands to hold an indicated altitude.
 * 
 * The director requires valid pitch, indicated altitude and indicated vertical speed data to arm or activate.
 */
export class APAltDirector implements PlaneDirector {

  /** @inheritDoc */
  public state: DirectorState;

  /** @inheritDoc */
  public drivePitch?: (pitch: number, adjustForAoa?: boolean, adjustForVerticalWind?: boolean) => void;

  /** @inheritDoc */
  public onActivate?: () => void;

  /** @inheritDoc */
  public onArm?: () => void;

  /** @inheritDoc */
  public onDeactivate?: () => void;

  private readonly pitch = this.apValues.dataProvider.getItem('pitch');
  private readonly indicatedAltitude = this.apValues.dataProvider.getItem('indicated_altitude');
  private readonly indicatedVerticalSpeed = this.apValues.dataProvider.getItem('indicated_vertical_speed');
  private readonly tas = this.apValues.dataProvider.getItem('tas');

  /**
   * Creates a new instance of APAltDirector.
   * @param apValues are the ap selected values for the autopilot.
   */
  public constructor(private readonly apValues: APValues) {
    this.state = DirectorState.Inactive;
  }

  /**
   * Checks whether the data required for this director to function are valid.
   * @returns Whether the data required for this director to function are valid.
   */
  private isDataValid(): boolean {
    return this.pitch.isValueValid() && this.indicatedAltitude.isValueValid() && this.indicatedVerticalSpeed.isValueValid();
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

    SimVar.SetSimVarValue('AUTOPILOT ALTITUDE LOCK', 'Bool', true);
  }

  /** @inheritDoc */
  public arm(): void {
    if (this.state !== DirectorState.Inactive || !this.isDataValid()) {
      return;
    }

    this.state = DirectorState.Armed;

    if (this.onArm !== undefined) {
      this.onArm();
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

    SimVar.SetSimVarValue('AUTOPILOT ALTITUDE LOCK', 'Bool', false);
  }

  /** @inheritDoc */
  public update(): void {
    if (this.state === DirectorState.Inactive) {
      return;
    }

    if (!this.isDataValid()) {
      this.deactivate();
      return;
    }

    if (this.state === DirectorState.Active) {
      this.holdAltitude();
    } else {
      this.tryActivate();
    }
  }

  /**
   * Attempts to activate altitude capture.
   */
  private tryActivate(): void {
    const capturedAltitude = Math.round(this.apValues.capturedAltitude.get());
    const deviationFromTarget = Math.abs(capturedAltitude - this.indicatedAltitude.getValue());

    if (deviationFromTarget <= 20) {
      this.activate();
    }
  }

  /**
   * Holds a captured altitude.
   */
  private holdAltitude(): void {
    const capturedAltitude = Math.round(this.apValues.capturedAltitude.get());
    const deltaAlt = this.indicatedAltitude.getValue() - capturedAltitude;
    let setVerticalSpeed = 0;
    const correction = MathUtils.clamp(10 * Math.abs(deltaAlt), 100, 500);
    if (deltaAlt > 10) {
      setVerticalSpeed = 0 - correction;
    } else if (deltaAlt < -10) {
      setVerticalSpeed = correction;
    }
    this.drivePitch && this.drivePitch(this.getDesiredPitch(setVerticalSpeed), true, true);
  }

  /**
   * Gets a desired pitch from the selected vs value.
   * @param vs target vertical speed.
   * @returns The desired pitch angle.
   */
  private getDesiredPitch(vs: number): number {
    const desiredPitch = VNavUtils.getFpa(UnitType.KNOT.convertTo(this.tas.getActualValue(), UnitType.FPM), vs);
    return -MathUtils.clamp(desiredPitch, -10, 10);
  }
}
