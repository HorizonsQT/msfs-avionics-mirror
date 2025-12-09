import { EventBus, Publisher } from '../data/EventBus';
import { RegisteredSimVarUtils, SimVarValueType } from '../data/SimVars';
import { ExpSmoother } from '../math/ExpSmoother';
import { MathUtils } from '../math/MathUtils';
import { UnitType } from '../math/NumberUnit';
import { Subscribable } from '../sub/Subscribable';
import { APDataItem } from './APDataProvider';
import { APValues } from './APValues';
import { FlightDirectorEvents } from './data/FlightDirectorEvents';
import { VNavUtils } from './vnav/VNavUtils';

/**
 * An output to which an {@link AutopilotDriver} sends pitch and bank reference commands.
 */
export interface AutopilotDriverOutput {
  /**
   * Sets the commanded bank angle, in degrees.
   * @param bank The commanded bank angle to set, in degrees. Positive values indicate left bank.
   */
  setBank(bank: number): void;

  /**
   * Drives the commanded bank angle toward a desired value.
   * @param bank The desired bank angle, in degrees. Positive values indicate left bank.
   * @param rate The rate at which to drive the commanded bank angle, in degrees per second.
   */
  driveBank(bank: number, rate: number): void;

  /**
   * Sets the commanded pitch angle, in degrees.
   * @param pitch The commanded pitch angle to set, in degrees. Positive values indicate downward pitch.
   */
  setPitch(pitch: number): void;

  /**
   * Drives the commanded pitch angle toward a desired value.
   * @param pitch The desired pitch angle, in degrees. Positive values indicate downward pitch.
   * @param rate The rate at which to drive the commanded pitch angle, in degrees per second.
   */
  drivePitch(pitch: number, rate: number): void;

  /**
   * A method that is called every time this output's parent autopilot is updated.
   */
  onUpdate(): void;
}

/**
 * Configuration options for {@link AutopilotDriver}.
 */
export type AutopilotDriverOptions = {
  /** The default rate used to drive changes in commanded pitch, in degrees per second. Defaults to `5`. */
  pitchServoRate?: number;

  /** The default rate used to drive changes in commanded bank, in degrees per second. Defaults to `10`. */
  bankServoRate?: number;

  /**
   * A function that creates an output to which the autopilot driver will send pitch and bank reference commands.
   * @param apValues Autopilot values from the driver's parent autopilot.
   * @returns An output to which the autopilot driver will send pitch and bank reference commands.
   */
  createOutput?: (apValues: APValues) => AutopilotDriverOutput;

  // NOTE: the following options apply to the default autopilot driver output implementation that is only used when
  // createOutput is not defined.

  /**
   * Whether to publish the pitch and bank reference values set by the driver to the event bus using the
   * `fd_target_pitch` and `fd_target_bank` topics defined by {@link FlightDirectorEvents}. Ignored if `createOutput`
   * is defined. Defaults to `false`.
   */
  setInternalFlightDirector?: boolean;

  /**
   * The radio altitude below which all commanded bank angles are forced to zero degrees. If not defined, then
   * commanded bank angles will not be forced to zero degrees based on radio altitude. Only applicable if
   * `createOutput` is not defined.
   */
  zeroRollHeight?: number;

  /**
   * Whether to provide turn auto-coordination while the autopilot is engaged. Only applicable if `createOutput` is not
   * defined. Auto-coordination works by commanding a rudder deflection in the same direction as the commanded bank
   * angle (e.g. a commanded left bank will result in a commanded left rudder). The commanded rudder deflection is
   * proportional to the commanded bank angle.
   */
  autoCoordinationEnabled?: boolean;

  /**
   * The airplane's maximum rudder deflection, in degrees. Only applicable if `createOutput` is not defined. Ignored if
   * `autoCoordinationEnabled` is false. Defaults to `25`.
   */
  maxRudderDeflection?: number;

  /**
   * The factor to multiply with the commanded bank angle to calculate the rudder deflection commanded by rudder
   * auto-coordination. Only applicable if `createOutput` is not defined. Ignored if `autoCoordinationEnabled` is
   * false. Defaults to `0.3`.
   */
  rudderBankFactor?: number;

  /**
   * The rate used to drive the rudder auto-coordination servo, in degrees per second. Only applicable if
   * `createOutput` is not defined. Ignored if `autoCoordinationEnabled` is false. Defaults to `1`.
   */
  rudderServoRate?: number;
};

/**
 * Processes pitch and bank commands for an autopilot.
 */
export class AutopilotDriver {
  private static readonly DEFAULT_PITCH_SERVO_RATE = 5; // degrees per second
  private static readonly DEFAULT_BANK_SERVO_RATE = 10; // degrees per second

  private static readonly VERTICAL_WIND_SMOOTHING_TAU = 500 / Math.LN2;

  private readonly output: AutopilotDriverOutput;

  private readonly pitchServoRate: number;
  private readonly bankServoRate: number;

  private readonly verticalWind = RegisteredSimVarUtils.create('AMBIENT WIND Y', SimVarValueType.FPM);
  private readonly tas = this.apValues.dataProvider.getItem('tas');
  private readonly aoa = this.apValues.dataProvider.getItem('aoa');

  private readonly verticalWindSmoother = new ExpSmoother(AutopilotDriver.VERTICAL_WIND_SMOOTHING_TAU);
  private verticalWindAverageValue = 0;
  private lastVerticalWindTime?: number;

  /**
   * Creates an instance of this Autopilot Driver.
   * @param bus An instance of the Event Bus.
   * @param apValues Autopilot values from this driver's parent autopilot.
   * @param apMasterOn Whether the AP is engaged.
   * @param options Options for this driver.
   */
  public constructor(
    bus: EventBus,
    private readonly apValues: APValues,
    apMasterOn: Subscribable<boolean>,
    options?: Readonly<AutopilotDriverOptions>
  ) {
    this.output = options?.createOutput?.(apValues) ?? new DefaultOutput(bus, apValues, options);

    this.pitchServoRate = options?.pitchServoRate ?? AutopilotDriver.DEFAULT_PITCH_SERVO_RATE;
    this.bankServoRate = options?.bankServoRate ?? AutopilotDriver.DEFAULT_BANK_SERVO_RATE;
  }

  /**
   * Updates this driver.
   */
  public update(): void {
    const verticalWind = this.verticalWind.get();
    const time = this.apValues.activeSimDuration.get();

    if (this.lastVerticalWindTime === undefined) {
      this.verticalWindAverageValue = this.verticalWindSmoother.reset(verticalWind);
    } else {
      this.verticalWindAverageValue = this.verticalWindSmoother.next(verticalWind, Math.max(time - this.lastVerticalWindTime, 0));
    }

    this.lastVerticalWindTime = time;

    this.output.onUpdate();
  }

  /**
   * Drives the commanded bank angle toward a desired value.
   * @param bank The desired bank angle, in degrees. Positive values indicate left bank.
   * @param rate The rate at which to drive the commanded bank angle, in degrees per second. Defaults to this driver's
   * default bank servo rate.
   */
  public driveBank(bank: number, rate = this.bankServoRate): void {
    if (isFinite(bank)) {
      this.output.driveBank(bank, rate);
    } else {
      console.warn('AutopilotDriver: Non-finite bank angle was attempted to be set.');
    }
  }

  /**
   * Sets the commanded bank angle, in degrees.
   * @param bank The commanded bank angle to set, in degrees. Positive values indicate left bank.
   * @param resetServo This parameter is deprecated and has no effect.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public setBank(bank: number, resetServo = true): void {
    if (isFinite(bank)) {
      this.output.setBank(bank);
    } else {
      console.warn('AutopilotDriver: Non-finite bank angle was attempted to be set.');
    }
  }

  /**
   * Drives the commanded pitch angle toward a desired value while optionally correcting for angle of attack and
   * vertical wind.
   * @param pitch The desired pitch angle, in degrees. Positive values indicate downward pitch.
   * @param adjustForAoa Whether to adjust the commanded pitch angle for angle of attack. If `true`, the provided pitch
   * angle is treated as a desired flight path angle and a new commanded pitch angle will be calculated to produce the
   * desired FPA given the airplane's current angle of attack. This correction can be used in conjunction with the
   * vertical wind correction. Defaults to `false`.
   * @param adjustForVerticalWind Whether to adjust the commanded pitch angle for vertical wind velocity. If `true`,
   * the provided pitch angle is treated as a desired flight path angle and a new commanded pitch angle will be
   * calculated to produce the desired FPA given the current vertical wind component. This correction can be used in
   * conjunction with the angle of attack correction. Defaults to `false`.
   * @param rate The rate at which to drive the commanded pitch angle, in degrees per second. Defaults to this driver's
   * default pitch servo rate.
   * @param maxNoseDownPitch The maximum nose-down pitch angle, in degrees. Defaults to the global autopilot nose-down
   * pitch limit.
   * @param maxNoseUpPitch The maximum nose-up pitch angle, in degrees. Defaults to the global autopilot nose-up pitch
   * limit.
   */
  public drivePitch(
    pitch: number,
    adjustForAoa = false,
    adjustForVerticalWind = false,
    rate = this.pitchServoRate,
    maxNoseDownPitch = this.apValues.maxNoseDownPitchAngle.get(),
    maxNoseUpPitch = this.apValues.maxNoseUpPitchAngle.get()
  ): void {
    pitch = this.getAdjustedPitch(pitch, adjustForAoa, adjustForVerticalWind);
    if (isFinite(pitch)) {
      this.output.drivePitch(MathUtils.clamp(pitch, -maxNoseUpPitch, maxNoseDownPitch), rate);
    } else {
      console.warn('AutopilotDriver: Non-finite pitch angle was attempted to be set.');
    }
  }

  /**
   * Sets the commanded pitch angle, in degrees.
   * @param pitch The commanded pitch angle to set, in degrees. Positive values indicate downward pitch.
   * @param resetServo This parameter is deprecated and has no effect.
   * @param maxNoseDownPitch The maximum nose-down pitch angle, in degrees. Defaults to the global autopilot nose-down
   * pitch limit.
   * @param maxNoseUpPitch The maximum nose-up pitch angle, in degrees. Defaults to the global autopilot nose-up pitch
   * limit.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public setPitch(pitch: number, resetServo = true, maxNoseDownPitch = this.apValues.maxNoseDownPitchAngle.get(), maxNoseUpPitch = this.apValues.maxNoseUpPitchAngle.get()): void {
    if (isFinite(pitch)) {
      this.output.setPitch(MathUtils.clamp(pitch, -maxNoseUpPitch, maxNoseDownPitch));
    } else {
      console.warn('AutopilotDriver: Non-finite pitch angle was attempted to be set.');
    }
  }

  /**
   * Adjusts a pitch angle optionally for angle of attack and vertical wind.
   * @param pitch The desired pitch angle, in degrees. Positive values indicate downward pitch.
   * @param adjustForAoa Whether to adjust the commanded pitch angle for angle of attack. If `true`, the provided pitch
   * angle is treated as a desired flight path angle and a new commanded pitch angle will be calculated to produce the
   * desired FPA given the airplane's current angle of attack. This correction can be used in conjunction with the
   * vertical wind correction. Defaults to `false`.
   * @param adjustForVerticalWind Whether to adjust the commanded pitch angle for vertical wind velocity. If `true`,
   * the provided pitch angle is treated as a desired flight path angle and a new commanded pitch angle will be
   * calculated to produce the desired FPA given the current vertical wind component. This correction can be used in
   * conjunction with the angle of attack correction. Defaults to `false`.
   * @returns The adjusted pitch angle, in degrees.
   */
  public getAdjustedPitch(pitch: number, adjustForAoa = false, adjustForVerticalWind = false): number {
    if (!isFinite(pitch)) {
      return pitch;
    }

    //pitch = -5 we want a 5 degree FPA up
    if (adjustForVerticalWind) {
      // with an updraft, we get a down correction value
      // if pitch were normal (+ === up), we would add the correction 5 + (-1) = 4 (pitch adjusted down because of updraft)
      // since pitch is actually inverse (- === up), we want to subtract the correction value -5 - (-1) = -4
      pitch -= this.getVerticalWindCorrection();
    }
    if (adjustForAoa) {
      // if we want to fly an FPA of +5 degrees, we need to add our AOA to our FPA for the desired pitch.
      // if our AOA is 1 degree, we want to set our pitch to 5 + 1 = 6 degrees to achieve a 5 degree FPA.
      // since pitch is inverse and AOA is not, we want to subtract the aoa value -5 - (+1) = -6 (6 degree up pitch)
      // if we are wanting to fly an FPA of -3 degrees, and our AOA is +1 degree, we would set +3 - (+1) = 2 (2 degree down pitch)
      pitch -= this.aoa.getActualValue();
    }
    return pitch;
  }

  /**
   * Gets the vertical wind correction in degrees.
   * @returns The vertical wind correction in degrees.
   */
  private getVerticalWindCorrection(): number {
    // Wind correction FPA will be the FPA required to negate the vertical wind (so negative verticalWindAverageValue)
    return VNavUtils.getFpa(UnitType.KNOT.convertTo(this.tas.getActualValue(), UnitType.FPM), -this.verticalWindAverageValue);
  }
}

/**
 * Configuration options for {@link DefaultOutput}.
 */
type DefaultOutputOptions = {
  /**
   * Whether to publish the pitch and bank reference values set by the driver to the event bus using the
   * `fd_target_pitch` and `fd_target_bank` topics defined by {@link FlightDirectorEvents}. Defaults to `false`.
   */
  setInternalFlightDirector?: boolean;

  /**
   * The radio altitude below which all commanded bank angles are forced to zero degrees. If not defined, then
   * commanded bank angles will not be forced to zero degrees based on radio altitude.
   */
  zeroRollHeight?: number;

  /**
   * Whether to provide turn auto-coordination while the autopilot is engaged. Auto-coordination works by commanding a
   * rudder deflection in the same direction as the commanded bank angle (e.g. a commanded left bank will result in a
   * commanded left rudder). The commanded rudder deflection is proportional to the commanded bank angle.
   */
  autoCoordinationEnabled?: boolean;

  /**
   * The airplane's maximum rudder deflection, in degrees. Ignored if `autoCoordinationEnabled` is false. Defaults to
   * `25`.
   */
  maxRudderDeflection?: number;

  /**
   * The factor to multiply with the commanded bank angle to calculate the rudder deflection commanded by rudder
   * auto-coordination. Ignored if `autoCoordinationEnabled` is false. Defaults to `0.3`.
   */
  rudderBankFactor?: number;

  /**
   * The rate used to drive the rudder auto-coordination servo, in degrees per second.  Ignored if
   * `autoCoordinationEnabled` is false. Defaults to `1`.
   */
  rudderServoRate?: number;
};

/**
 * A default implementation of {@link AutopilotDriverOutput} that writes commanded bank and pitch reference values to
 * the `AUTOPILOT BANK HOLD REF` and `AUTOPILOT PITCH HOLD REF` SimVars. Also optionally publishes the reference values
 * to the event bus using the `fd_target_bank` and `fd_target_pitch` topics defined by {@link FlightDirectorEvents}.
 * Also supports automatic turn coordination using the rudder while the autopilot is engaged.
 */
class DefaultOutput implements AutopilotDriverOutput {
  private static readonly DEFAULT_RUDDER_BANK_FACTOR = 0.3;
  private static readonly DEFAULT_MAX_RUDDER_DEFLECTION = 25; // degrees
  private static readonly DEFAULT_RUDDER_SERVO_RATE = 1; // degrees per second

  private readonly bankRefSimVar = RegisteredSimVarUtils.create('AUTOPILOT BANK HOLD REF', SimVarValueType.Degree);
  private currentBankRef = this.bankRefSimVar.get();
  private lastBankSetTime?: number;

  private readonly pitchRefSimVar = RegisteredSimVarUtils.create('AUTOPILOT PITCH HOLD REF', SimVarValueType.Degree);
  private currentPitchRef = this.pitchRefSimVar.get();
  private lastPitchSetTime?: number;

  private readonly isOnGround: APDataItem<boolean>;
  private readonly radioAltitude: APDataItem<number>;

  private readonly activeSimDuration: Subscribable<number>;
  private readonly apMasterOn: Subscribable<boolean>;

  private readonly fdPublisher?: Publisher<FlightDirectorEvents>;

  private readonly zeroRollHeight?: number;

  private readonly isAutoCoordinationEnabled: boolean;
  private readonly setRudderAxisSimVar = RegisteredSimVarUtils.create('K:AXIS_RUDDER_SET', SimVarValueType.Number);
  private readonly rudderBankFactor: number = DefaultOutput.DEFAULT_RUDDER_BANK_FACTOR;
  private readonly maxRudderDeflection: number = DefaultOutput.DEFAULT_MAX_RUDDER_DEFLECTION;
  private readonly rudderServoRate: number = 0;
  private isAutoCoordinationActive = false;
  private rudderSet = 0;

  private lastUpdateTime?: number;
  private lastDt = 0;

  /**
   * Creates a new instance of DefaultOutput.
   * @param bus The event bus.
   * @param apValues Autopilot values from the output's parent autopilot.
   * @param options Options with which to configure the output.
   */
  public constructor(bus: EventBus, apValues: APValues, options?: Readonly<DefaultOutputOptions>) {
    this.isOnGround = apValues.dataProvider.getItem('is_on_ground');
    this.radioAltitude = apValues.dataProvider.getItem('radio_altitude');

    this.activeSimDuration = apValues.activeSimDuration;
    this.apMasterOn = apValues.apMasterOn;

    if (options?.setInternalFlightDirector) {
      this.fdPublisher = bus.getPublisher<FlightDirectorEvents>();
    }

    this.zeroRollHeight = options?.zeroRollHeight;

    if (options?.autoCoordinationEnabled) {
      this.isAutoCoordinationEnabled = true;

      if (options.rudderBankFactor !== undefined) {
        this.rudderBankFactor = options.rudderBankFactor;
      }

      if (options.maxRudderDeflection !== undefined) {
        this.maxRudderDeflection = options.maxRudderDeflection;
      }

      this.rudderServoRate = (options?.rudderServoRate ?? DefaultOutput.DEFAULT_RUDDER_SERVO_RATE) / this.maxRudderDeflection * 16384;

      this.apMasterOn.sub(this.onApMasterOnChanged.bind(this));
    } else {
      this.isAutoCoordinationEnabled = false;
    }
  }

  /**
   * Responds to when the autopilot master ON/OFF state changes.
   * @param isApMasterOn Whether the autopilot master ON/OFF state is ON.
   */
  private onApMasterOnChanged(isApMasterOn: boolean): void {
    if (!isApMasterOn) {
      this.deactivateAutoCoordination();
    }
  }

  /** @inheritDoc */
  public setBank(bank: number): void {
    if (this.zeroRollHeight !== undefined) {
      if (this.radioAltitude.isValueValid() && this.radioAltitude.getValue() < this.zeroRollHeight) {
        bank = 0;
      }
    }

    this.currentBankRef = bank;
    this.bankRefSimVar.set(bank);
    this.fdPublisher?.pub('fd_target_bank', this.currentBankRef, true, true);

    this.lastBankSetTime = this.activeSimDuration.get();
  }

  /** @inheritDoc */
  public driveBank(bank: number, rate: number): void {
    let dt: number;
    if (this.lastBankSetTime === undefined) {
      dt = this.lastDt;
    } else {
      dt = Math.min(this.activeSimDuration.get() - this.lastBankSetTime, this.lastDt);
    }

    this.setBank(MathUtils.driveLinear(this.currentBankRef, bank, rate, dt / 1000));
  }

  /** @inheritDoc */
  public setPitch(pitch: number): void {
    this.currentPitchRef = pitch;
    this.pitchRefSimVar.set(pitch);
    this.fdPublisher?.pub('fd_target_pitch', this.currentPitchRef, true, true);

    this.lastPitchSetTime = this.activeSimDuration.get();
  }

  /** @inheritDoc */
  public drivePitch(pitch: number, rate: number): void {
    let dt: number;
    if (this.lastPitchSetTime === undefined) {
      dt = this.lastDt;
    } else {
      dt = Math.min(this.activeSimDuration.get() - this.lastPitchSetTime, this.lastDt);
    }

    this.setPitch(MathUtils.driveLinear(this.currentPitchRef, pitch, rate, dt / 1000));
  }

  /** @inheritDoc */
  public onUpdate(): void {
    const time = this.activeSimDuration.get();
    const dt = this.lastUpdateTime === undefined ? 0 : Math.max(time - this.lastUpdateTime, 0);

    if (this.isAutoCoordinationEnabled && this.apMasterOn.get()) {
      this.updateAutoCoordination(dt);
    }

    this.lastUpdateTime = time;
    this.lastDt = dt;
  }

  /**
   * Updates turn auto-coordination.
   * @param dt The elapsed time since the last update, in milliseconds.
   */
  private updateAutoCoordination(dt: number): void {
    const isOnGround = this.isOnGround.isValueValid() && this.isOnGround.getValue();

    if (isOnGround) {
      if (this.isAutoCoordinationActive) {
        this.deactivateAutoCoordination();
      }
    } else {
      this.isAutoCoordinationActive = true;

      this.rudderSet = MathUtils.driveLinear(
        this.rudderSet,
        (this.rudderBankFactor * this.currentBankRef / this.maxRudderDeflection) * 16384,
        this.rudderServoRate,
        dt / 1000
      );
      this.setRudderAxisSimVar.set(this.rudderSet);
    }
  }

  /**
   * Deactivates turn auto-coordination. This will set the rudder to the neutral position.
   */
  private deactivateAutoCoordination(): void {
    this.rudderSet = 0;
    this.setRudderAxisSimVar.set(0);
    this.isAutoCoordinationActive = false;
  }
}
