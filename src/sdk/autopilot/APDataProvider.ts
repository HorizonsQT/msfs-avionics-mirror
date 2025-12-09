/**
 * A data item for an autopilot.
 * @template T The type of the item's value.
 */
export interface APDataItem<T> {
  /**
   * Gets the value of this item.
   * @returns The value of this item.
   */
  getValue(): T;

  /**
   * Checks whether this item's value is valid.
   * 
   * **Note:** The validity status does not apply to the item's _actual_ value.
   * @returns Whether this item's value is valid.
   */
  isValueValid(): boolean;

  /**
   * Gets the actual value of this item. The actual value is the value that would be assigned to the item by an
   * omniscient and infallible observer.
   * @returns The actual value of this item.
   */
  getActualValue(): T;
}

/**
 * A record of all valid keys for autopilot data items and their associated value types.
 */
export interface APDataItemTypes {
  /** The current time in the simulation, as a Javascript timestamp. */
  sim_time: number;

  /** The airplane's latitude, in degrees. */
  lat: number;

  /** The airplane's longitude, in degrees. */
  lon: number;

  /**
   * The magnetic variation at the airplane's position, in degrees. Positive values indicate eastward deviation of
   * magnetic north relative to true north. Negative values indicate westward deviation.
   */
  mag_var: number;

  /** Whether the airplane is on the ground. */
  is_on_ground: boolean;

  /** The airplane's pitch, in degrees. Positive values indicate downward pitch. Negative values indicate upward pitch. */
  pitch: number;

  /** The airplane's bank, in degrees. Positive values indicate leftward bank. Negative values indicate rightward bank. */
  bank: number;

  /** The airplane's true heading, in degrees. */
  heading_true: number;

  /** The airplane's magnetic heading, in degrees. */
  heading_magnetic: number;

  /** The rate of range of the airplane's heading, in degrees per second. */
  heading_change_rate: number;

  /** The airplane's angle of attack, in degrees. */
  aoa: number;

  /** The airplane's sideslip angle, in degrees. */
  sideslip: number;

  /** The airplane's indicated airspeed, in knots. */
  ias: number;

  /** The airplane's true airspeed, in knots. */
  tas: number;

  /** The airplane's mach number. */
  mach: number;

  /** The airplane's ground speed, in knots. */
  ground_speed: number;

  /** The airplane's indicated altitude, in feet. */
  indicated_altitude: number;

  /** The airplane's positional altitude, in feet. Positional altitude is derived from geo-position data (GPS, IRS, etc). */
  position_altitude: number;

  /** The airplane's radio altitude, in feet. */
  radio_altitude: number;

  /** The airplane's pressure altitude, in feet. */
  pressure_altitude: number;

  /** The airplane's indicated vertical speed, in feet per minute. */
  indicated_vertical_speed: number;

  /**
   * The airplane's positional vertical speed, in feet per minute. Positional vertical speed is derived from
   * geo-position data (GPS, IRS, etc).
   */
  position_vertical_speed: number;

  /** The airplane's true ground track, in degrees. */
  ground_track_true: number;

  /** The airplane's magnetic ground track, in degrees. */
  ground_track_magnetic: number;

  /** The outside static air pressure, in hectopascals. */
  static_air_pressure: number;

  /** The outside static air temperature, in degrees Celsius. */
  static_air_temperature: number;

  /**
   * The airplane's linear velocity derived from inertial sources (e.g. AHRS, IRS), in meters per second, along the
   * airplane's lateral (left-right) axis. Positive values indicate movement toward the right of the airplane.
   */
  inertial_velocity_body_x: number;

  /**
   * The airplane's linear velocity derived from inertial sources (e.g. AHRS, IRS), in meters per second, along the
   * airplane's vertical (bottom-top) axis. Positive values indicate movement toward the top of the airplane.
   */
  inertial_velocity_body_y: number;

  /**
   * The airplane's linear velocity derived from inertial sources (e.g. AHRS, IRS), in meters per second, along the
   * airplane's longitudinal (rear-front) axis. Positive values indicate movement toward the front of the airplane.
   */
  inertial_velocity_body_z: number;

  /**
   * The airplane's linear acceleration derived from inertial sources (e.g. AHRS, IRS), in meters per second per
   * second, along the airplane's lateral (left-right) axis. Positive values indicate acceleration toward the right of
   * the airplane.
   */
  inertial_acceleration_body_x: number;

  /**
   * The airplane's linear acceleration derived from inertial sources (e.g. AHRS, IRS), in meters per second per
   * second, along the airplane's vertical (bottom-top) axis. Positive values indicate acceleration toward the top of
   * the airplane.
   */
  inertial_acceleration_body_y: number;

  /**
   * The airplane's linear acceleration derived from inertial sources (e.g. AHRS, IRS), in meters per second per
   * second, along the airplane's longitudinal (rear-front) axis. Positive values indicate acceleration toward the
   * front of the airplane.
   */
  inertial_acceleration_body_z: number;

  /**
   * The airplane's linear velocity derived from inertial sources (e.g. AHRS, IRS), in meters per second, along the
   * world's west-east axis. The west-east axis is defined as the axis that is parallel to the longitudinal axis of the
   * airplane when the airplane's pitch angle is equal to zero and the airplane's true heading is 90 degrees. Positive
   * values indicate movement toward the east.
   */
  inertial_velocity_world_x: number;

  /**
   * The airplane's linear velocity derived from inertial sources (e.g. AHRS, IRS), in meters per second, along the
   * world's vertical axis. The world's vertical axis is defined as the axis that is parallel to the airplane's
   * vertical (bottom-top) axis when the airplane's pitch and bank angles are equal to zero. Positive values indicate
   * movement upward.
   */
  inertial_velocity_world_y: number;

  /**
   * The airplane's linear velocity derived from inertial sources (e.g. AHRS, IRS), in meters per second, along the
   * world's south-north axis. The south-north axis is defined as the axis that is parallel to the longitudinal axis of
   * the airplane when the airplane's pitch angle is equal to zero and the airplane's true heading is 0 degrees.
   * Positive values indicate movement toward the north.
   */
  inertial_velocity_world_z: number;

  /**
   * The airplane's linear acceleration derived from inertial sources (e.g. AHRS, IRS), in meters per second per
   * second, along the world's west-east axis. The west-east axis is defined as the axis that is parallel to the
   * longitudinal axis of the airplane when the airplane's pitch angle is equal to zero and the airplane's true heading
   * is 90 degrees. Positive values indicate movement toward the east.
   */
  inertial_acceleration_world_x: number;

  /**
   * The airplane's linear acceleration derived from inertial sources (e.g. AHRS, IRS), in meters per second per
   * second, along the world's vertical axis. The world's vertical axis is defined as the axis that is parallel to the
   * airplane's vertical (bottom-top) axis when the airplane's pitch and bank angles are equal to zero. Positive values
   * indicate movement upward.
   */
  inertial_acceleration_world_y: number;

  /**
   * The airplane's linear acceleration derived from inertial sources (e.g. AHRS, IRS), in meters per second per
   * second, along the world's south-north axis. The south-north axis is defined as the axis that is parallel to the
   * longitudinal axis of the airplane when the airplane's pitch angle is equal to zero and the airplane's true heading
   * is 0 degrees. Positive values indicate movement toward the north.
   */
  inertial_acceleration_world_z: number;

  /**
   * The airplane's rotational velocity, in degrees per second, about its lateral (left-right) axis (i.e. the rate of
   * change of its pitch angle). Positive values indicate the airplane is pitching down.
   */
  pitch_rate: number;

  /**
   * The airplane's rotational velocity, in degrees per second, about its vertical (bottom-top) axis (i.e. the rate of
   * change of its yaw angle). Positive values indicate the airplane is yawing to the right.
   */
  yaw_rate: number;

  /**
   * The airplane's rotational velocity, in degrees per second, about its longitudinal (rear-front) axis (i.e. the rate
   * of change of its roll/bank angle). Positive values indicate the airplane is rolling to the left.
   */
  bank_rate: number;

  /**
   * The airplane's rotational acceleration, in degrees per second per second, about its lateral (left-right) axis
   * (i.e. the acceleration of its pitch angle). Positive values indicate the acceleration is in the pitch-down
   * direction.
   */
  pitch_acceleration: number;

  /**
   * The airplane's rotational acceleration, in degrees per second per second, about its vertical (bottom-top) axis
   * (i.e. the acceleration of its yaw angle). Positive values indicate the acceleration is in the yaw-right direction.
   */
  yaw_acceleration: number;

  /**
   * The airplane's rotational acceleration, in degrees per second per second, about its longitudinal (rear-front) axis
   * (i.e. the acceleration of its roll/bank angle). Positive values indicate the acceleration is in the bank-left
   * direction.
   */
  bank_acceleration: number;

  /** The airplane's load factor. */
  load_factor: number;

  /** The rate of change of the airplane's load factor per second. */
  load_factor_rate: number;
}

/**
 * All valid keys for autopilot data items.
 */
export type APDataItemKeys = keyof APDataItemTypes;

/**
 * A provider of data for an autopilot.
 */
export interface APDataProvider {
  /**
   * Gets a data item from this provider.
   * @param key The key of the data item to get.
   * @returns The data item with the specified key.
   */
  getItem<K extends APDataItemKeys>(key: K): APDataItem<APDataItemTypes[K]>;
}

/**
 * A provider of data for an autopilot that can be controlled by an autopilot instance.
 */
export interface ControllableAPDataProvider extends APDataProvider {
  /**
   * A method that is called on every autopilot update cycle before the autopilot directors are updated.
   */
  onBeforeUpdate(): void;

  /**
   * A method that is called on every autopilot update cycle after the autopilot directors are updated.
   */
  onAfterUpdate(): void;
}
