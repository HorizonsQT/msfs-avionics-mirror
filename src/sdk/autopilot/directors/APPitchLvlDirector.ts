/// <reference types="@microsoft/msfs-types/js/simvar" preserve="true" />

import { APValues } from '../APValues';
import { DirectorState, PlaneDirector } from './PlaneDirector';

/**
 * An autopilot director that generates flight director pitch commands to maintain zero vertical speed.
 * 
 * The director requires valid pitch and indicated vertical speed data to arm or activate.
 */
export class APPitchLvlDirector implements PlaneDirector {
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
  private readonly indicatedVerticalSpeed = this.apValues.dataProvider.getItem('indicated_vertical_speed');

  /**
   * Creates an instance of the APPitchLvlDirector.
   * @param apValues are the ap selected values for the autopilot.
   */
  constructor(protected readonly apValues: APValues) {
    this.state = DirectorState.Inactive;
  }

  /**
   * Checks whether the data required for this director to function are valid.
   * @returns Whether the data required for this director to function are valid.
   */
  private isDataValid(): boolean {
    return this.pitch.isValueValid() && this.indicatedVerticalSpeed.isValueValid();
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
  }

  /** @inheritDoc */
  public arm(): void {
    if (this.state == DirectorState.Inactive) {
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
  }

  /** @inheritDoc */
  public update(): void {
    if (this.state !== DirectorState.Active) {
      return;
    }

    if (this.isDataValid()) {
      this.drivePitch && this.drivePitch(0, true, true);
    } else {
      this.deactivate();
    }
  }
}
