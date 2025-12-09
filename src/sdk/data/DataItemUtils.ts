import { DataItem, DataItemOfStatus, DataItemStatus, EmptyDataItem } from './DataItem';

// eslint-disable-next-line jsdoc/require-jsdoc
type DataItemStatusGuard<S extends DataItemStatus> = (dataItem: Readonly<DataItem<any>>) => dataItem is Readonly<DataItemOfStatus<any, S>>;

/**
 * A utility class for working with {@link DataItem | DataItems}.
 * @experimental
 */
export class DataItemUtils {
  /**
   * Creates a new empty data item.
   * @returns A new empty data item.
   */
  public static emptyItem(): EmptyDataItem {
    return {
      value: undefined,
      status: DataItemStatus.EmptyValue,
    };
  }

  /**
   * Checks whether two data items are equal using default equality semantics for data item values: values for two data
   * items `a.value` and `b.value` are equal if and only if the strict equality operator (`===`) evaluates to `true`
   * for `a.value` and `b.value`, or both `a.value` and `b.value` are the numeric value `NaN`.
   * @param a The first data item to check.
   * @param b The second data item to check.
   * @returns Whether the two specified data items are equal using default equality semantics for their data item
   * values.
   */
  public static defaultEquals(a: Readonly<DataItem<unknown>>, b: Readonly<DataItem<unknown>>): boolean {
    return a.status === b.status
      && (a.status === DataItemStatus.EmptyValue || DataItemUtils.defaultValueEquals(a.value, b.value));
  }

  /**
   * Creates a function that evaluates the equality of two data items given value equality semantics defined by a
   * supplied function.
   * @param valueEqualityFunc The function to use to check whether two data item values are equal. Defaults to a
   * function that implements default equality semantics: two values `a` and `b` are equal if and only if the strict
   * equality operator (`===`) evaluates to `true` for `a` and `b`, or both `a` and `b` are the numeric value `NaN`.
   * @returns A function that evaluates the equality of two data items given the value equality semantics defined by
   * the specified function.
   */
  public static createEquals<T>(
    valueEqualityFunc: (a: T, b: T) => boolean = DataItemUtils.defaultValueEquals
  ): (a: Readonly<DataItem<T>>, b: Readonly<DataItem<T>>) => boolean {
    return (a, b) => {
      return a.status === b.status
        && (a.status === DataItemStatus.EmptyValue || valueEqualityFunc(a.value, b.value as T));
    };
  }

  /**
   * Checks whether two data item values are equal using default equality semantics: two values `a` and `b` are equal
   * if and only if the strict equality operator (`===`) evaluates to `true` for `a` and `b`, or both `a` and `b` are
   * the numeric value `NaN`.
   * @param a The first data item value to check.
   * @param b The second data item value to check.
   * @returns Whether the two specified values are equal using default equality semantics.
   */
  public static defaultValueEquals(a: unknown, b: unknown): boolean {
    return a === b
      || (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b));
  }

  /**
   * Checks if a data item status is {@link DataItemStatus.Normal} or {@link DataItemStatus.Testing}.
   * @param dataItem The data item to check.
   * @returns true if the data item is valid.
   */
  public static defaultIsValid(dataItem: Readonly<DataItem<any>>): dataItem is Readonly<DataItemOfStatus<any, DataItemStatus.Normal | DataItemStatus.Testing>> {
    return dataItem.status === DataItemStatus.Normal || dataItem.status === DataItemStatus.Testing;
  }

  /**
   * Creates a predicate that can be used with {@link DataItemUtils.valueOr} or {@link DataItemUtils.isValid}.
   * @param validStatuses An array of statuses that should be considered valid.
   * @returns The new predicate.
   */
  public static createIsValid<S extends DataItemStatus>(validStatuses: readonly S[]): DataItemStatusGuard<S> {
    return ((dataItem) => (validStatuses as readonly DataItemStatus[]).includes(dataItem.status)) as DataItemStatusGuard<S>;
  }

  /**
   * Checks if a data item is valid, according to the isValid predicate.
   * @param dataItem The data item to check.
   * @returns Whether the data item is valid (status is {@link DataItemStatus.Normal} or {@link DataItemStatus.Testing}).
   */
  public static isValid(dataItem: Readonly<DataItem<any>>): dataItem is Readonly<DataItemOfStatus<any, DataItemStatus.Normal | DataItemStatus.Testing>>;
  /**
   * Checks if a data item is valid, according to the isValid predicate.
   * @param dataItem The data item to check.
   * @param isValid An isValid predicate created by {@link DataItemUtils.createIsValid}.
   * @returns Whether the data item is valid according to isValid.
   */
  public static isValid<S extends DataItemStatus>(dataItem: Readonly<DataItem<any>>, isValid: DataItemStatusGuard<S>): dataItem is Readonly<DataItemOfStatus<any, S>>;
  /**
   * Checks if a data item is valid, according to the isValid predicate.
   * @param dataItem The data item to check.
   * @param isValid An isValid predicate created by {@link DataItemUtils.createIsValid}.
   * Defaults to a validator accepting {@link DataItemUtils.valueOr} or {@link DataItemUtils.isValid}.
   * @returns Whether the data item is valid according to isValid.
   */
  public static isValid(dataItem: Readonly<DataItem<any>>, isValid?: DataItemStatusGuard<DataItemStatus>): boolean;
  // eslint-disable-next-line jsdoc/require-jsdoc
  public static isValid(dataItem: Readonly<DataItem<any>>, isValid: DataItemStatusGuard<DataItemStatus> = DataItemUtils.defaultIsValid): boolean {
    return isValid(dataItem);
  }

  /**
   * Gets the value of the data item is the status is valid (Normal or Testing),
   * or else a default value.
   * @param dataItem The data item to use.
   * @param defaultValue The default value returned when the data item is invalid.
   * @param isValid An isValid predicate created by {@link DataItemUtils.createIsValid}.
   * Defaults to a predicate that accepts {@link DataItemStatus.Normal} or {@link DataItemStatus.Testing} as valid.
   * @returns The valid value, or the default value.
   */
  public static valueOr<T, D = T>(
    dataItem: Readonly<DataItem<T>>,
    defaultValue: D,
    isValid: DataItemStatusGuard<Exclude<DataItemStatus, DataItemStatus.EmptyValue>> = DataItemUtils.defaultIsValid
  ): T | D {
    if (isValid(dataItem)) {
      return dataItem.value;
    }
    return defaultValue;
  }
}
