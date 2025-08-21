import { Lifecycle } from './Lifecycle';
import { Subscription } from './Subscription';

/**
 * A subscription lifecycle that pauses all registered subscriptions when the lifecycle is paused and resumes all
 * registered subscriptions when the lifecycle is resumed.
 */
export class BasicLifecycle implements Lifecycle {
  protected subscriptions?: Subscription[];
  protected isDestroyed = false;

  /**
   * Creates an instance of a BasicLifecycle.
   * @param notifyOnResume Whether to immediately trigger notifications to this lifecycle's registered subscriptions
   * when this lifecycle is resumed.
   */
  public constructor(public readonly notifyOnResume: boolean) { }

  /** @inheritDoc */
  public register(sub: Subscription): void {
    if (this.isDestroyed) {
      sub.destroy();
    } else {
      if (this.subscriptions === undefined) {
        this.subscriptions = [];
      }

      this.subscriptions.push(sub);
    }
  }

  /** @inheritDoc */
  public unregister(sub: Subscription): void {
    if (this.subscriptions !== undefined) {
      const index = this.subscriptions.indexOf(sub);
      if (index >= 0) {
        this.subscriptions.splice(index, 1);
      }
    }
  }

  /** @inheritDoc */
  public pause(): void {
    if (this.subscriptions !== undefined) {
      for (const subscription of this.subscriptions) {
        subscription.pause();
      }
    }
  }

  /** @inheritDoc */
  public resume(): void {
    if (this.subscriptions !== undefined) {
      for (const subscription of this.subscriptions) {
        subscription.resume(this.notifyOnResume);
      }
    }
  }

  /** @inheritDoc */
  public destroy(): void {
    this.isDestroyed = true;

    if (this.subscriptions !== undefined) {
      for (const subscription of this.subscriptions) {
        subscription.destroy();
      }

      this.subscriptions = undefined;
    }
  }
}
