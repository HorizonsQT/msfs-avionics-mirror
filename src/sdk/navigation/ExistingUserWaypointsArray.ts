import { Subscription } from '../sub/Subscription';
import { AbstractSubscribableArray } from '../sub/AbstractSubscribableArray';
import { Facility, FacilityType, UserFacility } from './Facilities';
import { FacilityWaypoint } from './Waypoint';
import { FacilityRepository, FacilityRepositoryEvents } from './FacilityRepository';
import { EventBus } from '../data/EventBus';
import { FacilityWaypointCache } from './FacilityWaypointCache';
import { FacilityUtils } from './FacilityUtils';
import { SubscribableArrayEventType } from '../sub/SubscribableArray';
import { ICAO } from './IcaoUtils';

/**
 * Configuration options for {@link ExistingUserWaypointsArray}.
 */
export type ExistingUserWaypointsArrayOptions = {
  /**
   * The scope of the user waypoints to include in the array. The scope is read from the airport ident field of the
   * waypoints' ICAO values.
   */
  scope?: string;
};

/**
 * An array of all existing user waypoints. Each instance of this class is automatically updated to contain all
 * existing user waypoints in the order in which they were added.
 */
export class ExistingUserWaypointsArray extends AbstractSubscribableArray<FacilityWaypoint<UserFacility>> {

  private readonly scope: string;

  private readonly _array: FacilityWaypoint<UserFacility>[] = [];

  /** @inheritDoc */
  public get length(): number {
    return this._array.length;
  }

  private readonly facRepoSubs: Subscription[];

  /**
   * Creates a new instance of ExistingUserWaypointsArray.
   * @param facRepo The facility repository.
   * @param bus The event bus.
   * @param facWaypointCache A cache from which to retrieve facility waypoints.
   * @param options Options with which to configure the array.
   */
  public constructor(
    facRepo: FacilityRepository,
    bus: EventBus,
    private readonly facWaypointCache: FacilityWaypointCache,
    options?: Readonly<ExistingUserWaypointsArrayOptions>
  ) {
    super();

    this.scope = options?.scope ?? '';

    facRepo.forEach(facility => {
      if (facility.icaoStruct.airport === this.scope) {
        this._array.push(facWaypointCache.get(facility));
      }
    }, [FacilityType.USR]);

    const sub = bus.getSubscriber<FacilityRepositoryEvents>();

    this.facRepoSubs = [
      sub.on('facility_added').handle(this.onFacilityAdded.bind(this)),
      sub.on('facility_removed').handle(this.onFacilityRemoved.bind(this))
    ];
  }

  /** @inheritDoc */
  public getArray(): readonly FacilityWaypoint<UserFacility>[] {
    return this._array;
  }

  /**
   * Responds to when a user facility is added.
   * @param facility The added facility.
   */
  private onFacilityAdded(facility: Facility): void {
    if (
      FacilityUtils.isFacilityType(facility, FacilityType.USR)
      && facility.icaoStruct.airport === this.scope
    ) {
      const waypoint = this.facWaypointCache.get<UserFacility>(facility);
      this._array.push(waypoint);
      this.notify(this._array.length - 1, SubscribableArrayEventType.Added, waypoint);
    }
  }

  /**
   * Responds to when a user facility is removed.
   * @param facility The removed facility.
   */
  private onFacilityRemoved(facility: Facility): void {
    if (
      FacilityUtils.isFacilityType(facility, FacilityType.USR)
      && facility.icaoStruct.airport === this.scope
    ) {
      const index = this._array.findIndex(waypoint => ICAO.valueEquals(waypoint.facility.get().icaoStruct, facility.icaoStruct));
      if (index >= 0) {
        this.notify(index, SubscribableArrayEventType.Removed, this._array.splice(index, 1)[0]);
      }
    }
  }

  /**
   * Destroys this array. Once destroyed, the state of the array will no longer reflect all existing user waypoints.
   */
  public destroy(): void {
    this.facRepoSubs.forEach(sub => { sub.destroy(); });
  }
}
