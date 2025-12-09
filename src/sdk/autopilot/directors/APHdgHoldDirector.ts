import { EventBus } from '../../data/EventBus';
import { NavMath } from '../../geo/NavMath';
import { APValues } from '../APValues';
import { DirectorState, PlaneDirector } from './PlaneDirector';

/**
 * Options for {@link APHdgHoldDirector}.
 */
export type APHdgHoldDirectorOptions = {
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
 * the resultant magnetic heading once the wings are level.
 * 
 * The director requires valid bank and magnetic heading data to arm or activate.
 */
export class APHdgHoldDirector implements PlaneDirector {
  /** bank angle below which we capture the heading */
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

  /** heading captured at wings level, or null if not yet captured */
  private capturedHeading: number | null = null;

  private readonly bank = this.apValues.dataProvider.getItem('bank');
  private readonly headingMagnetic = this.apValues.dataProvider.getItem('heading_magnetic');

  /**
   * Creates an instance of the heading hold director.
   * @param bus The event bus to use with this instance.
   * @param apValues Autopilot values from this director's parent autopilot.
   * @param options Options to configure the new director.
   */
  constructor(
    bus: EventBus,
    private readonly apValues: APValues,
    options?: Readonly<APHdgHoldDirectorOptions>
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
    return this.bank.isValueValid() && this.headingMagnetic.isValueValid();
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

    this.capturedHeading = null;

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

    const currentHeading = this.headingMagnetic.getValue();

    if (this.capturedHeading === null && Math.abs(this.bank.getValue()) < APHdgHoldDirector.MIN_BANK_THRESHOLD) {
      this.capturedHeading = currentHeading;
    }

    this.driveBankFunc(this.capturedHeading !== null ? this.desiredBank(currentHeading, this.capturedHeading) : 0);
  }

  /**
   * Gets the desired bank angle from given current and target heading values.
   * @param currentHeading The airplane's current heading, in degrees.
   * @param targetHeading The target heading, in degrees.
   * @returns The desired bank angle, in degrees. Positive values indicate leftward bank. Negative values indicate
   * rightward bank.
   */
  private desiredBank(currentHeading: number, targetHeading: number): number {
    const turnDirection = NavMath.getTurnDirection(currentHeading, targetHeading);
    const headingDiff = Math.abs(NavMath.diffAngle(currentHeading, targetHeading));

    let baseBank = Math.min(1.25 * headingDiff, this.maxBankAngleFunc());
    baseBank *= (turnDirection === 'left' ? 1 : -1);

    return baseBank;
  }
}
