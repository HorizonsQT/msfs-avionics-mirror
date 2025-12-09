import { MathUtils } from '../../../math/MathUtils';
import { Subject } from '../../../sub/Subject';
import { Subscribable } from '../../../sub/Subscribable';

/**
 * A module describing the nominal scale factor of a map, as selected from an array of scale factors.
 */
export class MapIndexedScaleFactorModule {
  /** The index of the nominal scale factor. */
  public readonly nominalScaleFactorIndex = Subject.create(0) as Subscribable<number>;

  /** The array of possible map nominal scale factors. */
  public readonly nominalScaleFactors = Subject.create<readonly number[]>([1]);

  /** The nominal scale factor. */
  public readonly nominalScaleFactor = Subject.create(1) as Subscribable<number>;

  /**
   * Creates a new instance of MapIndexedScaleFactorModule.
   */
  public constructor() {
    this.nominalScaleFactors.sub(this.onNominalScaleFactorsChanged.bind(this));
  }

  /**
   * A callback which is called when the nominal scale factor array changes.
   * @param array The new array.
   */
  private onNominalScaleFactorsChanged(array: readonly number[]): void {
    const currentIndex = this.nominalScaleFactorIndex.get();
    this.setNominalScaleFactorIndex(MathUtils.clamp(currentIndex, 0, array.length - 1));
  }

  /**
   * Sets the nominal scale factor by index.
   * @param index The index of the new nominal scale factor.
   * @returns The value of the new nominal scale factor.
   * @throws Error if index of out of bounds.
   */
  public setNominalScaleFactorIndex(index: number): number {
    const rangeArray = this.nominalScaleFactors.get();
    if (index < 0 || index >= rangeArray.length) {
      throw new RangeError('Index out of bounds.');
    }

    const range = rangeArray[index];
    (this.nominalScaleFactorIndex as Subject<number>).set(index);
    (this.nominalScaleFactor as Subject<number>).set(range);
    return range;
  }
}
