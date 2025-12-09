import { EventBus } from '../data/EventBus';
import { SharedGlobal, SharedGlobalObjectRef } from '../data/SharedGlobal';
import { GeoPoint, GeoPointReadOnly } from '../geo/GeoPoint';
import { ExpSmoother } from '../math/ExpSmoother';
import { NumberUnit, NumberUnitReadOnly, UnitFamily, UnitType } from '../math/NumberUnit';
import { Wait } from '../utils/time/Wait';
import { Instrument } from './Backplane';
import { ClockEvents } from './Clock';

/**
 * Traffic events.
 */
export interface TrafficEvents {
  /** A traffic contact was added. The value is the uid of the new contact. */
  traffic_contact_added: number;

  /** A traffic contact was updated. The value is the uid of the updated contact. */
  traffic_contact_updated: number;

  /** A traffic contact was removed. The value is the uid of the removed contact. */
  traffic_contact_removed: number;
}

/**
 * A traffic contact.
 */
export interface TrafficContact {
  /** A unique ID number assigned to this contact. */
  readonly uid: number;

  /** The name/callsign of this contact. */
  readonly name: string;

  /** The last time of contact, in sim time, as a Javascript timestamp. */
  readonly lastContactTime: number;

  /** The position of this contact at time of last contact. */
  readonly lastPosition: GeoPointReadOnly;

  /** The altitude of this contact at time of last contact. */
  readonly lastAltitude: NumberUnitReadOnly<UnitFamily.Distance>;

  /** The heading of this contact at time of last contact, in degrees. */
  readonly lastHeading: number;

  /** The most recent calculated ground speed of this contact. Equal to NaN if not yet been calculated. */
  readonly groundSpeed: NumberUnitReadOnly<UnitFamily.Speed>;

  /** The most recent calculated ground track of this contact. Equal to NaN if not yet been calculated. */
  readonly groundTrack: number;

  /** The most recent calculated vertical speed of this contact. Equal to NaN if not yet been calculated. */
  readonly verticalSpeed: NumberUnitReadOnly<UnitFamily.Speed>;

  /**
   * Calculates the predicted position and altitude of this contact at a specified time based on the most recent
   * available data and stores the results in the supplied objects. If insufficient data are available to calculate
   * the prediction, the results will be equal to NaN.
   * @param simTime The sim time for which to calculate the prediction, as a UNIX millisecond timestamp.
   * @param positionOut A GeoPoint object to which to write the predicted position.
   * @param altitudeOut A NumberUnit object to which to write the predicted altitude.
   */
  predict(simTime: number, positionOut: GeoPoint, altitudeOut: NumberUnit<UnitFamily.Distance>): void;
}

/**
 * Configuration options for a {@link TrafficInstrument} whose state is not synced from another instance.
 */
export type TrafficInstrumentFunctionalOptions = {
  /** The maximum update frequency (Hz) in real time. Ignored if the instrument's sync role is `replica`. */
  realTimeUpdateFreq: number;

  /** The maximum update frequency (Hz) in sim time. Ignored if the instrument's sync role is `replica`. */
  simTimeUpdateFreq: number;

  /**
   * The maximum amount of sim time elapsed, in milliseconds, since last contact allowed before a contact is
   * deprecated. Ignored if the instrument's sync role is `replica`.
   */
  contactDeprecateTime: number;
};

/**
 * Configuration options for {@link TrafficInstrument} related to state sync.
 */
export type TrafficInstrumentSyncOptions = {
  /**
   * The ID to use when syncing the instrument's state. Cannot be the empty string. The instrument's state will only be
   * synced with other instruments that have the same sync ID. Ignored if the instrument's sync role is `none`.
   */
  syncId: string;
};

/**
 * Configuration options for {@link TrafficInstrument}.
 */
export type TrafficInstrumentOptions
  = (
    {
      /**
       * The instrument's sync role. A `primary` instrument will sync its state to corresponding `replica` instruments. An
       * instrument with a sync role of `none` does not sync its state to or from other instruments; it maintains its own
       * independent state. Defaults to `none`.
       */
      syncRole?: 'none';
    } & TrafficInstrumentFunctionalOptions
  ) | (
    {
      /**
       * The instrument's sync role. A `primary` instrument will sync its state to corresponding `replica` instruments. An
       * instrument with a sync role of `none` does not sync its state to or from other instruments; it maintains its own
       * independent state. Defaults to `none`.
       */
      syncRole: 'primary';
    } & TrafficInstrumentFunctionalOptions & TrafficInstrumentSyncOptions
  ) | (
    {
      /**
       * The instrument's sync role. A `primary` instrument will sync its state to corresponding `replica` instruments. An
       * instrument with a sync role of `none` does not sync its state to or from other instruments; it maintains its own
       * independent state. Defaults to `none`.
       */
      syncRole: 'replica';
    } & TrafficInstrumentSyncOptions
  );

/**
 * Tracks aircraft traffic. Maintains a list of contacts, periodically updates their position, altitude, and reported
 * heading, and uses these data to compute ground speed, ground track, and vertical speed.
 *
 * Requires the topics defined in {@link ClockEvents} to be published to the event bus.
 */
export class TrafficInstrument implements Instrument {
  private readonly publisher = this.bus.getPublisher<TrafficEvents>();

  private readonly listenerPromise?: Promise<ViewListener.ViewListener>;
  private listener?: ViewListener.ViewListener;

  private readonly syncRole: 'none' | 'primary' | 'replica';
  private readonly syncId: string;

  private readonly realTimeUpdatePeriod: number;
  private readonly simTimeUpdatePeriod: number;
  private readonly contactDeprecateTime: number;

  private sharedGlobalData?: SharedGlobalData;
  private lastSharedGlobalUpdateId: number | undefined = undefined;

  private readonly tracked = new Map<number, TrafficContact>();

  private isInitStarted = false;

  private lastUpdateRealTime = 0;
  private lastUpdateSimTime = 0;
  private isBusy = false;

  /**
   * Creates a new instance of TrafficInstrument.
   * @param bus The event bus.
   * @param options Options with which to configure this instrument.
   */
  public constructor(private readonly bus: EventBus, options: Readonly<TrafficInstrumentOptions>) {
    this.syncRole = options.syncRole ?? 'none';

    if (options.syncRole === 'primary' || options.syncRole === 'replica') {
      if (!options.syncId) {
        throw new Error('TrafficInstrument: required option syncId is the empty string');
      }

      this.syncId = options.syncId;
    } else {
      this.syncId = '';
    }

    if (options.syncRole === 'replica') {
      this.realTimeUpdatePeriod = 0;
      this.simTimeUpdatePeriod = 0;
      this.contactDeprecateTime = 0;
    } else {
      this.realTimeUpdatePeriod = 1000 / options.realTimeUpdateFreq;
      this.simTimeUpdatePeriod = 1000 / options.simTimeUpdateFreq;
      this.contactDeprecateTime = options.contactDeprecateTime;

      this.listenerPromise = new Promise(resolve => {
        const listener = RegisterViewListener('JS_LISTENER_AIR_TRAFFIC', () => {
          this.listener = listener;
          resolve(listener);
        });
      });
    }
  }

  /**
   * Gets the name of the shared global object to use for this instrument.
   * @returns The name of the shared global object to use for this instrument.
   */
  private getSharedGlobalName(): string {
    return `__msfssdk-trafficInstrumentSync-${this.syncId}`;
  }

  /**
   * Retrieves a traffic contact by its assigned ID number.
   * @param uid an ID number.
   * @returns the traffic contact with the assigned ID number, or undefined if no such contact exists.
   */
  public getContact(uid: number): TrafficContact | undefined {
    return this.tracked.get(uid);
  }

  /**
   * Iterates through all tracked traffic contacts with a visitor function.
   * @param visitor A visitor function.
   */
  public forEachContact(visitor: (contact: TrafficContact) => void): void {
    this.tracked.forEach(visitor);
  }

  /**
   * Initializes this instrument. Once initialized, this instrument will automatically track and update traffic
   * contacts. Initialization is asynchronous and is not guaranteed to have completed by the time this method returns.
   */
  public init(): void {
    this.doInit();
  }

  /**
   * Initializes this instrument. Once initialized, this instrument will automatically track and update traffic
   * contacts.
   */
  private async doInit(): Promise<void> {
    if (this.isInitStarted) {
      return;
    }

    this.isInitStarted = true;

    if (this.syncRole !== 'replica') {
      await Promise.all([
        this.listenerPromise,
        this.syncRole === 'primary' ? this.createSharedGlobal() : Promise.resolve()
      ]);

      this.bus.getSubscriber<ClockEvents>()
        .on('simTime')
        .whenChanged()
        .handle(this.updateFromSimData.bind(this));
    } else {
      await this.getSharedGlobal();

      this.bus.getSubscriber<ClockEvents>()
        .on('realTime')
        .handle(this.updateFromSharedData.bind(this));
    }
  }

  /**
   * Creates a shared global object for this instrument.
   */
  private async createSharedGlobal(): Promise<void> {
    const sharedGlobalName = this.getSharedGlobalName();
    const ref = await SharedGlobal.get(sharedGlobalName);

    if (!ref.isViewOwner) {
      throw new Error(`TrafficInstrument::createSharedGlobal(): could not create shared global with name ${sharedGlobalName} because a shared global with that name already exists`);
    }

    const data = ref.instance as SharedGlobalData;

    data.trafficContactData = new Map();
    data.updateId = 0;

    data.isReady = true;

    this.sharedGlobalData = data;
  }

  /**
   * Gets a shared global object for this instrument. If the shared global is ever detached, then this instrument's
   * state will be reset, and the process for getting a shared global will restart.
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

    const sub = ref.isDetached.sub(isDetached => {
      if (isDetached) {
        sub.destroy();

        this.reset();
        this.getSharedGlobal();
      }
    });
  }

  /**
   * Resets this instrument, uncoupling it from its associated shared data object and removing all tracked contacts.
   * This method should only be called if this instrument's sync role is `replica`.
   */
  private reset(): void {
    this.sharedGlobalData = undefined;
    this.lastSharedGlobalUpdateId = undefined;
    const contacts = [...this.tracked.values()];
    this.tracked.clear();
    for (const contact of contacts) {
      this.publisher.pub('traffic_contact_removed', contact.uid, false, false);
    }
  }

  /**
   * This method does nothing.
   */
  public onUpdate(): void {
    // noop
  }

  /**
   * Updates this instrument using the latest traffic data that can be retrieved from the sim.
   * @param simTime The current sim time, as a Javascript timestamp.
   */
  private async updateFromSimData(simTime: number): Promise<void> {
    const realTime = Date.now();
    if (
      this.isBusy
      || Math.abs(simTime - this.lastUpdateSimTime) < this.simTimeUpdatePeriod
      || Math.abs(realTime - this.lastUpdateRealTime) < this.realTimeUpdatePeriod
    ) {
      return;
    }

    this.isBusy = true;
    try {
      const data = await Promise.race([this.listener!.call('GET_AIR_TRAFFIC'), Wait.awaitDelay(1000)]);

      if (data) {
        this.updateContactsFromSimData(data, simTime);
        this.deprecateContacts(simTime);
        this.lastUpdateSimTime = simTime;
        this.lastUpdateRealTime = realTime;

        if (this.sharedGlobalData) {
          ++this.sharedGlobalData.updateId;
        }
      }
    } catch (e) {
      console.error(e);
      if (e instanceof Error) {
        console.error(e.stack);
      }
    }

    this.isBusy = false;
  }

  /**
   * Updates this instrument's list of contacts using traffic data retrieved from the sim.
   * @param data An array of the most recent traffic data entries retrieved from the sim.
   * @param simTime The sim time at which the traffic data was generated.
   */
  private updateContactsFromSimData(data: readonly TrafficDataEntry[], simTime: number): void {
    const len = data.length;
    for (let i = 0; i < len; i++) {
      const entry = data[i];
      const contact = this.tracked.get(entry.uId) as TrafficContactClass | undefined;
      if (contact) {
        this.updateContactFromSimDataEntry(contact, entry, simTime);
      } else {
        this.createContactFromSimDataEntry(entry, simTime);
      }
    }
  }

  /**
   * Creates a contact from a sim traffic data entry.
   * @param entry The traffic data entry from which to create the new contact.
   * @param simTime The sim time at which the traffic data entry was generated, as a Javascript timestamp.
   */
  private createContactFromSimDataEntry(entry: TrafficDataEntry, simTime: number): void {
    let sharedContactData: SharedTrafficContactData | undefined;
    if (this.sharedGlobalData) {
      sharedContactData = this.sharedGlobalData.trafficContactData.get(entry.uId);
      if (!sharedContactData) {
        sharedContactData = {
          uid: entry.uId,
          name: entry.name,
          lat: NaN,
          lon: NaN,
          altitude: NaN,
          heading: NaN,
          lastContactTime: NaN,
          groundSpeed: NaN,
          groundTrack: NaN,
          verticalSpeed: NaN,
        };
        this.sharedGlobalData.trafficContactData.set(sharedContactData.uid, sharedContactData);
      }
    }

    const contact = new TrafficContactClass(entry.uId, this.simTimeUpdatePeriod * 5, sharedContactData);
    this.tracked.set(contact.uid, contact);

    contact.update(simTime, entry);
    this.publisher.pub('traffic_contact_added', contact.uid, false, false);
  }

  /**
   * Updates a contact from a sim traffic data entry.
   * @param contact The contact to update.
   * @param entry The current traffic data entry for the contact.
   * @param simTime The sim time at which the traffic data entry was generated, as a Javascript timestamp.
   */
  private updateContactFromSimDataEntry(contact: TrafficContactClass, entry: TrafficDataEntry, simTime: number): void {
    contact.update(simTime, entry);
    this.publisher.pub('traffic_contact_updated', contact.uid, false, false);
  }

  /**
   * Removes all contacts whose time since last contact exceeds the deprecation threshold.
   * @param simTime The current sim time, as a Javascript timestamp.
   */
  private deprecateContacts(simTime: number): void {
    this.tracked.forEach(contact => {
      const dt = Math.abs(simTime - contact.lastContactTime);
      if (dt >= this.contactDeprecateTime) {
        if (this.sharedGlobalData) {
          this.sharedGlobalData.trafficContactData.delete(contact.uid);
        }

        this.tracked.delete(contact.uid);
        this.publisher.pub('traffic_contact_removed', contact.uid, false, false);
      }
    });
  }

  /**
   * Updates this instrument from its associated shared data object. If the shared data object is not defined, then
   * this method does nothing.
   */
  private updateFromSharedData(): void {
    if (!this.sharedGlobalData) {
      return;
    }

    if (this.lastSharedGlobalUpdateId === this.sharedGlobalData.updateId) {
      return;
    }

    // Mark all existing tracked contacts for removal. The mark will be removed if traffic data for the contact still
    // exists on the shared data object.
    for (const contact of this.tracked.values()) {
      (contact as SyncedTrafficContactClass).isMarkedForRemoval = true;
    }

    for (const contactData of this.sharedGlobalData.trafficContactData.values()) {
      const existing = this.tracked.get(contactData.uid) as SyncedTrafficContactClass | undefined;
      if (existing) {
        existing.update(contactData);
        existing.isMarkedForRemoval = false;
        this.publisher.pub('traffic_contact_updated', existing.uid, false, false);
      } else {
        this.createContactFromSharedData(contactData);
      }
    }

    // Remove all tracked contacts that are still marked for removal.
    for (const contact of this.tracked.values()) {
      if ((contact as SyncedTrafficContactClass).isMarkedForRemoval) {
        this.tracked.delete(contact.uid);
        this.publisher.pub('traffic_contact_removed', contact.uid, false, false);
      }
    }

    this.lastSharedGlobalUpdateId = this.sharedGlobalData.updateId;
  }

  /**
   * Creates a contact from shared traffic data.
   * @param data The shared traffic data from which to create the new contact.
   */
  private createContactFromSharedData(data: Readonly<SharedTrafficContactData>): void {
    const contact = new SyncedTrafficContactClass(data.uid);
    this.tracked.set(contact.uid, contact);
    contact.update(data);
    this.publisher.pub('traffic_contact_added', contact.uid, false, false);
  }
}

/**
 * A traffic data entry provided by the sim.
 */
type TrafficDataEntry = {
  /** A unique ID number assigned to this entry. */
  readonly uId: number;

  /** The name or callsign of the entry. */
  readonly name: string;

  /** The ICAO plane model of the entry. */
  readonly plane_model_icao: string;

  /** This entry's current reported latitude, in degrees. */
  readonly lat: number;

  /** This entry's current reported longitude, in degrees. */
  readonly lon: number;

  /** This entry's current reported altitude, in meters. */
  readonly alt: number;

  /** This entry's current reported heading, in degrees. */
  readonly heading: number;
};

/**
 * Data used to sync a traffic contact's state.
 */
type SharedTrafficContactData = {
  /** The unique ID number assigned to the contact. */
  uid: number;

  /** The name or callsign of the contact. */
  name: string;

  /** The last reported latitude of the contact, in degrees. */
  lat: number;

  /** The last reported longitude of the contact, in degrees. */
  lon: number;

  /** The last reported altitude of the contact, in feet. */
  altitude: number;

  /** The last reported heading of the contact, in degrees. */
  heading: number;

  /** The last time of contact, as a Javascript timestamp. */
  lastContactTime: number;

  /** The last calculated ground speed of the contact, in knots. */
  groundSpeed: number;

  /** The last calculated true ground track of the contact, in degrees. */
  groundTrack: number;

  /** The last calculated vertical speed of the contact, in feet per minute. */
  verticalSpeed: number;
};

/**
 * A shared global object used to sync state between primary and replica instances of {@link TrafficInstrument}.
 */
type SharedGlobalData = {
  /** Whether this shared data object is ready to be used. */
  isReady: boolean;

  /** A map containing data describing all currently tracked traffic contacts, keyed by UID. */
  trafficContactData: Map<number, SharedTrafficContactData>;

  /** A numeric identifier for the last operation that updated these data. */
  updateId: number;
};

/**
 * An abstract implementation of {@link TrafficContact} that defines all required properties and the `predict()`
 * method, but leaves the details of updating data to subclasses.
 */
abstract class AbstractTrafficContact implements TrafficContact {
  // reported data

  public name = '';

  protected readonly _lastPosition = new GeoPoint(NaN, NaN);
  public readonly lastPosition = this._lastPosition.readonly;

  protected readonly _lastAltitude = UnitType.FOOT.createNumber(NaN);
  public readonly lastAltitude = this._lastAltitude.readonly;

  /** @inheritDoc */
  public lastHeading = NaN;

  /** @inheritDoc */
  public lastContactTime = NaN;

  // computed data

  protected readonly _groundSpeed = UnitType.KNOT.createNumber(NaN);
  /** @inheritDoc */
  public readonly groundSpeed = this._groundSpeed.readonly;

  /** @inheritDoc */
  public groundTrack = NaN;

  protected readonly _verticalSpeed = UnitType.FPM.createNumber(NaN);
  /** @inheritDoc */
  public readonly verticalSpeed = this._verticalSpeed.readonly;

  /**
   * Creates a new instance of AbstractTrafficContact.
   * @param uid This contact's unique ID number.
   */
  public constructor(public readonly uid: number) {
  }

  /** @inheritDoc */
  public predict(simTime: number, positionOut: GeoPoint, altitudeOut: NumberUnit<UnitFamily.Distance>): void {
    if (this._groundSpeed.isNaN()) {
      positionOut.set(NaN, NaN);
      altitudeOut.set(NaN);
      return;
    }

    const dt = simTime - this.lastContactTime;

    const distance = UnitType.NMILE.convertTo(this._groundSpeed.number * (dt / 3600000), UnitType.GA_RADIAN);
    this._lastPosition.offset(this.groundTrack, distance, positionOut);

    const deltaAlt = this._verticalSpeed.number * (dt / 60000);
    this._lastAltitude.add(deltaAlt, UnitType.FOOT, altitudeOut);
  }
}

/**
 * An aircraft contact that is being tracked. Each contact tracks its last reported position, altitude, and heading.
 * Successively updating these values will allow ground speed, ground track, and vertical speed to be calculated based
 * on changes in the values over time. The calculated values are exponentially smoothed to reduce artifacts from
 * potentially noisy data.
 */
class TrafficContactClass extends AbstractTrafficContact {
  private static readonly GROUND_SPEED_TIME_CONSTANT = 2 / Math.LN2;
  private static readonly GROUND_TRACK_TIME_CONSTANT = 2 / Math.LN2;
  private static readonly VERTICAL_SPEED_TIME_CONSTANT = 2 / Math.LN2;

  private static readonly MAX_VALID_GROUND_SPEED = 1500; // knots
  private static readonly MAX_VALID_VERTICAL_SPEED = 10000; // fpm
  private static readonly MIN_GROUND_TRACK_DISTANCE = 10 / 1852; // nautical miles

  private static readonly tempGeoPoint = new GeoPoint(0, 0);

  private readonly groundSpeedSmoother = new ExpSmoother(TrafficContactClass.GROUND_SPEED_TIME_CONSTANT, null, this.contactTimeResetThreshold / 1000);
  private readonly groundTrackSmoother = new ExpSmoother(TrafficContactClass.GROUND_TRACK_TIME_CONSTANT, null, this.contactTimeResetThreshold / 1000);
  private readonly verticalSpeedSmoother = new ExpSmoother(TrafficContactClass.VERTICAL_SPEED_TIME_CONSTANT, null, this.contactTimeResetThreshold / 1000);

  /**
   * Creates a new instance of TrafficContactClass.
   * @param uid The contact's unique ID number.
   * @param contactTimeResetThreshold The maximum allowed elapsed sim time, in milliseconds, since time of last contact
   * before this contact's computed values are reset.
   * @param sharedData The shared data object to which to write this contact's state.
   */
  public constructor(
    uid: number,
    private readonly contactTimeResetThreshold: number,
    private readonly sharedData?: SharedTrafficContactData
  ) {
    super(uid);
  }

  /**
   * Updates this contact from a traffic data entry. Also updates the computed ground speed, ground track, and vertical
   * speed if there are sufficient data to do so. If a shared data object is assigned to this contact, then it will
   * also be updated.
   * @param simTime The current sim time.
   * @param entry The data entry to use to update this contact.
   */
  public update(simTime: number, entry: TrafficDataEntry): void {
    const dt = simTime - this.lastContactTime;

    if (!isNaN(dt) && (dt < 0 || dt > this.contactTimeResetThreshold)) {
      this.reset(simTime, entry);
      this.updateSharedData();
      return;
    }

    if (!isNaN(dt) && dt > 0) {
      this.updateComputedValues(dt / 1000, entry);
    }

    this.setReportedValues(entry);

    if (this.areComputedValuesValid()) {
      this.lastContactTime = simTime;
    } else {
      this.reset(simTime, entry);
    }

    this.updateSharedData();
  }

  /**
   * Erases this contact's tracking history and sets the initial reported name, position, altitude, and heading from a
   * traffic data entry.
   * @param simTime The current sim time.
   * @param entry The data entry to use to reset this contact.
   */
  private reset(simTime: number, entry: TrafficDataEntry): void {
    this.setReportedValues(entry);
    this._groundSpeed.set(NaN);
    this.groundTrack = NaN;
    this._verticalSpeed.set(NaN);
    this.groundSpeedSmoother.reset();
    this.groundTrackSmoother.reset();
    this.verticalSpeedSmoother.reset();
    this.lastContactTime = simTime;
  }

  /**
   * Sets this contact's most recent reported values from a traffic data entry.
   * @param entry The data entry to use to update this contact.
   */
  private setReportedValues(entry: TrafficDataEntry): void {
    this.name = entry.name;
    this._lastPosition.set(entry.lat, entry.lon);
    this._lastAltitude.set(entry.alt, UnitType.METER);
    this.lastHeading = entry.heading;
  }

  /**
   * Updates this contact's computed values from a traffic data entry.
   * @param dt The elapsed time, in seconds, since last contact.
   * @param entry The data entry to use to update this contact.
   */
  private updateComputedValues(dt: number, entry: TrafficDataEntry): void {
    const pos = TrafficContactClass.tempGeoPoint.set(entry.lat, entry.lon);
    const distanceNM = UnitType.GA_RADIAN.convertTo(this.lastPosition.distance(pos), UnitType.NMILE);
    const track = pos.bearingFrom(this._lastPosition);
    this.updateGroundSpeed(dt, distanceNM);
    this.updateGroundTrack(dt, track, distanceNM);
    this.updateVerticalSpeed(dt, UnitType.METER.convertTo(entry.alt, UnitType.FOOT));
  }

  /**
   * Updates this contact's ground speed.
   * @param dt The elapsed time, in seconds, since last contact.
   * @param distanceNM The distance, in nautical miles, from this contact's position at last contact to this contact's
   * current reported position.
   */
  private updateGroundSpeed(dt: number, distanceNM: number): void {
    const dtHours = dt / 3600;
    const speedKnots = distanceNM / dtHours;
    this._groundSpeed.set(this.groundSpeedSmoother.next(speedKnots, dt));
  }

  /**
   * Updates this contact's ground track.
   * @param dt The elapsed time, in seconds, since last contact.
   * @param track The true ground track from this contact's position at last contact to this contact's current reported
   * position, as measured at the current reported position.
   * @param distanceNM The distance, in nautical miles, from this contact's position at last contact to this contact's
   * current reported position.
   */
  private updateGroundTrack(dt: number, track: number, distanceNM: number): void {
    const last = this.groundTrackSmoother.last();
    if (distanceNM >= TrafficContactClass.MIN_GROUND_TRACK_DISTANCE) {
      if (last !== null && !isNaN(last)) {
        // need to handle wraparounds
        let delta = track - last;
        if (delta > 180) {
          delta = delta - 360;
        } else if (delta < -180) {
          delta = delta + 360;
        }
        track = last + delta;
      }
    } else {
      // if distance between current and last position is too small, computed ground track will be unreliable
      // (and if distance = 0 the track will be meaningless), so we just copy forward the last computed track,
      // or NaN if there is no previously computed track
      track = last === null ? NaN : last;
    }
    const next = last !== null && isNaN(last) ? this.groundTrackSmoother.reset(track) : this.groundTrackSmoother.next(track, dt);
    this.groundTrack = (next + 360) % 360; // enforce range 0-359
  }

  /**
   * Updates this contact's vertical speed.
   * @param dt The elapsed time, in seconds, since last contact.
   * @param altitude The current reported altitude, in feet.
   */
  private updateVerticalSpeed(dt: number, altitude: number): void {
    const dtMin = dt / 60;
    const deltaAltFeet = altitude - this._lastAltitude.number;
    const vsFPM = deltaAltFeet / dtMin;
    this._verticalSpeed.set(this.verticalSpeedSmoother.next(vsFPM, dt));
  }

  /**
   * Checks whether this contact's calculated ground speed and vertical speeds are valid.
   * @returns whether this contact's calculated ground speed and vertical speeds are valid.
   */
  private areComputedValuesValid(): boolean {
    const isGroundSpeedValid = this._groundSpeed.isNaN() || this._groundSpeed.number <= TrafficContactClass.MAX_VALID_GROUND_SPEED;
    const isVerticalSpeedValid = this._verticalSpeed.isNaN() || this._verticalSpeed.number <= TrafficContactClass.MAX_VALID_VERTICAL_SPEED;
    return isGroundSpeedValid && isVerticalSpeedValid;
  }

  /**
   * Updates this contact's assigned shared data with the current state of the contact.
   */
  private updateSharedData(): void {
    if (!this.sharedData) {
      return;
    }

    this.sharedData.lat = this._lastPosition.lat;
    this.sharedData.lon = this._lastPosition.lon;
    this.sharedData.altitude = this._lastAltitude.asUnit(UnitType.FOOT);
    this.sharedData.heading = this.lastHeading;

    this.sharedData.groundSpeed = this._groundSpeed.asUnit(UnitType.KNOT);
    this.sharedData.groundTrack = this.groundTrack;
    this.sharedData.verticalSpeed = this._verticalSpeed.asUnit(UnitType.FPM);

    this.sharedData.lastContactTime = this.lastContactTime;
  }
}

/**
 * A traffic contact whose state is updated from synced data.
 */
class SyncedTrafficContactClass extends AbstractTrafficContact {
  /** Whether this contact has been marked for removal. */
  public isMarkedForRemoval = false;

  /**
   * Creates a new instance of SyncedTrafficContactClass.
   * @param uid The contact's unique ID number.
   */
  public constructor(uid: number) {
    super(uid);
  }

  /**
   * Updates this contact's state from a shared data object.
   * @param data The shared data object from which to update this contact's state.
   */
  public update(data: Readonly<SharedTrafficContactData>): void {
    this.name = data.name;

    this._lastPosition.set(data.lat, data.lon);
    this._lastAltitude.set(data.altitude, UnitType.FOOT);
    this.lastHeading = data.heading;

    this._groundSpeed.set(data.groundSpeed, UnitType.KNOT);
    this.groundTrack = data.groundTrack;
    this._verticalSpeed.set(data.verticalSpeed, UnitType.FPM);

    this.lastContactTime = data.lastContactTime;
  }
}
