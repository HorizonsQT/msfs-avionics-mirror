import { Subscribable } from '../sub/Subscribable';
import { DataItem, DataItemStatus } from './DataItem';

/**
 * A provider of subscribable {@link DataItem | DataItems}.
 * @experimental
 */
export interface DataBusClient {
  /**
   * Retrieves a typed data bus client that provides data items described by a record type.
   * @returns A typed data bus client that provides data items described by the specified record type.
   * @template R A record describing the data items available from the typed client to return. The name of each
   * property in the record defines one label that can be used to retrieve a data item, and the type of the
   * property defines the value type of data items retrieved using the label (under any index).
   * @template I The indexes for which data items are available from the client.
   */
  of<R extends Record<string, any> = Record<never, never>, I extends number = number>(): TypedDataBusClient<R, I>;
}

/**
 * A provider of subscribable {@link DataItem | DataItems}. Each data item is accessed using a combination of a string
 * label and a numeric index. The data item labels available from the provider are defined by its record type
 * parameter.
 * @template R The record describing the data items available from the client. The name of each property in the record
 * defines one label that can be used to retrieve a data item, and the type of the property defines the value type of
 * data items retrieved using the label (under any index).
 * @template I The indexes for which data items are available from the client.
 * @experimental
 */
export interface TypedDataBusClient<R extends Record<string, any>, I extends number = number> {
  /**
   * Gets a subscribable for a data item.
   * @param label The label of the data item to get.
   * @param index The index of the data item to get.
   * @returns A subscribable for the requested data item.
   * @template L The label of the data item to get.
   */
  getSubscribable<L extends keyof R & string>(label: L, index: I): Subscribable<Readonly<DataItem<R[L]>>>;
}

/**
 * A provider of subscribable {@link DataItem | DataItems} that also supports publishing changes to the same data
 * items.
 * @experimental
 */
export interface DataBusHost extends DataBusClient {
  /**
   * Retrieves a typed data bus host that provides and allows publishing to data items described by a record type.
   * @returns A typed data bus host that provides and allows publishing to data items described by the specified record
   * type.
   * @template R A record describing the data items available from the typed host to return. The name of each property
   * in the record defines one label that can be used to access a data item, and the type of the property defines the
   * value type of data items accessed using the label (under any index).
   * @template I The indexes for which data items are available from the host.
   */
  of<R extends Record<string, unknown> = Record<never, never>, I extends number = number>(): TypedDataBusHost<R, I>;
}

/**
 * A provider of subscribable {@link DataItem | DataItems} that also supports publishing changes to the same data
 * items. Each data item is accessed using a combination of a string label and a numeric index. The data item labels
 * available from the provider are defined by its record type parameter.
 * @template R The record describing the data items available from the host. The name of each property in the record
 * defines one label that can be used to access a data item, and the type of the property defines the value type of
 * data items accessed using the label (under any index).
 * @template I The indexes for which data items are available from the host.
 * @experimental
 */
export interface TypedDataBusHost<R extends Record<string, any>, I extends number = number> extends TypedDataBusClient<R, I> {
  /**
   * Defines equality semantics for data item values published to a given label. The specified equality semantics will
   * be used to determine whether to notify subscribers when an update to the data item is published (subscribers are
   * notified if and only if either the new data item value or status is not equal to the old data item value or
   * status, respectively).
   * @param label The label for which to define data item value equality semantics.
   * @param equalityFunc A function that implements the desired equality semantics by returning whether two data item
   * values are equal. If not defined, then default equality semantics will be used, which state that two values `a`
   * and `b` are equal if and only if the strict equality operator (`===`) evaluates to `true` for `a` and `b`, or both
   * `a` and `b` are the numeric value `NaN`.
   */
  defineEquality<L extends keyof R & string>(label: L, equalityFunc: ((a: R[L], b: R[L]) => boolean) | undefined): void;

  /**
   * Publishes a value update to this data bus. The updated data item will retain its current status. If the data
   * item's current status is `EmptyValue`, then the value update will be ignored.
   * @param label The label of the data item to publish to.
   * @param index The index of the data item to publish to.
   * @param value The value to publish.
   * @template L The label of the data item to publish to.
   */
  publish<L extends keyof R & string>(label: L, index: I, value: R[L]): void;
  /**
   * Publishes a no-value update to this data bus.
   * @param label The label of the data item to publish to.
   * @param index The index of the data item to publish to.
   * @param value The value to publish, which must be undefined.
   * @param status A status to publish along with the value, which must be `EmptyValue`.
   * @template L The label of the data item to publish to.
   */
  publish<L extends keyof R & string>(label: L, index: I, value: undefined, status: DataItemStatus.EmptyValue): void;
  /**
   * Publishes a value and status update to this data bus.
   * @param label The label of the data item to publish to.
   * @param index The index of the data item to publish to.
   * @param value The value to publish.
   * @param status The status to publish.
   * @template L The label of the data item to publish to.
   */
  publish<L extends keyof R & string>(label: L, index: I, value: R[L], status: Exclude<DataItemStatus, DataItemStatus.EmptyValue>): void;
  /**
   * Publishes a value and status update to this data bus.
   * @param label The label of the data item to publish to.
   * @param index The index of the data item to publish to.
   * @param value The value to publish.
   * @param status The status to publish.
   * @template L The label of the data item to publish to.
   * @template S The status to publish.
   */
  publish<L extends keyof R & string, S extends DataItemStatus>(label: L, index: I, value: S extends DataItemStatus.EmptyValue ? undefined : R[L], status: S): void;
}
