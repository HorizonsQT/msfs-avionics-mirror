import { ConsumerSubject } from '../../../data/ConsumerSubject';
import { EventSubscriber } from '../../../data/EventSubscriber';
import { MutableAccessible } from '../../../sub/Accessible';
import { SubEventInterface, SubEventInterfaceDataType, SubEventInterfaceSenderType } from '../../../sub/SubEvent';
import { MutableSubscribableInputType, Subscribable } from '../../../sub/Subscribable';
import { SubscribableUtils } from '../../../sub/SubscribableUtils';
import { Subscription } from '../../../sub/Subscription';
import { MapSystemContext } from '../MapSystemContext';
import { MapSystemController } from '../MapSystemController';

/**
 * Modules required for {@link MapModulePropsController}.
 * @template ModuleKey The key of the controlled module.
 * @template Module The type of the controlled module.
 */
export type MapModulePropsControllerModules<ModuleKey extends string, Module extends object> = {
  /** The module whose properties are set by the controller. */
  [K in ModuleKey]: Module;
}

/**
 * Filters a module to only those properties that implement the `MutableAccessible` type.
 * @template Module The type of the module to filter.
 */
type MutableAccessibleFilter<Module extends object> = {
  [Key in (keyof Module & string) as Module[Key] extends MutableAccessible<any> ? Key : never]: Module[Key];
}

/**
 * Filters a module to only those properties that implement the `SubEventInterface` type.
 * @template Module The type of the module to filter.
 */
type SubEventFilter<Module extends object> = {
  [Key in (keyof Module & string) as Module[Key] extends SubEventInterface<any, any> ? Key : never]: Module[Key];
}

/**
 * A key for a module property that can be bound by {@link MapModulePropsController} and implements the
 * {@link MutableAccessible} interface.
 * @template Module The type of the controlled module.
 */
export type MapModulePropsControllerAccessiblePropKey<Module extends object> = keyof MutableAccessibleFilter<Module> & string;

/**
 * A key for a module property that can be bound by {@link MapModulePropsController} and implements the
 * {@link SubEventInterface} interface.
 * @template Module The type of the controlled module.
 */
export type MapModulePropsControllerSubEventPropKey<Module extends object> = keyof SubEventFilter<Module> & string;

/**
 * A key for a module property that can be bound by {@link MapModulePropsController}.
 * @template Module The type of the controlled module.
 */
export type MapModulePropsControllerPropKey<Module extends object> = keyof Module & string;

/**
 * The base definition of a binding between a module property and an external data source.
 */
type BaseBinding<K extends string> = {
  /** The key of the property to bind. */
  key: K;

  /**
   * The frequency, in hertz, at which the bound property will be updated from its data source. If the frequency is
   * `null`, then updates will not be throttled by frequency - the property will be updated as soon as the value of its
   * data source changes. If the frequency is not `null`, then the property will only be updated when the controller's
   * `onBeforeUpdated()` method is called, and the frequency of updates will not exceed `updateFreq`. Defaults to
   * `null`.
   */
  updateFreq?: number | null | Subscribable<number | null>;
};

// NOTE: The below type aliases use the conditional "K extends any ? ..." to distribute K (if it is a union) over the
// binding types. Because K is either a property key or a union of property keys, we always want to distribute K if
// possible so that each binding only applies to one property (key).
//
// For example, take the type MapModulePropsControllerMappedEventBusBinding<{ a: number, b: boolean }>. Without
// distributing K, the type is resolved as:
//
// type Resolved = BaseBinding<'a' | 'b'> & { topic: string; handler: (prop: number | boolean, value: any) => void; };
//
// The above type won't accept the object "{ key: 'a', topic: 'topic', handler: (prop: number, value: any) => {} }"
// because the handler function takes a number for the prop argument instead of number | boolean. This is not desired
// behavior since the prop argument should only have to accept the actual type of the 'a' property, which is number.
//
// With K distributed, the type is instead resolved as:
//
// type Resolved = (BaseBinding<'a'> & { topic: string; handler: (prop: number, value: any) => void; })
//   | (BaseBinding<'b'> & { topic: string; handler: (prop: boolean, value: any) => void; });
//
// This type *will* accept the object "{ key: 'a', topic: 'topic', handler: (prop: number, value: any) => {} }".

/**
 * A definition of a binding between a module property and an event bus topic in which the property is set to the
 * data published to the topic.
 * @template Module The type of the module containing the bound property.
 * @template K The key of the bound property.
 */
export type MapModulePropsControllerUnmappedEventBusBinding<
  Module extends object,
  K extends MapModulePropsControllerAccessiblePropKey<Module> = MapModulePropsControllerAccessiblePropKey<Module>
> = K extends any ? BaseBinding<K> & {
  /** The event bus topic to which to bind the property. */
  topic: string;
} : never;

/**
 * A definition of a binding between a module property and an event bus topic in which the property is set based on a
 * transformed version of the data published to the topic.
 * @template Module The type of the module containing the bound property.
 * @template K The key of the bound property.
 */
export type MapModulePropsControllerMappedEventBusBinding<
  Module extends object,
  K extends MapModulePropsControllerPropKey<Module> = MapModulePropsControllerPropKey<Module>
> = K extends any ? BaseBinding<K> & {
  /** The event bus topic to which to bind the property. */
  topic: string;

  /**
   * A function that handles setting the bound property to a value mapped from the event bus topic.
   * @param prop The property to set.
   * @param value The current value published to the event bus topic.
   */
  handler: (prop: Module[K], value: any) => void;
} : never;

/**
 * A definition of a binding between a module property and a subscribable in which the property is set to the
 * subscribable's value.
 * @template Module The type of the module containing the bound property.
 * @template K The key of the bound property.
 */
export type MapModulePropsControllerUnmappedSubscribableBinding<
  Module extends object,
  K extends MapModulePropsControllerAccessiblePropKey<Module> = MapModulePropsControllerAccessiblePropKey<Module>
> = K extends any ? BaseBinding<K> & {
  /** The subscribable to which to bind the property. */
  sub: Subscribable<MutableSubscribableInputType<Module[K]>>;
} : never;

/**
 * A definition of a binding between a module property and a subscribable in which the property is set based on a
 * transformed version of the subscribable's value.
 * @template Module The type of the module containing the bound property.
 * @template K The key of the bound property.
 * @template T The value type of the subscribable.
 */
export type MapModulePropsControllerMappedSubscribableBinding<
  Module extends object,
  K extends MapModulePropsControllerPropKey<Module> = MapModulePropsControllerPropKey<Module>,
  T = any
> = K extends any ? BaseBinding<K> & {
  /** The subscribable to which to bind the property. */
  sub: Subscribable<T>;

  /**
   * A function that handles setting the bound property to a value mapped from the subscribable.
   * @param prop The property to set.
   * @param value The current value of the subscribable.
   */
  handler: (prop: Module[K], value: T) => void;
} : never;

/**
 * A definition of a binding between a module property and a {@link SubEventInterface} in which events received from
 * the SubEventInterface are forwarded unchanged to the property.
 * @template Module The type of the module containing the bound property.
 * @template K The key of the bound property.
 */
export type MapModulePropsControllerUnmappedSubEventBinding<
  Module extends object,
  K extends MapModulePropsControllerSubEventPropKey<Module> = MapModulePropsControllerSubEventPropKey<Module>
> = K extends any ? BaseBinding<K> & {
  /** The event to which to bind the property. */
  subEvent: SubEventInterface<SubEventInterfaceSenderType<Module[K]>, SubEventInterfaceDataType<Module[K]>>;
} : never;

/**
 * A definition of a binding between a module property and a {@link SubEventInterface} in which the property is set
 * based on a transformed version of events received from the SubEventInterface.
 * @template Module The type of the module containing the bound property.
 * @template K The key of the bound property.
 * @template SenderType The sender type of the SubEventInterface.
 * @template DataType The data type of the SubEventInterface.
 */
export type MapModulePropsControllerMappedSubEventBinding<
  Module extends object,
  K extends MapModulePropsControllerPropKey<Module> = MapModulePropsControllerPropKey<Module>,
  SenderType = unknown,
  DataType = unknown
> = K extends any ? BaseBinding<K> & {
  /** The event to which to bind the property. */
  subEvent: SubEventInterface<SenderType, DataType>;

  /**
   * A function that handles setting the bound property from a received event.
   * @param prop The property to set.
   * @param sender The sender of the event.
   * @param data The event data.
   */
  handler: (prop: Module[K], sender: SenderType, data: DataType) => void;
} : never;

/**
 * A definition of a binding between a module property and an external data source.
 * @template Module The type of the module containing the bound property.
 */
export type MapModulePropsControllerBinding<Module extends object>
  = MapModulePropsControllerUnmappedEventBusBinding<Module>
  | MapModulePropsControllerMappedEventBusBinding<Module>
  | MapModulePropsControllerUnmappedSubscribableBinding<Module>
  | MapModulePropsControllerMappedSubscribableBinding<Module>
  | MapModulePropsControllerUnmappedSubEventBinding<Module>
  | MapModulePropsControllerMappedSubEventBinding<Module>;

/**
 * Updates the properties in a {@link MapAutopilotPropsModule}.
 */
export class MapModulePropsController<ModuleKey extends string, Module extends object>
  extends MapSystemController<MapModulePropsControllerModules<ModuleKey, Module>> {

  private readonly bindings: Binding[] = [];

  /**
   * Creates a new instance of MapModulePropsController.
   * @param context This controller's map context.
   * @param moduleKey The key of the module controlled by the controller.
   * @param bindings An iterable containing definitions of the bindings to create between module properties and
   * external data sources.
   */
  public constructor(
    context: MapSystemContext<MapModulePropsControllerModules<ModuleKey, Module>>,
    moduleKey: ModuleKey,
    bindings: Iterable<MapModulePropsControllerBinding<Module>>
  ) {
    super(context);

    const module = this.context.model.getModule(moduleKey);

    const sub = this.context.bus.getSubscriber<any>();

    for (const binding of bindings) {
      if ('subEvent' in binding) {
        this.bindings.push(new SubEventBinding(module, binding));
      } else {
        this.bindings.push(new ValueBinding(module, binding, sub));
      }
    }
  }

  /** @inheritDoc */
  public onAfterMapRender(): void {
    for (const binding of this.bindings) {
      binding.init();
    }
  }

  /** @inheritDoc */
  public onBeforeUpdated(time: number, elapsed: number): void {
    for (let i = 0; i < this.bindings.length; i++) {
      this.bindings[i].update(elapsed);
    }
  }

  /** @inheritDoc */
  public onMapDestroyed(): void {
    this.destroy();
  }

  /** @inheritDoc */
  public destroy(): void {
    for (const binding of this.bindings) {
      binding.destroy();
    }

    super.destroy();
  }
}

/**
 * A binding between a module property and an external data source.
 */
interface Binding {
  /**
   * Initializes this binding.
   */
  init(): void;

  /**
   * Updates this binding.
   * @param elapsedTime The amount of time elapsed since the last update, in milliseconds.
   */
  update(elapsedTime: number): void;

  /**
   * Destroys this binding.
   */
  destroy(): void;
}

/**
 * An implementation of a binding between a module property and an external subscribable or event bus topic.
 */
class ValueBinding<Module extends object> implements Binding {
  private static readonly UNINITIALIZED_VALUE = {};

  private readonly key: keyof Module & string;

  private readonly source: Subscribable<unknown>;
  private readonly consumerSource?: ConsumerSubject<unknown>;

  private readonly handler: (prop: any, value: unknown) => void;

  private readonly sourceSub: Subscription;
  private readonly updateFreqSub?: Subscription;

  private needUpdate = false;

  private updatePeriod: number | null = null;

  private elapsedTime = 0;

  /**
   * Creates a new instance of ValueBinding.
   * @param module The module containing the property to bind.
   * @param def The definition of the binding to create.
   * @param eventSubscriber An event bus subscriber.
   */
  public constructor(
    private readonly module: Module,
    def: MapModulePropsControllerUnmappedEventBusBinding<Module>
      | MapModulePropsControllerMappedEventBusBinding<Module>
      | MapModulePropsControllerUnmappedSubscribableBinding<Module>
      | MapModulePropsControllerMappedSubscribableBinding<Module>,
    eventSubscriber: EventSubscriber<any>
  ) {
    this.key = def.key as keyof Module & string;

    this.handler = 'handler' in def
      ? def.handler
      : ValueBinding.defaultBindingHandler;

    if ('sub' in def) {
      this.source = def.sub;
    } else {
      this.consumerSource = this.source = ConsumerSubject.create(
        eventSubscriber.on(def.topic),
        ValueBinding.UNINITIALIZED_VALUE,
        // We configure the ConsumerSubject to always notify subscribers when something is published to its topic. This
        // ensures that subscribing to this ConsumerSubject is equivalent to subscribing to the event bus topic.
        SubscribableUtils.NEVER_EQUALITY
      ).pause();
    }

    this.sourceSub = this.source.sub(this.onValueChanged.bind(this), false, true);

    const updateFreq = def.updateFreq ?? null;

    if (SubscribableUtils.isSubscribable(updateFreq)) {
      this.updateFreqSub = updateFreq.sub(this.onUpdateFreqChanged.bind(this), false, true);
    } else {
      this.updatePeriod = updateFreq;
    }
  }

  /** @inheritDoc */
  public init(): void {
    this.consumerSource?.resume();

    const value = this.source.get();
    if (value !== ValueBinding.UNINITIALIZED_VALUE) {
      this.setPropFromExternal(value);
    }

    this.updateFreqSub?.resume(true);
    this.sourceSub.resume();
  }

  /** @inheritDoc */
  public update(elapsedTime: number): void {
    if (this.updatePeriod !== null) {
      this.elapsedTime += Math.max(0, elapsedTime);

      if (this.elapsedTime >= this.updatePeriod) {
        if (this.needUpdate) {
          this.needUpdate = false;
          this.setPropFromExternal(this.source.get());
        }

        if (this.updatePeriod > 0) {
          this.elapsedTime %= this.updatePeriod;
        }
      }
    }
  }

  /**
   * Sets this binding's property from external data.
   * @param value The value of the external data.
   */
  private setPropFromExternal(value: unknown): void {
    if (value !== ValueBinding.UNINITIALIZED_VALUE) {
      this.handler(this.module[this.key], value);
    }
  }

  /**
   * Responds to when the value of this binding's external data source changes.
   * @param value The new external data source value.
   */
  private onValueChanged(value: unknown): void {
    if (this.updatePeriod === null) {
      this.setPropFromExternal(value);
    } else {
      this.needUpdate = true;
    }
  }

  /**
   * Responds to when the update frequency for this binding changes.
   * @param freq The new update frequency, in hertz, or `null` if updates should not be throttled by frequency.
   */
  private onUpdateFreqChanged(freq: number | null): void {
    if (freq === null) {
      this.updatePeriod = null;
      if (this.needUpdate) {
        this.needUpdate = false;
        this.setPropFromExternal(this.source.get());
      }
    } else {
      this.updatePeriod = 1000 / freq;
      this.elapsedTime = 0;
    }
  }

  /** @inheritDoc */
  public destroy(): void {
    this.consumerSource?.destroy();
    this.sourceSub.destroy();
    this.updateFreqSub?.destroy();
  }

  /**
   * Sets the value of a `MutableAccessible` property.
   * @param prop The property to set.
   * @param value The value to set.
   */
  private static defaultBindingHandler(prop: MutableAccessible<unknown>, value: unknown): void {
    prop.set(value);
  }
}

/**
 * An implementation of a binding between a module property and an external `SubEventInterface`.
 */
class SubEventBinding<Module extends object> implements Binding {
  private readonly key: keyof Module & string;

  private readonly source: SubEventInterface<unknown, unknown>;

  private readonly handler: (prop: any, sender: unknown, data: unknown) => void;

  private readonly sourceSub: Subscription;
  private readonly updateFreqSub?: Subscription;

  private needUpdate = false;
  private lastSender: unknown = undefined;
  private lastData: unknown = undefined;

  private updatePeriod: number | null = null;

  private elapsedTime = 0;

  /**
   * Creates a new instance of SubEventBinding.
   * @param module The module containing the property to bind.
   * @param def The definition of the binding to create.
   */
  public constructor(
    private readonly module: Module,
    def: MapModulePropsControllerUnmappedSubEventBinding<Module> | MapModulePropsControllerMappedSubEventBinding<Module>
  ) {
    this.key = def.key as keyof Module & string;

    this.handler = 'handler' in def
      ? def.handler
      : SubEventBinding.defaultBindingHandler;

    this.source = def.subEvent;

    this.sourceSub = this.source.on(this.onEvent.bind(this), true);

    const updateFreq = def.updateFreq ?? null;

    if (SubscribableUtils.isSubscribable(updateFreq)) {
      this.updateFreqSub = updateFreq.sub(this.onUpdateFreqChanged.bind(this), false, true);
    } else {
      this.updatePeriod = updateFreq;
    }
  }

  /** @inheritDoc */
  public init(): void {
    this.updateFreqSub?.resume(true);
    this.sourceSub.resume();
  }

  /** @inheritDoc */
  public update(elapsedTime: number): void {
    if (this.updatePeriod !== null) {
      this.elapsedTime += Math.max(0, elapsedTime);

      if (this.elapsedTime >= this.updatePeriod) {
        if (this.needUpdate) {
          this.updateFromCached();
        }

        if (this.updatePeriod > 0) {
          this.elapsedTime %= this.updatePeriod;
        }
      }
    }
  }

  /**
   * Sets this binding's property from an event received from this binding's external data source.
   * @param sender The sender of the event.
   * @param data The event data.
   */
  private setPropFromExternal(sender: unknown, data: unknown): void {
    this.handler(this.module[this.key], sender, data);
  }

  /**
   * Updates this binding's property from the most recent cached event and clears the cached event afterwards.
   */
  private updateFromCached(): void {
    const sender = this.lastSender;
    const data = this.lastData;
    this.lastSender = undefined;
    this.lastData = undefined;
    this.needUpdate = false;
    this.setPropFromExternal(sender, data);
  }

  /**
   * Responds to when an event is received from this binding's external data source.
   * @param sender The sender of the event.
   * @param data The event data.
   */
  private onEvent(sender: unknown, data: unknown): void {
    if (this.updatePeriod === null) {
      this.setPropFromExternal(sender, data);
    } else {
      this.lastSender = sender;
      this.lastData = data;
      this.needUpdate = true;
    }
  }

  /**
   * Responds to when the update frequency for this binding changes.
   * @param freq The new update frequency, in hertz, or `null` if updates should not be throttled by frequency.
   */
  private onUpdateFreqChanged(freq: number | null): void {
    if (freq === null) {
      this.updatePeriod = null;
      if (this.needUpdate) {
        this.updateFromCached();
      }
    } else {
      this.updatePeriod = 1000 / freq;
      this.elapsedTime = 0;
    }
  }

  /** @inheritDoc */
  public destroy(): void {
    this.sourceSub.destroy();
    this.updateFreqSub?.destroy();
  }

  /**
   * Triggers an event on a `SubEventInterface` property.
   * @param prop The property on which to trigger an event.
   * @param sender The sender of the event.
   * @param data The data event.
   */
  private static defaultBindingHandler(prop: SubEventInterface<unknown, unknown>, sender: unknown, data: unknown): void {
    prop.notify(sender, data);
  }
}
