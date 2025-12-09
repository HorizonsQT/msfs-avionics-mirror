import { EventBus } from '../../data/EventBus';
import { NavMath } from '../../geo/NavMath';
import { MathUtils } from '../../math/MathUtils';
import { APValues } from '../APValues';
import { DirectorState, PlaneDirector } from './PlaneDirector';

/**
 * Options for {@link APHdgDirector}.
 */
export type APHdgDirectorOptions = {
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

  /**
   * The threshold difference between selected heading and current heading, in degrees, at which the director unlocks
   * its commanded turn direction and chooses a new optimal turn direction to establish on the selected heading,
   * potentially resulting in a turn reversal. Any value less than or equal to 180 degrees effectively prevents the
   * director from locking a commanded turn direction. Any value greater than or equal to 360 degrees will require the
   * selected heading to traverse past the current heading in the desired turn direction in order for the director to
   * issue a turn reversal. Defaults to `0`.
   */
  turnReversalThreshold?: number;

  /**
   * Whether the director is to be used as a TO/GA lateral mode. If false, then the director will hold the autopilot's
   * selected heading and will control the state of the `AUTOPILOT HEADING LOCK` SimVar. If true, then the director
   * will hold the airplane's current heading at the time of director activation or the transition from on-ground to
   * in-air, whichever comes later, and will not control the state of the `AUTOPILOT HEADING LOCK` SimVar. Defaults to
   * `false`.
   */
  isToGaMode?: boolean;
};

/**
 * An autopilot director that generates flight director bank commands to hold a magnetic heading. Optionally sets
 * the `AUTOPILOT HEADING LOCK` SimVar state to true (1) when it is armed or activated, and to false (0) when it is
 * deactivated.
 * 
 * The director requires valid bank and magnetic heading data to arm or activate.
 */
export class APHdgDirector implements PlaneDirector {
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

  private toGaHeading = 0;

  private lastHeadingDiff: number | undefined = undefined;
  private readonly turnReversalThreshold: number;
  private lockedTurnDirection: 'left' | 'right' | undefined = undefined;

  private readonly maxBankAngleFunc: () => number;
  private readonly driveBankFunc: (bank: number) => void;

  private readonly isToGaMode: boolean;

  private readonly bank = this.apValues.dataProvider.getItem('bank');
  private readonly headingMagnetic = this.apValues.dataProvider.getItem('heading_magnetic');
  private readonly isOnGround = this.apValues.dataProvider.getItem('is_on_ground');

  /**
   * Creates a new instance of APHdgDirector.
   * @param bus The event bus to use with this instance.
   * @param apValues Autopilot values from this director's parent autopilot.
   * @param options Options to configure the new director.
   */
  constructor(
    bus: EventBus,
    private readonly apValues: APValues,
    options?: Readonly<APHdgDirectorOptions>
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

    this.turnReversalThreshold = options?.turnReversalThreshold ?? 0;

    this.isToGaMode = options?.isToGaMode ?? false;

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

    if (!this.isToGaMode) {
      SimVar.SetSimVarValue('AUTOPILOT HEADING LOCK', 'Bool', true);
    } else {
      this.toGaHeading = this.headingMagnetic.getValue();
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

    if (!this.isToGaMode) {
      SimVar.SetSimVarValue('AUTOPILOT HEADING LOCK', 'Bool', false);
    }

    this.lastHeadingDiff = undefined;
    this.lockedTurnDirection = undefined;
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

    let bank: number;

    if (this.isToGaMode) {
      if (this.isOnGround.getValue()) {
        this.toGaHeading = this.headingMagnetic.getValue();
      }

      bank = this.desiredBank(this.toGaHeading);
    } else {
      bank = this.desiredBank(this.apValues.selectedHeading.get());
    }

    this.driveBankFunc(bank);
  }

  /**
   * Gets a desired bank from a Target Selected Heading.
   * @param targetHeading The target heading.
   * @returns The desired bank angle.
   */
  private desiredBank(targetHeading: number): number {
    const currentHeading = this.headingMagnetic.getValue();
    const headingDiff = MathUtils.diffAngleDeg(currentHeading, targetHeading);

    let turnDirection: 'left' | 'right' | undefined = undefined;
    let directionalHeadingDiff: number;

    if (this.lockedTurnDirection !== undefined) {
      turnDirection = this.lockedTurnDirection;
      directionalHeadingDiff = turnDirection === 'left' ? (360 - headingDiff) % 360 : headingDiff;

      if (directionalHeadingDiff >= this.turnReversalThreshold) {
        turnDirection = undefined;
      } else if (this.lastHeadingDiff !== undefined) {
        // Check if the heading difference passed through zero in the positive to negative direction since the last
        // update. If so, we may need to issue a turn reversal.
        const headingDiffDelta = (MathUtils.diffAngleDeg(this.lastHeadingDiff, directionalHeadingDiff) + 180) % 360 - 180; // -180 to +180
        if (this.lastHeadingDiff + headingDiffDelta < 0) {
          turnDirection = undefined;
        }
      }
    }

    if (turnDirection === undefined) {
      turnDirection = NavMath.getTurnDirection(currentHeading, targetHeading);
      directionalHeadingDiff = turnDirection === 'left' ? (360 - headingDiff) % 360 : headingDiff;
    }

    if (this.turnReversalThreshold > 180) {
      this.lockedTurnDirection = turnDirection;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.lastHeadingDiff = directionalHeadingDiff!;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    let baseBank = Math.min(1.25 * directionalHeadingDiff!, this.maxBankAngleFunc());
    baseBank *= (turnDirection === 'left' ? 1 : -1);

    return baseBank;
  }
}
