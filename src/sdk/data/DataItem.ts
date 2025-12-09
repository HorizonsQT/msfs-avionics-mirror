/**
 * The status of a data item.
 * @experimental
 */
export enum DataItemStatus {
  /** The data item has no value. */
  EmptyValue = 0,

  /** The data item value is a normal value. */
  Normal,

  /** The data item is reporting that the value may be unreliable due to a failure. */
  Failed,

  /** The data item is reporting that the value may be unreliable due to a reason other than a failure. */
  NoComputedValue,

  /** The data item value is sourced from a functional test. */
  Testing,
}

/**
 * A data item with a filled value and corresponding status.
 * @template T The type of the data item's value.
 * @experimental
 */
export interface FilledDataItem<T> {
  /** The data item value. */
  value: T;

  /** The data item status. */
  status: Exclude<DataItemStatus, DataItemStatus.EmptyValue>;
}

/**
 * A valueless (empty) data item with the `EmptyValue` status.
 * @experimental
 */
export interface EmptyDataItem {
  /** The empty value, which is always `undefined`. */
  value: undefined;

  /** The data item status. */
  status: DataItemStatus.EmptyValue;
}

/**
 * A data item, consisting of a value and an associated status.
 * @template T The type of the data item's value.
 * @experimental
 */
export type DataItem<T> = FilledDataItem<T> | EmptyDataItem;

/**
 * A data item with a specific status.
 * @template T The type of the data item's value.
 * @template S The type of the status.
 * @experimental
 */
// eslint-disable-next-line jsdoc/require-jsdoc
export type DataItemOfStatus<T, S extends DataItemStatus> = DataItem<T> & { status: S };
