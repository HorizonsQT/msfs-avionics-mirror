import { AbstractSubscribable } from '../sub/AbstractSubscribable';
import { Subject } from '../sub/Subject';
import { Subscribable } from '../sub/Subscribable';
import { DataBusClient, TypedDataBusClient, TypedDataBusHost } from './DataBus';
import { DataItem, DataItemStatus } from './DataItem';
import { DataItemUtils } from './DataItemUtils';
import { SharedGlobal, SharedGlobalObjectRef } from './SharedGlobal';

/**
 * An entry for a data item label in the shared data storage.
 * @template T The value type of the label's data items.
 */
interface LabelEntry<T> {
  /** A map of the label's data items, keyed by index. */
  dataItemEntries: Map<number, DataItemEntry<T>>;

  /**
   * A function that checks whether two values are equal for the label's data items.
   * @param a The first value to check.
   * @param b The second value to check.
   * @returns Whether the two specified values are equal.
   */
  equalityFunc?: (a: T, b: T) => boolean;
}

/**
 * An entry for a data item in the shared data storage.
 * @template T The type of the value.
 */
interface DataItemEntry<T> {
  /**
   * A number that identifies the version of the current value of the data item. This number should be incremented
   * every time the data item value changes.
   */
  valueId: number;

  /** The value of the data item. */
  current: DataItem<T>;
}

/**
 * An interface that defines the internal shared data structure.
 * @experimental This API is still under development and should not be used for production code.
 */
interface SharedData {
  /** The shared bus data. */
  data?: Map<string, LabelEntry<any>>,
}

/**
 * A subject that delivers shared data values to multiple views.
 * @template T The type of the value in the subject.
 * @experimental This API is still under development and should not be used for production code.
 */
class DistributedSubject<T> extends AbstractSubscribable<Readonly<DataItem<T>>> implements Subscribable<Readonly<DataItem<T>>> {

  private lastUpdatedValueId = 0;

  /**
   * Creates an instance of a DistributedSubject.
   * @param data The data item backing the subject.
   * @experimental This API is still under development and should not be used for production code.
   */
  constructor(private data: DataItemEntry<T>) {
    super();
  }

  /**
   * Sets this subject's backing data item. If the new backing data item is different from the current backing data
   * item, then this will also notify subscribers that the subject's value has changed.
   * @param data The backing data item to set.
   */
  public setData(data: DataItemEntry<T>): void {
    if (data === this.data) {
      return;
    }

    this.data = data;
    this.notify();
  }

  /** @inheritDoc */
  public get(): Readonly<DataItem<T>> {
    return this.data.current;
  }

  /**
   * Updates the subject and notifies subscribers if the value is dirty.
   * @experimental This API is still under development and should not be used for production code.
   */
  public update(): void {
    if (this.lastUpdatedValueId !== this.data.valueId) {
      this.notify();
    }
  }

  /** @inheritDoc */
  protected notify(): void {
    this.lastUpdatedValueId = this.data.valueId;
    super.notify();
  }
}

/**
 * A provider of data that is stored in a global object shared between CoherentGT views. The client requires a
 * corresponding {@link SharedDataBusHost} to function properly.
 * @experimental This API is still under development and should not be used for production code.
 */
export class SharedDataBusClient implements DataBusClient {

  protected data = new Map<string, LabelEntry<any>>();
  protected readonly localSubjects = new Map<string, Map<number, DistributedSubject<any>>>();

  protected readonly _isAlive = Subject.create<boolean>(false);
  /**
   * Signals if the data bus host is alive and available for writing and reading.
   * @experimental This API is still under development and should not be used for production code.
   */
  public readonly isAlive: Subscribable<boolean> = this._isAlive;

  protected readonly typedImplementation = this.createTypedImplementation();

  /**
   * Creates an instance of SharedDataBusClient.
   * @param sharedGlobalName The name of the shared global object that is used to hold the data provided by the client.
   * @experimental This API is still under development and should not be used for production code.
   */
  public constructor(protected readonly sharedGlobalName: string) {
    this.initSharedGlobal();
  }

  /**
   * Waits for the data to be created on the shared object.
   * @param ref The ref to the shared object.
   * @returns The data object.
   */
  private waitDataCreated(ref: SharedGlobalObjectRef<SharedData>): Promise<Map<string, LabelEntry<any>>> {
    return new Promise<Map<string, LabelEntry<any>>>((resolve, reject) => {
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
   * Initializes this client from its associated shared global object.
   */
  protected async initSharedGlobal(): Promise<void> {
    try {
      const globalRef = await SharedGlobal.await(this.sharedGlobalName);
      const sharedData = await this.waitDataCreated(globalRef);
      this.setSharedData(sharedData);
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
   * Sets the shared data object used by this client.
   * @param data The shared data object to set.
   */
  protected setSharedData(data: Map<string, LabelEntry<any>>): void {
    this.data = data;

    for (const [key, sourceMap] of this.localSubjects.entries()) {
      for (const [sourceId, sub] of sourceMap.entries()) {
        sub.setData(this.getDataItemEntry<any, string>(key, sourceId));
      }
    }
  }

  /**
   * Creates an object that can access any data item from this client and implements {@link TypedDataBusClient}.
   * @returns An object that can access any data item from this client and implements `TypedDataBusClient`.
   */
  protected createTypedImplementation(): TypedDataBusClient<Record<string, any>> {
    return Object.freeze({
      getSubscribable: <R extends Record<string, any>, L extends (keyof R & string)>(label: L, index: number): Subscribable<Readonly<DataItem<R[L]>>> => {
        let sourceMap = this.localSubjects.get(label);

        if (sourceMap === undefined) {
          sourceMap = new Map<number, DistributedSubject<any>>();
          this.localSubjects.set(label, sourceMap);
        }

        let sub = sourceMap.get(index);

        if (sub === undefined) {
          sub = new DistributedSubject<R[L]>(this.getDataItemEntry(label, index));
          sourceMap.set(index, sub);
        }

        return sub;
      }
    });
  }

  /** @inheritDoc */
  public of<R extends Record<string, any> = Record<never, never>>(): TypedDataBusClient<R> {
    return this.typedImplementation as TypedDataBusClient<R>;
  }

  /**
   * Gets the entry for a data item label from the shared storage.
   * @param label The label for which to get an entry.
   * @returns The requested data item label entry.
   * @template R A record describing the data item label entry to get. The record should contain a property whose name
   * is equal to the label, and the type of the property defines the value type of the label's data items.
   * @template L The label for which to get an entry.
   */
  protected getLabelEntry<R extends Record<string, any>, L extends (keyof R & string)>(label: L): LabelEntry<R[L]> {
    let labelEntry = this.data.get(label);

    if (labelEntry === undefined) {
      labelEntry = {
        dataItemEntries: new Map<number, DataItemEntry<any>>(),
      };
      this.data.set(label, labelEntry);
    }

    return labelEntry;
  }

  /**
   * Gets the entry for a data item from a label entry.
   * @param labelEntry The label entry from which to get the data item entry.
   * @param index The index of the data item entry to get.
   * @returns The requested data item entry.
   * @template T The type of the data item's value.
   */
  protected getDataItemEntryFromLabelEntry<T>(labelEntry: LabelEntry<T>, index: number): DataItemEntry<T> {
    let dataItemEntry = labelEntry.dataItemEntries.get(index);

    if (dataItemEntry === undefined) {
      dataItemEntry = {
        valueId: 0,
        current: DataItemUtils.emptyItem(),
      };

      labelEntry.dataItemEntries.set(index, dataItemEntry);
    }

    return dataItemEntry;
  }

  /**
   * Gets the entry for a data item from the shared storage.
   * @param label The label of the data item entry to get.
   * @param index The index of the data item entry to get.
   * @returns The requested data item entry.
   * @template R A record describing the data item entry to get. The record should contain a property whose name is
   * equal to the label of the data item entry, and the type of the property defines the value type of the data item
   * entry.
   * @template L The label of the data item entry to get.
   */
  protected getDataItemEntry<R extends Record<string, any>, L extends (keyof R & string)>(label: L, index: number): DataItemEntry<R[L]> {
    return this.getDataItemEntryFromLabelEntry(this.getLabelEntry<R, L>(label), index);
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
 * A host of data that is stored in a global object shared between CoherentGT views. Data published to the host can be
 * retrieved by instances of {@link SharedDataBusClient} on the same or different CoherentGT views. The host also acts
 * as a client for its own data.
 * @experimental This API is still under development and should not be used for production code.
 * */
export class SharedDataBusHost extends SharedDataBusClient implements SharedDataBusHost {

  /**
   * Creates an instance of SharedDataBusHost.
   * @param sharedGlobalName The name of the shared global object that is used to hold the data written by the host.
   * There should be at most one instance of SharedDataBusHost across all CoherentGT views for each unique shared
   * global object.
   * @experimental This API is still under development and should not be used for production code.
   */
  public constructor(sharedGlobalName: string) {
    super(sharedGlobalName);
  }

  /**
   * Creates an object that can access any data item from this host and implements {@link TypedDataBusHost}.
   * @returns An object that can access any data item from this host and implements `TypedDataBusHost`.
   */
  protected createTypedImplementation(): TypedDataBusHost<Record<string, any>> {
    return Object.freeze({
      ...super.createTypedImplementation(),

      defineEquality: <R extends Record<string, any>, L extends (keyof R & string)>(label: L, equalityFunc: ((a: R[L], b: R[L]) => boolean) | undefined): void => {
        const labelEntry = this.getLabelEntry<R, L>(label);
        labelEntry.equalityFunc = (equalityFunc ?? DataItemUtils.defaultValueEquals);
      },

      publish: <R extends Record<string, any>, L extends (keyof R & string)>(label: L, index: number, value: R[L] | undefined, status?: DataItemStatus): void => {
        const labelEntry = this.getLabelEntry<R, L>(label);
        const dataItem = this.getDataItemEntryFromLabelEntry(labelEntry, index);

        let isDirty = false;

        if (status !== undefined && dataItem.current.status !== status) {
          dataItem.current.status = status;

          if (status === DataItemStatus.EmptyValue) {
            dataItem.current.value = undefined;
          }

          isDirty = true;
        }

        if (dataItem.current.status !== DataItemStatus.EmptyValue) {
          // NOTE: The equality is function is guaranteed to be defined because getLabelEntry() would have set it to the
          // default function if it was undefined.
          if (!labelEntry.equalityFunc!(dataItem.current.value, value as R[L])) {
            dataItem.current.value = value as R[L];
            isDirty = true;
          }
        }

        if (isDirty) {
          // Increment value ID so that client subjects notify their subscribers at the next update.
          ++dataItem.valueId;

          // Immediately notify local subjects on the host.
          const sourceMap = this.localSubjects.get(label);
          if (sourceMap !== undefined) {
            const sub = sourceMap.get(index);

            if (sub !== undefined) {
              sub.update();
            }
          }
        }
      }
    });
  }

  /** @inheritDoc */
  public of<R extends Record<string, any> = Record<never, never>>(): TypedDataBusHost<R> {
    return this.typedImplementation as TypedDataBusHost<R>;
  }

  /**
   * Initializes the shared global object to which this host will write data.
   */
  protected async initSharedGlobal(): Promise<void> {
    let globalRef: SharedGlobalObjectRef<SharedData> | undefined;

    try {
      globalRef = await SharedGlobal.get<SharedData>(this.sharedGlobalName);
    } catch (_) {
      this._isAlive.set(false);
      setTimeout(() => this.initSharedGlobal());
    }

    if (!globalRef) {
      return;
    }

    if (globalRef.instance.data !== undefined) {
      throw new Error('SharedDataBusHost: cannot bind host to a shared global object that is owned by another entity');
    }

    globalRef.instance.data = this.data;

    this._isAlive.set(true);

    const sub = globalRef.isDetached.sub(isDestroyed => {
      if (isDestroyed) {
        sub.destroy();
        this._isAlive.set(false);
        // The host should always be the owner of the shared global object. If the object has been detached, then that
        // can only mean the host's parent view is being destroyed. Therefore we should not try to re-initialize the
        // shared global.
      }
    }, false, true);
    sub.resume(true);
  }

  /** @inheritDoc */
  protected getLabelEntry<R extends Record<string, any>, L extends (keyof R & string)>(label: L): LabelEntry<R[L]> {
    const labelEntry = super.getLabelEntry<R, L>(label);

    // If the entry does not have an equality function defined, then use the default equality function.
    if (!labelEntry.equalityFunc) {
      labelEntry.equalityFunc = DataItemUtils.defaultValueEquals;
    }

    return labelEntry;
  }

  /** @inheritDoc */
  public update(): void {
    // The host is guaranteed to immediately notify local subjects of any data item changes when publish() is called,
    // so we don't need to do anything here.
  }
}
