import { MathUtils } from '../../math/MathUtils';
import { APValues } from '../APValues';
import { DirectorState, PlaneDirector } from './PlaneDirector';

/**
 * Options for control of the roll director.
 */
export type APRollDirectorOptions = {
  /**
   * The minimum bank angle, in degrees, below which the roll director will command wings level, or a function which
   * returns it. Defaults to `0`.
   */
  minBankAngle?: number | (() => number);

  /**
   * The maximum bank angle, in degrees, that the roll director will not exceed, or a function which returns it. If not
   * defined, the director will use the maximum bank angle defined by its parent autopilot (via `apValues`).
   */
  maxBankAngle?: number | (() => number) | undefined;

  /**
   * The bank rate to enforce when the director commands changes in bank angle, in degrees per second, or a function
   * which returns it. If not undefined, a default bank rate will be used. Defaults to `undefined`.
   */
  bankRate?: number | (() => number) | undefined;
};

/**
 * An autopilot director that generates flight director bank commands to hold a roll attitude.
 * 
 * The director requires valid bank data to arm or activate.
 */
export class APRollDirector implements PlaneDirector {
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

  private currentBankRef = 0;
  private desiredBank = 0;

  private readonly minBankAngleFunc: () => number;
  private readonly maxBankAngleFunc: () => number;
  private readonly driveBankFunc: (bank: number) => void;

  private readonly bank = this.apValues.dataProvider.getItem('bank');

  /**
   * Creates a new instance of APRollDirector.
   * @param apValues The AP Values.
   * @param options Options to configure the new director.
   */
  public constructor(private readonly apValues: APValues, options?: Readonly<APRollDirectorOptions>) {
    const minBankAngleOpt = options?.minBankAngle ?? 0;
    if (typeof minBankAngleOpt === 'number') {
      this.minBankAngleFunc = () => minBankAngleOpt;
    } else {
      this.minBankAngleFunc = minBankAngleOpt;
    }

    const maxBankAngleOpt = options?.maxBankAngle;
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
    return this.bank.isValueValid();
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

    this.currentBankRef = this.bank.getValue();

    const maxBank = this.maxBankAngleFunc();
    const minBank = this.minBankAngleFunc();

    if (Math.abs(this.currentBankRef) < minBank) {
      this.desiredBank = 0;
    } else {
      this.desiredBank = MathUtils.clamp(this.currentBankRef, -maxBank, maxBank);
    }

    SimVar.SetSimVarValue('AUTOPILOT BANK HOLD', 'Bool', true);
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

    this.desiredBank = 0;

    SimVar.SetSimVarValue('AUTOPILOT BANK HOLD', 'Bool', false);
  }

  /** @inheritDoc */
  public update(): void {
    if (this.state !== DirectorState.Active) {
      return;
    }

    if (this.isDataValid()) {
      this.driveBankFunc(this.desiredBank);
    } else {
      this.deactivate();
    }
  }
}
