import { RegisteredSimVarUtils, SimVarValueType } from '../data/SimVars';
import { MagVar } from '../geo/MagVar';
import { Accessible } from '../sub/Accessible';
import { CachedValue } from '../sub/CachedValue';
import { MappedValue } from '../sub/MappedValue';
import { Value } from '../sub/Value';
import { TimeUtils } from '../utils/time/TimeUtils';
import { APDataItem, APDataItemKeys, APDataItemTypes, ControllableAPDataProvider } from './APDataProvider';

/**
 * Configuration options for {@link DefaultAPDataProvider}.
 */
export type DefaultAPDataProviderOptions = {
  /**
   * A record of Accessibles that provide the validity state of the data provider's data item values, keyed by data
   * item key. If an explicit validity state is not defined for a data item, then that data item's value will always be
   * considered valid.
   */
  validity?: Partial<Readonly<Record<APDataItemKeys, Accessible<boolean>>>>;
};

/**
 * A default implementation of {@link ControllableAPDataProvider} that sources data from standard SimVars. All data
 * items from `DefaultAPDataProvider` always report the `APDataItemStatus.Normal` status.
 */
export class DefaultAPDataProvider implements ControllableAPDataProvider {
  private readonly items: Map<APDataItemKeys, APDataItem<any>>;

  private readonly cachedValues: CachedValue<any>[];

  /**
   * Creates a new instance of DefaultAPDataProvider.
   * @param options Options with which to configure the data provider.
   */
  public constructor(options?: Readonly<DefaultAPDataProviderOptions>) {
    const validity = options?.validity ?? {};

    const simTime = CachedValue.create(MappedValue.create(
      ([absoluteTime]) => TimeUtils.simAbsoluteTimeToJSTimestamp(absoluteTime),
      RegisteredSimVarUtils.create('E:ABSOLUTE TIME', SimVarValueType.Seconds)
    ));

    const lat = CachedValue.create(RegisteredSimVarUtils.create('PLANE LATITUDE', SimVarValueType.Degree));
    const lon = CachedValue.create(RegisteredSimVarUtils.create('PLANE LONGITUDE', SimVarValueType.Degree));

    const magVar = CachedValue.create(RegisteredSimVarUtils.create('MAGVAR', SimVarValueType.Degree));

    const isOnGround = CachedValue.create(RegisteredSimVarUtils.createBoolean('SIM ON GROUND'));

    const pitch = CachedValue.create(RegisteredSimVarUtils.create('ATTITUDE INDICATOR PITCH DEGREES', SimVarValueType.Degree));
    const actualPitch = CachedValue.create(RegisteredSimVarUtils.create('PLANE PITCH DEGREES', SimVarValueType.Degree));
    const bank = CachedValue.create(RegisteredSimVarUtils.create('ATTITUDE INDICATOR BANK DEGREES', SimVarValueType.Degree));
    const actualBank = CachedValue.create(RegisteredSimVarUtils.create('PLANE BANK DEGREES', SimVarValueType.Degree));

    const headingMagnetic = CachedValue.create(RegisteredSimVarUtils.create('HEADING INDICATOR', SimVarValueType.Degree));
    const actualHeadingMagnetic = CachedValue.create(RegisteredSimVarUtils.create('PLANE HEADING DEGREES MAGNETIC', SimVarValueType.Degree));
    const headingTrue = MappedValue.create(
      ([headingMagneticVal, magVarVal]) => MagVar.magneticToTrue(headingMagneticVal, magVarVal),
      headingMagnetic,
      magVar
    );
    const actualHeadingTrue = CachedValue.create(RegisteredSimVarUtils.create('PLANE HEADING DEGREES TRUE', SimVarValueType.Degree));
    const headingChangeRate = CachedValue.create(RegisteredSimVarUtils.create('DELTA HEADING RATE', SimVarValueType.Degree));

    const aoa = CachedValue.create(RegisteredSimVarUtils.create('INCIDENCE ALPHA', SimVarValueType.Degree));
    const sideslip = CachedValue.create(RegisteredSimVarUtils.create('INCIDENCE BETA', SimVarValueType.Degree));

    const ias = CachedValue.create(RegisteredSimVarUtils.create('AIRSPEED INDICATED', SimVarValueType.Knots));
    const tas = CachedValue.create(RegisteredSimVarUtils.create('AIRSPEED TRUE', SimVarValueType.Knots));
    const mach = CachedValue.create(RegisteredSimVarUtils.create('AIRSPEED MACH', SimVarValueType.Mach));
    const groundSpeed = CachedValue.create(RegisteredSimVarUtils.create('GROUND VELOCITY', SimVarValueType.Knots));

    const indicatedAltitude = CachedValue.create(RegisteredSimVarUtils.create('INDICATED ALTITUDE', SimVarValueType.Feet));
    const positionAltitude = CachedValue.create(RegisteredSimVarUtils.create('PLANE ALTITUDE', SimVarValueType.Feet));
    const radioAltitude = CachedValue.create(RegisteredSimVarUtils.create('RADIO HEIGHT', SimVarValueType.Feet));
    const pressureAltitude = CachedValue.create(RegisteredSimVarUtils.create('PRESSURE ALTITUDE', SimVarValueType.Feet));

    const indicatedVerticalSpeed = CachedValue.create(RegisteredSimVarUtils.create('VERTICAL SPEED', SimVarValueType.FPM));
    const positionVerticalSpeed = CachedValue.create(RegisteredSimVarUtils.create('VELOCITY WORLD Y', SimVarValueType.FPM));

    const velocityWorldX = RegisteredSimVarUtils.create('VELOCITY WORLD X', SimVarValueType.MetersPerSecond);
    const velocityWorldY = RegisteredSimVarUtils.create('VELOCITY WORLD Y', SimVarValueType.MetersPerSecond);
    const velocityWorldZ = RegisteredSimVarUtils.create('VELOCITY WORLD Z', SimVarValueType.MetersPerSecond);

    const accelerationWorldX = RegisteredSimVarUtils.create('ACCELERATION WORLD X', SimVarValueType.MetersPerSecondSquared);
    const accelerationWorldY = RegisteredSimVarUtils.create('ACCELERATION WORLD Y', SimVarValueType.MetersPerSecondSquared);
    const accelerationWorldZ = RegisteredSimVarUtils.create('ACCELERATION WORLD Z', SimVarValueType.MetersPerSecondSquared);

    const groundTrackTrue = CachedValue.create(MappedValue.create(
      ([velocityWorldXVal, velocityWorldZVal, actualHeadingTrueVal]) => {
        if (velocityWorldXVal === 0 && velocityWorldZVal === 0) {
          return actualHeadingTrueVal;
        } else {
          return Math.atan2(velocityWorldXVal, velocityWorldZVal) * Avionics.Utils.RAD2DEG;
        }
      },
      velocityWorldX,
      velocityWorldZ,
      actualHeadingTrue
    ));
    const groundTrackMagnetic = MappedValue.create(
      ([groundTrackTrueVal, magVarVal]) => MagVar.trueToMagnetic(groundTrackTrueVal, magVarVal),
      groundTrackTrue,
      magVar
    );

    const pressure = CachedValue.create(RegisteredSimVarUtils.create('AMBIENT PRESSURE', SimVarValueType.HPA));
    const temperature = CachedValue.create(RegisteredSimVarUtils.create('AMBIENT TEMPERATURE', SimVarValueType.Celsius));

    const velocityBodyX = CachedValue.create(RegisteredSimVarUtils.create('VELOCITY BODY X', SimVarValueType.MetersPerSecond));
    const velocityBodyY = CachedValue.create(RegisteredSimVarUtils.create('VELOCITY BODY Y', SimVarValueType.MetersPerSecond));
    const velocityBodyZ = CachedValue.create(RegisteredSimVarUtils.create('VELOCITY BODY Z', SimVarValueType.MetersPerSecond));

    const accelerationBodyX = CachedValue.create(RegisteredSimVarUtils.create('ACCELERATION BODY X', SimVarValueType.MetersPerSecondSquared));
    const accelerationBodyY = CachedValue.create(RegisteredSimVarUtils.create('ACCELERATION BODY Y', SimVarValueType.MetersPerSecondSquared));
    const accelerationBodyZ = CachedValue.create(RegisteredSimVarUtils.create('ACCELERATION BODY Z', SimVarValueType.MetersPerSecondSquared));

    const pitchRate = CachedValue.create(RegisteredSimVarUtils.create('ROTATION VELOCITY BODY X', SimVarValueType.DegreesPerSecond));
    const yawRate = CachedValue.create(RegisteredSimVarUtils.create('ROTATION VELOCITY BODY Y', SimVarValueType.DegreesPerSecond));
    const bankRate = CachedValue.create(RegisteredSimVarUtils.create('ROTATION VELOCITY BODY Z', SimVarValueType.DegreesPerSecond));

    const pitchAcceleration = CachedValue.create(RegisteredSimVarUtils.create('ROTATION ACCELERATION BODY X', SimVarValueType.DegreesPerSecondSquared));
    const yawAcceleration = CachedValue.create(RegisteredSimVarUtils.create('ROTATION ACCELERATION BODY Y', SimVarValueType.DegreesPerSecondSquared));
    const bankAcceleration = CachedValue.create(RegisteredSimVarUtils.create('ROTATION ACCELERATION BODY Z', SimVarValueType.DegreesPerSecondSquared));

    const loadFactor = CachedValue.create(RegisteredSimVarUtils.create('SEMIBODY LOADFACTOR Y', SimVarValueType.Number));
    const loadFactorRate = CachedValue.create(RegisteredSimVarUtils.create('SEMIBODY LOADFACTOR YDOT', SimVarValueType.PerSecond));

    this.items = new Map<APDataItemKeys, APDataItem<any>>([
      ['sim_time', new DefaultAPDataProviderItem(simTime, validity['sim_time'])],
      ['lat', new DefaultAPDataProviderItem(lat, validity['lat'])],
      ['lon', new DefaultAPDataProviderItem(lon, validity['lon'])],
      ['mag_var', new DefaultAPDataProviderItem(magVar, validity['mag_var'])],
      ['is_on_ground', new DefaultAPDataProviderItem(isOnGround, validity['is_on_ground'])],
      ['pitch', new DefaultAPDataProviderItem(pitch, validity['pitch'], actualPitch)],
      ['bank', new DefaultAPDataProviderItem(bank, validity['bank'], actualBank)],
      ['heading_magnetic', new DefaultAPDataProviderItem(headingMagnetic, validity['heading_magnetic'], actualHeadingMagnetic)],
      ['heading_true', new DefaultAPDataProviderItem(headingTrue, validity['heading_true'], actualHeadingTrue)],
      ['heading_change_rate', new DefaultAPDataProviderItem(headingChangeRate, validity['heading_change_rate'])],
      ['aoa', new DefaultAPDataProviderItem(aoa, validity['aoa'])],
      ['sideslip', new DefaultAPDataProviderItem(sideslip, validity['sideslip'])],
      ['ias', new DefaultAPDataProviderItem(ias, validity['ias'])],
      ['tas', new DefaultAPDataProviderItem(tas, validity['tas'])],
      ['mach', new DefaultAPDataProviderItem(mach, validity['mach'])],
      ['ground_speed', new DefaultAPDataProviderItem(groundSpeed, validity['ground_speed'])],
      ['indicated_altitude', new DefaultAPDataProviderItem(indicatedAltitude, validity['indicated_altitude'])],
      ['position_altitude', new DefaultAPDataProviderItem(positionAltitude, validity['position_altitude'])],
      ['radio_altitude', new DefaultAPDataProviderItem(radioAltitude, validity['radio_altitude'])],
      ['pressure_altitude', new DefaultAPDataProviderItem(pressureAltitude, validity['pressure_altitude'])],
      ['indicated_vertical_speed', new DefaultAPDataProviderItem(indicatedVerticalSpeed, validity['indicated_vertical_speed'])],
      ['position_vertical_speed', new DefaultAPDataProviderItem(positionVerticalSpeed, validity['position_vertical_speed'])],
      ['ground_track_true', new DefaultAPDataProviderItem(groundTrackTrue, validity['ground_track_true'])],
      ['ground_track_magnetic', new DefaultAPDataProviderItem(groundTrackMagnetic, validity['ground_track_magnetic'])],
      ['static_air_pressure', new DefaultAPDataProviderItem(pressure, validity['static_air_pressure'])],
      ['static_air_temperature', new DefaultAPDataProviderItem(temperature, validity['static_air_temperature'])],
      ['inertial_velocity_body_x', new DefaultAPDataProviderItem(velocityBodyX, validity['inertial_velocity_body_x'])],
      ['inertial_velocity_body_y', new DefaultAPDataProviderItem(velocityBodyY, validity['inertial_velocity_body_y'])],
      ['inertial_velocity_body_z', new DefaultAPDataProviderItem(velocityBodyZ, validity['inertial_velocity_body_z'])],
      ['inertial_acceleration_body_x', new DefaultAPDataProviderItem(accelerationBodyX, validity['inertial_acceleration_body_x'])],
      ['inertial_acceleration_body_y', new DefaultAPDataProviderItem(accelerationBodyY, validity['inertial_acceleration_body_y'])],
      ['inertial_acceleration_body_z', new DefaultAPDataProviderItem(accelerationBodyZ, validity['inertial_acceleration_body_z'])],
      ['inertial_velocity_world_x', new DefaultAPDataProviderItem(velocityWorldX, validity['inertial_velocity_world_x'])],
      ['inertial_velocity_world_y', new DefaultAPDataProviderItem(velocityWorldY, validity['inertial_velocity_world_y'])],
      ['inertial_velocity_world_z', new DefaultAPDataProviderItem(velocityWorldZ, validity['inertial_velocity_world_z'])],
      ['inertial_acceleration_world_x', new DefaultAPDataProviderItem(accelerationWorldX, validity['inertial_acceleration_world_x'])],
      ['inertial_acceleration_world_y', new DefaultAPDataProviderItem(accelerationWorldY, validity['inertial_acceleration_world_y'])],
      ['inertial_acceleration_world_z', new DefaultAPDataProviderItem(accelerationWorldZ, validity['inertial_acceleration_world_z'])],
      ['pitch_rate', new DefaultAPDataProviderItem(pitchRate, validity['pitch_rate'])],
      ['yaw_rate', new DefaultAPDataProviderItem(yawRate, validity['yaw_rate'])],
      ['bank_rate', new DefaultAPDataProviderItem(bankRate, validity['bank_rate'])],
      ['pitch_rate', new DefaultAPDataProviderItem(pitchAcceleration, validity['pitch_acceleration'])],
      ['yaw_rate', new DefaultAPDataProviderItem(yawAcceleration, validity['yaw_acceleration'])],
      ['bank_rate', new DefaultAPDataProviderItem(bankAcceleration, validity['bank_acceleration'])],
      ['load_factor', new DefaultAPDataProviderItem(loadFactor, validity['load_factor'])],
      ['load_factor_rate', new DefaultAPDataProviderItem(loadFactorRate, validity['load_factor_rate'])],
    ]);

    this.cachedValues = [
      simTime,
      lat,
      lon,
      magVar,
      isOnGround,
      pitch,
      actualPitch,
      bank,
      actualBank,
      headingMagnetic,
      actualHeadingMagnetic,
      actualHeadingTrue,
      headingChangeRate,
      aoa,
      sideslip,
      ias,
      tas,
      mach,
      groundSpeed,
      indicatedAltitude,
      positionAltitude,
      radioAltitude,
      pressureAltitude,
      indicatedVerticalSpeed,
      positionVerticalSpeed,
      groundTrackTrue,
      pressure,
      temperature,
      accelerationBodyX,
      accelerationBodyY,
      accelerationBodyZ,
      pitchRate,
      yawRate,
      bankRate,
      loadFactor,
      loadFactorRate,
    ];
  }

  /** @inheritDoc */
  public getItem<K extends APDataItemKeys>(key: K): APDataItem<APDataItemTypes[K]> {
    return this.items.get(key) as APDataItem<APDataItemTypes[K]>;
  }

  /** @inheritDoc */
  public onBeforeUpdate(): void {
    const len = this.cachedValues.length;
    for (let i = 0; i < len; i++) {
      this.cachedValues[i].invalidate();
    }
  }

  /** @inheritDoc */
  public onAfterUpdate(): void {
    // noop
  }
}

/**
 * A data item provided by {@link DefaultAPDataProvider}.
 * @template T The type of the item's value.
 */
class DefaultAPDataProviderItem<T> implements APDataItem<T> {
  private static readonly DEFAULT_VALIDITY = Value.create(true);

  /**
   * Creates a new instance of DefaultAPDataProviderItem.
   * @param value An Accessible that provides the item's value.
   * @param validity An Accessible that provides whether the item's value is valid. If not defined, then the item's
   * value will always be considered valid.
   * @param actualValue An Accessible that provides the item's actual value. If not defined, then the item's value will
   * be used for its actual value.
   */
  public constructor(
    private readonly value: Accessible<T>,
    private readonly validity: Accessible<boolean> = DefaultAPDataProviderItem.DEFAULT_VALIDITY,
    private readonly actualValue = value
  ) {
  }

  /** @inheritDoc */
  public getValue(): T {
    return this.value.get();
  }

  /** @inheritDoc */
  public isValueValid(): boolean {
    return this.validity.get();
  }

  /** @inheritDoc */
  public getActualValue(): T {
    return this.actualValue.get();
  }
}
