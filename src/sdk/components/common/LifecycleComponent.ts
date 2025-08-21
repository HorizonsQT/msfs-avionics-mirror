import { BasicLifecycle } from '../../sub/BasicLifecycle';
import { Lifecycle } from '../../sub/Lifecycle';
import { Subscription } from '../../sub/Subscription';
import { DisplayComponent, FSComponent, VNode } from '../FSComponent';

/**
 * An implementation of {@link DisplayComponent} which creates its own {@link Lifecycle} implementation that can be tied
 * to subscriptions created within the component.
 *
 * This component provides `pause()` and `resume()` methods, which act upon the attached lifecycle and the first `LifecycleComponent`
 * in each branch of its children component tree.
 *
 * This component also, by default, destroys the first `DisplayComponent` in each branch of its children component tree
 * when it is itself destroyed.
 */
export abstract class LifecycleComponent<P, Contexts extends unknown[] = []> extends DisplayComponent<P, Contexts> {
  /** The default lifecycle to use to managed subscriptions. */
  protected readonly defaultLifecycle = this.createDefaultLifecycle();

  protected thisNode?: VNode;

  /**
   * Creates the component's default lifecycle.
   * @returns A lifecycle to use as the default.
   */
  protected createDefaultLifecycle(): Lifecycle {
    return new BasicLifecycle(true);
  }

  /** Pauses subscriptions managed by the component lifecycle and the first `LifecycleComponent` of each child component branch. */
  public pause(): void {
    this.forChildNodes(n => n.pause());
    this.defaultLifecycle.pause();
  }

  /** Resumes subscriptions managed by the component lifecycle and the first {@link LifecycleComponent} of each child component branch. */
  public resume(): void {
    this.defaultLifecycle.resume();
    this.forChildNodes(n => n.resume());
  }

  /** @inheritdoc */
  public override destroy(): void {
    if (this.thisNode !== undefined) {
      FSComponent.shallowDestroy(this.thisNode);
    }

    this.defaultLifecycle.destroy();
  }

  /** @inheritdoc */
  public onAfterRender(node: VNode): void {
    this.thisNode = node;
    super.onAfterRender(node);
  }

  /**
   * Registers a subscription with the component default lifecycle.
   * @param sub The subscription to register.
   * @returns The registered subscription.
   */
  protected register<T extends Subscription>(sub: T): T {
    return sub.withLifecycle(this.defaultLifecycle) as T;
  }

  /**
   * Iterates over immediate child nodes.
   * @param fn The function to call when a LifecycleComponent is found.
   */
  protected forChildNodes(fn: (n: LifecycleComponent<any, any>) => void): void {
    if (this.thisNode !== undefined) {
      FSComponent.visitNodes(this.thisNode, (node: VNode) => {
        if (node !== this.thisNode && node.instance instanceof LifecycleComponent) {
          fn(node.instance);
          return true;
        }

        return false;
      });
    }
  }
}
