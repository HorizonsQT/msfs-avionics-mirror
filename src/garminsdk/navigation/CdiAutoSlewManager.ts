import { SimVarValueType, Subscription } from '@microsoft/msfs-sdk';

import { NavReferenceSource } from '../navreference/source/NavReferenceSource';

/**
 * A manager that automatically slews a selected CDI course setting for a navigation radio to the localizer course when
 * a localizer is tuned and received.
 */
export class CdiAutoSlewManager {
  private isAlive = true;
  private isInit = false;
  private isResumed = false;

  private readonly subscriptions: Subscription[] = [];

  /**
   * Creates a new instance of CdiAutoSlewManager.
   * @param navSource The navigation reference source associated with the navigation radio to manage.
   */
  public constructor(private readonly navSource: NavReferenceSource<any>) {
  }

  /**
   * Initializes this manager. Once this manager is initialized, it will be able to automatically slew the selected CDI
   * course for its navigation radio.
   * @param paused Whether to initialize this manager in a paused state. Defaults to `false`.
   * @throws Error if this manager has been destroyed.
   */
  public init(paused = false): void {
    if (!this.isAlive) {
      throw new Error('CdiAutoSlewManager::init(): cannot initialize a dead manager');
    }

    if (this.isInit) {
      return;
    }

    this.isInit = true;

    const trySlewObs = this.trySlewObs.bind(this);

    this.subscriptions.push(
      this.navSource.localizerCourse.sub(trySlewObs, false, true),
      this.navSource.hasLocalizer.sub(trySlewObs, false, true)
    );

    if (!paused) {
      this.resume();
    }
  }

  /**
   * Resumes this manager. When resumed, this manager will automatically slew the selected CDI course for its
   * navigation radio. This method does nothing if the manager is not initialized.
   * @throws Error if this manager has been destroyed.
   */
  public resume(): void {
    if (!this.isAlive) {
      throw new Error('CdiAutoSlewManager::resume(): cannot resume a dead manager');
    }

    if (!this.isInit || this.isResumed) {
      return;
    }

    this.isResumed = true;

    for (const sub of this.subscriptions) {
      sub.resume();
    }

    this.trySlewObs();
  }

  /**
   * Pauses this manager. When this manager is paused, it will not automatically slew the selected CDI course for its
   * navigation radio until it is resumed. This method does nothing if the manager is not initialized.
   * @throws Error if this manager has been destroyed.
   */
  public pause(): void {
    if (!this.isAlive) {
      throw new Error('CdiAutoSlewManager::pause(): cannot pause a dead manager');
    }

    if (!this.isInit || !this.isResumed) {
      return;
    }

    this.isResumed = false;

    for (const sub of this.subscriptions) {
      sub.pause();
    }
  }

  /**
   * Attempts to slew the selected CDI course to the course of the tuned localizer, if one exists.
   */
  private trySlewObs(): void {
    const course = this.navSource.localizerCourse.get();
    if (this.navSource.hasLocalizer.get() && course !== null) {
      SimVar.SetSimVarValue(`K:VOR${this.navSource.index}_SET`, SimVarValueType.Number, Math.round(course));
    }
  }

  /**
   * Destroys this manager.
   */
  public destroy(): void {
    this.isAlive = false;

    for (const sub of this.subscriptions) {
      sub.destroy();
    }
  }
}
