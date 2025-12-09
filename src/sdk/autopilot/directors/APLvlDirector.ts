import { APValues } from '../APValues';
import { DirectorState, PlaneDirector } from './PlaneDirector';

/**
 * Options for {@link APLvlDirector}.
 */
export type APLvlDirectorOptions = {
  /**
   * The bank rate to enforce when the director commands changes in bank angle, in degrees per second, or a function
   * which returns it. If not undefined, a default bank rate will be used. Defaults to `undefined`.
   */
  bankRate?: number | (() => number) | undefined;

  /**
   * Whether the director should omit setting the `AUTOPILOT WING LEVELER` SimVar to true (1) when the director is
   * active. Defaults to `false`.
   */
  omitWingLeveler?: boolean;
};

/**
 * An autopilot director that generates flight director bank commands to level the wings (zero bank). Optionally sets
 * the `AUTOPILOT WING LEVELER` SimVar state to true (1) when it is armed or activated, and to false (0) when it is
 * deactivated.
 * 
 * The director requires valid bank data to arm or activate.
 */
export class APLvlDirector implements PlaneDirector {
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

  private readonly driveBankFunc: (bank: number) => void;

  private readonly omitWingLeveler: boolean;

  private readonly bank = this.apValues.dataProvider.getItem('bank');

  /**
   * Creates a new instance of APLvlDirector.
   * @param apValues Autopilot values from this director's parent autopilot.
   * @param options Options to configure the new director.
   */
  public constructor(
    private readonly apValues: APValues,
    options?: Readonly<APLvlDirectorOptions>
  ) {
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

    this.omitWingLeveler = options?.omitWingLeveler ?? false;

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

    if (!this.omitWingLeveler) {
      SimVar.SetSimVarValue('AUTOPILOT WING LEVELER', 'Bool', true);
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

    if (!this.omitWingLeveler) {
      SimVar.SetSimVarValue('AUTOPILOT WING LEVELER', 'Bool', false);
    }
  }

  /** @inheritDoc */
  public update(): void {
    if (this.state !== DirectorState.Active) {
      return;
    }

    if (this.isDataValid()) {
      this.driveBankFunc(0);
    } else {
      this.deactivate();
    }
  }
}
