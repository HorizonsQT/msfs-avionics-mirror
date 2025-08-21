import { EventBus, SimVarValueType } from '../../data';
import { ClockEvents } from '../../instruments';
import { BinaryHeap } from '../datastructures';

/** A node in the sim timer queue. */
interface SimTimerNode {
  /** The ID of the callback. */
  id: number,

  /** Whether or not the callback has been canceled. */
  isCanceled: boolean,

  /** The timestamp the callback is scheduled for. */
  scheduledAt: number,

  /** The callback to run. */
  callback: () => void,
}

/**
 * A class that handles queue and dispatch of scheduled callbacks based on sim time.
 */
class SimTimerQueue {
  private static readonly SIM_TO_UNIX_TIME_OFFSET = 62135596800;

  private currentTimestamp = (SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds) - SimTimerQueue.SIM_TO_UNIX_TIME_OFFSET) * 1000;
  private currentCallbackId = 0;

  private queue = new BinaryHeap<SimTimerNode>((a, b) => a.scheduledAt - b.scheduledAt);
  private map = new Map<number, SimTimerNode>();

  /**
   * Creates an instance of the SimTimerQueue.
   * @param bus The event bus to use with this instance.
   */
  constructor(bus: EventBus) {
    bus.getSubscriber<ClockEvents>().on('simTime').handle(this.onUpdate.bind(this));
  }

  /**
   * Schedules a callback on the queue.
   * @param callback The callback to schedule.
   * @param timeout The timeout after which to call the callback, in milliseconds.
   * @returns A timer ID.
   */
  public schedule(callback: () => void, timeout: number): number {
    const id = this.currentCallbackId++;
    const node: SimTimerNode = {
      id: id,
      isCanceled: false,
      scheduledAt: this.currentTimestamp + timeout,
      callback: callback
    };

    this.map.set(id, node);
    this.queue.insert(node);

    return id;
  }

  /**
   * Unschedules a callback.
   * @param id The ID of the scheduled callback.
   */
  public unschedule(id: number): void {
    const node = this.map.get(id);
    if (node !== undefined) {
      node.isCanceled = true;
    }
  }

  /**
   * Handles when the sim time is updated.
   * @param timestamp The new sim time timestamp.
   */
  private onUpdate(timestamp: number): void {
    // Check for time jumps, and reschedule against the new time if detected
    const deltaTime = timestamp - this.currentTimestamp;
    if (deltaTime < -15 || deltaTime > 60000) {
      this.shiftSchedule(timestamp);
    }

    this.currentTimestamp = timestamp;

    let node = this.queue.findMin();
    while (node !== undefined) {
      if (node.scheduledAt <= this.currentTimestamp) {
        this.map.delete(node.id);

        this.queue.removeMin();
        if (!node.isCanceled) {
          node.callback();
        }

        node = this.queue.findMin();
      } else {
        node = undefined;
      }
    }
  }

  /**
   * Shifts the schedule of all scheduled nodes in case of a time skip.
   * @param timestamp The new timestamp to shift to. 
   */
  private shiftSchedule(timestamp: number): void {
    for (const node of this.map.values()) {
      const timeRemaining = node.scheduledAt - this.currentTimestamp;
      node.scheduledAt = timeRemaining + timestamp;
    }
  }
}

/**
 * A timer that allows for scheduling delayed callbacks using time supplied
 * by the event bus and ClockPublisher's simTime event.
 */
export class BusSimTimeDelayTimer {
  private static queueInstance?: SimTimerQueue;
  private timer: number | undefined = undefined;

  /**
   * Creates an instance of a BusSimTimeDelayTimer.
   * @param bus The event bus to use with this instance.
   */
  constructor(bus: EventBus) {
    if (BusSimTimeDelayTimer.queueInstance === undefined) {
      BusSimTimeDelayTimer.queueInstance = new SimTimerQueue(bus);
    }
  }

  /**
   * Checks whether an action is pending on this timer.
   * @returns Whether an action is pending on this timer.
   */
  public isPending(): boolean {
    return this.timer !== undefined;
  }

  /**
   * Schedules an action. Waits for a specified amount of time, and executes the action only if no other action is
   * scheduled on this timer during the delay.
   * @param action The action to schedule.
   * @param delay The debounce delay, in milliseconds.
   */
  public schedule(action: () => void, delay: number): void {
    this.clear();
    this.timer = BusSimTimeDelayTimer.queueInstance!.schedule(() => {
      this.timer = undefined;
      action();
    }, delay);
  }

  /**
   * Clears this timer of any pending actions. Actions that are cleared will not be executed.
   */
  public clear(): void {
    if (this.timer === undefined) {
      return;
    }

    BusSimTimeDelayTimer.queueInstance!.unschedule(this.timer);
    this.timer = undefined;
  }
}