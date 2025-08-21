/// <reference types="@microsoft/msfs-types/js/common" preserve="true" />
import { HandlerSubscription } from '../sub/HandlerSubscription';
import { Subscription } from '../sub/Subscription';
import { EventSubscriber } from './EventSubscriber';

/** A handler for handling subscription data. */
export type Handler<T> = (data: T) => void;

/** A handler for handling wildcard multiple subscription data. */
export type WildcardHandler = (topic: string, data: any) => void;

/**
 * Meta-events published for event bus happenings.
 */
export interface EventBusMetaEvents {
  /** General event bus topic, currently only used for resync requests. */
  event_bus: string,
  /** Notification that a topic has had a subscripiton.  */
  event_bus_topic_first_sub: string
}

/**
 * Used for storing events in an event cache.
 */
type CachedEvent = {
  /** The data that was sent */
  data: any,
  /** Whether or not the data should be synced */
  synced: boolean
}

/**
 * An indexed event type. Indexed events have keys of the form `event_[index]`.
 */
export type IndexedEventType<T extends string> = `${T}_${number}`;

/**
 * Creates an indexed events type. Indexed events have keys of the form `event_[index]`.
 */
export type IndexedEvents<Events extends { [event: string]: any }, Index extends number> = {
  [Event in keyof Events as `${Event & string}_${Index}`]: Events[Event];
};

/**
 * Mock event types.
 */
export interface MockEventTypes {
  /** A random number event. */
  randomNumber: number;
}

/**
 * An interface that describes an event publisher.
 */
export interface Publisher<E> {
  /**
   * Publishes an event with data to a topic.
   * @param topic The topic to publish to.
   * @param data The data to publish.
   * @param sync Whether or the event should be synced to other event bus instances. Defaults to `false`.
   * @param isCached Whether the event data should be cached. Cached data that are published to a topic can be
   * retrieved by subscribers after the data was initially published. Defaults to `true`.
   */
  pub<K extends keyof E>(topic: K, data: E[K], sync?: boolean, isCached?: boolean): void;
}

/**
 * A handler for syncing events published to an event bus to other event bus instances.
 */
export interface EventBusSyncHandler {
  /**
   * Sends an event to be synced to other event bus instances.
   * @param topic The event topic.
   * @param data The event data.
   * @param isCached Whether the event data should be cached.
   */
  sendSyncedEvent(topic: string, data: unknown, isCached: boolean): void;
}

/**
 * A function that creates an object that handles syncing events published to an {@link EventBus} to other event bus
 * instances.
 * @param busId The unique ID assigned to the event bus.
 * @param onSyncedEventReceived A function to call when a synced event from another event bus instance is received.
 * @returns An object that handles syncing events published to the specified event bus to other event bus instances.
 */
export type EventBusSyncHandlerFactory = (
  busId: number,
  onSyncedEventReceived: (topic: string, data: unknown, isCached: boolean) => void
) => EventBusSyncHandler;

/**
 * A structure that holds both the subscriptions for a given topic, and its notify recursion depth
 */
type EventBusTopicSubscriptions = {
  /** The subscriptions */
  handlerSubscriptions: HandlerSubscription<Handler<any>>[];
  /** Current recursion depth of notifications. Used to guard against destruction during recursion  */
  notifyDepth: number;
}

/**
 * An event bus that can be used to publish data from backend
 * components and devices to consumers.
 */
export class EventBus {
  private _topicSubsMap = new Map<string, EventBusTopicSubscriptions>();
  private _wildcardSubs = new Array<HandlerSubscription<WildcardHandler>>();
  private _wildcardNotifyDepth = 0;

  private _eventCache = new Map<string, CachedEvent>();

  private readonly _busId: number;

  private readonly _busSync: EventBusSyncHandler;

  protected readonly onWildcardSubDestroyedFunc = this.onWildcardSubDestroyed.bind(this);

  /**
   * Creates an instance of an EventBus.
   * @param useAlternativeEventSync Whether to sync events to other event bus instances using the Coherent flow event
   * API (`true`) instead of the generic data listener (`false`). Flow event sync sends events to event bus instances
   * on other Coherent views that are considered gauges. The generic data listener sync sends events to event bus
   * instances on all other Coherent views. Defaults to `false`.
   * @param shouldResync Whether the the newly created bus should ask for a resync of all previously cached events
   * after it is created. Defaults to `true`.
   */
  public constructor(useAlternativeEventSync?: boolean, shouldResync?: boolean);
  /**
   * Creates an instance of an EventBus.
   * @param syncHandlerFactory A function that creates an object that handles syncing events published to the new bus
   * to other event bus instances. If not defined, then a built-in sync handler that sends events to all other Coherent
   * views will be created and used.
   * @param shouldResync Whether the the newly created bus should ask for a resync of all previously cached events
   * after it is created. Defaults to `true`.
   */
  public constructor(syncHandlerFactory?: EventBusSyncHandlerFactory, shouldResync?: boolean);
  // eslint-disable-next-line jsdoc/require-jsdoc
  public constructor(
    syncHandlerArg: boolean | EventBusSyncHandlerFactory = false,
    shouldResync = true
  ) {
    this._busId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);

    let syncHandlerFactory: EventBusSyncHandlerFactory;
    if (typeof syncHandlerArg === 'function') {
      syncHandlerFactory = syncHandlerArg;
    } else {
      if (syncHandlerArg) {
        syncHandlerFactory = (busId, onSyncedEventReceived) => new EventBusFlowEventSync(busId, onSyncedEventReceived);
      } else {
        syncHandlerFactory = (busId, onSyncedEventReceived) => new EventBusListenerSync(busId, onSyncedEventReceived);
      }
    }
    this._busSync = syncHandlerFactory(this._busId, this.onSyncedEventReceived.bind(this));

    if (shouldResync === true) {
      this.syncEvent('event_bus', 'resync_request', false);
      this.on('event_bus', (data) => {
        if (data == 'resync_request') {
          this.resyncEvents();
        }
      });
    }
  }

  /**
   * Subscribes to a topic on the bus.
   * @param topic The topic to subscribe to.
   * @param handler The handler to be called when an event happens.
   * @param paused Whether the new subscription should be initialized as paused. Defaults to `false`.
   * @returns The new subscription.
   */
  public on(topic: string, handler: Handler<any>, paused = false): Subscription {
    let subs = this._topicSubsMap.get(topic);

    if (subs === undefined) {
      subs = { handlerSubscriptions: [], notifyDepth: 0 };
      this._topicSubsMap.set(topic, subs);
      this.pub('event_bus_topic_first_sub', topic, false, false);
    }

    const initialNotifyFunc = (sub: HandlerSubscription<Handler<any>>): void => {
      const lastState = this._eventCache.get(topic);
      if (lastState !== undefined) {
        sub.handler(lastState.data);
      }
    };
    const onDestroyFunc = (sub: HandlerSubscription<Handler<any>>): void => {
      // If we are not in the middle of a notify operation, remove the subscription.
      // Otherwise, do nothing and let the post-notify clean-up code handle it.
      if (subs && !subs.notifyDepth) {
        subs.handlerSubscriptions.splice(subs.handlerSubscriptions.indexOf(sub), 1);
      }
    };

    const sub = new HandlerSubscription<Handler<any>>(handler, initialNotifyFunc, onDestroyFunc);
    subs.handlerSubscriptions.push(sub);

    if (paused) {
      sub.pause();
    } else {
      sub.initialNotify();
    }

    return sub;
  }

  /**
   * Subscribes to all topics.
   * @param handler The handler to subscribe to all events.
   * @returns The new subscription.
   */
  public onAll(handler: WildcardHandler): Subscription {
    const sub = new HandlerSubscription<WildcardHandler>(handler, undefined, this.onWildcardSubDestroyedFunc);
    this._wildcardSubs.push(sub);
    return sub;
  }

  /**
   * Publishes an event to the topic on the bus.
   * @param topic The topic to publish to.
   * @param data The event data to publish.
   * @param sync Whether or the event should be synced to other event bus instances. Defaults to `false`.
   * @param isCached Whether the event data should be cached. Cached data that are published to a topic can be
   * retrieved by subscribers after the data was initially published. Defaults to `true`.
   */
  public pub(topic: string, data: any, sync = false, isCached = true): void {
    if (isCached) {
      this._eventCache.set(topic, { data: data, synced: sync });
    }

    const subs = this._topicSubsMap.get(topic);
    if (subs !== undefined) {

      let needCleanUpSubs = false;

      const notifyDepth = subs.notifyDepth;
      subs.notifyDepth = notifyDepth + 1;

      const subsArray = subs.handlerSubscriptions;
      const len = subsArray.length;
      for (let i = 0; i < len; i++) {
        try {
          const sub = subsArray[i];
          // Note: a dead HandlerSubscription is necessarily paused.
          if (!sub.isPaused) {
            sub.handler(data);
          }

          needCleanUpSubs ||= !sub.isAlive;
        } catch (error) {
          console.error(`EventBus: error in handler: ${error}. topic: ${topic}. data: ${data}. sync: ${sync}. isCached: ${isCached}`,
            { error, topic, data, sync, isCached, subs });
          if (error instanceof Error) {
            console.error(error.stack);
          }
        }
      }

      subs.notifyDepth = notifyDepth;

      if (needCleanUpSubs && notifyDepth === 0) {
        const filteredSubs = subsArray.filter(sub => sub.isAlive);
        subs.handlerSubscriptions = filteredSubs;
      }
    }

    // We don't know if anything is subscribed on busses in other instruments,
    // so we'll unconditionally sync if sync is true and trust that the
    // publisher knows what it's doing.
    if (sync) {
      this.syncEvent(topic, data, isCached);
    }

    // always push to wildcard handlers
    let needCleanUpSubs = false;
    this._wildcardNotifyDepth++;

    const wcLen = this._wildcardSubs.length;
    for (let i = 0; i < wcLen; i++) {
      const sub = this._wildcardSubs[i];
      if (!sub.isPaused) {
        sub.handler(topic, data);
      }

      needCleanUpSubs ||= !sub.isAlive;
    }

    this._wildcardNotifyDepth--;

    if (needCleanUpSubs && this._wildcardNotifyDepth === 0) {
      this._wildcardSubs = this._wildcardSubs.filter(sub => sub.isAlive);
    }
  }

  /**
   * Responds to when a wildcard subscription is destroyed.
   * @param sub The destroyed subscription.
   */
  private onWildcardSubDestroyed(sub: HandlerSubscription<WildcardHandler>): void {
    // If we are not in the middle of a notify operation, remove the subscription.
    // Otherwise, do nothing and let the post-notify clean-up code handle it.
    if (this._wildcardNotifyDepth === 0) {
      this._wildcardSubs.splice(this._wildcardSubs.indexOf(sub), 1);
    }
  }

  /**
   * Re-sync all synced events
   */
  private resyncEvents(): void {
    for (const [topic, event] of this._eventCache) {
      if (event.synced) {
        this.syncEvent(topic, event.data, true);
      }
    }
  }

  /**
   * Syncs an event to other event bus instances.
   * @param topic The event topic.
   * @param data The event data.
   * @param isCached Whether the event data should be cached.
   */
  private syncEvent(topic: string, data: unknown, isCached: boolean): void {
    this._busSync.sendSyncedEvent(topic, data, isCached);
  }

  /**
   * Responds to when a synced event from another event bus instance is received.
   * @param topic The event topic.
   * @param data The event data.
   * @param isCached Whether the event data should be cached.
   */
  private onSyncedEventReceived(topic: string, data: unknown, isCached: boolean): void {
    this.pub(topic, data, false, isCached);
  }

  /**
   * Gets a typed publisher from the event bus..
   * @returns The typed publisher.
   */
  public getPublisher<E>(): Publisher<E> {
    return this as Publisher<E>;
  }

  /**
   * Gets a typed subscriber from the event bus.
   * @returns The typed subscriber.
   */
  public getSubscriber<E>(): EventSubscriber<E> {
    return new EventSubscriber(this);
  }

  /**
   * Get the number of subscribes for a given topic.
   * @param topic The name of the topic.
   * @returns The number of subscribers.
   **/
  public getTopicSubscriberCount(topic: string): number {
    return this._topicSubsMap.get(topic)?.handlerSubscriptions.length ?? 0;
  }

  /**
   * Executes a function once for each topic with at least one subscriber.
   * @param fn The function to execute.
   */
  public forEachSubscribedTopic(fn: (topic: string, subscriberCount: number) => void): void {
    this._topicSubsMap.forEach((subs, topic) => { subs.handlerSubscriptions.length > 0 && fn(topic, subs.handlerSubscriptions.length); });
  }
}

/** A data package for syncing events between instruments. */
interface SyncDataPackage {
  /** The bus id */
  busId: number;
  /** The package id */
  packagedId: number;
  /** Array of data packages */
  data: TopicDataPackage[];
}

/** A package representing one bus event. */
interface TopicDataPackage {
  /** The bus topic. */
  topic: string;
  /** The data object */
  data: unknown;
  /** Indicating if this event should be cached on the bus */
  isCached: boolean;
}

/**
 * An abstract class for built-in event bus sync handler implementations.
 */
abstract class EventBusSyncBase implements EventBusSyncHandler {
  protected isPaused = false;

  private readonly dataPackageQueue: TopicDataPackage[] = [];
  private lastEventSynced = -1;

  /**
   * Creates an instance of EventBusSyncBase.
   * @param busId The unique ID assigned to the event bus.
   * @param onSyncedEventReceived A function to call when a synced event from another event bus instance is received.
   */
  public constructor(
    protected readonly busId: number,
    protected readonly onSyncedEventReceived: (topic: string, data: any, isCached: boolean) => void
  ) {
    this.hookReceiveEvent();

    /** Sends the queued up data packages */
    const sendFn = (): void => {
      if (!this.isPaused && this.dataPackageQueue.length > 0) {
        // console.log(`Sending ${this.dataPackageQueue.length} packages`);
        const syncDataPackage: SyncDataPackage = {
          busId: this.busId,
          packagedId: Math.floor(Math.random() * 1000000000),
          data: this.dataPackageQueue
        };
        if (this.executeSync(syncDataPackage)) {
          this.dataPackageQueue.length = 0;
        } else {
          console.warn('Failed to send sync data package');
        }
      }
      requestAnimationFrame(sendFn);
    };

    requestAnimationFrame(sendFn);
  }

  /**
   * Sends this frame's events.
   * @param syncDataPackage The data package to send.
   * @returns Whether or not the data package was sent successfully.
   */
  protected abstract executeSync(syncDataPackage: SyncDataPackage): boolean;

  /**
   * Hooks up the method being used to received events.
   * Will unwrap the data and should call processEventsReceived.
   */
  protected abstract hookReceiveEvent(): void;

  /**
   * Processes events received and sends them onto the local bus.
   * @param syncData The data package to process.
   */
  protected processEventsReceived(syncData: SyncDataPackage): void {
    if (this.busId !== syncData.busId) {
      // HINT: coherent events are still received twice, so check for this
      if (this.lastEventSynced !== syncData.packagedId) {
        this.lastEventSynced = syncData.packagedId;
        syncData.data.forEach((data: TopicDataPackage): void => {
          try {
            this.onSyncedEventReceived(data.topic, data.data, data.isCached);
          } catch (e) {
            console.error(e);
            if (e instanceof Error) {
              console.error(e.stack);
            }
          }
        });
      } else {
        //console.warn('Same event package received twice: ' + syncData.packagedId);
      }
    }
  }

  /** @inheritDoc */
  public sendSyncedEvent(topic: string, data: unknown, isCached: boolean): void {
    // stringify data
    const dataObj = data;
    // build a data package
    const dataPackage: TopicDataPackage = {
      topic: topic,
      data: dataObj,
      isCached: isCached
    };
    // queue data package
    this.dataPackageQueue.push(dataPackage);
  }
}

/**
 * An event bus sync handler that sends events to event bus instances on other Coherent views using the Coherent Flow
 * Event API.
 */
class EventBusFlowEventSync extends EventBusSyncBase {
  private static readonly EB_LISTENER_KEY = 'EB_EVENTS';

  /** @inheritdoc */
  protected executeSync(syncDataPackage: SyncDataPackage): boolean {
    // console.log('Sending sync package: ' + syncDataPackage.packagedId);
    try {
      LaunchFlowEvent('ON_MOUSERECT_HTMLEVENT', EventBusFlowEventSync.EB_LISTENER_KEY, this.busId.toString(), JSON.stringify(syncDataPackage));
      return true;
    } catch (error) {
      return false;
    }
  }

  /** @inheritdoc */
  protected hookReceiveEvent(): void {
    Coherent.on('OnInteractionEvent', (target: string, args: string[]): void => {
      // identify if its a busevent
      if (args.length === 0 || args[0] !== EventBusFlowEventSync.EB_LISTENER_KEY || !args[2]) { return; }
      this.processEventsReceived(JSON.parse(args[2]) as SyncDataPackage);
    });
  }
}


//// DECLARING THESE GLOBALS UNTIL WE EXPORTED SU10 TYPES
/**
 * The Generic Data Listener
 */
interface GenericDataListener extends ViewListener.ViewListener {
  onDataReceived(key: string, callback: (data: any) => void): void;
  send(key: string, data: any): void;
}

declare function RegisterGenericDataListener(callback?: () => void): GenericDataListener;
//// END GLOBALS DECLARATION

/**
 * An event bus sync handler that sends events to event bus instances on other Coherent views using the generic data
 * listener.
 */
class EventBusListenerSync extends EventBusSyncBase {
  private static readonly EB_KEY = 'wt.eb.evt';

  private listener!: GenericDataListener;

  /** @inheritdoc */
  protected executeSync(syncDataPackage: SyncDataPackage): boolean {
    try {
      this.listener.send(EventBusListenerSync.EB_KEY, syncDataPackage);
      return true;
    } catch (error) {
      return false;
    }
  }

  /** @inheritdoc */
  protected hookReceiveEvent(): void {
    // pause the sync until the listener is ready
    this.isPaused = true;
    this.listener = RegisterGenericDataListener(() => {
      this.listener.onDataReceived(EventBusListenerSync.EB_KEY, (data: SyncDataPackage) => {
        try {
          this.processEventsReceived(data);
        } catch (error) {
          console.error(error);
        }
      });
      this.isPaused = false;
    });
  }
}
