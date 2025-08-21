import { BasicLifecycle } from './BasicLifecycle';
import { Subscription } from './Subscription';

/**
 * A variant of {@link BasicLifecycle} that keeps track of its own pause/resume state and immediately pauses or resumes
 * subscriptions when they are registered depending on whether it (the lifecycle) is paused or resumed at the time.
 */
export class StatefulBasicLifecycle extends BasicLifecycle {
  protected _isResumed: boolean;

  /**
   * Creates an instance of a StatefulLifecycle.
   * @param notifyOnResume Whether to immediately trigger notifications to this lifecycle's registered subscriptions
   * when this lifecycle is resumed.
   * @param isResumed Whether the lifecycle is initially resumed. Defaults to `false`.
   */
  public constructor(notifyOnResume: boolean, isResumed = false) {
    super(notifyOnResume);

    this._isResumed = isResumed;
  }

  /**
   * Checks whether this lifecycle is resumed.
   * @returns Whether this lifecycle is resumed.
   */
  public isResumed(): boolean {
    return this._isResumed;
  }

  /** @inheritDoc */
  public register(sub: Subscription): void {
    super.register(sub);

    if (!this.isDestroyed) {
      if (this._isResumed) {
        sub.resume(this.notifyOnResume);
      } else {
        sub.pause();
      }
    }
  }

  /** @inheritDoc */
  public pause(): void {
    if (this.isDestroyed || !this._isResumed) {
      return;
    }

    this._isResumed = false;

    super.pause();
  }

  /** @inheritDoc */
  public resume(): void {
    if (this.isDestroyed || this._isResumed) {
      return;
    }

    this._isResumed = true;

    super.resume();
  }
}
