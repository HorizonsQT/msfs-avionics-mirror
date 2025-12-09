import { EventBus, IndexedEventType } from '../data/EventBus';
import { SharedGlobal, SharedGlobalObjectRef } from '../data/SharedGlobal';
import { RegisteredSimVarUtils, SimVarValueType } from '../data/SimVars';
import { LatLonInterface } from '../geo/GeoInterfaces';
import { GeoPoint, GeoPointReadOnly } from '../geo/GeoPoint';
import { MathUtils } from '../math/MathUtils';
import { UnitType } from '../math/NumberUnit';
import { ReadonlyFloat64Array, Vec2Math, Vec3Math, VecNMath } from '../math/VecMath';
import { Vec2Subject, Vec3Subject, VecNSubject } from '../math/VectorSubject';
import { MappedValue } from '../sub/MappedValue';
import { SetSubject } from '../sub/SetSubject';
import { Subject } from '../sub/Subject';
import { Subscribable } from '../sub/Subscribable';
import { SubscribableSet } from '../sub/SubscribableSet';
import { SubscribableUtils } from '../sub/SubscribableUtils';
import { Subscription } from '../sub/Subscription';
import { ArrayUtils } from '../utils/datastructures/ArrayUtils';
import { TimeUtils } from '../utils/time/TimeUtils';
import { Wait } from '../utils/time/Wait';
import { Instrument } from './Backplane';

/**
 * SBAS group names.
 */
export enum SBASGroupName {
  /** Wide Area Augmentation System (USA). */
  WAAS = 'WAAS',

  /** European Geostationary Navigation Overlay Service (EU). */
  EGNOS = 'EGNOS',

  /** GPS Aided Geo Augmented Navigation System (India). */
  GAGAN = 'GAGAN',

  /** Multi-functional Satellite Augmentation System (Japan). */
  MSAS = 'MSAS'
}

/**
 * A definition of a SBAS geostationary satellite.
 */
interface SBASSatelliteDefinition {
  /** The PRN of the satellite. */
  prn: number;

  /** The satellite longitude. */
  lon: number;
}

/**
 * A definition of a SBAS differential corrections area group.
 */
interface SBASGroupDefinition {
  /** The SBAS satellite group that this definition is for. */
  group: string;

  /** The SBAS differential coverage area for the SBAS group. */
  coverage: ReadonlyFloat64Array[];

  /** The constellation of satellites in this SBAS group. */
  constellation: SBASSatelliteDefinition[];
}

/**
 * Possible state on GPS satellites.
 */
export enum GPSSatelliteState {
  /** There is no current valid state. */
  None,

  /** The satellite is out of view and cannot be reached. */
  Unreachable,

  /** The satellite has been found and data is being downloaded. */
  Acquired,

  /** The satellite is faulty. */
  Faulty,

  /** The satellite has been found, data is downloaded, but is not presently used in the GPS solution. */
  DataCollected,

  /** The satellite is being active used in the GPS solution. */
  InUse,

  /** The satellite is being active used in the GPS solution and SBAS differential corrections are being applied. */
  InUseDiffApplied
}

/**
 * Possible {@link GPSSatComputer} states.
 */
export enum GPSSystemState {
  /** The GPS receiver is searching for any visible satellites to acquire. */
  Searching = 'Searching',

  /** The GPS receiver is in the process of acquiring satellites. */
  Acquiring = 'Acquiring',

  /** A 3D solution has been acquired. */
  SolutionAcquired = 'SolutionAcquired',

  /** A 3D solution using differential computations has been acquired. */
  DiffSolutionAcquired = 'DiffSolutionAcquired'
}

/**
 * Possible SBAS connection states.
 */
export enum GPSSystemSBASState {
  /** SBAS is disabled. */
  Disabled = 'Disabled',

  /** SBAS is enabled but not receiving differential corrections. */
  Inactive = 'Inactive',

  /** SBAS is enabled and is receiving differential corrections. */
  Active = 'Active'
}

/**
 * A representation of a GPS satellite that is simulated by a {@link GPSPredictionContext}.
 */
export interface GPSPredictionSatellite {
  /** The PRN (pseudo-random noise) code for this satellite. */
  readonly prn: number;

  /** The SBAS group to which this satellite belongs, or `undefined` if this satellite is not an SBAS satellite. */
  readonly sbasGroup: string | undefined;

  /** This satellite's most recently predicted state. */
  readonly state: Subscribable<GPSSatelliteState>;

  /**
   * This satellite's most recently predicted position relative to the receiver, as `[zenith angle, hour angle]` in
   * radians. Zenith angle is the angle between the satellite's line-of-sight vector from the receiver and a vector
   * pointing directly upward at the receiver's position. Hour angle is the angle between the satellite's line-of-sight
   * vector from the receiver, projected onto the horizontal plane at the receiver's position, and the vector pointing
   * toward true north from the receiver's position.
   */
  readonly position: Subscribable<ReadonlyFloat64Array>;

  /** This satellite's most recently predicted signal strength, in the range 0 to 1. */
  readonly signalStrength: Subscribable<number>;
}

/**
 * A context that can be used to simulate satellite geometry and reception at arbitrary spatiotemporal positions.
 */
export interface GPSPredictionContext {
  /** The maximum number of satellites this context can use for position solution calculations. */
  readonly satInUseMaxCount: Subscribable<number>;

  /**
   * The maximum PDOP this context targets when selecting satellites to use for position solution calculations.
   * Additional satellites will be selected while PDOP is greater than the target or the number of selected satellites
   * is less than the optimum count (`satInUseOptimumCount`). Values less than or equal to zero will cause all possible
   * satellites to be selected up to the maximum count (`satInUseMaxCount`).
   */
  readonly satInUsePdopTarget: Subscribable<number>;

  /**
   * The optimum number of satellites to use for position solution calculations when this context targets a maximum
   * PDOP value. Additional satellites will be selected while PDOP is greater than the target (`satInUsePdopTarget`) or
   * the number of selected satellites is less than the optimum count.
   */
  readonly satInUseOptimumCount: Subscribable<number>;

  /**
   * This context's currently enabled SBAS groups. SBAS satellites that belong to groups that are not enabled are
   * inhibited from being tracked by this context's receiver and cannot be used for position determination or
   * differential correction download.
   */
  readonly enabledSbasGroups: SubscribableSet<string> & Subscribable<ReadonlySet<string>>;

  /**
   * The PRN (pseudo-random noise) codes of all satellites that are currently manually inhibited in this context. This
   * set does **not** include SBAS satellites that are inhibited solely because their associated SBAS group is not
   * enabled (unless the satellite has also been manually inhibited).
   * 
   * Inhibited satellites cannot be tracked, and therefore cannot be used for position determination or (in the case of
   * SBAS satellites) differential correction download.
   */
  readonly inhibitedSatellitePrnCodes: SubscribableSet<number> & Subscribable<ReadonlySet<number>>;

  /**
   * Waits for this context to complete initialization.
   * @returns A Promise which is fulfilled when this context has completed initialization, or rejected if this context
   * is destroyed before it has completed initialization.
   */
  awaitInit(): Promise<void>;

  /**
   * Gets the satellites simulated by this context.
   * @returns The satellites simulated by this context.
   */
  getSatellites(): readonly GPSPredictionSatellite[];

  /**
   * Gets the latitude/longitude coordinates of this context's receiver.
   * @returns The latitude/longitude coordinates of this context's receiver.
   */
  getLatLon(): GeoPointReadOnly;

  /**
   * Gets the altitude of this context's receiver, in meters above MSL.
   * @returns The altitude of this context's receiver, in meters above MSL.
   */
  getAltitude(): number;

  /**
   * Gets the time point of this context's receiver, as a Javascript timestamp.
   * @returns The time point of this context's receiver, as a Javascript timestamp.
   */
  getTime(): number;

  /**
   * Checks whether this context's parent {@link GPSSatComputer} instance has access to valid downloaded almanac data
   * that are up to date for a given time.
   * @param time The time for which to check for almanac validity, as a Javascript timestamp. Defaults to the current
   * time point of this context's receiver.
   * @returns Whether this context's parent {@link GPSSatComputer} instance has access to valid downloaded almanac data
   * that are up to date for the specified time.
   */
  isParentAlamanacValid(time?: number): boolean;

  /**
   * Gets the SBAS groups from which differential corrections were predicted to be available in the most recent
   * prediction simulated by this context. For differential corrections to be available from an SBAS group, the group
   * must be enabled, the receiver must be within the SBAS coverage area, and the receiver must have line of sight to
   * at least one of the group's satellites that is not inhibited.
   * @returns The SBAS groups from which differential corrections were predicted to be available in the most recent
   * prediction simulated by this context.
   */
  getAvailableDiffCorrections(): ReadonlySet<string>;

  /**
   * Gets the covariance matrix calculated from the satellite constellation used to produce a position solution in the
   * most recent prediction simulated by this context, represented as a 16-element vector.
   * @returns The covariance matrix calculated from the satellite constellation used to produce a position solution in the
   * most recent prediction simulated by this context, represented as a 16-element vector. The matrix is organized such
   * that row/column 1 represents spatial axis **x** (parallel to Earth's surface, positive points toward true north),
   * row/column 2 represents spatial axis **y** (parallel to Earth's surface, positive points toward the east),
   * row/column 3 represents spatial axis **z** (perpendicular to Earth's surface, positive points upward), and
   * row/column 4 represents the temporal axis. The element at row `i`, column `j` of the covariance matrix is
   * represented by the element at index `i * 4 + j` in the vector (i.e. the vector is filled from the matrix in
   * row-major order). If the most recent simulated constellation was not sufficient to produce a position solution or
   * if no predictions have been simulated, then all elements of the vector will be `NaN`.
   */
  getCovarMatrix(): ReadonlyFloat64Array;

  /**
   * Gets the dilution of precision values calculated from the satellite constellation used to produce a position
   * solution in the most recent prediction simulated by this context, as `[PDOP, HDOP, VDOP]`.
   * @returns The dilution of precision values calculated from the satellite constellation used to produce a position
   * solution in the most recent prediction simulated by this context, as `[PDOP, HDOP, VDOP]`. If the most recent
   * simulated constellation was not sufficient to produce a position solution or if no predictions have been
   * simulated, then all elements of the vector will be `-1`.
   */
  getDops(): ReadonlyFloat64Array;

  /**
   * Sets the parameters for this context to use when selecting satellites to use for position solution calculations.
   * This will also disable syncing of these parameters from this context's parent {@link GPSSatComputer} instance.
   * @param satInUseMaxCount The maximum number of satellites to use for position solution calculations.
   * @param satInUsePdopTarget The maximum PDOP to target when selecting satellites to use for position solution
   * calculations. Additional satellites will be selected while PDOP is greater than the target or the number of
   * selected satellites is less than the optimum count (`satInUseOptimumCount`). Values less than or equal to zero
   * will cause all possible satellites to be selected up to the maximum count (`satInUseMaxCount`).
   * @param satInUseOptimumCount The optimum number of satellites to use for position solution calculations when
   * targeting a maximum PDOP value. Additional satellites will be selected while PDOP is greater than the target
   * (`satInUsePdopTarget`) or the number of selected satellites is less than the optimum count.
   * @returns This context, after the parameters have been set.
   * @throws Error if this context has been destroyed.
   */
  setSatelliteSelectionParams(
    satInUseMaxCount: number,
    satInUsePdopTarget: number,
    satInUseOptimumCount: number
  ): this;

  /**
   * Syncs the parameters for this context to use when selecting satellites to use for position solution calculations
   * with the values used by this context's parent {@link GPSSatComputer} instance. While sync is enabled, any changes
   * to these parameters on the parent will also be reflected in this context's parameters.
   * @returns This context, after the sync has been enabled.
   * @throws Error if this context has been destroyed.
   */
  syncSatelliteSelectionParamsWithParent(): this;

  /**
   * Sets the SBAS groups that are enabled in this context. SBAS satellites that belong to groups that are not enabled
   * are inhibited from being tracked by this context's receiver and cannot be used for position determination or
   * differential correction download. This will also disable syncing of these groups from this context's parent
   * {@link GPSSatComputer} instance.
   * @param groups The enabled SBAS groups to set.
   * @returns This context, after the enabled SBAS groups have been set.
   * @throws Error if this context has been destroyed.
   */
  setEnabledSbasGroups(groups: Iterable<string>): this;

  /**
   * Syncs the SBAS groups that are enabled in this context with those used by this context's parent
   * {@link GPSSatComputer} instance. While sync is enabled, any changes to the enabled groups on the parent will also
   * be reflected in this context's enabled groups.
   * @returns This context, after the sync has been enabled.
   * @throws Error if this context has been destroyed.
   */
  syncEnabledSbasGroupsWithParent(): this;

  /**
   * Sets whether a satellite is manually inhibited. Inhibited satellites cannot be tracked, and therefore cannot be
   * used for position determination or (in the case of SBAS satellites) differential correction download. This will
   * also disable syncing of inhibited satellites from this context's parent {@link GPSSatComputer} instance.
   * @param prn The PRN (pseudo-random noise) code of the satellite to change.
   * @param inhibit Whether the satellite should be inhibited.
   * @returns This context, after the satellite inhibit state has been changed.
   * @throws Error if this context has been destroyed.
   */
  setSatelliteInhibit(prn: number, inhibit: boolean): this;

  /**
   * Syncs manually inhibited satellites in this context with those in this context's parent {@link GPSSatComputer}
   * instance. While sync is enabled, any changes to inhibited satellites on the parent will also be reflected in this
   * context's inhibited satellites.
   * @returns This context, after the sync has been enabled.
   * @throws Error if this context has been destroyed.
   */
  syncSatelliteInhibitWithParent(): this;

  /**
   * Sets the spatial and temporal location of this context's receiver.
   * @param lat The latitude of the position to set, in degrees.
   * @param lon The longitude of the position to set, in degrees.
   * @param altitude The altitude of the position to set, in meters.
   * @param time The time of the position to set, as a Javascript timestamp.
   * @returns This context, after the position has been set.
   * @throws Error if this context has been destroyed.
   */
  setPosition(lat: number, lon: number, altitude: number, time: number): this;

  /**
   * Simulates a predicted satellite constellation and receiver state. The prediction uses this context's current
   * parameters. After the prediction has been simulated, the predicted satellite state can be accessed by using
   * `getSatellites()`, and the predicted receiver state can be accessed by using `getAvailableDiffCorrections()`,
   * `getCovarMatrix()`, and `getDops()`. This method does nothing if this context has not been initialized.
   * @returns This context, after the prediction has been simulated.
   * @throws Error if this context has been destroyed.
   */
  predict(): this;

  /**
   * Destroys this context. This frees resources associated with the context and allows the context to be garbage
   * collected.
   */
  destroy(): void;
}

/**
 * A shared global object used to sync state between primary and replica instances of {@link GPSSatComputer}.
 */
type SharedGlobalData = {
  /** Whether this shared data object is ready to be used. */
  isReady: boolean;

  /** Options describing the timings of {@link GPSSatellite} state changes. */
  timingOptions: Required<GPSSatelliteTimingOptions>;

  /**
   * The nominal total number of receiver channels supported by the computer, or `null` if the computer supports an
   * unlimited number of channels.
   */
  nominalChannelCount: number | null;

  /**
   * The nominal number of SBAS-only receiver channels supported by the computer, or `null` if all channels can track
   * both non-SBAS and SBAS satellites.
   */
  nominalSbasChannelCount: number | null;

  /** Data describing the current state of every satellite in the constellation supported by the computer. */
  satellites: SatelliteData[];

  /** Data describing every SBAS group supported by the computer. */
  sbasData: SBASGroupDefinition[];

  /**
   * The number of receiver channels that can only track SBAS satellites, or `null` if all receiver channels can track
   * both SBAS and non-SBAS satellites.
   */
  sbasChannelCount: number | null;

  /**
   * The PRN codes of satellites assigned to be tracked by every receiver channel supported by the computer. If a
   * channel does not have an assigned satellite, then the value for the channel is `null` instead.
   */
  channelAssignments: (number | null)[];

  /** The names of the SBAS satellite groups for which signal reception is enabled. */
  enabledSbasGroups: string[];

  /** The PRN codes of all satellites that are currently manually inhibited. */
  manuallyInhibitedSatellitePrnCodes: number[];

  /**
   * The last point in time at which the system had access to an up-to-date almanac, as a Javascript timestamp, or
   * `undefined` if the system has never had such access.
   */
  lastAlmanacTime: number | undefined;

  /**
   * The ID assigned to the most recent update of satellite positions. Every time satellite positions are updated, the
   * ID increments by one.
   */
  satellitePositionUpdateId: number;

  /** The current state of the computer. */
  state: GPSSystemState;

  /** The current SBAS state of the computer. */
  sbasState: GPSSystemSBASState;

  /**
   * The covariance matrix calculated from the satellite constellation used to produce this computer's current position
   * solution, represented as a 16-element vector. The matrix is organized such that:
   * 
   * - Row/column 1 represents spatial axis **x** (parallel to Earth's surface, positive points toward true north).
   * - Row/column 2 represents spatial axis **y** (parallel to Earth's surface, positive points toward the east).
   * - Row/column 3 represents spatial axis **z** (perpendicular to Earth's surface, positive points upward).
   * - Row/column 4 represents the temporal axis.
   * 
   * The element at row `i`, column `j` of the covariance matrix is represented by the element at index `i * 4 + j` in
   * the vector (i.e. the vector is filled from the matrix in row-major order). If this computer has not acquired a
   * position solution, then all elements of the vector will be `NaN`.
   */
  covarMatrix: Float64Array;

  /**
   * The computer's current position dilution of precision value (PDOP), or `-1` if this computer has not acquired a
   * position solution.
   */
  pdop: number;

  /**
   * The computer's current horizontal dilution of precision value (HDOP), or `-1` if this computer has not acquired a
   * position solution.
   */
  hdop: number;

  /**
   * The computer's current vertical dilution of precision value (VDOP), or `-1` if this computer has not acquired a
   * position solution.
   */
  vdop: number;
};

/**
 * Data describing the state of a {@link GPSSatellite}.
 */
type SatelliteData = {
  /** The satellite's PRN (pseudo-random noise) code. */
  prn: number;

  /** The SBAS group to which the satellite belongs, or `undefined` if the satellite is not part of an SBAS constellation. */
  sbasGroup: string | undefined;

  /**
   * The ephemeris describing the satellite's orbital characteristics, or `undefined` if the satellite is a
   * geostationary SBAS satellite.
   */
  ephemeris: GPSEphemeris | undefined;

  /** Options describing the timings of state changes for the satellite. */
  timingOptions: Required<GPSSatelliteTimingOptions>;

  /** The current satellite state. */
  state: GPSSatelliteState;

  /** The current satellite position, in cartesian coordinates. */
  positionCartesian: Float64Array;

  /** The current satellite position, in zenith angle radians and hour angle radians. */
  position: Float64Array;

  /** The current satellite signal strength. */
  signalStrength: number;

  /** Whether the satellite is currently being tracked by the GPS receiver. */
  isTracked: boolean;

  /**
   * The most recent simulation time at which the satellite's ephemeris was downloaded, as a Javascript timestamp, or
   * `undefined` if the satellite's ephemeris has not yet been downloaded.
   */
  lastEphemerisTime: number | undefined;

  /**
   * The most recent simulation time at which the satellite was confirmed to be unreachable, as a Javascript
   * timestamp, or `undefined` if the satellite has not been confirmed to be unreachable.
   */
  lastUnreachableTime: number | undefined;

  /** Whether SBAS differential correction data have been downloaded from the satellite. */
  areDiffCorrectionsDownloaded: boolean;

  /**
   * The amount of time that has been spent by the GPS receiver attempting to acquire the satellite, in milliseconds,
   * or `undefined` if the satellite is not being acquired or has already been acquired.
   */
  timeSpentAcquiring: number | undefined;

  /**
   * The amount of time remaining before the GPS receiver will acquire the satellite, in milliseconds, or `undefined`
   * if the satellite is not being acquired, has already been acquired, or cannot be acquired.
   */
  timeToAcquire: number | undefined;

  /**
   * The amount of time remaining before the GPS receiver will have fully downloaded the satellite's ephemeris data, in
   * milliseconds, or `undefined` if the data are not downloading or have already been downloaded.
   */
  timeToDownloadEphemeris: number | undefined;

  /**
   * The amount of time remaining before the GPS receiver will have fully downloaded the satellite's differential
   * correction data, in milliseconds, or `undefined` if the data are not downloading or have already been downloaded.
   */
  timeToDownloadCorrections: number | undefined;
};

/**
 * Events used to sync state between GPSSatComputer instances.
 */
interface GPSSatComputerSyncEvents {
  /** A primary GPS satellite system has been reset. */
  [gps_system_sync_reset: IndexedEventType<'gps_system_sync_reset'>]: void;
}

/**
 * Events published by the GPSSatComputer system.
 */
export interface GPSSatComputerEvents {
  /** An event published when a GPS satellite changes state. */
  [gps_sat_state_changed: IndexedEventType<'gps_sat_state_changed'>]: GPSSatellite;

  /**
   * The nominal total number of receiver channels supported by the GPS system, or `null` if the system supports an
   * unlimited number of channels.
   */
  [gps_system_nominal_channel_count: IndexedEventType<'gps_system_nominal_channel_count'>]: number | null;

  /**
   * The nominal number of SBAS-only receiver channels supported by the GPS system, or `null` if all channels can track
   * both non-SBAS and SBAS satellites.
   */
  [gps_system_nominal_sbas_channel_count: IndexedEventType<'gps_system_nominal_sbas_channel_count'>]: number | null;

  /**
   * An event published when the set of manually inhibited satellites for the GPS system changes. The event data is a
   * set containing the PRN (pseudo-random noise) codes of all currently inhibited satellites. This does **not**
   * include SBAS satellites that are inhibited solely because their associated SBAS group is not enabled (unless the
   * satellite has also been manually inhibited).
   */
  [gps_system_satellite_inhibit_changed: IndexedEventType<'gps_system_satellite_inhibit_changed'>]: ReadonlySet<number>;

  /** An event published when the GPS satellite system changes state. */
  [gps_system_state_changed: IndexedEventType<'gps_system_state_changed'>]: GPSSystemState;

  /** An event published when the GPS satellite positions have been updated. */
  [gps_sat_pos_calculated: IndexedEventType<'gps_sat_pos_calculated'>]: void;

  /** An event published when the GPS system SBAS state changes. */
  [gps_system_sbas_state_changed: IndexedEventType<'gps_system_sbas_state_changed'>]: GPSSystemSBASState;

  /**
   * The covariance matrix calculated from the satellite constellation used to produce the GPS system's current
   * position solution, represented as a 16-element vector. The matrix is organized such that:
   * 
   * - Row/column 1 represents spatial axis **x** (parallel to Earth's surface, positive points toward true north).
   * - Row/column 2 represents spatial axis **y** (parallel to Earth's surface, positive points toward the east).
   * - Row/column 3 represents spatial axis **z** (perpendicular to Earth's surface, positive points upward).
   * - Row/column 4 represents the temporal axis.
   * 
   * The element at row `i`, column `j` of the covariance matrix is represented by the element at index `i * 4 + j` in
   * the vector (i.e. the vector is filled from the matrix in row-major order). If the system has not acquired a
   * position solution, then all elements of the vector will be `NaN`.
   */
  [gps_system_covar_matrix: IndexedEventType<'gps_system_covar_matrix'>]: ReadonlyFloat64Array;

  /**
   * The current position dilution of precision (PDOP) calculated by the GPS system, or `-1` if the system has not
   * acquired a position solution.
   */
  [gps_system_pdop: IndexedEventType<'gps_system_pdop'>]: number;

  /**
   * The current horizontal dilution of precision (HDOP) calculated by the GPS system, or `-1` if the system has not
   * acquired a position solution.
   */
  [gps_system_hdop: IndexedEventType<'gps_system_hdop'>]: number;

  /**
   * The current horizontal dilution of precision (VDOP) calculated by the GPS system, or `-1` if the system has not
   * acquired a position solution.
   */
  [gps_system_vdop: IndexedEventType<'gps_system_vdop'>]: number;
}

/**
 * Options describing the timings of {@link GPSSatellite} state changes.
 */
export type GPSSatelliteTimingOptions = {
  /**
   * The amount of elapsed time (bidirectional) required for a downloaded almanac to expire, in milliseconds. Defaults
   * to `7776000000` (90 days).
   */
  almanacExpireTime?: number;

  /**
   * The amount of elapsed time (bidirectional) required for ephemeris data to expire, in milliseconds. Defaults to
   * `7200000` (2 hours).
   */
  ephemerisExpireTime?: number;

  /**
   * The amount of time spent searching for a satellite signal, in milliseconds, before the satellite is declared
   * unreachable. Defaults to `60000`.
   */
  acquisitionTimeout?: number;

  /**
   * The average time required to acquire a satellite signal without valid ephemeris data, in milliseconds. Defaults to
   * `30000`.
   */
  acquisitionTime?: number;

  /**
   * The difference between the maximum and minimum time required to acquire a satellite signal without valid ephemeris
   * data, in milliseconds. The range is centered on the average (`acquisitionTime`). Defaults to `15000`.
   */
  acquisitionTimeRange?: number;

  /**
   * The average time required to acquire a satellite signal with valid ephemeris data, in milliseconds. Defaults to
   * `15000`.
   */
  acquisitionTimeWithEphemeris?: number;

  /**
   * The difference between the maximum and minimum time required to acquire a satellite signal with valid ephemeris
   * data, in milliseconds. The range is centered on the average (`acquisitionTimeWithEphemeris`). Defaults to `5000`.
   */
  acquisitionTimeRangeWithEphemeris?: number;

  /**
   * The amount of elapsed time (bidirectional), in milliseconds, required for a satellite that was previously declared
   * unreachable to be considered eligible for tracking again. Defaults to `3600000` (1 hour).
   */
  unreachableExpireTime?: number;

  /** The time required to download ephemeris data from a non-SBAS satellite, in milliseconds. Defaults to `30000`. */
  ephemerisDownloadTime?: number;

  /**
   * The time required to download a complete almanac from a non-SBAS satellite, in milliseconds. Defaults to `750000`
   * (12.5 minutes).
   */
  almanacDownloadTime?: number;

  /**
   * The average time required to download ephemeris data from an SBAS satellite, in milliseconds. Defaults to
   * `60500`.
   */
  sbasEphemerisDownloadTime?: number;

  /**
   * The difference between the maximum and minimum time required to download ephemeris data from an SBAS satellite,
   * in milliseconds. The range is centered on the average (`sbasEphemerisDownloadTime`). Defaults to `59500`.
   */
  sbasEphemerisDownloadTimeRange?: number;

  /**
   * The average time required to download differential correction data from an SBAS satellite, in milliseconds.
   * Defaults to `150500`.
   */
  sbasCorrectionDownloadTime?: number;

  /**
   * The difference between the maximum and minimum time required to download differential correction data from an SBAS
   * satellite, in milliseconds. The range is centered on the average (`sbasCorrectionDownloadTime`). Defaults to
   * `149500`.
   */
  sbasCorrectionDownloadTimeRange?: number;
};

/**
 * Options for {@link GPSSatComputer}.
 */
export type GPSSatComputerOptions = {
  /**
   * The total number of receiver channels supported by the computer. The computer can acquire and track one satellite
   * per channel.
   * 
   * If `sbasChannelCount` is defined, then the computer's receiver channels will be split into two categories:
   * non-SBAS and SBAS channels. Non-SBAS channels will only be capable of tracking non-SBAS satellites, and SBAS
   * channels will only be capable of tracking SBAS satellites. The number of non-SBAS channels will be set equal to
   * the total number of channels minus the number of SBAS channels. If `sbasChannelCount` is not defined, then all
   * receiver channels will be able to track both non-SBAS and SBAS satellites.
   * 
   * If the number of channels capable of tracking non-SBAS satellites is less than four, then the total number of
   * channels will be forcibly increased to accommodate four non-SBAS-tracking channels.
   * 
   * If this value is not defined, then it will default to the total number of all satellites if `sbasChannelCount` is
   * defined, or to the total number of non-SBAS satellites plus the value of `sbasChannelCount` if `sbasChannelCount`
   * is defined.
   */
  channelCount?: number;

  /**
   * The number of SBAS receiver channels supported by the computer. If this value is defined, then the computer's
   * receiver channels will be split into two categories: non-SBAS and SBAS channels. Non-SBAS channels will only be
   * capable of tracking non-SBAS satellites, and SBAS channels will only be capable of tracking SBAS satellites. The
   * number of non-SBAS channels will be set equal to the total number of channels minus the number of SBAS channels.
   * If this value is not defined, then all receiver channels will be able to track both non-SBAS and SBAS satellites.
   */
  sbasChannelCount?: number;

  /**
   * The maximum number of satellites to use for position solution calculations. Must be greater than or equal to `4`.
   * Defaults to `Infinity`.
   */
  satInUseMaxCount?: number | Subscribable<number>;

  /**
   * The maximum PDOP to target when selecting satellites to use for position solution calculations. Additional
   * satellites will be selected while PDOP is greater than the target or the number of selected satellites is less
   * than the optimum count (`satInUseOptimumCount`). Values less than or equal to zero will cause all possible
   * satellites to be selected up to the maximum count (`satInUseMaxCount`). Defaults to `-1`.
   */
  satInUsePdopTarget?: number | Subscribable<number>;

  /**
   * The optimum number of satellites to use for position solution calculations when targeting a maximum PDOP value.
   * Must be greater than or equal to `4`. Additional satellites will be selected while PDOP is greater than the target
   * (`satInUsePdopTarget`) or the number of selected satellites is less than the optimum count. Defaults to `4`.
   */
  satInUseOptimumCount?: number | Subscribable<number>;

  /** Options with which to configure the timings of satellite state changes. */
  timingOptions?: Readonly<GPSSatelliteTimingOptions>;
};

/**
 * An instrument that computes GPS satellite information.
 */
export class GPSSatComputer implements Instrument {
  private readonly publisher = this.bus.getPublisher<GPSSatComputerEvents>();
  private readonly syncPublisher = this.bus.getPublisher<GPSSatComputerSyncEvents>();

  private readonly nominalChannelCountTopic = `gps_system_nominal_channel_count_${this.index}` as const;
  private readonly nominalSbasChannelCountTopic = `gps_system_nominal_sbas_channel_count_${this.index}` as const;
  private readonly satStateChangedTopic = `gps_sat_state_changed_${this.index}` as const;
  private readonly satPosCalcTopic = `gps_sat_pos_calculated_${this.index}` as const;

  private readonly resetSyncTopic = `gps_system_sync_reset_${this.index}` as const;

  private readonly satelliteTimingOptions: Required<GPSSatelliteTimingOptions>;

  private readonly desiredTotalChannelCount: number;

  private readonly satInUseMaxCount: number | Subscribable<number>;
  private readonly satInUsePdopTarget: number | Subscribable<number>;
  private readonly satInUseOptimumCount: number | Subscribable<number>;

  private readonly activeSimulationContext = new SatelliteSimulationContext();

  /**
   * The PRN (pseudo-random noise) codes of all satellites that are currently manually inhibited. This set does **not**
   * include SBAS satellites that are inhibited solely because their associated SBAS group is not enabled (unless the
   * satellite has also been manually inhibited).
   * 
   * Inhibited satellites cannot be tracked, and therefore cannot be used for position determination, almanac download,
   * or (in the case of SBAS satellites) differential correction download.
   */
  public readonly inhibitedSatellitePrnCodes = this.activeSimulationContext.manuallyInhibitedSatellitePrnCodes as (
    SubscribableSet<number> & Subscribable<ReadonlySet<number>>
  );

  private readonly publishedSatStates: GPSSatelliteState[] = [];

  private readonly latSimVar = RegisteredSimVarUtils.create('PLANE LATITUDE', SimVarValueType.Degree);
  private readonly lonSimVar = RegisteredSimVarUtils.create('PLANE LONGITUDE', SimVarValueType.Degree);
  private readonly altSimVar = RegisteredSimVarUtils.create('PLANE ALTITUDE', SimVarValueType.Meters);
  private readonly simTimeSource = MappedValue.create(
    ([absoluteTime]) => TimeUtils.simAbsoluteTimeToJSTimestamp(absoluteTime),
    RegisteredSimVarUtils.create('E:ABSOLUTE TIME', SimVarValueType.Seconds)
  );

  private readonly lastUpdatePosition = new GeoPoint(NaN, NaN);

  private previousSimTime: number | undefined = undefined;
  private lastUpdateTime: number | undefined = undefined;

  private readonly _state = Subject.create(GPSSystemState.Searching);
  /** The current system state of this computer. */
  public readonly systemState = this._state as Subscribable<GPSSystemState>;

  private readonly _sbasState = Subject.create(GPSSystemSBASState.Disabled);
  /** The current system SBAS state of this computer. */
  public readonly systemSbasState = this._sbasState as Subscribable<GPSSystemSBASState>;

  private readonly _covarMatrix = VecNSubject.create(new Float64Array(this.activeSimulationContext.covarMatrix));
  /**
   * The covariance matrix calculated from the satellite constellation used to produce this computer's current position
   * solution, represented as a 16-element vector. The matrix is organized such that:
   * 
   * - Row/column 1 represents spatial axis **x** (parallel to Earth's surface, positive points toward true north).
   * - Row/column 2 represents spatial axis **y** (parallel to Earth's surface, positive points toward the east).
   * - Row/column 3 represents spatial axis **z** (perpendicular to Earth's surface, positive points upward).
   * - Row/column 4 represents the temporal axis.
   * 
   * The element at row `i`, column `j` of the covariance matrix is represented by the element at index `i * 4 + j` in
   * the vector (i.e. the vector is filled from the matrix in row-major order). If this computer has not acquired a
   * position solution, then all elements of the vector will be `NaN`.
   */
  public readonly covarMatrix = this._covarMatrix as Subscribable<ReadonlyFloat64Array>;

  private readonly _pdop = Subject.create(-1);
  /**
   * This computer's current position dilution of precision value (PDOP), or `-1` if this computer has not acquired a
   * position solution.
   */
  public readonly pdopValue = this._pdop as Subscribable<number>;

  private readonly _hdop = Subject.create(-1);
  /**
   * This computer's current horizontal dilution of precision value (HDOP), or `-1` if this computer has not acquired a
   * position solution.
   */
  public readonly hdopValue = this._hdop as Subscribable<number>;

  private readonly _vdop = Subject.create(-1);
  /**
   * This computer's current vertical dilution of precision value (VDOP), or `-1` if this computer has not acquired a
   * position solution.
   */
  public readonly vdopValue = this._vdop as Subscribable<number>;

  private almanacProgress = 0;
  private lastAlamanacTime: number | undefined = undefined;

  private readonly predictionContexts: PredictionContext[] = [];

  private sharedGlobalData?: SharedGlobalData;
  private lastSatellitePositionUpdateId: number | undefined = undefined;

  private hasInitStarted = false;
  private isInit = false;
  private needAcquireAndUse = false;

  private initPromiseResolve!: () => void;
  private readonly initPromise = new Promise<void>(resolve => {
    this.initPromiseResolve = resolve;
  });

  /**
   * The nominal total number of receiver channels supported by this computer, or `null` if this computer supports an
   * unlimited number of channels.
   */
  public readonly nominalChannelCount: number | null;

  /**
   * The nominal number of SBAS-only receiver channels supported by the GPS system, or `null` if all channels can track
   * both non-SBAS and SBAS satellites.
   */
  public readonly nominalSbasChannelCount: number | null;

  /**
   * Gets the current satellites that are being tracked by this computer.
   * @returns The collection of current satellites.
   * @deprecated Please use `getSatellites()` instead.
   */
  public get sats(): readonly GPSSatellite[] {
    return this.activeSimulationContext.satellites;
  }

  /**
   * Gets the current GPS system state.
   * @returns The current GPS system state.
   * @deprecated Please use `systemState` instead.
   */
  public get state(): GPSSystemState {
    return this._state.get();
  }

  /**
   * Gets the current GPS system SBAS state.
   * @returns The current GPS system SBAS state.
   * @deprecated Please use `systemSbasState` instead.
   */
  public get sbasState(): GPSSystemSBASState {
    return this._sbasState.get();
  }

  /**
   * Gets this system's current position dilution of precision value (PDOP), or `-1` if this system has not acquired a
   * position solution.
   * @returns This system's current position dilution of precision value (PDOP), or `-1` if this system has not
   * acquired a position solution.
   * @deprecated Please use `pdopValue` instead.
   */
  public get pdop(): number {
    return this._pdop.get();
  }

  /**
   * Gets this system's current horizontal dilution of precision value (HDOP), or `-1` if this system has not acquired a
   * position solution.
   * @returns This system's current horizontal dilution of precision value (HDOP), or `-1` if this system has not
   * acquired a position solution.
   * @deprecated Please use `hdopValue` instead.
   */
  public get hdop(): number {
    return this._hdop.get();
  }

  /**
   * Gets this system's current vertical dilution of precision value (VDOP), or `-1` if this system has not acquired a
   * position solution.
   * @returns This system's current vertical dilution of precision value (VDOP), or `-1` if this system has not
   * acquired a position solution.
   * @deprecated Please use `vdopValue` instead.
   */
  public get vdop(): number {
    return this._vdop.get();
  }

  /**
   * Creates an instance of GPSSatComputer.
   * @param index The index of this computer.
   * @param bus An instance of the event bus.
   * @param ephemerisFile The HTTP path to the ephemeris file to use for computations.
   * @param sbasFile The HTTP path to the SBAS definitions file.
   * @param updateInterval The interval in milliseconds to update the satellite positions.
   * @param enabledSBASGroups The names of the SBAS satellite groups for which signal reception is enabled. If the
   * computer's sync role is `replica`, then this parameter is ignored and the computer will sync enabled SBAS groups
   * from the associated primary computer.
   * @param syncRole This computer's sync role. A `primary` computer will sync its state to corresponding `replica`
   * computers. A computer with a sync role of `none` does not sync its state to or from other computers; it maintains
   * its own independent state. Defaults to `none`.
   * @param options Options with which to configure the computer. If the computer's sync role is `replica`, then these
   * options are ignored and all configuration is instead synced with the associated primary computer.
   */
  public constructor(
    public readonly index: number,
    private readonly bus: EventBus,
    private readonly ephemerisFile: string,
    private readonly sbasFile: string,
    private readonly updateInterval: number,
    enabledSBASGroups: Iterable<string> | SubscribableSet<string> | undefined,
    public readonly syncRole: 'primary' | 'replica' | 'none' = 'none',
    options?: Readonly<GPSSatComputerOptions>
  ) {
    this.nominalSbasChannelCount = options?.sbasChannelCount === undefined || !isFinite(options.sbasChannelCount)
      ? null
      : Math.max(Math.round(options.sbasChannelCount), 0);

    this.desiredTotalChannelCount = Math.max(Math.round(options?.channelCount ?? Infinity), 4 + (this.nominalSbasChannelCount ?? 0));
    this.nominalChannelCount = isFinite(this.desiredTotalChannelCount) ? this.desiredTotalChannelCount : null;

    this.satInUseMaxCount = options?.satInUseMaxCount ?? Infinity;
    this.satInUsePdopTarget = options?.satInUsePdopTarget ?? -1;
    this.satInUseOptimumCount = options?.satInUseOptimumCount ?? 4;

    this.initSatelliteSelectionParameters();

    if (syncRole === 'replica') {
      this.satelliteTimingOptions = {} as Required<GPSSatelliteTimingOptions>;
    } else {
      this.satelliteTimingOptions = { ...options?.timingOptions } as Required<GPSSatelliteTimingOptions>;

      if (enabledSBASGroups !== undefined) {
        if ('isSubscribableSet' in enabledSBASGroups) {
          enabledSBASGroups.pipe(this.activeSimulationContext.enabledSbasGroups);
        } else {
          this.activeSimulationContext.enabledSbasGroups.set(enabledSBASGroups);
        }
      }
    }

    this.satelliteTimingOptions.almanacExpireTime ??= 7776000000;
    this.satelliteTimingOptions.ephemerisExpireTime ??= 7200000;
    this.satelliteTimingOptions.acquisitionTimeout ??= 30000;
    this.satelliteTimingOptions.acquisitionTime ??= 30000;
    this.satelliteTimingOptions.acquisitionTimeRange ??= 15000;
    this.satelliteTimingOptions.acquisitionTimeWithEphemeris ??= 15000;
    this.satelliteTimingOptions.acquisitionTimeRangeWithEphemeris ??= 5000;
    this.satelliteTimingOptions.unreachableExpireTime ??= 3600000;
    this.satelliteTimingOptions.ephemerisDownloadTime ??= 30000;
    this.satelliteTimingOptions.almanacDownloadTime ??= 750000;
    this.satelliteTimingOptions.sbasEphemerisDownloadTime ??= 60500;
    this.satelliteTimingOptions.sbasEphemerisDownloadTimeRange ??= 59500;
    this.satelliteTimingOptions.sbasCorrectionDownloadTime ??= 150500;
    this.satelliteTimingOptions.sbasCorrectionDownloadTimeRange ??= 149500;

    this.updatePosition();
  }

  /**
   * Initializes this computer's satellite selection parameters.
   */
  private initSatelliteSelectionParameters(): void {
    if (SubscribableUtils.isSubscribable(this.satInUseMaxCount)) {
      this.satInUseMaxCount.sub(count => { this.activeSimulationContext.satInUseMaxCount = count; }, true);
    } else {
      this.activeSimulationContext.satInUseMaxCount = this.satInUseMaxCount;
    }

    if (SubscribableUtils.isSubscribable(this.satInUsePdopTarget)) {
      this.satInUsePdopTarget.sub(count => { this.activeSimulationContext.satInUsePdopTarget = count; }, true);
    } else {
      this.activeSimulationContext.satInUsePdopTarget = this.satInUsePdopTarget;
    }

    if (SubscribableUtils.isSubscribable(this.satInUseOptimumCount)) {
      this.satInUseOptimumCount.sub(count => { this.activeSimulationContext.satInUseOptimumCount = count; }, true);
    } else {
      this.activeSimulationContext.satInUseOptimumCount = this.satInUseOptimumCount;
    }
  }

  /**
   * Publishes data to an event bus topic defined in `GPSSatComputerEvents`.
   * @param topic The topic to which to publish the data.
   * @param data The data to publish.
   */
  private publishEvent<K extends keyof GPSSatComputerEvents>(topic: K, data: GPSSatComputerEvents[K]): void {
    this.publisher.pub(topic, data, true, true);
  }

  /** @inheritdoc */
  public init(): void {
    if (this.hasInitStarted) {
      return;
    }

    this.hasInitStarted = true;
    this.doInit();
  }

  /**
   * Waits for this computer to complete initialization.
   * @returns A Promise which is fulfilled when this computer has completed initialization.
   */
  public awaitInit(): Promise<void> {
    return this.initPromise;
  }

  /**
   * Performs initialization.
   */
  private async doInit(): Promise<void> {
    // Publish initial state.
    this.publisher.pub(this.nominalChannelCountTopic, this.nominalChannelCount, false, true);

    this.activeSimulationContext.manuallyInhibitedSatellitePrnCodes.sub(this.publishEvent.bind(this, `gps_system_satellite_inhibit_changed_${this.index}`), true);
    this._state.sub(this.publishEvent.bind(this, `gps_system_state_changed_${this.index}`), true);
    this._sbasState.sub(this.publishEvent.bind(this, `gps_system_sbas_state_changed_${this.index}`), true);
    this._covarMatrix.sub(this.publishEvent.bind(this, `gps_system_covar_matrix_${this.index}`), true);
    this._pdop.sub(this.publishEvent.bind(this, `gps_system_pdop_${this.index}`), true);
    this._hdop.sub(this.publishEvent.bind(this, `gps_system_hdop_${this.index}`), true);
    this._vdop.sub(this.publishEvent.bind(this, `gps_system_vdop_${this.index}`), true);

    if (this.syncRole === 'replica') {
      await this.getSharedGlobal();

      // Force an update from the shared global when we get a notification that the primary was reset. This is
      // necessary for backward compatibility since with the old event bus state sync, resets did not require a call
      // to the replica's onUpdate() method to be synced.
      this.bus.getSubscriber<GPSSatComputerSyncEvents>().on(this.resetSyncTopic).handle(() => { this.updateFromSharedData(); });
    } else {
      const satelliteData = await this.loadSatelliteData();
      this.activeSimulationContext.initSatellitesFromData(satelliteData);

      this.publishedSatStates.length = this.activeSimulationContext.satellites.length;
      for (let i = 0; i < this.activeSimulationContext.satellites.length; i++) {
        this.publishedSatStates[i] = GPSSatelliteState.None;
      }

      if (this.nominalSbasChannelCount === null) {
        // Prune total channel count so that it is not more than the total number of satellites.
        const totalChannelCount = Math.min(this.desiredTotalChannelCount, this.activeSimulationContext.satellites.length);
        this.activeSimulationContext.initChannels(totalChannelCount, null);
      } else {
        const desiredSbasChannelCount = this.nominalSbasChannelCount;
        const desiredNonSbasChannelCount = this.desiredTotalChannelCount - desiredSbasChannelCount;

        // Prune SBAS and total channel counts so that the number of SBAS channels is not more than the number of SBAS
        // satellites and the number of non-SBAS channels is not more than the number of non-SBAS satellites.
        const sbasChannelCount = Math.min(this.nominalSbasChannelCount, this.activeSimulationContext.sbasSatelliteCount);
        const totalChannelCount = this.nominalSbasChannelCount + Math.min(desiredNonSbasChannelCount, this.activeSimulationContext.nonSbasSatelliteCount);

        this.activeSimulationContext.initChannels(totalChannelCount, sbasChannelCount);
      }

      if (this.syncRole === 'primary') {
        await this.createSharedGlobal(satelliteData);
      }

      for (const context of this.predictionContexts) {
        this.initPredictionContext(context);
      }
    }

    this.isInit = true;

    if (this.needAcquireAndUse) {
      this.needAcquireAndUse = false;
      this.acquireAndUseSatellites();
    } else if (this.syncRole !== 'replica') {
      this.reset();
    }

    this.initPromiseResolve();
  }

  /**
   * Loads satellite data from this computer's assigned ephemeris and SBAS data files.
   * @returns An array containing satellite data objects for all satellites defined in this computer's assigned
   * ephemeris and SBAS data files.
   */
  private async loadSatelliteData(): Promise<SatelliteData[]> {
    const ephemerisData = await this.loadEphemerisData();
    const sbasData = await this.loadSbasData();

    this.activeSimulationContext.initSbasData(sbasData);

    const satelliteData: SatelliteData[] = [];

    // Add non-SBAS satellites.

    for (const prn in ephemerisData) {
      satelliteData.push({
        prn: parseInt(prn),
        sbasGroup: undefined,
        ephemeris: ephemerisData[prn],
        timingOptions: this.satelliteTimingOptions,
        state: GPSSatelliteState.None,
        positionCartesian: Vec3Math.create(),
        position: Vec2Math.create(),
        signalStrength: 0,
        isTracked: false,
        areDiffCorrectionsDownloaded: false,
        lastEphemerisTime: undefined,
        lastUnreachableTime: undefined,
        timeSpentAcquiring: undefined,
        timeToAcquire: undefined,
        timeToDownloadEphemeris: undefined,
        timeToDownloadCorrections: undefined,
      });
    }

    // Add SBAS satellites.

    const satellitePos = new GeoPoint(0, 0);
    // Geostationary orbital radius.
    const orbitRadius = UnitType.KILOMETER.convertTo(35785, UnitType.GA_RADIAN);

    for (let i = 0; i < sbasData.length; i++) {
      const sbasDef = sbasData[i];
      for (const satDef of sbasDef.constellation) {
        const positionCartesian = Vec3Math.create();
        Vec3Math.multScalar(satellitePos.set(0, satDef.lon).toCartesian(positionCartesian), orbitRadius, positionCartesian);

        satelliteData.push({
          prn: satDef.prn,
          sbasGroup: sbasDef.group,
          ephemeris: undefined,
          timingOptions: this.satelliteTimingOptions,
          state: GPSSatelliteState.None,
          positionCartesian,
          position: Vec2Math.create(),
          signalStrength: 0,
          isTracked: false,
          areDiffCorrectionsDownloaded: false,
          lastEphemerisTime: undefined,
          lastUnreachableTime: undefined,
          timeSpentAcquiring: undefined,
          timeToAcquire: undefined,
          timeToDownloadEphemeris: undefined,
          timeToDownloadCorrections: undefined,
        });
      }
    }

    return satelliteData;
  }

  /**
   * Loads the GPS ephemeris data file.
   * @returns The GPS ephemeris records loaded from the file.
   */
  private loadEphemerisData(): Promise<GPSEphemerisRecords> {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.onreadystatechange = () => {
        if (request.readyState === XMLHttpRequest.DONE) {
          if (request.status === 200) {
            resolve(JSON.parse(request.responseText));
          } else {
            reject(`Could not initialize sat computer system with ephemeris data: ${request.responseText}`);
          }
        }
      };

      request.open('GET', this.ephemerisFile);
      request.send();
    });
  }

  /**
   * Loads the GPS SBAS data file.
   * @returns The SBAS group definitions loaded from the file.
   */
  private loadSbasData(): Promise<SBASGroupDefinition[]> {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.onreadystatechange = () => {
        if (request.readyState === XMLHttpRequest.DONE) {
          if (request.status === 200) {
            resolve(JSON.parse(request.responseText));
          } else {
            reject(`Could not initialize sat computer system with sbas data: ${request.responseText}`);
          }
        }
      };

      request.open('GET', this.sbasFile);
      request.send();
    });
  }

  /**
   * Gets the name of the shared global object to use for this computer.
   * @returns The name of the shared global object to use for this computer.
   */
  private getSharedGlobalName(): string {
    return `__gpsSatComputerSync-${this.index}`;
  }

  /**
   * Creates a shared global object for this computer.
   * @param satelliteData The satellite data objects used by this computer's satellites.
   */
  private async createSharedGlobal(satelliteData: SatelliteData[]): Promise<void> {
    const sharedGlobalName = this.getSharedGlobalName();
    const ref = await SharedGlobal.get(sharedGlobalName);

    if (!ref.isViewOwner) {
      throw new Error(`GpsSatComputer::createSharedGlobal(): could not create shared global with name ${sharedGlobalName} because a shared global with that name already exists`);
    }

    const data = ref.instance as SharedGlobalData;

    data.timingOptions = this.satelliteTimingOptions;

    data.nominalChannelCount = this.nominalChannelCount;
    data.nominalSbasChannelCount = this.nominalSbasChannelCount;

    data.satellites = satelliteData;
    data.sbasData = this.activeSimulationContext.sbasData;

    data.sbasChannelCount = this.activeSimulationContext.sbasChannelCount;
    data.channelAssignments = this.activeSimulationContext.channels.map(satellite => satellite === null ? null : satellite.prn);

    data.enabledSbasGroups = Array.from(this.activeSimulationContext.enabledSbasGroups.get());

    data.manuallyInhibitedSatellitePrnCodes = Array.from(this.activeSimulationContext.manuallyInhibitedSatellitePrnCodes.get());

    data.lastAlmanacTime = this.lastAlamanacTime;

    data.satellitePositionUpdateId = 0;

    data.state = this._state.get();
    data.sbasState = this._sbasState.get();

    data.covarMatrix = new Float64Array(this.activeSimulationContext.covarMatrix);
    data.pdop = this._pdop.get();
    data.hdop = this._hdop.get();
    data.vdop = this._vdop.get();

    data.isReady = true;

    this.sharedGlobalData = data;
  }

  /**
   * Gets a shared global object for this computer and syncs configuration (but not state) from the shared global. If
   * the shared global is ever detached, then this computer's state will be reset, and the process for getting a
   * shared global will restart.
   */
  private async getSharedGlobal(): Promise<void> {
    const sharedGlobalName = this.getSharedGlobalName();

    let ref: SharedGlobalObjectRef<SharedGlobalData>;
    do {
      ref = await SharedGlobal.await<SharedGlobalData>(sharedGlobalName);

      await Wait.awaitCondition(() => {
        return ref.isDetached.get() || ref.instance.isReady;
      });
    } while (ref.isDetached.get());

    this.sharedGlobalData = ref.instance;

    (this.satelliteTimingOptions as Required<GPSSatelliteTimingOptions>) = this.sharedGlobalData.timingOptions;

    this.activeSimulationContext.initSbasData(this.sharedGlobalData.sbasData);

    if (this.nominalChannelCount !== this.sharedGlobalData.nominalChannelCount) {
      (this.nominalChannelCount as number | null) = this.sharedGlobalData.nominalChannelCount;
      this.publisher.pub(this.nominalChannelCountTopic, this.nominalChannelCount, false, true);
    }

    if (this.nominalSbasChannelCount !== this.sharedGlobalData.nominalSbasChannelCount) {
      (this.nominalSbasChannelCount as number | null) = this.sharedGlobalData.nominalSbasChannelCount;
      this.publisher.pub(this.nominalSbasChannelCountTopic, this.nominalSbasChannelCount, false, true);
    }

    const localSatelliteData = this.sharedGlobalData.satellites.map(GPSSatComputer.cloneSatelliteData);
    this.activeSimulationContext.initSatellitesFromData(localSatelliteData);

    const oldPublishedSatStatesLength = this.publishedSatStates.length;
    this.publishedSatStates.length = this.activeSimulationContext.satellites.length;
    for (let i = oldPublishedSatStatesLength; i < this.activeSimulationContext.satellites.length; i++) {
      this.publishedSatStates[i] = GPSSatelliteState.None;
    }

    this.activeSimulationContext.initChannels(this.sharedGlobalData.channelAssignments.length, this.sharedGlobalData.sbasChannelCount);

    for (const context of this.predictionContexts) {
      this.initPredictionContext(context);
    }

    this.updateFromSharedData();

    const sub = ref.isDetached.sub(isDetached => {
      if (isDetached) {
        sub.destroy();

        this.sharedGlobalData = undefined;
        this.lastSatellitePositionUpdateId = undefined;
        this.resetState();

        this.getSharedGlobal();
      }
    });
  }

  /**
   * Resets the state of this computer. This will unassign all receiver channels, set the state of every satellite to
   * {@link GPSSatelliteState.None}, and set the state of the system to {@link GPSSystemState.Searching}.
   */
  private resetState(): void {
    this.activeSimulationContext.reset();

    this.diffAndPublishSatelliteStates();

    this._state.set(GPSSystemState.Searching);

    this._sbasState.set(this.activeSimulationContext.enabledSbasGroups.get().size > 0 ? GPSSystemSBASState.Inactive : GPSSystemSBASState.Disabled);

    if (this.syncRole === 'primary') {
      this.updateSharedData(false);

      this.syncPublisher.pub(this.resetSyncTopic, undefined, true, false);
    }
  }

  /**
   * Gets an array containing all satellites that can potentially be tracked by this computer.
   * @returns An array containing all satellites that can potentially be tracked by this computer.
   */
  public getSatellites(): readonly GPSSatellite[] {
    return this.activeSimulationContext.satellites;
  }

  /**
   * Creates a new prediction context from this computer.
   * @returns A new prediction context whose parent is this computer.
   */
  public createPredictionContext(): GPSPredictionContext {
    let satInUseMaxCountPipe: Subscription | undefined;
    let satInUsePdopTargetPipe: Subscription | undefined;
    let satInUseOptimumCountPipe: Subscription | undefined;

    let enabledSbasGroupsPipe: Subscription | undefined;

    let satelliteInhibitPipe: Subscription | undefined;

    const newContext = new PredictionContext(
      this.isAlmanacValid.bind(this),
      (context, sync) => {
        if (sync) {
          if (SubscribableUtils.isSubscribable(this.satInUseMaxCount)) {
            if (satInUseMaxCountPipe) {
              satInUseMaxCountPipe.resume(true);
            } else {
              satInUseMaxCountPipe = this.satInUseMaxCount.pipe(context._satInUseMaxCount);
            }
          } else {
            context._satInUseMaxCount.set(this.satInUseMaxCount);
          }

          if (SubscribableUtils.isSubscribable(this.satInUsePdopTarget)) {
            if (satInUsePdopTargetPipe) {
              satInUsePdopTargetPipe.resume(true);
            } else {
              satInUsePdopTargetPipe = this.satInUsePdopTarget.pipe(context._satInUsePdopTarget);
            }
          } else {
            context._satInUsePdopTarget.set(this.satInUsePdopTarget);
          }

          if (SubscribableUtils.isSubscribable(this.satInUseOptimumCount)) {
            if (satInUseOptimumCountPipe) {
              satInUseOptimumCountPipe.resume(true);
            } else {
              satInUseOptimumCountPipe = this.satInUseOptimumCount.pipe(context._satInUseOptimumCount);
            }
          } else {
            context._satInUseOptimumCount.set(this.satInUseOptimumCount);
          }
        } else {
          satInUseMaxCountPipe?.pause();
          satInUsePdopTargetPipe?.pause();
          satInUseOptimumCountPipe?.pause();
        }
      },
      (context, sync) => {
        if (sync) {
          if (enabledSbasGroupsPipe) {
            enabledSbasGroupsPipe.resume(true);
          } else {
            enabledSbasGroupsPipe = this.activeSimulationContext.enabledSbasGroups.pipe(context._simulationContext.enabledSbasGroups);
          }
        } else {
          enabledSbasGroupsPipe?.pause();
        }
      },
      (context, sync) => {
        if (sync) {
          if (satelliteInhibitPipe) {
            satelliteInhibitPipe.resume(true);
          } else {
            satelliteInhibitPipe = this.activeSimulationContext.manuallyInhibitedSatellitePrnCodes.pipe(context._simulationContext.manuallyInhibitedSatellitePrnCodes);
          }
        } else {
          satelliteInhibitPipe?.pause();
        }
      },
      (context) => {
        satInUseMaxCountPipe?.destroy();
        satInUsePdopTargetPipe?.destroy();
        satInUseOptimumCountPipe?.destroy();

        enabledSbasGroupsPipe?.destroy();

        satelliteInhibitPipe?.destroy();

        const index = this.predictionContexts.indexOf(context);
        if (index >= 0) {
          this.predictionContexts.splice(index, 1);
        }
      }
    );

    this.predictionContexts.push(newContext);

    if (this.isInit) {
      this.initPredictionContext(newContext);
    }

    return newContext;
  }

  /**
   * Initializes one of this computer's prediction contexts. Initializing the context will sync its SBAS data,
   * satellite data, and receiver channel configuration with this computer's active simulation context.
   * @param context The context to initialize.
   */
  private initPredictionContext(context: PredictionContext): void {
    context._simulationContext.initSbasData(this.activeSimulationContext.sbasData);

    const satelliteData = this.activeSimulationContext.satelliteData.map(GPSSatComputer.cloneSatelliteData);
    context._simulationContext.initSatellitesFromData(satelliteData);

    context._simulationContext.initChannels(this.activeSimulationContext.totalChannelCount, this.activeSimulationContext.sbasChannelCount);

    context.markInit();
  }

  /**
   * Calculates the horizon zenith angle.
   * @returns The calculated horizon zenith angle based on the current altitude.
   */
  public calcHorizonAngle(): number {
    return Math.acos(6378100 / (6378100 + Math.max(this.activeSimulationContext.altitude, 0)));
  }

  /**
   * Syncs this computer's last known position with a given value.
   * 
   * Has no effect if this system is a replica.
   * @param pos The position with which to sync the last known position. Defaults to the airplane's current position.
   */
  public syncLastKnownPosition(pos: LatLonInterface = this.activeSimulationContext.position): void {
    if (this.syncRole === 'replica') {
      return;
    }

    this.activeSimulationContext.setLastKnownPosition(pos.lat, pos.lon);
  }

  /**
   * Erases this computer's last known position.
   * 
   * Has no effect if this system is a replica.
   */
  public eraseLastKnownPosition(): void {
    if (this.syncRole === 'replica') {
      return;
    }

    this.activeSimulationContext.setLastKnownPosition(NaN, NaN);
  }

  /**
   * Checks whether this computer's downloaded almanac data is valid at a given simulation time.
   * @param simTime The simulation time at which to check for almanac validity, as a Javascript timestamp. Defaults to
   * the current simulation time.
   * @returns Whether this computer's downloaded almanac data is valid at the specified simulation time.
   */
  public isAlmanacValid(simTime = this.activeSimulationContext.time): boolean {
    return this.lastAlamanacTime !== undefined && Math.abs(simTime - this.lastAlamanacTime) < this.satelliteTimingOptions.almanacExpireTime;
  }

  /**
   * Forces this computer to immediately download a complete alamanac.
   * 
   * Has no effect if this system is a replica.
   * @param simTime The simulation time at which the almanac is considered to have been downloaded, as a Javascript
   * timestamp. Defaults to the current simulation time.
   */
  public downloadAlamanac(simTime = this.activeSimulationContext.time): void {
    if (this.syncRole === 'replica') {
      return;
    }

    this.almanacProgress = 0;
    this.lastAlamanacTime = simTime;

    if (this.syncRole === 'primary' && this.sharedGlobalData) {
      this.sharedGlobalData.lastAlmanacTime = simTime;
    }
  }

  /**
   * Erases this computer's downloaded almanac and any partial download progress.
   * 
   * Has no effect if this system is a replica.
   */
  public eraseAlamanac(): void {
    if (this.syncRole === 'replica') {
      return;
    }

    this.almanacProgress = 0;
    this.lastAlamanacTime = undefined;

    if (this.syncRole === 'primary' && this.sharedGlobalData) {
      this.sharedGlobalData.lastAlmanacTime = undefined;
    }
  }

  /**
   * Erases this computer's cached ephemeris data for all satellites.
   * 
   * Has no effect if this system is a replica.
   */
  public eraseCachedEphemeris(): void {
    if (this.syncRole === 'replica') {
      return;
    }

    for (let i = 0; i < this.activeSimulationContext.satellites.length; i++) {
      this.activeSimulationContext.satellites[i].eraseCachedEphemeris();
    }
  }

  /**
   * Sets whether a satellite is manually inhibited. Inhibited satellites cannot be tracked, and therefore cannot be
   * used for position determination, almanac download, or (in the case of SBAS satellites) differential correction
   * download.
   * 
   * Has no effect if this system is a replica.
   * @param prn The PRN (pseudo-random noise) code of the satellite to change.
   * @param inhibit Whether the satellite should be inhibited.
   */
  public setSatelliteInhibit(prn: number, inhibit: boolean): void {
    if (this.syncRole === 'replica') {
      return;
    }

    this.activeSimulationContext.manuallyInhibitedSatellitePrnCodes.toggle(prn, inhibit);
  }

  /**
   * Instantly chooses the optimal satellites to track for all receiver channels, then acquires and downloads all data
   * (ephemeris, almanac, and differential corrections) from tracked satellites with sufficient signal strength. If
   * this system is not initialized, the operation will be delayed until just after initialization, unless `reset()` is
   * called in the interim.
   *
   * Has no effect if this system is a replica.
   */
  public acquireAndUseSatellites(): void {
    if (this.syncRole === 'replica') {
      return;
    }

    if (this.isInit) {
      this.updateSatellites(0, true, true);
    } else {
      this.needAcquireAndUse = true;
    }
  }

  /**
   * Resets the GPSSatComputer system. This will unassign all receiver channels, set the state of every satellite to
   * {@link GPSSatelliteState.None}, and set the state of the system to {@link GPSSystemState.Searching}.
   *
   * If this system is not initialized, this method has no effect other than to cancel any pending operations triggered
   * by previous calls to `acquireAndUseSatellites()`.
   * 
   * Has no effect if this system is a replica.
   */
  public reset(): void {
    if (this.syncRole === 'replica') {
      return;
    }

    this.needAcquireAndUse = false;

    if (!this.isInit) {
      return;
    }

    this.resetState();
  }

  /** @inheritdoc */
  public onUpdate(): void {
    if (!this.isInit) {
      return;
    }

    this.updatePosition();

    if (this.syncRole !== 'replica') {
      const deltaTime = this.previousSimTime === undefined ? undefined : this.activeSimulationContext.time - this.previousSimTime;

      if (deltaTime !== undefined && (deltaTime < 0 || deltaTime > (this.updateInterval * 2))) {
        this.previousSimTime = this.activeSimulationContext.time;
        return;
      }

      // We will update satellite positions if...
      const shouldUpdatePositions
        // ... we've never updated positions before...
        = this.lastUpdateTime === undefined
        // ... OR the difference in time between now and the last update is greater than or equal to the desired update
        // interval...
        || Math.abs(this.activeSimulationContext.time - this.lastUpdateTime) >= this.updateInterval
        // ... OR the current position differs from the position at the last update by at least 10 nautical miles.
        || !this.activeSimulationContext.position.equals(this.lastUpdatePosition, 0.0029069);

      this.updateSatellites(deltaTime ?? 0, shouldUpdatePositions, false);

      if (this.syncRole === 'primary') {
        this.updateSharedData(shouldUpdatePositions);
      }
    } else {
      this.updateFromSharedData();
    }
  }

  /**
   * Updates the spatial and temporal position of this computer's receiver.
   */
  private updatePosition(): void {
    this.activeSimulationContext.setPosition(
      this.latSimVar.get(),
      this.lonSimVar.get(),
      this.altSimVar.get(),
      this.simTimeSource.get()
    );
  }

  /**
   * Updates the states and optionally the orbital positions of all satellites.
   * @param deltaTime The time elapsed, in milliseconds, since the last satellite update.
   * @param shouldUpdatePositions Whether to update the orbital positions of the satellites.
   * @param forceAcquireAndUse Whether to immediately choose the optimal satellites to track for all receiver channels,
   * then acquire and download all data (ephemeris, almanac, and differential corrections) from tracked satellites with
   * sufficient signal strength.
   */
  private updateSatellites(deltaTime: number, shouldUpdatePositions: boolean, forceAcquireAndUse: boolean): void {
    this.activeSimulationContext.isAlmanacValid = this.isAlmanacValid();

    this.activeSimulationContext.update(deltaTime, shouldUpdatePositions, forceAcquireAndUse);

    this.updateAlmanacState(deltaTime, forceAcquireAndUse);

    this.diffAndPublishSatelliteStates();

    this._state.set(this.activeSimulationContext.systemState);

    this._sbasState.set(this.activeSimulationContext.sbasState);

    if (shouldUpdatePositions) {
      this.lastUpdatePosition.set(this.activeSimulationContext.position);
      this.lastUpdateTime = this.activeSimulationContext.time;
      this.publisher.pub(this.satPosCalcTopic, undefined, false, false);
    }

    this._covarMatrix.set(this.activeSimulationContext.covarMatrix);

    const dops = this.activeSimulationContext.dops;
    this.setDop(dops[0], dops[1], dops[2]);

    this.previousSimTime = this.activeSimulationContext.time;
  }

  private static readonly COLLECTING_DATA_SATELLITE_STATES = new Set([
    GPSSatelliteState.Acquired,
    GPSSatelliteState.DataCollected,
    GPSSatelliteState.InUse,
    GPSSatelliteState.InUseDiffApplied
  ]);

  private readonly collectingDataSatelliteFilter = (sat: GPSSatellite | null): boolean => {
    return sat !== null && GPSSatComputer.COLLECTING_DATA_SATELLITE_STATES.has(sat.state.get());
  };

  /**
   * Updates the almanac download state.
   * @param deltaTime The time elapsed, in milliseconds, since the last update.
   * @param forceDownload Whether to force the entire almanac to be instantly downloaded.
   */
  private updateAlmanacState(deltaTime: number, forceDownload: boolean): void {
    if (forceDownload) {
      this.lastAlamanacTime = this.activeSimulationContext.time;
      this.almanacProgress = 0;
    } else {
      const isCollectingData = this.activeSimulationContext.channels.some(this.collectingDataSatelliteFilter);

      if (isCollectingData) {
        this.almanacProgress += deltaTime / this.satelliteTimingOptions.almanacDownloadTime;
        if (this.almanacProgress >= 1) {
          this.lastAlamanacTime = this.activeSimulationContext.time;
          this.almanacProgress -= 1;
        }
      } else {
        this.almanacProgress = 0;
      }
    }
  }

  /**
   * Updates this computer's associated shared data object with the current state of this computer. If the shared data
   * object is not defined, then this method does nothing.
   * @param areSatellitePositionsUpdated Whether satellite positions have been updated since the last time the shared
   * data object was updated.
   */
  private updateSharedData(areSatellitePositionsUpdated: boolean): void {
    if (!this.sharedGlobalData) {
      return;
    }

    {
      const enabledSbasGroups = this.activeSimulationContext.enabledSbasGroups.get();
      this.sharedGlobalData.enabledSbasGroups.length = enabledSbasGroups.size;

      let index = 0;
      for (const group of enabledSbasGroups) {
        this.sharedGlobalData.enabledSbasGroups[index++] = group;
      }
    }

    {
      this.sharedGlobalData.manuallyInhibitedSatellitePrnCodes.length = this.activeSimulationContext.manuallyInhibitedSatellitePrnCodes.size;

      let index = 0;
      for (const code of this.activeSimulationContext.manuallyInhibitedSatellitePrnCodes.get()) {
        this.sharedGlobalData.manuallyInhibitedSatellitePrnCodes[index++] = code;
      }
    }

    const channels = this.activeSimulationContext.channels;
    for (let i = 0; i < channels.length; i++) {
      const satellite = channels[i];
      this.sharedGlobalData.channelAssignments[i] = satellite === null ? null : satellite.prn;
    }

    // NOTE: We don't need to explicitly update satellite data because primary computers use and manipulate the
    // satellite data stored in the shared global directly.

    this.sharedGlobalData.lastAlmanacTime = this.lastAlamanacTime;

    if (areSatellitePositionsUpdated) {
      ++this.sharedGlobalData.satellitePositionUpdateId;
    }

    this.sharedGlobalData.state = this._state.get();
    this.sharedGlobalData.sbasState = this._sbasState.get();

    this.sharedGlobalData.covarMatrix.set(this._covarMatrix.get());
    this.sharedGlobalData.pdop = this._pdop.get();
    this.sharedGlobalData.hdop = this._hdop.get();
    this.sharedGlobalData.vdop = this._vdop.get();
  }

  /**
   * Updates this computer from its associated shared data object. If the shared data object is not defined, then this
   * method does nothing.
   */
  private updateFromSharedData(): void {
    if (!this.sharedGlobalData) {
      return;
    }

    this.activeSimulationContext.enabledSbasGroups.set(this.sharedGlobalData.enabledSbasGroups);

    this.activeSimulationContext.manuallyInhibitedSatellitePrnCodes.set(this.sharedGlobalData.manuallyInhibitedSatellitePrnCodes);

    const satellites = this.activeSimulationContext.satellites;
    const channels = this.activeSimulationContext.channels;

    for (let i = 0; i < channels.length; i++) {
      const assignment = this.sharedGlobalData.channelAssignments[i];
      if (assignment === null) {
        channels[i] = null;
      } else {
        channels[i] = satellites[this.activeSimulationContext.getSatelliteIndexFromPrn(assignment)] ?? null;
      }
    }

    for (let i = 0; i < satellites.length; i++) {
      satellites[i].updateStateFromData(this.sharedGlobalData.satellites[i]);
    }

    this.lastAlamanacTime = this.sharedGlobalData.lastAlmanacTime;
    this.activeSimulationContext.isAlmanacValid = this.isAlmanacValid();

    this.diffAndPublishSatelliteStates();

    this._state.set(this.sharedGlobalData.state);

    this._sbasState.set(this.sharedGlobalData.sbasState);

    if (this.lastSatellitePositionUpdateId !== this.sharedGlobalData.satellitePositionUpdateId) {
      this.lastSatellitePositionUpdateId = this.sharedGlobalData.satellitePositionUpdateId;
      this.publisher.pub(this.satPosCalcTopic, undefined, false, false);
    }

    this._covarMatrix.set(this.sharedGlobalData.covarMatrix);

    this.setDop(this.sharedGlobalData.pdop, this.sharedGlobalData.hdop, this.sharedGlobalData.vdop);

    this.previousSimTime = this.activeSimulationContext.time;
  }

  /**
   * For each satellite, checks if its state is different from the most recently published state, and if so publishes
   * the new state. If this computer's sync role is `primary`, then a satellite state sync event will be published
   * alongside any regular state events.
   */
  private diffAndPublishSatelliteStates(): void {
    const satellites = this.activeSimulationContext.satellites;
    for (let i = 0; i < satellites.length; i++) {
      const sat = satellites[i];
      const state = sat.state.get();

      if (this.publishedSatStates[i] !== state) {
        this.publishedSatStates[i] = state;
        this.publisher.pub(this.satStateChangedTopic, sat, false, false);
      }
    }
  }

  /**
   * Sets this system's dilution of precision values, and if they are different from the current values, publishes the
   * new values to the event bus.
   * @param pdop The position DOP value to set.
   * @param hdop The horizontal DOP value to set.
   * @param vdop The vertical DOP value to set.
   */
  private setDop(pdop: number, hdop: number, vdop: number): void {
    this._pdop.set(pdop);
    this._hdop.set(hdop);
    this._vdop.set(vdop);
  }

  /**
   * Clones a satellite data object. All immutable properties on the cloned object will be inherited from the original
   * object. All mutable properties on the cloned object will be initialized to default values.
   * @param data The object to clone.
   * @returns A new satellite data object.
   */
  private static cloneSatelliteData(data: SatelliteData): SatelliteData {
    return {
      prn: data.prn,
      sbasGroup: data.sbasGroup,
      ephemeris: data.ephemeris,
      timingOptions: data.timingOptions,
      state: GPSSatelliteState.None,
      positionCartesian: data.sbasGroup === undefined ? Vec3Math.create() : new Float64Array(data.positionCartesian),
      position: Vec2Math.create(),
      signalStrength: 0,
      isTracked: false,
      areDiffCorrectionsDownloaded: false,
      lastEphemerisTime: undefined,
      lastUnreachableTime: undefined,
      timeSpentAcquiring: undefined,
      timeToAcquire: undefined,
      timeToDownloadEphemeris: undefined,
      timeToDownloadCorrections: undefined,
    };
  }
}

/**
 * The GPS ephemeris data epoch.
 */
export interface GPSEpoch {
  /** The epoch year. */
  year: number;

  /** The epoch month. */
  month: number;

  /** The epoch day. */
  day: number;

  /** The epoch hour. */
  hour: number;

  /** The epoch minute. */
  minute: number;

  /** The epoch second. */
  second: number;
}

/**
 * Data about the GPS satellite clock.
 */
export interface GPSSVClock {
  /** The current clock bias. */
  bias: number,

  /** The current amount of clock drift. */
  drift: number,

  /** The current rate of clock drift. */
  driftRate: number
}

/**
 * A GPS ephemeris data record.
 */
export interface GPSEphemeris {
  /** The GPS epoch for this ephemeris record. */
  epoch: GPSEpoch;

  /** The GPS satellite clock metadata at the time of the record. */
  svClock: GPSSVClock;

  /** IODE Issue of Data, Ephemeris */
  iodeIssueEphemeris: number;

  /** Crs */
  crs: number;

  /** Delta N */
  deltaN: number;

  /** M0 */
  m0: number;

  /** Cuc */
  cuc: number;

  /** e */
  eEccentricity: number;

  /** Cus */
  cus: number;

  /** Square root of A */
  sqrtA: number;

  /** toe */
  toeTimeEphemeris: number;

  /** Cic */
  cic: number;

  /** OMEGA */
  omegaL: number;

  /** Cis */
  cis: number;

  /** i0 */
  i0: number;

  /** Crc */
  crc: number;

  /** omega */
  omegaS: number;

  /** OMEGA dot */
  omegaLDot: number;

  /** IDOT */
  idot: number;

  /** Codes on the GPS L2 channel */
  codesOnL2Channel: number;

  /** The GPS week number */
  gpsWeekNumber: number;

  /** LP2 Data flag */
  l2PDataFlag: number;

  /** Accuracy metadata */
  svAccuracy: number;

  /** Health metadata */
  svHealth: number;

  /** tgd */
  tgd: number;

  /** IODE Issue of Data, Clock */
  iodeIssueClock: number;

  /** Transmission time of the ephemeris message */
  transmissionTimeOfMessage: number;
}

/**
 * A collection of GPS ephemeris records.
 */
export interface GPSEphemerisRecords {
  [index: string]: GPSEphemeris
}

// TODO: Need to refactor the API for this so we only expose an interface for GPSSatellite instead of a class. Right
// now consumers of the API have way too much access to what should be internal-only methods on the satellite. We can't
// revoke the access without breaking backward compatibility, though.

/**
 * A tracked GPS satellite.
 */
export class GPSSatellite {
  private readonly vec3Cache = [new Float64Array(3), new Float64Array(3), new Float64Array(3), new Float64Array(3), new Float64Array(3)];

  /** The GPS PRN number for this satellite. */
  public readonly prn = this.data.prn;

  /** The SBAS group to which this satellite belongs, or `undefined` if this satellite is not an SBAS satellite. */
  public readonly sbasGroup = this.data.sbasGroup;

  /** The current satellite state. */
  public readonly state = Subject.create<GPSSatelliteState>(this.data.state);

  /** The current satellite position, in zenith angle radians and hour angle radians. */
  public readonly position = Vec2Subject.create(new Float64Array(this.data.position));

  /** The current satellite position, in cartesian coordinates. */
  public readonly positionCartesian = Vec3Subject.create(new Float64Array(this.data.positionCartesian));

  /** The current satellite signal strength. */
  public readonly signalStrength = Subject.create(this.data.signalStrength);

  // eslint-disable-next-line jsdoc/require-returns
  /**
   * The most recent simulation time at which this satellite's ephemeris was downloaded, as a Javascript timestamp, or
   * `undefined` if this satellite's ephemeris has not yet been downloaded.
   */
  public get lastEphemerisTime(): number | undefined {
    return this.data.lastEphemerisTime;
  }

  // eslint-disable-next-line jsdoc/require-returns
  /**
   * The most recent simulation time at which this satellite was confirmed to be unreachable, as a Javascript
   * timestamp, or `undefined` if this satellite has not been confirmed to be unreachable.
   */
  public get lastUnreachableTime(): number | undefined {
    return this.data.lastUnreachableTime;
  }

  // eslint-disable-next-line jsdoc/require-returns
  /** Whether SBAS differential correction data have been downloaded from this satellite. */
  public get areDiffCorrectionsDownloaded(): boolean {
    return this.data.areDiffCorrectionsDownloaded;
  }

  private hasComputedPosition = false;

  /**
   * Creates a new instance of GPSSatellite.
   * @param data The data object used to hold the state of this satellite.
   */
  public constructor(private readonly data: SatelliteData) { }

  /**
   * Computes the current satellite positions given the loaded ephemeris data.
   * @param simTime The current simulator time, in milliseconds UNIX epoch
   */
  public computeSatellitePositions(simTime: number): void {
    const record = this.data.ephemeris;
    if (record !== undefined) {
      const mu = 3.986005e14; //WGS84 gravitational constant for GPS user (meters3/sec2)
      const omegae_dot = 7.2921151467e-5; //WGS84 earth rotation rate (rad/sec)

      // Restore semi-major axis
      const a = record.sqrtA * record.sqrtA;

      // Computed mean motion
      const n0 = Math.sqrt(mu / (a * a * a));

      // Time from ephemeris reference epoch
      const now = simTime / 1000;

      const t = (now - (86400 * 3) + 1735) % 604800;
      let tk = t - record.toeTimeEphemeris;
      if (tk > 302400) {
        tk -= 604800;
      } else if (tk < -302400) {
        tk += 604800;
      }

      // Corrected mean motion
      const n = n0 + record.deltaN;

      // Mean anomaly
      const M = record.m0 + n * tk;

      // Initial guess of eccentric anomaly
      let E = M;
      let E_old;
      let dE;

      // Iterative computation of eccentric anomaly
      for (let i = 1; i < 20; i++) {
        E_old = E;
        E = M + record.eEccentricity * Math.sin(E);
        dE = E - E_old % (2.0 * Math.PI);
        if (Math.abs(dE) < 1e-12) {
          // Necessary precision is reached, exit from the loop
          break;
        }
      }

      const sek = Math.sin(E);
      const cek = Math.cos(E);
      const OneMinusecosE = 1.0 - record.eEccentricity * cek;
      const sq1e2 = Math.sqrt(1.0 - record.eEccentricity * record.eEccentricity);

      // Compute the true anomaly
      const tmp_Y = sq1e2 * sek;
      const tmp_X = cek - record.eEccentricity;
      const nu = Math.atan2(tmp_Y, tmp_X);

      // Compute angle phi (argument of Latitude)
      const phi = nu + record.omegaS;

      // Reduce phi to between 0 and 2*pi rad
      const s2pk = Math.sin(2.0 * phi);
      const c2pk = Math.cos(2.0 * phi);

      // Correct argument of latitude
      const u = phi + record.cuc * c2pk + record.cus * s2pk;
      const suk = Math.sin(u);
      const cuk = Math.cos(u);

      // Correct radius
      const r = a * OneMinusecosE + record.crc * c2pk + record.crs * s2pk;

      // Correct inclination
      const i = record.i0 + record.idot * tk + record.cic * c2pk + record.cis * s2pk;
      const sik = Math.sin(i);
      const cik = Math.cos(i);

      // Compute the angle between the ascending node and the Greenwich meridian
      const Omega_dot = record.omegaLDot - omegae_dot;
      const Omega = record.omegaL + Omega_dot * tk - omegae_dot * record.toeTimeEphemeris;

      const sok = Math.sin(Omega);
      const cok = Math.cos(Omega);

      //Compute satellite coordinates in Earth-fixed coordinates
      const xprime = r * cuk;
      const yprime = r * suk;

      const x = xprime * cok - yprime * cik * sok;
      const y = xprime * sok + yprime * cik * cok;
      const z = yprime * sik;

      Vec3Math.set(
        UnitType.METER.convertTo(x, UnitType.GA_RADIAN),
        UnitType.METER.convertTo(y, UnitType.GA_RADIAN),
        UnitType.METER.convertTo(z, UnitType.GA_RADIAN),
        this.data.positionCartesian
      );

      this.positionCartesian.set(this.data.positionCartesian);
    }
  }

  /**
   * Applies a projection to the satellite cartesian coordinates to convert to zenith and hour angles.
   * @param ppos The current plane position.
   * @param altitude The current plane altitude in meters.
   */
  public applyProjection(ppos: GeoPoint, altitude: number): void {
    const satPos = this.positionCartesian.get();

    const altRadians = UnitType.METER.convertTo(altitude, UnitType.GA_RADIAN);
    const pposCartesian = Vec3Math.multScalar(ppos.toCartesian(this.vec3Cache[0]), 1 + altRadians, this.vec3Cache[0]);
    const delta = Vec3Math.normalize(Vec3Math.sub(satPos, pposCartesian, this.vec3Cache[1]), this.vec3Cache[1]);

    const zenithAngle = Math.acos(Vec3Math.dot(delta, Vec3Math.normalize(pposCartesian, this.vec3Cache[2])));

    const satPos0 = Vec3Math.normalize(satPos, this.vec3Cache[1]);
    const northPole = Vec3Math.set(0, 0, 1, this.vec3Cache[2]);

    if (Math.abs(zenithAngle) < 1e-8 || Math.abs(zenithAngle - 180) < 1e-8) {
      Vec2Math.set(zenithAngle, 0, this.data.position);
    } else {
      const A = Vec3Math.normalize(Vec3Math.cross(pposCartesian, northPole, this.vec3Cache[3]), this.vec3Cache[3]);
      const B = Vec3Math.normalize(Vec3Math.cross(pposCartesian, satPos0, this.vec3Cache[4]), this.vec3Cache[4]);

      const signBz = B[2] >= 0 ? 1 : -1;
      const hourAngle = Math.acos(Vec3Math.dot(A, B)) * signBz;

      Vec2Math.set(zenithAngle, -hourAngle, this.data.position);
    }

    this.position.set(this.data.position);

    this.hasComputedPosition = true;
  }

  /**
   * Calculates the current signal strength.
   * @param invMaxZenithAngle The inverse of the maximum zenith angle at which a satellite can still have line of sight, in radians.
   */
  public calculateSignalStrength(invMaxZenithAngle: number): void {
    if (this.hasComputedPosition) {
      this.data.signalStrength = Math.max(0, 1 - (this.position.get()[0] * invMaxZenithAngle));

      this.signalStrength.set(this.data.signalStrength);
    }
  }

  /**
   * Calculates the horizon zenith angle.
   * @param altitude The altitude, in meters.
   * @returns The calculated horizon zenith angle based on the current altitude.
   */
  public static calcHorizonAngle(altitude: number): number {
    return Math.acos(6378100 / (6378100 + Math.max(altitude, 0)));
  }

  /**
   * Checks whether this satellite's cached ephemeris data is valid at a given simulation time.
   * @param simTime The simulation time at which to check for ephemeris validity, as a Javascript timestamp.
   * @returns Whether this satellite's cached ephemeris data is valid at the specified simulation time.
   */
  public isCachedEphemerisValid(simTime: number): boolean {
    return this.data.lastEphemerisTime !== undefined && Math.abs(simTime - this.data.lastEphemerisTime) < this.data.timingOptions.ephemerisExpireTime;
  }

  /**
   * Erases this satellite's cached ephemeris data.
   */
  public eraseCachedEphemeris(): void {
    this.data.lastEphemerisTime = undefined;
  }

  /**
   * Sets whether this satellite is being tracked by a receiver channel.
   * @param tracked Whether this satellite is being tracked by a receiver channel.
   */
  public setTracked(tracked: boolean): void {
    if (this.data.isTracked === tracked) {
      return;
    }

    this.data.isTracked = tracked;

    this.data.areDiffCorrectionsDownloaded = false;

    this.data.timeSpentAcquiring = undefined;
    this.data.timeToAcquire = undefined;
    this.data.timeToDownloadEphemeris = undefined;
    this.data.timeToDownloadCorrections = undefined;

    if (tracked || this.data.state !== GPSSatelliteState.Unreachable) {
      this.state.set(this.data.state = GPSSatelliteState.None);
    }
  }

  /**
   * Updates the state of the satellite.
   * @param simTime The current simulation time, as a Javascript timestamp.
   * @param deltaTime The amount of sim time that has elapsed since the last update, in milliseconds.
   * @param distanceFromLastKnownPos The distance, in great-arc radians, from the airplane's current actual position to
   * its last known position.
   * @param forceAcquireAndUse Whether to force this satellite to the highest possible use state
   * ({@link GPSSatelliteState.DataCollected}) if signal strength is sufficient.
   * @returns Whether this satellite's state changed as a result of the update.
   */
  public updateState(simTime: number, deltaTime: number, distanceFromLastKnownPos: number, forceAcquireAndUse: boolean): boolean {
    const stateChanged = this.data.isTracked
      ? this.updateStateTracked(simTime, deltaTime, distanceFromLastKnownPos, forceAcquireAndUse)
      : this.updateStateUntracked(simTime);

    switch (this.state.get()) {
      case GPSSatelliteState.Unreachable:
        if (this.data.isTracked) {
          this.data.lastUnreachableTime = simTime;
        }
        break;
      case GPSSatelliteState.DataCollected:
      case GPSSatelliteState.InUse:
      case GPSSatelliteState.InUseDiffApplied:
        this.data.lastEphemerisTime = simTime;
        break;
    }

    return stateChanged;
  }

  /**
   * Updates the state of the satellite while it is being tracked.
   * @param simTime The current simulation time, as a Javascript timestamp.
   * @param deltaTime The amount of sim time that has elapsed since the last update, in milliseconds.
   * @param distanceFromLastKnownPos The distance, in great-arc radians, from the airplane's current actual position to
   * its last known position.
   * @param forceAcquireAndUse Whether to force this satellite to the highest possible use state
   * ({@link GPSSatelliteState.DataCollected}) if signal strength is sufficient.
   * @returns Whether this satellite's state changed as a result of the update.
   */
  private updateStateTracked(simTime: number, deltaTime: number, distanceFromLastKnownPos: number, forceAcquireAndUse: boolean): boolean {
    const reachable = this.data.signalStrength > 0.05;

    if (forceAcquireAndUse) {
      const state = this.data.state;
      if (reachable) {
        if (this.data.sbasGroup !== undefined) {
          this.data.areDiffCorrectionsDownloaded = true;
          this.data.timeToDownloadCorrections = undefined;
        }

        if (state !== GPSSatelliteState.DataCollected) {
          this.data.timeSpentAcquiring = undefined;
          this.data.timeToAcquire = undefined;
          this.data.timeToDownloadEphemeris = undefined;

          this.state.set(this.data.state = GPSSatelliteState.DataCollected);
          return true;
        }
      } else {
        if (state !== GPSSatelliteState.Unreachable) {
          this.data.timeSpentAcquiring = undefined;
          this.data.timeToAcquire = undefined;
          this.data.timeToDownloadEphemeris = undefined;
          this.data.areDiffCorrectionsDownloaded = false;
          this.data.timeToDownloadCorrections = undefined;

          this.state.set(this.data.state = GPSSatelliteState.Unreachable);
          return true;
        }
      }
    } else {
      switch (this.data.state) {
        case GPSSatelliteState.None:
          if (this.data.timeSpentAcquiring === undefined) {
            this.data.timeSpentAcquiring = 0;
          }

          this.data.timeSpentAcquiring += deltaTime;

          if (reachable) {
            if (this.data.timeToAcquire === undefined) {
              this.data.timeToAcquire = distanceFromLastKnownPos < 5.80734e-4 /* 2 nautical miles */ && this.isCachedEphemerisValid(simTime)
                ? this.data.timingOptions.acquisitionTimeWithEphemeris + (Math.random() - 0.5) * this.data.timingOptions.acquisitionTimeRangeWithEphemeris
                : this.data.timingOptions.acquisitionTime + (Math.random() - 0.5) * this.data.timingOptions.acquisitionTimeRange;
            }

            this.data.timeToAcquire -= deltaTime;

            if (this.data.timeToAcquire <= 0) {
              this.data.timeSpentAcquiring = undefined;
              this.data.timeToAcquire = undefined;

              // If we have valid cached ephemeris data for this satellite, then we can use the cached data for
              // calculating position solutions immediately instead of having to wait to download new ephemeris data.
              if (this.isCachedEphemerisValid(simTime)) {
                this.data.state = GPSSatelliteState.DataCollected;
              } else {
                this.data.state = GPSSatelliteState.Acquired;
              }

              this.state.set(this.data.state);

              return true;
            }
          } else {
            this.data.timeToAcquire = undefined;

            if (this.data.timeSpentAcquiring >= this.data.timingOptions.acquisitionTimeout) {
              this.data.timeSpentAcquiring = undefined;
              this.state.set(this.data.state = GPSSatelliteState.Unreachable);
              return true;
            }
          }
          break;
        case GPSSatelliteState.Unreachable:
          if (this.data.lastUnreachableTime === undefined) {
            this.data.lastUnreachableTime = simTime;
          } else if (Math.abs(simTime - this.data.lastUnreachableTime) >= this.data.timingOptions.unreachableExpireTime) {
            this.data.lastUnreachableTime = undefined;
            this.state.set(this.data.state = GPSSatelliteState.None);
            return true;
          }
          break;
        case GPSSatelliteState.Acquired:
          if (!reachable) {
            this.data.timeToDownloadEphemeris = undefined;
            this.data.areDiffCorrectionsDownloaded = false;
            this.data.timeToDownloadCorrections = undefined;
            this.state.set(this.data.state = GPSSatelliteState.None);
            return true;
          } else {
            if (this.data.timeToDownloadEphemeris === undefined) {
              this.data.timeToDownloadEphemeris = this.data.sbasGroup === undefined
                ? this.data.timingOptions.ephemerisDownloadTime
                : this.data.timingOptions.sbasEphemerisDownloadTime + (Math.random() - 0.5) * this.data.timingOptions.sbasEphemerisDownloadTimeRange;
            }

            this.data.timeToDownloadEphemeris -= deltaTime;

            this.updateSbasCorrectionsDownload(deltaTime);

            if (this.data.timeToDownloadEphemeris <= 0) {
              this.data.timeToDownloadEphemeris = undefined;
              this.state.set(this.data.state = GPSSatelliteState.DataCollected);
              return true;
            }
          }
          break;
        case GPSSatelliteState.DataCollected:
          if (!reachable) {
            this.data.areDiffCorrectionsDownloaded = false;
            this.data.timeToDownloadCorrections = undefined;
            this.state.set(this.data.state = GPSSatelliteState.None);
            return true;
          } else {
            this.updateSbasCorrectionsDownload(deltaTime);
          }
          break;
        case GPSSatelliteState.InUse:
          if (!reachable) {
            this.data.areDiffCorrectionsDownloaded = false;
            this.data.timeToDownloadCorrections = undefined;
            this.state.set(this.data.state = GPSSatelliteState.None);
            return true;
          } else {
            this.updateSbasCorrectionsDownload(deltaTime);
          }
          break;
        case GPSSatelliteState.InUseDiffApplied:
          if (!reachable) {
            this.data.areDiffCorrectionsDownloaded = false;
            this.data.timeToDownloadCorrections = undefined;
            this.state.set(this.data.state = GPSSatelliteState.None);
            return true;
          } else {
            this.updateSbasCorrectionsDownload(deltaTime);
          }
          break;
      }
    }

    return false;
  }

  /**
   * Updates the download state of SBAS differential corrections from this satellite.
   * @param deltaTime The amount of sim time that has elapsed since the last update, in milliseconds.
   */
  private updateSbasCorrectionsDownload(deltaTime: number): void {
    if (this.data.sbasGroup === undefined || this.data.areDiffCorrectionsDownloaded) {
      return;
    }

    if (this.data.timeToDownloadCorrections === undefined) {
      this.data.timeToDownloadCorrections = this.data.timingOptions.sbasCorrectionDownloadTime + (Math.random() - 0.5) * this.data.timingOptions.sbasCorrectionDownloadTimeRange;
    }

    this.data.timeToDownloadCorrections -= deltaTime;
    if (this.data.timeToDownloadCorrections <= 0) {
      this.data.areDiffCorrectionsDownloaded = true;
      this.data.timeToDownloadCorrections = undefined;
    }
  }

  /**
   * Updates the state of the satellite while it is not being tracked.
   * @param simTime The current simulation time, as a Javascript timestamp.
   * @returns Whether this satellite's state changed as a result of the update.
   */
  private updateStateUntracked(simTime: number): boolean {
    if (this.data.state === GPSSatelliteState.Unreachable) {
      if (this.data.lastUnreachableTime === undefined) {
        this.data.lastUnreachableTime = simTime;
      } else if (Math.abs(simTime - this.data.lastUnreachableTime) >= this.data.timingOptions.unreachableExpireTime) {
        this.data.lastUnreachableTime = undefined;
        this.state.set(this.data.state = GPSSatelliteState.None);
        return true;
      }
    }

    return false;
  }

  /**
   * Forces an update of this satellite's state to a specific value.
   * @param simTime The current simulation time, as a Javascript timestamp.
   * @param state The state to which to update this satellite. Defaults to this satellite's current state.
   * @param areDiffCorrectionsDownloaded Whether to force differential corrections to be downloaded. Defaults to the
   * satellite's current differential corrections download state.
   * @returns Whether this satellite's state changed as a result of the update.
   * @deprecated Do not use.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public forceUpdateState(simTime: number, state?: GPSSatelliteState, areDiffCorrectionsDownloaded?: boolean): boolean {
    return false;
  }

  /**
   * Updates this satellite's state to be equal to that defined by a given satellite data object.
   * @param data The data object describing the state from which to update this satellite.
   * @returns Whether this satellite's state changed as a result of the update.
   */
  public updateStateFromData(data: SatelliteData): boolean {
    const oldState = this.data.state;

    this.positionCartesian.set(Vec3Math.copy(data.positionCartesian, this.data.positionCartesian));
    this.position.set(Vec2Math.copy(data.position, this.data.position));

    this.signalStrength.set(this.data.signalStrength = data.signalStrength);

    this.data.isTracked = data.isTracked;
    this.data.areDiffCorrectionsDownloaded = data.areDiffCorrectionsDownloaded;

    this.data.lastEphemerisTime = data.lastEphemerisTime;
    this.data.lastUnreachableTime = data.lastUnreachableTime;

    this.data.timeSpentAcquiring = data.timeSpentAcquiring;
    this.data.timeToAcquire = data.timeToAcquire;
    this.data.timeToDownloadEphemeris = data.timeToDownloadEphemeris;
    this.data.timeToDownloadCorrections = data.timeToDownloadCorrections;

    this.state.set(this.data.state = data.state);

    return this.data.state !== oldState;
  }

  /**
   * Updates whether this satellite is being used to calculate a position solution.
   * @param inUse Whether the satellite is being used to calculate a position solution.
   * @returns Whether this satellite's state changed as a result of the update.
   */
  public updateInUse(inUse: boolean): boolean {
    if (inUse) {
      if (this.state.get() === GPSSatelliteState.DataCollected) {
        this.state.set(GPSSatelliteState.InUse);
        return true;
      }
    } else {
      switch (this.state.get()) {
        case GPSSatelliteState.InUse:
        case GPSSatelliteState.InUseDiffApplied:
          this.state.set(GPSSatelliteState.DataCollected);
          return true;
      }
    }

    return false;
  }

  /**
   * Updates whether differential corrections are applied to this satellite's ranging data when they are used to
   * calculate a position solution.
   * @param apply Whether differential corrections are applied.
   * @returns Whether this satellite's state changed as a result of the update.
   */
  public updateDiffCorrectionsApplied(apply: boolean): boolean {
    switch (this.state.get()) {
      case GPSSatelliteState.InUse:
        if (apply) {
          this.state.set(GPSSatelliteState.InUseDiffApplied);
          return true;
        }
        break;
      case GPSSatelliteState.InUseDiffApplied:
        if (!apply) {
          this.state.set(GPSSatelliteState.InUse);
          return true;
        }
        break;
    }

    return false;
  }

  /**
   * Resets this satellite to be untracked and sets this satellite's state to {@link GPSSatelliteState.None}.
   */
  public resetState(): void {
    this.setTracked(false);
    this.data.state = GPSSatelliteState.None;
    this.state.set(this.data.state);
  }
}

/**
 * A context used to simulate GPS satellites and their interactions with a GPS receiver.
 */
class SatelliteSimulationContext {
  /** The maximum number of satellites to use for position solution calculations. */
  public satInUseMaxCount = Infinity;

  /**
   * The maximum PDOP to target when selecting satellites to use for position solution calculations. Additional
   * satellites will be selected while PDOP is greater than the target or the number of selected satellites is less
   * than the optimum count (`satInUseOptimumCount`). Values less than or equal to zero will cause all possible
   * satellites to be selected up to the maximum count (`satInUseMaxCount`).
   */
  public satInUsePdopTarget = -1;

  /**
   * The optimum number of satellites to use for position solution calculations when targeting a maximum PDOP value.
   * Additional satellites will be selected while PDOP is greater than the target (`satInUsePdopTarget`) or the number
   * of selected satellites is less than the optimum count.
   */
  public satInUseOptimumCount = 4;

  /**
   * The SBAS constellation data used by this context.
   */
  public readonly sbasData: SBASGroupDefinition[] = [];

  private readonly sbasServiceAreas = new Map<string, ReadonlyFloat64Array[]>();

  /**
   * This context's currently enabled SBAS groups. SBAS satellites that belong to groups that are not enabled are
   * inhibited from being tracked by this context's receiver.
   */
  public readonly enabledSbasGroups = SetSubject.create<string>();

  private readonly currentAvailableSbasGroups = new Set<string>();

  /**
   * The SBAS groups from which differential corrections have been downloaded as of the most recent update simulated by
   * this context.
   */
  public readonly diffCorrectionsSbasGroups = new Set<string>();

  /**
   * The PRN codes of all satellites that are manually inhibited from being tracked by this context's receiver.
   */
  public readonly manuallyInhibitedSatellitePrnCodes = SetSubject.create<number>();

  private readonly sbasGroupInhibitedSatellitePrnCodes = SetSubject.create<number>();

  /** The data objects used to initialize this context's satellites. */
  public readonly satelliteData: SatelliteData[] = [];

  /** The number of non-SBAS satellites supported by this context. */
  public nonSbasSatelliteCount = 0;

  /** The number of SBAS satellites supported by this context. */
  public sbasSatelliteCount = 0;

  /** This context's satellites. All non-SBAS satellites appear in the array before all SBAS satellites. */
  public readonly satellites: GPSSatellite[] = [];

  private readonly satellitePrnMap = new Map<number, number>();

  /** The total number of receiver channels used by this context. */
  public totalChannelCount = 0;

  /**
   * The number of receiver channels used by this context that can only track SBAS satellites, or `null` if all
   * receiver channels can track both SBAS and non-SBAS satellites. 
   */
  public sbasChannelCount: number | null = null;

  /**
   * The current satellites assigned to each receiver channel. If channels are split into non-SBAS and SBAS channels
   * (i.e. if `sbasChannelCount` is not null), then all non-SBAS channels are ordered before all SBAS channels in the
   * array.
   */
  public readonly channels: (GPSSatellite | null)[] = [];

  /** The lateral position (latitude and longitude) of this context's receiver. */
  public readonly position = new GeoPoint(0, 0);
  private readonly positionVec = Vec2Math.create();

  /** The altitude of this context's receiver, in meters above MSL. */
  public altitude = 0;

  /** The time point of this context's receiver, as a Javascript timestamp. */
  public time = 0;

  private readonly lastKnownPosition = new GeoPoint(NaN, NaN);
  private distanceFromLastKnownPos = 0;

  /** Whether this context's receiver has access to a valid almanac. */
  public isAlmanacValid = false;

  /** The most recent GPS system state simulated by this context. */
  public systemState = GPSSystemState.Searching;

  /** The most recent GPS system SBAS state simulated by this context. */
  public sbasState = GPSSystemSBASState.Disabled;

  /**
   * The covariance matrix calculated from the satellite constellation used to produce a position solution in the most
   * recent update simulated by this context, represented as a 16-element vector. The matrix is organized such that
   * row/column 1 represents spatial axis **x** (parallel to Earth's surface, positive points toward true north),
   * row/column 2 represents spatial axis **y** (parallel to Earth's surface, positive points toward the east),
   * row/column 3 represents spatial axis **z** (perpendicular to Earth's surface, positive points upward), and
   * row/column 4 represents the temporal axis. The element at row `i`, column `j` of the covariance matrix is
   * represented by the element at index `i * 4 + j` in the vector (i.e. the vector is filled from the matrix in
   * row-major order). If the most recent simulated constellation was not sufficient to produce a position solution,
   * then all elements of the vector will be `NaN`.
   */
  public readonly covarMatrix = VecNMath.create(16).fill(NaN);

  /**
   * The dilution of precision values calculated from the satellite constellation used to produce a position solution
   * in the most recent update simulated by this context, as `[PDOP, HDOP, VDOP]`. If the most recent simulated
   * constellation was not sufficient to produce a position solution, then all elements of the vector will be `-1`.
   */
  public readonly dops = Vec3Math.create();

  /**
   * Initializes the SBAS constellation data used by this context. Any existing data will be replaced.
   * @param sbasData The SBAS constellation data to use.
   */
  public initSbasData(sbasData: readonly SBASGroupDefinition[]): void {
    ArrayUtils.shallowCopy(sbasData, this.sbasData);

    this.sbasServiceAreas.clear();
    for (const sbasDef of sbasData) {
      this.sbasServiceAreas.set(sbasDef.group, sbasDef.coverage);
    }
  }

  /**
   * Initializes this context's satellites from satellite data objects. Any existing satellites will be replaced.
   * @param satelliteData The satellite data objects with which to initialize the satellites. One satellite will be
   * created for each object in the array.
   */
  public initSatellitesFromData(satelliteData: readonly SatelliteData[]): void {
    ArrayUtils.shallowCopy(satelliteData, this.satelliteData);

    // Clear the SBAS-group inhibited satellite set in case satellite PRN codes change.
    this.sbasGroupInhibitedSatellitePrnCodes.clear();

    this.satellitePrnMap.clear();

    this.nonSbasSatelliteCount = 0;

    this.satellites.length = satelliteData.length;
    for (let i = 0; i < satelliteData.length; i++) {
      const data = satelliteData[i];
      if (data.sbasGroup === undefined) {
        ++this.nonSbasSatelliteCount;
      }
      this.satellites[i] = new GPSSatellite(data);
      this.satellitePrnMap.set(data.prn, i);
    }

    this.sbasSatelliteCount = this.satellites.length - this.nonSbasSatelliteCount;
  }

  /**
   * Initializes this context's receiver channels.
   * @param totalChannelCount The total number of receiver channels to use.
   * @param sbasChannelCount The number of receiver channels that can only track SBAS satellites, or `null` if all
   * receiver channels can track both SBAS and non-SBAS satellites. 
   */
  public initChannels(totalChannelCount: number, sbasChannelCount: number | null): void {
    const oldChannelCount = this.channels.length;
    this.totalChannelCount = totalChannelCount;
    this.sbasChannelCount = sbasChannelCount;
    this.channels.length = this.totalChannelCount;
    for (let i = oldChannelCount; i < this.totalChannelCount; i++) {
      this.channels[i] = null;
    }
  }

  /**
   * Checks whether a satellite PRN code belongs to an inhibited satellite.
   * @param prn The PRN code to check.
   * @returns Whether the specified PRN code belongs to an inhibited satellite.
   */
  private isSatellitePrnInhibited(prn: number): boolean {
    return this.manuallyInhibitedSatellitePrnCodes.has(prn) || this.sbasGroupInhibitedSatellitePrnCodes.has(prn);
  }

  /**
   * Reconciles this computer's set of satellites that are inhibited because their associated SBAS group is not
   * enabled with the current set of enabled SBAS groups.
   */
  private reconcileSbasGroupInhibitedSatellites(): void {
    const enabledSbasGroups = this.enabledSbasGroups.get();
    for (let i = this.nonSbasSatelliteCount; i < this.satellites.length; i++) {
      const sat = this.satellites[i];
      this.sbasGroupInhibitedSatellitePrnCodes.toggle(sat.prn, !enabledSbasGroups.has(sat.sbasGroup!));
    }
  }

  /**
   * Gets the index of a satellite with a given PRN identifier.
   * @param prn The PRN identifier for which to get the satellite index.
   * @returns The index of the satellite with the specified PRN identifier, or `-1` if the PRN does not belong to any
   * satellite.
   */
  public getSatelliteIndexFromPrn(prn: number): number {
    return this.satellitePrnMap.get(prn) ?? -1;
  }

  /**
   * Sets the spatial and temporal location of this context's receiver.
   * @param lat The latitude of the position to set, in degrees.
   * @param lon The longitude of the position to set, in degrees.
   * @param altitude The altitude of the position to set, in meters.
   * @param time The time of the position to set, as a Javascript timestamp.
   */
  public setPosition(lat: number, lon: number, altitude: number, time: number): void {
    this.position.set(lat, lon);
    Vec2Math.set(this.position.lat, this.position.lon, this.positionVec);
    this.altitude = altitude;
    this.time = time;
  }

  /**
   * Sets the last known position used by this context.
   * @param lat The latitude of the position to set, in degrees.
   * @param lon The longitude of the position to set, in degrees.
   */
  public setLastKnownPosition(lat: number, lon: number): void {
    this.lastKnownPosition.set(lat, lon);
  }

  /**
   * Resets the state of this context. This will unassign all receiver channels, set the state of every satellite to
   * {@link GPSSatelliteState.None}, and reset the covariance matrix and dilution of precision values.
   */
  public reset(): void {
    for (let i = 0; i < this.channels.length; i++) {
      this.channels[i] = null;
    }

    for (const sat of this.satellites) {
      sat.resetState();
    }

    this.covarMatrix.fill(NaN);
    Vec3Math.set(-1, -1, -1, this.dops);
  }

  /**
   * Updates this simulation context.
   * @param deltaTime The time elapsed, in milliseconds, since the last update.
   * @param shouldUpdatePositions Whether to update the orbital positions of the satellites.
   * @param forceAcquireAndUse Whether to immediately choose the optimal satellites to track for all receiver channels,
   * then acquire and download all data (ephemeris, almanac, and differential corrections) from tracked satellites with
   * sufficient signal strength.
   */
  public update(deltaTime: number, shouldUpdatePositions: boolean, forceAcquireAndUse: boolean): void {
    let numAcquiring = 0;
    let canApplyDiffCorrections = false;

    let shouldUpdateCovarMatrix = shouldUpdatePositions;

    if (forceAcquireAndUse) {
      this.reset();
      this.lastKnownPosition.set(this.position);
    }

    this.distanceFromLastKnownPos = this.lastKnownPosition.isValid()
      ? this.position.distance(this.lastKnownPosition)
      : Infinity;

    this.reconcileSbasGroupInhibitedSatellites();
    this.updateAvailableSbasGroups();

    const enabledSBASGroups = this.enabledSbasGroups.get();
    const invMaxZenithAngle = 1.0 / (GPSSatellite.calcHorizonAngle(this.altitude) + (Math.PI / 2));

    for (let i = 0; i < this.satellites.length; i++) {
      const sat = this.satellites[i];

      if (shouldUpdatePositions) {
        sat.computeSatellitePositions(this.time);
        sat.applyProjection(this.position, this.altitude);
      }

      sat.calculateSignalStrength(invMaxZenithAngle);
    }

    if (shouldUpdatePositions) {
      this.updateChannelAssignments(forceAcquireAndUse);
    }

    this.diffCorrectionsSbasGroups.clear();

    for (let i = 0; i < this.satellites.length; i++) {
      const sat = this.satellites[i];

      const updatedState = sat.updateState(this.time, deltaTime, this.distanceFromLastKnownPos, forceAcquireAndUse);

      if (updatedState) {
        shouldUpdateCovarMatrix = true;
      }

      const satState = sat.state.get();
      if (
        satState === GPSSatelliteState.DataCollected
        || satState === GPSSatelliteState.InUse
        || satState === GPSSatelliteState.InUseDiffApplied
      ) {
        numAcquiring++;

        if (sat.areDiffCorrectionsDownloaded && this.currentAvailableSbasGroups.has(sat.sbasGroup!)) {
          this.diffCorrectionsSbasGroups.add(sat.sbasGroup!);
          canApplyDiffCorrections = true;
        }
      } else if (satState === GPSSatelliteState.Acquired) {
        numAcquiring++;
      }
    }

    const newSbasState = canApplyDiffCorrections
      ? GPSSystemSBASState.Active
      : enabledSBASGroups.size === 0 ? GPSSystemSBASState.Disabled : GPSSystemSBASState.Inactive;

    if (shouldUpdateCovarMatrix) {
      this.selectSatellites(this.covarMatrix, this.dops);
    }

    let newSystemState = GPSSystemState.Searching;
    if (this.dops[0] /* PDOP */ >= 0) {
      newSystemState = canApplyDiffCorrections ? GPSSystemState.DiffSolutionAcquired : GPSSystemState.SolutionAcquired;
      this.lastKnownPosition.set(this.position);
    } else if (numAcquiring > 0) {
      newSystemState = GPSSystemState.Acquiring;
    } else if (this.distanceFromLastKnownPos < 0.0290367 /* 100 nautical miles */) {
      // Set system state to 'Acquiring' if we are attempting to acquire at least one satellite for which we have
      // predicted geometry data (either from the almanac or cached ephemeris data).
      for (let i = 0; i < this.channels.length; i++) {
        const sat = this.channels[i];
        if (sat && sat.state.get() === GPSSatelliteState.None && (this.isAlmanacValid || sat.isCachedEphemerisValid(this.time))) {
          newSystemState = GPSSystemState.Acquiring;
          break;
        }
      }
    }

    for (let i = 0; i < this.channels.length; i++) {
      const sat = this.channels[i];
      if (sat) {
        sat.updateDiffCorrectionsApplied(canApplyDiffCorrections);
      }
    }

    this.systemState = newSystemState;
    this.sbasState = newSbasState;
  }

  /**
   * Updates which SBAS groups are enabled and whose coverage area contain the airplane's current position.
   */
  private updateAvailableSbasGroups(): void {
    const enabledSBASGroups = this.enabledSbasGroups.get();

    for (let i = 0; i < this.sbasData.length; i++) {
      const sbasData = this.sbasData[i];
      if (enabledSBASGroups.has(sbasData.group) && Vec2Math.pointWithinPolygon(sbasData.coverage, this.positionVec)) {
        this.currentAvailableSbasGroups.add(sbasData.group);
      } else {
        this.currentAvailableSbasGroups.delete(sbasData.group);
      }
    }
  }

  private readonly covarMatrixCache = [
    new Float64Array(4),
    new Float64Array(4),
    new Float64Array(4),
    new Float64Array(4),
  ];

  private static readonly EPHEMERIS_COLLECTED_SATELLITE_STATES = new Set([GPSSatelliteState.DataCollected, GPSSatelliteState.InUse, GPSSatelliteState.InUseDiffApplied]);

  private readonly ephemerisCollectedSatelliteFilter = (sat: GPSSatellite): boolean => {
    return SatelliteSimulationContext.EPHEMERIS_COLLECTED_SATELLITE_STATES.has(sat.state.get());
  };

  private readonly losSatelliteFilter = (sat: GPSSatellite): boolean => {
    return sat.signalStrength.get() > 0.05
      && !this.isSatellitePrnInhibited(sat.prn)
      && (
        (
          this.distanceFromLastKnownPos < 0.0290367 // 100 nautical miles
          && (this.isAlmanacValid || sat.isCachedEphemerisValid(this.time))
        )
        || SatelliteSimulationContext.EPHEMERIS_COLLECTED_SATELLITE_STATES.has(sat.state.get())
      );
  };

  private readonly losSatelliteFilterOmniscient = (sat: GPSSatellite): boolean => {
    return sat.signalStrength.get() > 0.05 && !this.isSatellitePrnInhibited(sat.prn);
  };

  private readonly untrackedSatelliteFilter = (sat: GPSSatellite): boolean => {
    return !this.channels.includes(sat)
      && sat.state.get() !== GPSSatelliteState.Unreachable
      && !this.isSatellitePrnInhibited(sat.prn);
  };

  /**
   * Updates the satellites assigned to be tracked by this context's receiver channels.
   * @param forceAcquireAndUse Whether to immediately choose the optimal satellites to track and acquire all data from
   * tracked satellites if signal strength is sufficient.
   */
  private updateChannelAssignments(forceAcquireAndUse: boolean): void {
    // If we have at least one channel for every satellite, then we will simply assign each satellite to its own
    // channel. Note that even if we have separate SBAS and non-SBAS channels, the total count comparison is still
    // valid because we prune our channel counts such that the number of SBAS and non-SBAS channels cannot exceed the
    // number of SBAS and non-SBAS satellites, respectively.
    if (this.totalChannelCount >= this.satellites.length) {
      const end = Math.min(this.totalChannelCount, this.satellites.length);
      for (let i = 0; i < end; i++) {
        // NOTE: SBAS satellites are located after all the non-SBAS satellites in the array, so assigning satellites
        // to channels by index will still properly partition the satellites into the correct non-SBAS and SBAS
        // channels.
        const sat = this.satellites[i];
        // Do not assign the satellite if it is inhibited.
        if (!this.isSatellitePrnInhibited(sat.prn)) {
          this.assignSatelliteToChannel(i, this.satellites[i]);
        } else {
          this.assignSatelliteToChannel(i, null);
        }
      }
      return;
    }

    const losSatellites = this.satellites.filter(forceAcquireAndUse ? this.losSatelliteFilterOmniscient : this.losSatelliteFilter);

    let losSatellitesNotTrackedIndexes: number[];
    let losNonSbasSatellitesNotTrackedCount = 0;
    let losSbasSatellitesNotTrackedCount = 0;

    let openChannelIndexes: number[];
    let openNonSbasChannelCount = 0;
    let openSbasChannelCount = 0;

    let isTrackingSbasSatelliteInLos = false;

    if (forceAcquireAndUse) {
      // If we are acquiring and using the most optimal satellites, then consider all line-of-sight satellites to be
      // untracked and all channels to be open, so that the assignment algorithms below have the least possible
      // restrictions on which satellites they can assign to which channels.

      losSatellitesNotTrackedIndexes = ArrayUtils.range(losSatellites.length);
      for (let i = 0; i < losSatellites.length; i++) {
        if (losSatellites[i].sbasGroup === undefined) {
          ++losNonSbasSatellitesNotTrackedCount;
        } else {
          ++losSbasSatellitesNotTrackedCount;
        }
      }

      openChannelIndexes = ArrayUtils.range(this.totalChannelCount, this.totalChannelCount - 1, -1);
      if (this.sbasChannelCount !== null) {
        openNonSbasChannelCount = this.totalChannelCount - this.sbasChannelCount;
        openSbasChannelCount = this.sbasChannelCount;
      }
    } else {
      // We are not forced to acquire and use the most optimal satellites.

      // Enumerate all line-of-sight satellites that are not already being tracked. This will be the pool of satellites
      // that can be assigned to a new channel.

      losSatellitesNotTrackedIndexes = [];

      for (let i = 0; i < losSatellites.length; i++) {
        const sat = losSatellites[i];
        if (this.channels.includes(sat)) {
          if (sat.sbasGroup !== undefined && this.currentAvailableSbasGroups.has(sat.sbasGroup)) {
            isTrackingSbasSatelliteInLos = true;
          }
        } else {
          losSatellitesNotTrackedIndexes.push(i);

          if (sat.sbasGroup === undefined) {
            ++losNonSbasSatellitesNotTrackedCount;
          } else {
            ++losSbasSatellitesNotTrackedCount;
          }
        }
      }

      // Enumerate all open channels. A channel is considered open if it is not already assigned a satellite or if the
      // satellite it is assigned is unreachable or inhibited. Open channels are eligible to be assigned a new
      // satellite.

      openChannelIndexes = [];

      for (let i = this.channels.length - 1; i >= 0; i--) {
        const sat = this.channels[i];

        if (
          !sat
          || sat.state.get() === GPSSatelliteState.Unreachable
          || this.isSatellitePrnInhibited(sat.prn)
        ) {
          openChannelIndexes.push(i);

          if (this.sbasChannelCount !== null) {
            if (i < this.totalChannelCount - this.sbasChannelCount) {
              ++openNonSbasChannelCount;
            } else {
              ++openSbasChannelCount;
            }
          }
        }
      }
    }

    if (openChannelIndexes.length === 0 && (this.channels as GPSSatellite[]).every(this.ephemerisCollectedSatelliteFilter)) {
      // There are no open channels and we have collected ephemeris data from every tracked satellite.

      const trackedLosMatrix = SatelliteSimulationContext.getLosMatrix(this.channels as GPSSatellite[]);
      const trackedCovarMatrix = SatelliteSimulationContext.calculateCovarMatrix(trackedLosMatrix, this.covarMatrixCache);

      if (!isFinite(trackedCovarMatrix[0][0]) || !isFinite(trackedCovarMatrix[1][1]) || !isFinite(trackedCovarMatrix[2][2])) {
        // The currently tracked satellites are not sufficient to produce a 3D position solution. In this case we
        // will replace a random tracked satellite with an untracked. If channels are split into non-SBAS and SBAS, we
        // will only try to replace a non-SBAS satellite.

        const replaceEndIndex = this.sbasChannelCount === null ? this.totalChannelCount : this.totalChannelCount - this.sbasChannelCount;
        openChannelIndexes.push(Math.trunc(Math.random() * replaceEndIndex));
      } else {
        // The currently tracked satellites are sufficient to produce a 3D position solution. In this case we will
        // only try to replace a tracked satellite if channels are not split into non-SBAS and SBAS, we are tracking at
        // least one redundant satellite, we are not tracking an SBAS satellite within LOS, and there is a SBAS
        // satellite within LOS available for us to track. If the above is true, then we will replace the tracked
        // satellite with the smallest contribution to reducing PDOP with the SBAS satellite with highest signal strength.

        if (this.sbasChannelCount === null && this.totalChannelCount > 4 && !isTrackingSbasSatelliteInLos) {
          let highestSbasSignal = 0;
          let highestSbasSignalIndex = -1;

          for (let i = 0; i < losSatellitesNotTrackedIndexes.length; i++) {
            const index = losSatellitesNotTrackedIndexes[i];
            const sat = losSatellites[index];
            const signalStrength = sat.signalStrength.get();
            if (sat.sbasGroup !== undefined && this.currentAvailableSbasGroups.has(sat.sbasGroup) && signalStrength > highestSbasSignal) {
              highestSbasSignal = signalStrength;
              highestSbasSignalIndex = index;
            }
          }

          if (highestSbasSignalIndex >= 0) {
            const sTranspose = this.channels.map(SatelliteSimulationContext.createVec4);
            SatelliteSimulationContext.calculateDowndateSTranspose(trackedLosMatrix, trackedCovarMatrix, sTranspose);
            const pDiag = SatelliteSimulationContext.calculateDowndatePDiag(trackedLosMatrix, sTranspose, new Float64Array(trackedLosMatrix.length));
            SatelliteSimulationContext.calculateSatelliteCosts(sTranspose, pDiag, this.satelliteCosts);

            let satToReplaceCost = Infinity;
            let satToReplaceChannelIndex = -1;

            for (let i = 0; i < this.channels.length; i++) {
              const cost = this.satelliteCosts[i];
              if (cost < satToReplaceCost) {
                satToReplaceCost = cost;
                satToReplaceChannelIndex = i;
              }
            }

            if (satToReplaceChannelIndex >= 0) {
              this.assignSatelliteToChannel(satToReplaceChannelIndex, losSatellites[highestSbasSignalIndex]);
            }
          }
        }

        return;
      }
    }

    if (openChannelIndexes.length > 0) {
      let canTrackAllLosNonSbasSatellites = false;
      let canTrackAllLosSbasSatellites = false;

      if (this.sbasChannelCount === null) {
        canTrackAllLosNonSbasSatellites = canTrackAllLosSbasSatellites = openChannelIndexes.length >= losSatellitesNotTrackedIndexes.length;
      } else {
        canTrackAllLosNonSbasSatellites = openNonSbasChannelCount >= losNonSbasSatellitesNotTrackedCount;
        canTrackAllLosSbasSatellites = openSbasChannelCount >= losSbasSatellitesNotTrackedCount;
      }

      if (!(canTrackAllLosNonSbasSatellites && canTrackAllLosSbasSatellites)) {
        // We don't have enough open channels to begin tracking all satellites currently within line-of-sight.
        // Therefore, we will choose those with the largest contribution to reducing PDOP.

        const losMatrix = SatelliteSimulationContext.getLosMatrix(losSatellites);
        const covarMatrix = SatelliteSimulationContext.calculateCovarMatrix(losMatrix, this.covarMatrixCache);
        const sTranspose = losSatellites.map(SatelliteSimulationContext.createVec4);
        SatelliteSimulationContext.calculateDowndateSTranspose(losMatrix, covarMatrix, sTranspose);
        const pDiag = SatelliteSimulationContext.calculateDowndatePDiag(losMatrix, sTranspose, new Float64Array(losMatrix.length));
        SatelliteSimulationContext.calculateSatelliteCosts(sTranspose, pDiag, this.satelliteCosts);

        // If channels are not split into non-SBAS/SBAS and we are not already tracking an SBAS satellite within LOS,
        // then we will prioritize adding the SBAS satellite with the highest cost over non-SBAS satellites.
        if (this.sbasChannelCount === null && !isTrackingSbasSatelliteInLos) {
          let highestSbasCost = -Infinity;
          let highestSbasCostIndex = -1;

          for (let i = 0; i < this.satelliteCosts.length; i++) {
            const sbasGroup = losSatellites[i].sbasGroup;
            if (sbasGroup !== undefined && this.currentAvailableSbasGroups.has(sbasGroup)) {
              const cost = this.satelliteCosts[i];
              if (cost > highestSbasCost) {
                highestSbasCost = cost;
                highestSbasCostIndex = i;
              }
            }
          }

          if (highestSbasCostIndex >= 0) {
            this.satelliteCosts[highestSbasCostIndex] = Infinity;
          }
        }

        const satelliteIndexes = ArrayUtils.range(losSatellites.length);
        satelliteIndexes.sort(this.satelliteCostCompare);

        if (this.sbasChannelCount === null) {
          for (let i = satelliteIndexes.length - 1; i >= 0; i--) {
            const satIndex = satelliteIndexes[i];
            if (losSatellitesNotTrackedIndexes.includes(satIndex)) {
              const sat = losSatellites[satIndex];
              const channelIndex = openChannelIndexes.pop() as number;
              this.assignSatelliteToChannel(channelIndex, sat);

              if (openChannelIndexes.length === 0) {
                break;
              }
            }
          }
        } else {
          let usedNonSbasChannelCount = 0;
          let usedSbasChannelCount = 0;

          for (let i = satelliteIndexes.length - 1; i >= 0; i--) {
            const satIndex = satelliteIndexes[i];
            if (losSatellitesNotTrackedIndexes.includes(satIndex)) {
              const sat = losSatellites[satIndex];
              if (sat.sbasGroup === undefined) {
                if (usedNonSbasChannelCount < openNonSbasChannelCount) {
                  const channelIndex = openChannelIndexes[openChannelIndexes.length - 1 - usedNonSbasChannelCount];
                  ++usedNonSbasChannelCount;
                  this.assignSatelliteToChannel(channelIndex, sat);
                }
              } else {
                if (usedSbasChannelCount < openSbasChannelCount) {
                  const channelIndex = openChannelIndexes[openSbasChannelCount - 1 - usedSbasChannelCount];
                  ++usedSbasChannelCount;
                  this.assignSatelliteToChannel(channelIndex, sat);
                }
              }

              if (usedNonSbasChannelCount + usedSbasChannelCount >= openNonSbasChannelCount + openSbasChannelCount) {
                break;
              }
            }
          }

          openChannelIndexes.length -= usedNonSbasChannelCount;
          openChannelIndexes.splice(openSbasChannelCount - usedSbasChannelCount, usedSbasChannelCount);
        }
      } else {
        // We have enough open channels to begin tracking all satellites currently within LOS.

        if (this.sbasChannelCount === null) {
          for (let i = 0; i < losSatellitesNotTrackedIndexes.length; i++) {
            const satIndex = losSatellitesNotTrackedIndexes[i];
            const channelIndex = openChannelIndexes.pop() as number;
            this.assignSatelliteToChannel(channelIndex, losSatellites[satIndex]);
          }
        } else {
          // Assign non-SBAS satellites.
          for (let i = 0; i < losNonSbasSatellitesNotTrackedCount; i++) {
            const satIndex = losSatellitesNotTrackedIndexes[i];
            const channelIndex = openChannelIndexes[openChannelIndexes.length - 1 - i];
            this.assignSatelliteToChannel(channelIndex, losSatellites[satIndex]);
          }

          // Assign SBAS satellites.
          for (let i = 0; i < losSbasSatellitesNotTrackedCount; i++) {
            const satIndex = losSatellitesNotTrackedIndexes[losNonSbasSatellitesNotTrackedCount + i];
            const channelIndex = openChannelIndexes[openSbasChannelCount - 1 - i];
            this.assignSatelliteToChannel(channelIndex, losSatellites[satIndex]);
          }

          // Remove channels that have been assigned with a satellite from the open channel array.
          openChannelIndexes.length -= losNonSbasSatellitesNotTrackedCount;
          openChannelIndexes.splice(openSbasChannelCount - losSbasSatellitesNotTrackedCount, losSbasSatellitesNotTrackedCount);
        }
      }

      // If we still have open channels available, fill them with random satellites that have not been marked as
      // unreachable.
      if (openChannelIndexes.length > 0) {
        const untrackedSatellites = this.satellites.filter(this.untrackedSatelliteFilter);

        if (this.sbasChannelCount === null) {
          let untrackedIndex = 0;
          while (openChannelIndexes.length > 0 && untrackedIndex < untrackedSatellites.length) {
            const channelIndex = openChannelIndexes.pop() as number;
            this.assignSatelliteToChannel(channelIndex, untrackedSatellites[untrackedIndex++]);
          }
        } else {
          let untrackedNonSbasIndex = 0;
          let untrackedSbasIndex = untrackedSatellites.length;

          for (let i = 0; i < untrackedSatellites.length; i++) {
            if (untrackedSatellites[i].sbasGroup !== undefined) {
              untrackedSbasIndex = i;
              break;
            }
          }

          while (openChannelIndexes.length > 0) {
            const channelIndex = openChannelIndexes.pop() as number;
            if (channelIndex < this.totalChannelCount - this.sbasChannelCount) {
              // The open channel is a non-SBAS channel.
              if (untrackedNonSbasIndex < untrackedSbasIndex) {
                this.assignSatelliteToChannel(channelIndex, untrackedSatellites[untrackedNonSbasIndex++]);
              }
            } else {
              // The open channel is an SBAS channel.
              if (untrackedSbasIndex < untrackedSatellites.length) {
                this.assignSatelliteToChannel(channelIndex, untrackedSatellites[untrackedSbasIndex++]);
              }
            }
          }
        }

        // If there are still open channels available after assigning all non-unreachable satellites, then check if
        // there any channels assigned with inhibited satellites (NOTE: these channels are guaranteed to be considered
        // open). If so, then we need to unassign these satellites.
        if (openChannelIndexes.length > 0) {
          for (let i = 0; i < openChannelIndexes.length; i++) {
            const channelIndex = openChannelIndexes[i];
            const assignedSat = this.channels[channelIndex];
            if (assignedSat && this.isSatellitePrnInhibited(assignedSat.prn)) {
              this.assignSatelliteToChannel(channelIndex, null);
            }
          }
        }
      }
    }
  }

  /**
   * Assigns a satellite to a receiver channel.
   * @param channelIndex The index of the receiver channel.
   * @param sat The satellite to assign, or `null` if the channel is to be assigned no satellite.
   */
  private assignSatelliteToChannel(channelIndex: number, sat: GPSSatellite | null): void {
    const oldSat = this.channels[channelIndex];

    if (oldSat === sat) {
      return;
    }

    if (oldSat) {
      oldSat.setTracked(false);
    }

    this.channels[channelIndex] = sat;

    if (sat) {
      sat.setTracked(true);
    }
  }

  private static readonly readySatelliteFilter = (sat: GPSSatellite): boolean => {
    const state = sat.state.get();
    return state === GPSSatelliteState.DataCollected || state === GPSSatelliteState.InUse || state === GPSSatelliteState.InUseDiffApplied;
  };

  private static readonly createVec4 = (): Float64Array => new Float64Array(4);

  private readonly satelliteCosts: number[] = [];
  private readonly satelliteCostCompare = (indexA: number, indexB: number): number => {
    return this.satelliteCosts[indexA] - this.satelliteCosts[indexB];
  };

  /**
   * Selects satellites to use for calculating position solutions and outputs the covariance matrix and dilution of
   * precision values for the selected constellation.
   * @param covarMatrixOut The vector to which to write the covariance matrix. The vector must be of length 16. The
   * matrix elements will be written to the vector such that the element in row `i` and column `j` is written to index
   * `i * 4 + j` in the array. If the constellation is insufficient to provide a 3D position solution, then `NaN` will
   * be written to all indexes in the output.
   * @param dopOut The vector to which to write the dilution of precision values, as `[PDOP, HDOP, VDOP]`. If the
   * constellation is insufficient to provide a 3D position solution, then `[-1, -1, -1]` will be written to the
   * output.
   */
  private selectSatellites(covarMatrixOut: Float64Array, dopOut: Float64Array): void {
    covarMatrixOut.fill(NaN);
    Vec3Math.set(-1, -1, -1, dopOut);

    const satellitesToUse = this.satellites.filter(SatelliteSimulationContext.readySatelliteFilter);

    if (satellitesToUse.length < 4) {
      this.updateSatelliteInUseStates(satellitesToUse, []);
      return;
    }

    const losMatrix = SatelliteSimulationContext.getLosMatrix(satellitesToUse);
    const covarMatrix = SatelliteSimulationContext.calculateCovarMatrix(losMatrix, this.covarMatrixCache);

    const maxCount = MathUtils.clamp(this.satInUseMaxCount, 4, this.totalChannelCount);

    if (
      !VecNMath.isFinite(covarMatrix[0])
      || !VecNMath.isFinite(covarMatrix[1])
      || !VecNMath.isFinite(covarMatrix[2])
      || !VecNMath.isFinite(covarMatrix[3])
    ) {
      const satellitesToDiscard = satellitesToUse.splice(maxCount);
      this.updateSatelliteInUseStates(satellitesToUse, satellitesToDiscard);
      return;
    }

    const satellitesToDiscard: GPSSatellite[] = [];

    const pdopTarget = this.satInUsePdopTarget;
    const optimumCount = Math.max(this.satInUseOptimumCount, 4);
    const pdopTargetSq = pdopTarget < 0 ? -1 : pdopTarget * pdopTarget;
    let pdopSq = covarMatrix[0][0] + covarMatrix[1][1] + covarMatrix[2][2];

    if (satellitesToUse.length > maxCount || (satellitesToUse.length > optimumCount && pdopSq < pdopTargetSq)) {
      // There are more in-sight satellites than we can select. Therefore we will attempt to discard excess satellites
      // in manner that minimizes the increase to PDOP relative to selecting all in-sight satellites.

      // We will use the "downdate" selection algorithm presented in Walter, T, Blanch, J and Kropp, V, 2016.
      // Define Sᵀ = LC and P = I - LCLᵀ, where L is the line-of-sight matrix and C is the covariance matrix.
      // Then Ci = C + (Si)(Si)ᵀ / P(i, i), where Ci is the covariance matrix after removing the ith satellite and
      // Si is the ith column of S.

      // If PDOP = sqrt(C(1, 1) + C(2, 2) + C(3, 3)), then from the above it can be seen that removing the ith
      // satellite increases PDOP² by (S(1, i)² + S(2, i)² + S(3, i)²) / P(i, i). Defining this to be the cost of
      // removing satellite i, we are then guaranteed that removing the satellite with the lowest cost will result
      // in the smallest increase to PDOP.

      const sTranspose = satellitesToUse.map(SatelliteSimulationContext.createVec4);
      SatelliteSimulationContext.calculateDowndateSTranspose(losMatrix, covarMatrix, sTranspose);
      const pDiag = SatelliteSimulationContext.calculateDowndatePDiag(losMatrix, sTranspose, new Float64Array(losMatrix.length));
      SatelliteSimulationContext.calculateSatelliteCosts(sTranspose, pDiag, this.satelliteCosts);

      const satelliteIndexes = ArrayUtils.range(satellitesToUse.length);
      satelliteIndexes.sort(this.satelliteCostCompare);

      pdopSq = covarMatrix[0][0] + covarMatrix[1][1] + covarMatrix[2][2];
      let indexToRemove = satelliteIndexes[0];

      while (
        satellitesToUse.length > maxCount
        || (
          satellitesToUse.length > optimumCount
          && pdopSq + this.satelliteCosts[indexToRemove] <= pdopTargetSq
        )
      ) {

        satellitesToDiscard.push(satellitesToUse[indexToRemove]);
        satellitesToUse.splice(indexToRemove, 1);
        losMatrix.splice(indexToRemove, 1);

        // Reset satellite index array.
        satelliteIndexes.length--;
        for (let i = 0; i < satelliteIndexes.length; i++) {
          satelliteIndexes[i] = i;
        }

        // Update covariance matrix after removing a satellite.
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            covarMatrix[i][j] += sTranspose[indexToRemove][i] * sTranspose[indexToRemove][j] / pDiag[indexToRemove];
          }
        }

        // Recompute satellite costs.
        sTranspose.length--;
        SatelliteSimulationContext.calculateDowndateSTranspose(losMatrix, covarMatrix, sTranspose);
        SatelliteSimulationContext.calculateDowndatePDiag(losMatrix, sTranspose, pDiag);
        SatelliteSimulationContext.calculateSatelliteCosts(sTranspose, pDiag, this.satelliteCosts);
        satelliteIndexes.sort(this.satelliteCostCompare);

        pdopSq = covarMatrix[0][0] + covarMatrix[1][1] + covarMatrix[2][2];
        indexToRemove = satelliteIndexes[0];
      }
    }

    this.updateSatelliteInUseStates(satellitesToUse, satellitesToDiscard);

    // Grab the variance terms var(x), var(y), var(z) along the diagonal of the covariance matrix
    const varX = covarMatrix[0][0];
    const varY = covarMatrix[1][1];
    const varZ = covarMatrix[2][2];

    if (!isFinite(varX) || !isFinite(varY) || !isFinite(varZ)) {
      return;
    }

    covarMatrixOut.set(covarMatrix[0], 0);
    covarMatrixOut.set(covarMatrix[1], 4);
    covarMatrixOut.set(covarMatrix[2], 8);
    covarMatrixOut.set(covarMatrix[3], 12);

    const horizSumVar = varX + varY;

    const pdop = Math.sqrt(horizSumVar + varZ);
    const hdop = Math.sqrt(horizSumVar);
    const vdop = Math.sqrt(varZ);

    Vec3Math.set(pdop, hdop, vdop, dopOut);
  }

  /**
   * Updates the in-use state of satellites.
   * @param satellitesToUse The satellites to use for position solution calculations.
   * @param satellitesToNotUse The satellites to not use for position solution calculations.
   */
  private updateSatelliteInUseStates(satellitesToUse: readonly GPSSatellite[], satellitesToNotUse: readonly GPSSatellite[]): void {
    for (let i = 0; i < satellitesToUse.length; i++) {
      satellitesToUse[i].updateInUse(true);
    }

    for (let i = 0; i < satellitesToNotUse.length; i++) {
      satellitesToNotUse[i].updateInUse(false);
    }
  }

  /**
   * Creates a line-of-sight position matrix for a satellite constellation. Each row in the matrix is a 4-vector of
   * a satellite's position relative to the airplane, as `[x, y, z, 1]`. The index of the matrix row containing a
   * satellite's position vector matches the index of the satellite in the provided array.
   * @param satellites The satellites in the constellation.
   * @returns The line-of-sight position matrix for the specified satellite constellation.
   */
  private static getLosMatrix(satellites: readonly GPSSatellite[]): Float64Array[] {
    const los: Float64Array[] = [];

    // Get unit line-of-sight vectors for each satellite
    for (let i = 0; i < satellites.length; i++) {
      const [zenith, hour] = satellites[i].position.get();
      los[i] = Vec3Math.setFromSpherical(1, zenith, hour, new Float64Array(4));
      los[i][3] = 1;
    }

    return los;
  }

  private static readonly covarMultiplyFuncs = [
    [0, 1, 2, 3].map(col => (sum: number, vec: ArrayLike<number>): number => sum + vec[0] * vec[col]),
    [1, 2, 3].map(col => (sum: number, vec: ArrayLike<number>): number => sum + vec[1] * vec[col]),
    [2, 3].map(col => (sum: number, vec: ArrayLike<number>): number => sum + vec[2] * vec[col])
  ];

  /**
   * Calculates a position-covariance matrix for a satellite constellation.
   * @param los The line-of-sight position matrix for the satellite constellation.
   * @param out The matrix to which to write the result.
   * @returns The position-covariance matrix for the specified satellite constellation.
   */
  private static calculateCovarMatrix(los: readonly ReadonlyFloat64Array[], out: Float64Array[]): Float64Array[] {
    if (los.length < 4) {
      for (let i = 0; i < 4; i++) {
        out[i].fill(NaN, 0, 4);
      }

      return out;
    }

    // The covariance matrix is defined as C = (LᵀL)⁻¹, where L is the satellite line-of-sight matrix.
    // P = LᵀL is guaranteed to be symmetric, so we need only compute the upper triangular part of the product.

    const P11 = los.reduce(SatelliteSimulationContext.covarMultiplyFuncs[0][0], 0);
    const P12 = los.reduce(SatelliteSimulationContext.covarMultiplyFuncs[0][1], 0);
    const P13 = los.reduce(SatelliteSimulationContext.covarMultiplyFuncs[0][2], 0);
    const P14 = los.reduce(SatelliteSimulationContext.covarMultiplyFuncs[0][3], 0);

    const P22 = los.reduce(SatelliteSimulationContext.covarMultiplyFuncs[1][0], 0);
    const P23 = los.reduce(SatelliteSimulationContext.covarMultiplyFuncs[1][1], 0);
    const P24 = los.reduce(SatelliteSimulationContext.covarMultiplyFuncs[1][2], 0);

    const P33 = los.reduce(SatelliteSimulationContext.covarMultiplyFuncs[2][0], 0);
    const P34 = los.reduce(SatelliteSimulationContext.covarMultiplyFuncs[2][1], 0);

    const P44 = los.length;

    // Perform block-wise inversion of LᵀL (which is 4x4, so neatly decomposes into four 2x2 matrices) with optimizations
    // presented in Ingemarsson, C and Gustafsson O, 2015.

    // P = [A  B]
    //     [Bᵀ D]

    // C = P⁻¹ = [E  F]
    //           [Fᵀ H]

    // V = A⁻¹ (A is symmetric, therefore V is also symmetric, so we only need to compute the upper triangular part)
    const detA = 1 / (P11 * P22 - P12 * P12);
    const V11 = P22 * detA;
    const V12 = -P12 * detA;
    const V22 = P11 * detA;

    // X = VB
    const X11 = V11 * P13 + V12 * P23;
    const X12 = V11 * P14 + V12 * P24;
    const X21 = V12 * P13 + V22 * P23;
    const X22 = V12 * P14 + V22 * P24;

    // H = (D - BᵀX)⁻¹ (H and D are symmetric, which means BᵀX is also symmetric)
    const Hi11 = P33 - (P13 * X11 + P23 * X21);
    const Hi12 = P34 - (P13 * X12 + P23 * X22);
    const Hi22 = P44 - (P14 * X12 + P24 * X22);

    const detHi = 1 / (Hi11 * Hi22 - Hi12 * Hi12);
    const H11 = Hi22 * detHi;
    const H12 = -Hi12 * detHi;
    const H22 = Hi11 * detHi;

    // Z = XH, F = -Z
    const Z11 = X11 * H11 + X12 * H12;
    const Z12 = X11 * H12 + X12 * H22;
    const Z21 = X21 * H11 + X22 * H12;
    const Z22 = X21 * H12 + X22 * H22;

    // E = V + ZXᵀ (E is symmetric, so we only need to compute the upper triangular part)
    const E11 = V11 + Z11 * X11 + Z12 * X12;
    const E12 = V12 + Z11 * X21 + Z12 * X22;
    const E22 = V22 + Z21 * X21 + Z22 * X22;

    out[0][0] = E11;
    out[0][1] = E12;
    out[0][2] = -Z11;
    out[0][3] = -Z12;
    out[1][0] = E12; // E is symmetric, so E21 = E12
    out[1][1] = E22;
    out[1][2] = -Z21;
    out[1][3] = -Z22;
    out[2][0] = -Z11;
    out[2][1] = -Z21;
    out[2][2] = H11;
    out[2][3] = H12;
    out[3][0] = -Z12;
    out[3][1] = -Z22;
    out[3][2] = H12; // H is symmetric, so H21 = H12
    out[3][3] = H22;

    return out;
  }

  /**
   * Calculates the transpose of the `S` matrix in the downdate satellite selection algorithm for a satellite
   * constellation. The index of a satellite's corresponding row in the `Sᵀ` matrix matches the index of its position
   * vector in the provided line-of-sight position matrix.
   * @param los The line-of-sight position matrix for the satellite constellation.
   * @param covar The position-covariance matrix for the satellite constellation.
   * @param out The matrix to which to write the result.
   * @returns The transpose of the `S` matrix in the downdate satellite selection algorithm for the specified satellite
   * constellation.
   */
  private static calculateDowndateSTranspose(los: readonly ReadonlyFloat64Array[], covar: readonly ReadonlyFloat64Array[], out: Float64Array[]): Float64Array[] {
    for (let i = 0; i < los.length; i++) {
      for (let j = 0; j < 4; j++) {
        out[i][j] = 0;
        for (let k = 0; k < 4; k++) {
          out[i][j] += los[i][k] * covar[k][j];
        }
      }
    }

    return out;
  }

  /**
   * Calculates the diagonal of the `P` matrix in the downdate satellite selection algorithm for a satellite
   * constellation.
   * @param los The line-of-sight position matrix for the satellite constellation.
   * @param sTranspose The transpose of the `S` matrix in the downdate satellite selection algorithm for the satellite
   * constellation.
   * @param out The vector to which to write the result.
   * @returns The diagonal of the `P` matrix in the downdate satellite selection algorithm for the specified satellite
   * constellation.
   */
  private static calculateDowndatePDiag(los: readonly ReadonlyFloat64Array[], sTranspose: readonly ReadonlyFloat64Array[], out: Float64Array): Float64Array {
    out.fill(1);

    for (let i = 0; i < los.length; i++) {
      for (let j = 0; j < 4; j++) {
        out[i] -= sTranspose[i][j] * los[i][j];
      }
    }

    return out;
  }

  /**
   * Calculates the costs of removing each satellite from a constellation. The cost of removing a satellite is defined
   * as the amount by which `PDOP²` will increase when the satellite is removed relative to the full constellation. The
   * index of a satellite's cost in the returned array matches the index of the satellite's corresponding row in the
   * provided `Sᵀ` matrix.
   * @param sTranspose The transpose of the `S` matrix in the downdate satellite selection algorithm for the satellite
   * constellation.
   * @param pDiag The diagonal of the `P` matrix in the downdate satellite selection algorithm for the satellite
   * constellation.
   * @param out The array to which to write the results.
   * @returns The costs of removing each satellite from a constellation.
   */
  private static calculateSatelliteCosts(sTranspose: readonly ReadonlyFloat64Array[], pDiag: Float64Array, out: number[]): number[] {
    out.length = sTranspose.length;

    for (let i = 0; i < sTranspose.length; i++) {
      out[i] = (sTranspose[i][0] * sTranspose[i][0] + sTranspose[i][1] * sTranspose[i][1] + sTranspose[i][2] * sTranspose[i][2]) / pDiag[i];
    }

    return out;
  }
}

/**
 * An implementation of {@link GPSPredictionContext}.
 */
class PredictionContext implements GPSPredictionContext {
  /** The satellite simulation context used by this context. */
  public readonly _simulationContext = new SatelliteSimulationContext();

  public readonly _satInUseMaxCount = Subject.create(Infinity);
  /** @inheritDoc */
  public readonly satInUseMaxCount = this._satInUseMaxCount as Subscribable<number>;

  public readonly _satInUsePdopTarget = Subject.create(-1);
  /** @inheritDoc */
  public readonly satInUsePdopTarget = this._satInUsePdopTarget as Subscribable<number>;

  public readonly _satInUseOptimumCount = Subject.create(4);
  /** @inheritDoc */
  public readonly satInUseOptimumCount = this._satInUseOptimumCount as Subscribable<number>;

  /** @inheritDoc */
  public readonly enabledSbasGroups: SubscribableSet<string> & Subscribable<ReadonlySet<string>> = this._simulationContext.enabledSbasGroups;

  /** @inheritDoc */
  public readonly inhibitedSatellitePrnCodes: SubscribableSet<number> & Subscribable<ReadonlySet<number>> = this._simulationContext.manuallyInhibitedSatellitePrnCodes;

  private isAlive = true;
  private isInit = false;

  private initPromiseResolve!: () => void;
  private initPromiseReject!: (reason?: any) => void;
  private readonly initPromise = new Promise<void>((resolve, reject) => {
    this.initPromiseResolve = resolve;
    this.initPromiseReject = reject;
  });

  /**
   * Creates a new instance of PredictionContext.
   * @param isAlmanacValid A function to call to check whether this context's parent has access to a valid almanac that
   * is up-to-date for a given time.
   * @param setSatelliteSelectionParamsSync A function to call to set whether automatic sync of satellite selection
   * parameters from this context's parent is active.
   * @param setEnabledSbasGroupsSync A function to call to set whether automatic sync of enabled SBAS groups from this
   * context's parent is active.
   * @param setSatelliteInihibitSync A function to call to set whether automatic sync of manually inhibited satellites
   * from this context's parent is active.
   * @param onDestroy A function to call when this context is destroyed.
   */
  public constructor(
    private readonly isAlmanacValid: (time: number) => boolean,
    private readonly setSatelliteSelectionParamsSync: (context: PredictionContext, sync: boolean) => void,
    private readonly setEnabledSbasGroupsSync: (context: PredictionContext, sync: boolean) => void,
    private readonly setSatelliteInihibitSync: (context: PredictionContext, sync: boolean) => void,
    private readonly onDestroy: (context: PredictionContext) => void
  ) {
    this._satInUseMaxCount.sub(count => { this._simulationContext.satInUseMaxCount = count; });
    this._satInUsePdopTarget.sub(count => { this._simulationContext.satInUsePdopTarget = count; });
    this._satInUseOptimumCount.sub(count => { this._simulationContext.satInUseOptimumCount = count; });
  }

  /**
   * Marks this context as initialized.
   */
  public markInit(): void {
    this.isInit = true;
    this.initPromiseResolve();
  }

  /** @inheritDoc */
  public awaitInit(): Promise<void> {
    return this.initPromise;
  }

  /** @inheritDoc */
  public isParentAlamanacValid(time = this._simulationContext.time): boolean {
    return this.isAlmanacValid(time);
  }

  /** @inheritDoc */
  public getSatellites(): readonly GPSPredictionSatellite[] {
    return this._simulationContext.satellites;
  }

  /** @inheritDoc */
  public getLatLon(): GeoPointReadOnly {
    return this._simulationContext.position.readonly;
  }

  /** @inheritDoc */
  public getAltitude(): number {
    return this._simulationContext.altitude;
  }

  /** @inheritDoc */
  public getTime(): number {
    return this._simulationContext.time;
  }

  /** @inheritDoc */
  public getAvailableDiffCorrections(): ReadonlySet<string> {
    return this._simulationContext.diffCorrectionsSbasGroups;
  }

  /** @inheritDoc */
  public getCovarMatrix(): ReadonlyFloat64Array {
    return this._simulationContext.covarMatrix;
  }

  /** @inheritDoc */
  public getDops(): ReadonlyFloat64Array {
    return this._simulationContext.dops;
  }

  /** @inheritDoc */
  public setSatelliteSelectionParams(satInUseMaxCount: number, satInUsePdopTarget: number, satInUseOptimumCount: number): this {
    if (!this.isAlive) {
      throw new Error('GPSPredictionContext: cannot manipulate a dead context');
    }

    this.setSatelliteSelectionParamsSync(this, false);
    this._satInUseMaxCount.set(satInUseMaxCount);
    this._satInUsePdopTarget.set(satInUsePdopTarget);
    this._satInUseOptimumCount.set(satInUseOptimumCount);
    return this;
  }

  /** @inheritDoc */
  public syncSatelliteSelectionParamsWithParent(): this {
    if (!this.isAlive) {
      throw new Error('GPSPredictionContext: cannot manipulate a dead context');
    }

    this.setSatelliteSelectionParamsSync(this, true);
    return this;
  }

  /** @inheritDoc */
  public setEnabledSbasGroups(groups: Iterable<string>): this {
    if (!this.isAlive) {
      throw new Error('GPSPredictionContext: cannot manipulate a dead context');
    }

    this.setEnabledSbasGroupsSync(this, false);
    this._simulationContext.enabledSbasGroups.set(groups);
    return this;
  }

  /** @inheritDoc */
  public syncEnabledSbasGroupsWithParent(): this {
    if (!this.isAlive) {
      throw new Error('GPSPredictionContext: cannot manipulate a dead context');
    }

    this.setEnabledSbasGroupsSync(this, true);
    return this;
  }

  /** @inheritDoc */
  public setSatelliteInhibit(prn: number, inhibit: boolean): this {
    if (!this.isAlive) {
      throw new Error('GPSPredictionContext: cannot manipulate a dead context');
    }

    this.setSatelliteInihibitSync(this, false);
    this._simulationContext.manuallyInhibitedSatellitePrnCodes.toggle(prn, inhibit);
    return this;
  }

  /** @inheritDoc */
  public syncSatelliteInhibitWithParent(): this {
    if (!this.isAlive) {
      throw new Error('GPSPredictionContext: cannot manipulate a dead context');
    }

    this.setSatelliteInihibitSync(this, true);
    return this;
  }

  /** @inheritDoc */
  public setPosition(lat: number, lon: number, altitude: number, time: number): this {
    if (!this.isAlive) {
      throw new Error('GPSPredictionContext: cannot manipulate a dead context');
    }

    this._simulationContext.setPosition(lat, lon, altitude, time);
    return this;
  }

  /** @inheritDoc */
  public predict(): this {
    if (!this.isAlive) {
      throw new Error('GPSPredictionContext: cannot manipulate a dead context');
    }

    if (this.isInit) {
      this._simulationContext.update(0, true, true);
    }

    return this;
  }

  /** @inheritDoc */
  public destroy(): void {
    this.isAlive = false;
    this.initPromiseReject('GPSPredictionContext: context was destroyed before completing initialization');
    this.setSatelliteSelectionParamsSync(this, false);
    this.onDestroy(this);
  }
}
