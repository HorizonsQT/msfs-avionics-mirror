import { FlightPlan } from '../../flightplan/FlightPlan';
import { FlightPlanner } from '../../flightplan/FlightPlanner';
import { FlightPlanSegment, LegDefinition } from '../../flightplan/FlightPlanning';
import { BitFlags } from '../../math/BitFlags';
import { MathUtils } from '../../math/MathUtils';
import { AltitudeRestrictionType, FixTypeFlags } from '../../navigation/Facilities';
import { Subject } from '../../sub/Subject';
import { Subscribable } from '../../sub/Subscribable';
import { SubscribableUtils } from '../../sub/SubscribableUtils';
import { Subscription } from '../../sub/Subscription';
import { VNavUtils } from '../vnav/VNavUtils';

/**
 * A description of a glidepath.
 */
export type GlidePathDescription = {
  /** The index of the flight plan containing the glidepath. */
  readonly planIndex: number;

  /**
   * The global index of the flight plan leg containing the glidepath reference point, or `-1` if there is no valid
   * glidepath. The reference point is always located at the end of its containing leg.
   */
  readonly referenceLegIndex: number;

  /** The altitude, in meters, of the glidepath reference point. */
  readonly referenceAltitude: number;

  /** The angle of the glidepath, in degrees. Positive angles represent a descending path. */
  readonly angle: number;
};

/**
 * Configuration options for {@link GlidePathCalculator2}.
 */
export type GlidePathCalculator2Options = {
  /** The index of the flight plan to track. */
  planIndex: number | Subscribable<number>;

  /**
   * A function which checks whether a candidate flight plan leg is eligible to host a glidepath reference point. If
   * not defined, then all candidate legs will be considered eligible.
   * @param leg The flight plan leg to check.
   * @param segment The flight plan segment containing the leg to check.
   * @param segmentIndex The index of the flight plan segment containing the leg to check.
   * @param segmentLegIndex The index of the leg to check within its containing segment.
   * @param plan The flight plan containing the leg to check.
   * @returns Whether the specified flight plan leg is eligible to host a glidepath reference point.
   */
  isEligibleReferenceLeg?: (
    leg: LegDefinition,
    segment: FlightPlanSegment,
    segmentIndex: number,
    segmentLegIndex: number,
    plan: FlightPlan
  ) => boolean;
};

/**
 * A calculator that tracks RNAV approach glidepaths for a flight plan.
 * 
 * The calculator attempts to find a glidepath for its flight plan by searching for a reference flight plan leg which
 * defines a published AT/AT OR ABOVE altitude constraint and a non-zero vertical angle. This leg must follow the last
 * leg in the flight plan that is designated as a final approach fix (FAF), if such a leg exists. If multiple legs meet
 * the criteria for a reference leg, then the one that appears last in the flight plan is chosen. If a reference leg is
 * found, then the glidepath reference point is set to the end of the reference leg at an altitude equal to the leg's
 * altitude constraint. The glidepath is then set to be the vertical path of angle equal to the reference leg's
 * published vertical angle that passes through the reference point.
 */
export class GlidePathCalculator2 {

  private readonly planIndex: Subscribable<number>;

  private readonly isEligibleReferenceLeg: (
    leg: LegDefinition,
    segment: FlightPlanSegment,
    segmentIndex: number,
    segmentLegIndex: number,
    plan: FlightPlan
  ) => boolean;

  private readonly _glidepath = Subject.create<GlidePathDescription>(
    {
      planIndex: -1,
      referenceLegIndex: -1,
      referenceAltitude: 0,
      angle: 0,
    },
    (a, b) => {
      return a.planIndex === b.planIndex
        && a.referenceLegIndex === b.referenceLegIndex
        && a.referenceAltitude === b.referenceAltitude
        && a.angle === b.angle;
    }
  );
  /** A description of this calculator's tracked glidepath. */
  public readonly glidepath = this._glidepath as Subscribable<GlidePathDescription>;

  private readonly _isGlidepathSynced = Subject.create(false);
  /** Whether this calculator's tracked glidepath is in sync with the tracked flight plan. */
  public readonly isGlidepathSynced = this._isGlidepathSynced as Subscribable<boolean>;

  private needUpdate = false;

  private readonly subscriptions: Subscription[] = [];

  /**
   * Creates a new instance of GlidePathCalculator2.
   * @param flightPlanner The flight planner to use.
   * @param options Options with which to configure the calculator.
   */
  public constructor(
    private readonly flightPlanner: FlightPlanner,
    options: Readonly<GlidePathCalculator2Options>
  ) {
    this.planIndex = SubscribableUtils.toSubscribable(options.planIndex, true);

    this.isEligibleReferenceLeg = options.isEligibleReferenceLeg ?? (() => true);

    this.initSubscriptions();

    this.needUpdate = true;
    this._isGlidepathSynced.set(false);
  }

  /**
   * Initializes this calculator's subscriptions.
   */
  private initSubscriptions(): void {
    const scheduleUpdate = (): void => {
      this.needUpdate = true;
      this._isGlidepathSynced.set(false);
    };

    this.subscriptions.push(
      this.flightPlanner.onEvent('fplCreated').handle(e => {
        if (e.planIndex === this.planIndex.get()) {
          scheduleUpdate();
        }
      }),

      this.flightPlanner.onEvent('fplCopied').handle(e => {
        if (e.targetPlanIndex === this.planIndex.get()) {
          scheduleUpdate();
        }
      }),

      this.flightPlanner.onEvent('fplLoaded').handle(e => {
        if (e.planIndex === this.planIndex.get()) {
          scheduleUpdate();
        }
      }),

      this.flightPlanner.onEvent('fplDeleted').handle(e => {
        if (e.planIndex === this.planIndex.get()) {
          scheduleUpdate();
        }
      }),

      this.flightPlanner.onEvent('fplLegChange').handle(e => {
        if (e.planIndex === this.planIndex.get()) {
          scheduleUpdate();
        }
      }),

      this.flightPlanner.onEvent('fplSegmentChange').handle(e => {
        if (e.planIndex === this.planIndex.get()) {
          scheduleUpdate();
        }
      }),

      this.flightPlanner.onEvent('fplIndexChanged').handle(scheduleUpdate),

      // this.flightPlanner.onEvent('fplCalculated').handle(e => {
      //   if (e.planIndex === this.planIndex.get()) {
      //     this.onPlanCalculated();
      //   }
      // }),

      this.planIndex.sub(scheduleUpdate)
    );
  }

  /**
   * Gets the distance from a point along this calculator's tracked flight plan to the glidepath reference point.
   * @param globalLegIndex The global index of the flight plan leg containing the query point.
   * @param distanceFromLegEnd The distance from the query point to the end of its containing leg, in meters.
   * @returns The distance from the specified point to the glidepath reference point. A positive value indicates the
   * query point is located prior to the reference point along the flight plan. A negative value indicates the query
   * point is located after the reference point along the flight plan. If this calculator has no tracked glidepath or
   * the query point is not valid, then `undefined` will be returned.
   */
  public getDistanceToReference(globalLegIndex: number, distanceFromLegEnd: number): number | undefined {
    const glidepath = this._glidepath.get();

    if (glidepath.referenceLegIndex < 0 || !this.flightPlanner.hasFlightPlan(glidepath.planIndex)) {
      return undefined;
    }

    const plan = this.flightPlanner.getFlightPlan(glidepath.planIndex);

    const referenceLeg = plan.tryGetLeg(glidepath.referenceLegIndex);
    const queryLeg = plan.tryGetLeg(globalLegIndex);

    if (!referenceLeg?.calculated || !queryLeg?.calculated) {
      return undefined;
    }

    const queryDistanceAlongPlan = queryLeg.calculated.cumulativeDistanceWithTransitions - distanceFromLegEnd;

    return referenceLeg.calculated.cumulativeDistanceWithTransitions - queryDistanceAlongPlan;
  }

  /**
   * Gets the desired altitude along this calculator's tracked glidepath at a given distance to the glidepath reference
   * point.
   * @param distanceFromReference The distance to the glidepath reference point, in meters.
   * @returns The desired altitude along this calculator's tracked glidepath at the specified distance to the glidepath
   * reference point, or `undefined` if there is no tracked glidepath.
   */
  public getDesiredAltitude(distanceFromReference: number): number | undefined {
    const glidepath = this._glidepath.get();

    if (glidepath.referenceLegIndex < 0) {
      return undefined;
    }

    return glidepath.referenceAltitude + VNavUtils.altitudeForDistance(glidepath.angle, distanceFromReference);
  }

  /**
   * Updates this calculator, syncing the state of its tracked glidepath with its tracked flight plan.
   */
  public update(): void {
    if (!this.needUpdate) {
      return;
    }
    this.needUpdate = false;

    const planIndex = this.planIndex.get();

    const glidepath = {
      planIndex,
      referenceLegIndex: -1,
      referenceAltitude: 0,
      angle: 0,
    } satisfies GlidePathDescription;

    if (!this.flightPlanner.hasFlightPlan(planIndex)) {
      this._glidepath.set(glidepath);
      this._isGlidepathSynced.set(true);
      return;
    }

    const plan = this.flightPlanner.getFlightPlan(planIndex);

    let foundFaf = false;
    let referenceLegIndex = -1;
    const referenceLeg = plan.findLeg((leg, segment, segmentIndex, segmentLegIndex) => {
      foundFaf ||= BitFlags.isAny(leg.leg.fixTypeFlags, FixTypeFlags.FAF);

      if (foundFaf || !this.isEligibleReferenceLeg(leg, segment, segmentIndex, segmentLegIndex, plan)) {
        return false;
      }

      if (
        (leg.leg.altDesc === AltitudeRestrictionType.At || leg.leg.altDesc === AltitudeRestrictionType.AtOrAbove)
        && leg.leg.verticalAngle > 270 && leg.leg.verticalAngle < 360
      ) {
        referenceLegIndex = segment.offset + segmentLegIndex;
        return true;
      }

      return false;
    }, true);

    if (!referenceLeg) {
      this._glidepath.set(glidepath);
      this._isGlidepathSynced.set(true);
      return;
    }

    glidepath.referenceLegIndex = referenceLegIndex;
    glidepath.referenceAltitude = referenceLeg.leg.altitude1;
    glidepath.angle = -MathUtils.normalizeAngleDeg(referenceLeg.leg.verticalAngle, -180);

    this._glidepath.set(glidepath);
    this._isGlidepathSynced.set(true);
  }

  /**
   * Destroys this calculator.
   */
  public destroy(): void {
    for (const sub of this.subscriptions) {
      sub.destroy();
    }
  }
}
