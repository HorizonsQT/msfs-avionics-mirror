import { EventBus } from '../../data/EventBus';
import { NavMath } from '../../geo/NavMath';
import { APValues } from '../APValues';
import { DirectorState, PlaneDirector } from './PlaneDirector';

/**
 * Options for {@link APTrkHoldDirector}.
 */
export type APTrkHoldDirectorOptions = {
  /**
   * The maximum bank angle, in degrees, supported by the director, or a function which returns it. If not defined,
   * the director will use the maximum bank angle defined by its parent autopilot (via `apValues`). Defaults to
   * `undefined`.
   */
  maxBankAngle?: number | (() => number) | undefined;

  /**
   * The bank rate to enforce when the director commands changes in bank angle, in degrees per second, or a function
   * which returns it. If not undefined, a default bank rate will be used. Defaults to `undefined`.
   */
  bankRate?: number | (() => number) | undefined;
};

/**
 * An autopilot director that generates flight director bank commands to level the wings upon activation and then hold
 * the resultant magnetic ground track once the wings are level.
 * 
 * The director requires valid bank and magnetic ground track data to arm or activate.
 */
export class APTrkHoldDirector implements PlaneDirector {
  /** bank angle below which we capture the track */
  private static readonly MIN_BANK_THRESHOLD = 1;

  /** @inheritDoc */
  public state: DirectorState;

  /** @inheritDoc */
  public onActivate?: () => void;

  /** @inheritDoc */
  public onArm?: () => void;

  /** @inheritDoc */
  public onDeactivate?: () => void;

  /** @inheritDoc */
  public driveBank?: (bank: number, rate?: number) => void;

  private readonly maxBankAngleFunc: () => number;
  private readonly driveBankFunc: (bank: number) => void;

  /** track captured at wings level, or null if not yet captured */
  private capturedTrack: number | null = null;

  private readonly bank = this.apValues.dataProvider.getItem('bank');
  private readonly trackMagnetic = this.apValues.dataProvider.getItem('ground_track_magnetic');

  /**
   * Creates an instance of the track hold director.
   * @param bus The event bus to use with this instance.
   * @param apValues Autopilot values from this director's parent autopilot.
   * @param options Options to configure the new director. Option values default to the following if not defined:
   * * `maxBankAngle`: `undefined`
   * * `isToGaMode`: `false`
   */
  constructor(
    private readonly bus: EventBus,
    private readonly apValues: APValues,
    options?: Readonly<APTrkHoldDirectorOptions>
  ) {
    const maxBankAngleOpt = options?.maxBankAngle ?? undefined;
    switch (typeof maxBankAngleOpt) {
      case 'number':
        this.maxBankAngleFunc = () => maxBankAngleOpt;
        break;
      case 'function':
        this.maxBankAngleFunc = maxBankAngleOpt;
        break;
      default:
        this.maxBankAngleFunc = this.apValues.maxBankAngle.get.bind(this.apValues.maxBankAngle);
    }

    const bankRateOpt = options?.bankRate;
    switch (typeof bankRateOpt) {
      case 'number':
        this.driveBankFunc = bank => {
          if (isFinite(bank) && this.driveBank) {
            this.driveBank(bank, bankRateOpt * this.apValues.simRate.get());
          }
        };
        break;
      case 'function':
        this.driveBankFunc = bank => {
          if (isFinite(bank) && this.driveBank) {
            this.driveBank(bank, bankRateOpt() * this.apValues.simRate.get());
          }
        };
        break;
      default:
        this.driveBankFunc = bank => {
          if (isFinite(bank) && this.driveBank) {
            this.driveBank(bank);
          }
        };
    }

    this.state = DirectorState.Inactive;
  }

  /**
   * Checks whether the data required for this director to function are valid.
   * @returns Whether the data required for this director to function are valid.
   */
  private isDataValid(): boolean {
    return this.bank.isValueValid() && this.trackMagnetic.isValueValid();
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

    this.capturedTrack = null;
    SimVar.SetSimVarValue('AUTOPILOT HEADING LOCK', 'Bool', true);
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

    SimVar.SetSimVarValue('AUTOPILOT HEADING LOCK', 'Bool', false);
  }

  /** @inheritDoc */
  public update(): void {
    if (this.state !== DirectorState.Active) {
      return;
    }

    if (!this.isDataValid()) {
      this.deactivate();
      return;
    }

    if (this.capturedTrack === null) {
      const currentBank = this.bank.getValue();
      if (Math.abs(currentBank) < APTrkHoldDirector.MIN_BANK_THRESHOLD) {
        this.capturedTrack = this.trackMagnetic.getValue();
      }
    }

    this.driveBankFunc(this.capturedTrack !== null ? this.desiredBank(this.capturedTrack) : 0);
  }

  /**
   * Gets a desired bank from a Target Selected Track.
   * @param targetTrack The target track.
   * @returns The desired bank angle.
   */
  private desiredBank(targetTrack: number): number {
    const magneticTrack = this.trackMagnetic.getValue();

    const turnDirection = NavMath.getTurnDirection(magneticTrack, targetTrack);
    const trackDiff = Math.abs(NavMath.diffAngle(magneticTrack, targetTrack));

    let baseBank = Math.min(1.25 * trackDiff, this.maxBankAngleFunc());
    baseBank *= (turnDirection === 'left' ? 1 : -1);

    return baseBank;
  }
}
