import { AbstractSubscribable } from '../sub/AbstractSubscribable';
import { Subject } from '../sub/Subject';
import { Subscribable } from '../sub/Subscribable';
import { SharedGlobal, SharedGlobalObjectRef } from './SharedGlobal';

/**
 * The status of a data item on the shared data bus.
 * @experimental This API is still under development and should not be used for production code.
 */
export enum DataItemStatus {
  /** The data item is reporting a failed status. */
  Failed,

  /** The data item has no valid value. */
  NoValue,

  /** The data item value is coming from a functional test. */
  Testing,

  /** The data item value is a normal value. */
  Normal
}

/**
 * A tuple of a value of a filled data item and its current status.
 * @template T The type of the value.
 * @experimental This API is still under development and should not be used for production code.
 */
export interface FilledDataItemValue<T> {
  /** The data item value. */
  value: T;

  /** The data item status. */
  status: Exclude<DataItemStatus, DataItemStatus.NoValue>;
}

/**
 * A valueless (empty) data item.
 * @experimental This API is still under development and should not be used for production code.
 */
export interface EmptyDataItemValue {
  /** The empty value, which is always undefined. */
  value: undefined;

  /** The data item status, which is always empty. */
  status: DataItemStatus.NoValue;
}

/**
 * A tuple of a value of a data item and its current status.
 * @template T The type of the value.
 * @experimental This API is still under development and should not be used for production code.
 */
export type DataItemValue<T> = FilledDataItemValue<T> | EmptyDataItemValue;

/**
 * A data item in the shared data storage.
 * @template T The type of the value.
 * @experimental This API is still under development and should not be used for production code.
 */
interface DataItem<T> {
  /** Whether or not the value is dirty and has been updated during the current tick. */
  isDirty: boolean;

  /** The value of the data item. */
  current: DataItemValue<T>;
}

/**
 * An interface that defines the internal shared data structure.
 * @experimental This API is still under development and should not be used for production code.
 */
interface SharedData {
  /** The shared bus data. */
  data?: Map<string, Map<number, DataItem<any>>>,
}

/**
 * An interface that applies a data items type to the SharedDataBusClient.
 * @experimental This API is still under development and should not be used for production code.
 */
export interface TypedDataBusClient<T> {
  /**
   * Gets a subscribable for a data item.
   * @param key The key of the data item.
   * @param sourceId The ID of the source to get the data item from.
   * @returns The requested subscribable.
   * @experimental This API is still under development and should not be used for production code.
   */
  getSubscribable<K extends keyof T & string>(key: K, sourceId: number): Subscribable<Readonly<DataItemValue<T[K]>>>;
}

/**
 * An interface that applies a data items type to the SharedDataBusHost.
 * @experimental This API is still under development and should not be used for production code.
 */
export interface TypedDataBusHost<T> extends TypedDataBusClient<T> {
  /**
   * Publishes a value update to the data bus.
   * @param key The data key to publish to.
   * @param sourceId The ID of the source of the data.
   * @param value The value to publish.
   * @experimental This API is still under development and should not be used for production code.
   */
  publish<K extends keyof T & string>(key: K, sourceId: number, value: T[K]): void;
  /**
   * Publishes a no-value update to the data bus.
   * @param key The data key to publish to.
   * @param sourceId The ID of the source of the data.
   * @param value The value to publish, which must be undefined.
   * @param status A status to publish along with the value, which must be NoValue.
   * @experimental This API is still under development and should not be used for production code.
   */
  publish<K extends keyof T & string>(key: K, sourceId: number, value: undefined, status: DataItemStatus.NoValue): void;
  /**
   * Publishes a value and status update to the data bus.
   * @param key The data key to publish to.
   * @param sourceId The ID of the source of the data.
   * @param value The value to publish.
   * @param status A status to publish along with the value.
   * @experimental This API is still under development and should not be used for production code.
   */
  publish<K extends keyof T & string>(key: K, sourceId: number, value: T[K], status: Exclude<DataItemStatus, DataItemStatus.NoValue>): void;
  /**
   * Publishes a value update to the data bus.
   * @param key The data key to publish to.
   * @param sourceId The ID of the source of the data.
   * @param value The value to publish, or undefined for data with a NoValue status. If undefined is
   * provided with a non-NoValue status, then the value will be ignored.
   * @param status An optional status to publish along with the value.
   * @experimental This API is still under development and should not be used for production code.
   */
  publish<K extends keyof T & string>(key: K, sourceId: number, value: T[K] | undefined, status?: DataItemStatus): void;
}

/**
 * A subject that delivers shared data values to multiple views.
 * @template T The type of the value in the subject.
 * @experimental This API is still under development and should not be used for production code.
 */
class DistributedSubject<T> extends AbstractSubscribable<Readonly<DataItemValue<T>>> implements Subscribable<Readonly<DataItemValue<T>>> {

  /**
   * Creates an instance of a DistributedSubject.
   * @param data The data item backing the subject.
   * @experimental This API is still under development and should not be used for production code.
   */
  constructor(private data: DataItem<T>) {
    super();
  }

  /** @inheritdoc */
  public override get(): Readonly<DataItemValue<T>> {
    return this.data.current;
  }

  /**
   * Updates the subject and notifies subscribers if the value is dirty.
   * @experimental This API is still under development and should not be used for production code.
   */
  public update(): void {
    if (this.data.isDirty) {
      this.notify();
    }
  }
}

/**
 * A host of data that is stored in a global object shared between instruments, which allows
 * for the host to update the data to multiple subscriber instruments.
 * @experimental This API is still under development and should not be used for production code.
 */
export class SharedDataBusClient {

  protected data = new Map<string, Map<number, DataItem<any>>>();
  protected localSubjects = new Map<string, Map<number, DistributedSubject<any>>>();

  protected readonly _isAlive = Subject.create<boolean>(false);
  /**
   * Signals if the data bus host is alive and available for writing and reading.
   * @experimental This API is still under development and should not be used for production code.
   */
  public readonly isAlive: Subscribable<boolean> = this._isAlive;

  /**
   * Creates an instance of SharedDataBushost.
   * @param sharedGlobalName The name of the shared global object that will hold the data.
   * @experimental This API is still under development and should not be used for production code.
   */
  public constructor(protected sharedGlobalName: string) {
    this.initSharedGlobal();
  }

  /**
   * Waits for the data to be created on the shared object.
   * @param ref The ref to the shared object.
   * @returns The data object.
   */
  private waitDataCreated(ref: SharedGlobalObjectRef<SharedData>): Promise<Map<string, Map<number, DataItem<any>>>> {
    return new Promise<Map<string, Map<number, DataItem<any>>>>((resolve, reject) => {
      const interval = setInterval(() => {
        if (ref.isDetached.get()) {
          clearInterval(interval);
          reject('Shared global was detached while waiting for data to be created.');
        }

        if (ref.instance.data !== undefined) {
          resolve(ref.instance.data);
        }
      });
    });
  }

  /**
   * Creates the shared global to store data in.
   */
  protected async initSharedGlobal(): Promise<void> {
    try {
      const globalRef = await SharedGlobal.await(this.sharedGlobalName);
      this.data = await this.waitDataCreated(globalRef);
      this._isAlive.set(true);

      const sub = globalRef.isDetached.sub(isDestroyed => {
        if (isDestroyed) {
          sub.destroy();
          this._isAlive.set(false);
          this.initSharedGlobal();
        }
      }, false, true);
      sub.resume(true);
    } catch (_) {
      this._isAlive.set(false);
      setTimeout(() => this.initSharedGlobal());
    }
  }

  /**
   * Applies an data items type to the data bus.
   * @returns The data bus with the data items type applied.
   * @experimental This API is still under development and should not be used for production code.
   */
  public of<T>(): TypedDataBusClient<T> {
    return this as TypedDataBusClient<T>;
  }

  /**
   * Gets a subscribable for a data item.
   * @param key The key of the data item.
   * @param sourceId The ID of the source to get the data item from.
   * @returns The requested subscribable.
   * @experimental This API is still under development and should not be used for production code.
   */
  public getSubscribable<T, K extends (keyof T & string) = (keyof T & string)>(key: K, sourceId: number): Subscribable<Readonly<DataItemValue<T[K]>>> {
    let sourceMap = this.localSubjects.get(key);

    if (sourceMap === undefined) {
      sourceMap = new Map<number, DistributedSubject<any>>();
      this.localSubjects.set(key, sourceMap);
    }

    let sub = sourceMap.get(sourceId);

    if (sub === undefined) {
      sub = new DistributedSubject<T[K]>(this.getDataItem(key, sourceId));
      sourceMap.set(sourceId, sub);
    }

    return sub;
  }

  /**
   * Gets the data item from the shared storage.
   * @param key The key to the data item.
   * @param sourceId The ID of the data item source.
   * @returns The requested data item.
   * @experimental This API is still under development and should not be used for production code.
   */
  protected getDataItem<T, K extends (keyof T & string) = (keyof T & string)>(key: K, sourceId: number): DataItem<T[K]> {
    let sourceMap = this.data.get(key);

    if (sourceMap === undefined) {
      sourceMap = new Map<number, DataItem<any>>();
      this.data.set(key, sourceMap);
    }

    let dataItem = sourceMap.get(sourceId);

    if (dataItem === undefined) {
      dataItem = {
        isDirty: false,
        current: { value: undefined, status: DataItemStatus.NoValue },
      };

      sourceMap.set(sourceId, dataItem);
    }

    return dataItem;
  }

  /**
   * Updates the data bus to notify subscribers of updated data items.
   * @experimental This API is still under development and should not be used for production code.
   */
  public update(): void {
    for (const sourceMap of this.localSubjects.values()) {
      for (const sub of sourceMap.values()) {
        sub.update();
      }
    }
  }
}

/**
 * A host of data that is stored in a global object shared between instruments, which allows
 * for the host to update the data to multiple subscriber instruments.
 * @experimental This API is still under development and should not be used for production code.
 * */
export class SharedDataBusHost extends SharedDataBusClient {

  /**
   * Applies an data items type to the data bus.
   * @returns The data bus with the data items type applied.
   * @experimental This API is still under development and should not be used for production code.
   */
  public of<T>(): TypedDataBusHost<T> {
    return this as TypedDataBusHost<T>;
  }

  /**
   * Creates the shared global to store data in.
   * @experimental This API is still under development and should not be used for production code.
   */
  protected override async initSharedGlobal(): Promise<void> {
    try {
      const globalRef = await SharedGlobal.get<SharedData>(this.sharedGlobalName);
      globalRef.instance.data = this.data;
      this._isAlive.set(true);

      const sub = globalRef.isDetached.sub(isDestroyed => {
        if (isDestroyed) {
          sub.destroy();
          this._isAlive.set(false);
          this.initSharedGlobal();
        }
      }, false, true);
      sub.resume(true);
    } catch (_) {
      this._isAlive.set(false);
      setTimeout(() => this.initSharedGlobal());
    }
  }

  /**
   * Publishes a value update to the data bus.
   * @param key The data key to publish to.
   * @param sourceId The ID of the source of the data.
   * @param value The value to publish.
   * @experimental This API is still under development and should not be used for production code.
   */
  public publish<T, K extends (keyof T & string) = (keyof T & string)>(key: K, sourceId: number, value: T[K]): void;
  /**
   * Publishes a no-value update to the data bus.
   * @param key The data key to publish to.
   * @param sourceId The ID of the source of the data.
   * @param value The value to publish, which must be undefined.
   * @param status A status to publish along with the value, which must be NoValue.
   * @experimental This API is still under development and should not be used for production code.
   */
  public publish<T, K extends (keyof T & string) = (keyof T & string)>(key: K, sourceId: number, value: undefined, status: DataItemStatus.NoValue): void;
  /**
   * Publishes a value and status update to the data bus.
   * @param key The data key to publish to.
   * @param sourceId The ID of the source of the data.
   * @param value The value to publish.
   * @param status A status to publish along with the value.
   * @experimental This API is still under development and should not be used for production code.
   */
  public publish<T, K extends (keyof T & string) = (keyof T & string)>(key: K, sourceId: number, value: T[K], status: Exclude<DataItemStatus, DataItemStatus.NoValue>): void;
  /**
   * Publishes a value update to the data bus.
   * @param key The data key to publish to.
   * @param sourceId The ID of the source of the data.
   * @param value The value to publish, or undefined for data with a NoValue status. If undefined is
   * provided with a non-NoValue status, then the value will be ignored.
   * @param status An optional status to publish along with the value.
   * @experimental This API is still under development and should not be used for production code.
   */
  public publish<T, K extends (keyof T & string) = (keyof T & string)>(key: K, sourceId: number, value: T[K] | undefined, status?: DataItemStatus): void {
    const dataItem = this.getDataItem<T>(key, sourceId);

    if (status !== undefined && dataItem.current.status !== status) {
      dataItem.current.status = status;

      if (status === DataItemStatus.NoValue) {
        dataItem.current.value = undefined;
      }

      dataItem.isDirty = true;
    }

    if (dataItem.current.status !== DataItemStatus.NoValue) {
      if (dataItem.current.value !== value
        && !(typeof (value) === 'number' && typeof (dataItem.current.value) === 'number' && isNaN(dataItem.current.value) && isNaN(value))) {
        dataItem.current.value = value as T[K];
        dataItem.isDirty = true;
      }
    }

    //Immediately notify local subjects on the host
    if (dataItem.isDirty) {
      const sourceMap = this.localSubjects.get(key);
      if (sourceMap !== undefined) {
        const sub = sourceMap.get(sourceId);

        if (sub !== undefined) {
          sub.update();
        }
      }
    }
  }
}