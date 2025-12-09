/// <reference types="@microsoft/msfs-types/js/simvar" preserve="true" />

import { EventBus, IndexedEventType } from '../data/EventBus';
import { PublishPacer } from '../data/EventBusPacer';
import { SimVarValueType } from '../data/SimVars';
import { SimVarPublisher, SimVarPublisherEntry } from './BasePublishers';

/**
 * Events for contact points.
 */
export interface BaseContactPointEvents {
  /** The percentage value representing the amount the contact point is compressed 0-1. */
  contact_point_compression: number;

  /** Whether the contact point is on the ground. */
  contact_point_is_on_ground: boolean;

  /** Whether the contact point is skidding. */
  contact_point_is_skidding: boolean;

  /** The currently extended position of the (retractable) contact point, 0-1. */
  contact_point_position: number;

  /** The skidding factor associated with the contact point, 0-1. */
  contact_point_skidding_factor: number;

  /**
   * This is the steering angle for the named contact point, in degrees,
   * where a negative value is to the left, and a positive value is to the right.
   */
  contact_point_steer_angle: number;

  /** This returns the depth of the water for the named contact point. */
  contact_point_water_depth: number;
}

/** Indexed topics. */
type IndexedTopics =
  'contact_point_compression' |
  'contact_point_is_on_ground' |
  'contact_point_is_skidding' |
  'contact_point_position' |
  'contact_point_skidding_factor' |
  'contact_point_steer_angle' |
  'contact_point_water_depth';

/** Indexed events. */
type ContactPointIndexedEvents = {
  [P in keyof Pick<BaseContactPointEvents, IndexedTopics> as IndexedEventType<P>]: BaseContactPointEvents[P];
};

/**
 * Events related to contact point information.
 */
export interface ContactPointEvents extends BaseContactPointEvents, ContactPointIndexedEvents {
}

/**
 * A publisher for contact point information.
 */
export class ContactPointSimVarPublisher extends SimVarPublisher<ContactPointEvents> {
  /**
   * Create an ContactPointSimvarPublisher
   * @param bus The EventBus to publish to
   * @param pacer An optional pacer to use to control the rate of publishing
   */
  public constructor(bus: EventBus, pacer: PublishPacer<ContactPointEvents> | undefined = undefined) {
    const simvars = new Map<keyof ContactPointEvents, SimVarPublisherEntry<any>>([
      ['contact_point_compression', { name: 'CONTACT POINT COMPRESSION:#index#', type: SimVarValueType.PercentOver100, indexed: true }],
      ['contact_point_is_on_ground', { name: 'CONTACT POINT IS ON GROUND:#index#', type: SimVarValueType.Bool, indexed: true }],
      ['contact_point_is_skidding', { name: 'CONTACT POINT IS SKIDDING:#index#', type: SimVarValueType.Bool, indexed: true }],
      ['contact_point_position', { name: 'CONTACT POINT POSITION:#index#', type: SimVarValueType.PercentOver100, indexed: true }],
      ['contact_point_skidding_factor', { name: 'CONTACT POINT SKIDDING FACTOR:#index#', type: SimVarValueType.PercentOver100, indexed: true }],
      ['contact_point_steer_angle', { name: 'CONTACT POINT STEER ANGLE:#index#', type: SimVarValueType.Degree, indexed: true }],
      ['contact_point_water_depth', { name: 'CONTACT POINT WATER DEPTH:#index#', type: SimVarValueType.Feet, indexed: true }],
    ]);

    super(simvars, bus, pacer);
  }
}
