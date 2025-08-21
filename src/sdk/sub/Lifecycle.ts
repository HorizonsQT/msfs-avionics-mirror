import { Subscription } from './Subscription';

/**
 * A version of {@link Lifecycle} that only allows registration and unregistration of subscriptions.
 */
export type ReadonlyLifecycle = Pick<Lifecycle, 'register' | 'unregister'>;

/**
 * An interface that defines an object that manages the lifecycle of subscriptions.
 */
export interface Lifecycle {
  /**
   * Registers a subscription to the lifecycle.
   * @param sub The subscription to register.
   */
  register(sub: Subscription): void;

  /**
   * Unregisters a subscription from the lifecycle.
   * @param sub The subscription to unregister.
   */
  unregister(sub: Subscription): void;

  /** Pauses subscriptions in this lifecycle. */
  pause(): void;

  /** Resumes subscriptions in this lifecycle. */
  resume(): void;

  /**
   * Destroys subscriptions in this lifecycle. All registered subscriptions
   * will be unregistered.
   */
  destroy(): void;
}
