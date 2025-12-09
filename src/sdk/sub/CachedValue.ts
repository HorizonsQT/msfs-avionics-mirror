import { Accessible } from './Accessible';

/**
 * A cached accessible value backed by a source Accessible. Every time the cached value's state is retrieved, it is
 * checked to determine whether it is valid. If it is valid, then the cached state is returned unchanged. If it is not
 * valid, then the cached state is updated with the state of the source Accessible before it is returned. Once updated
 * with the state of the source Accessible, the cached state remains valid until it is manually invalidated.
 * @template T The type of the value.
 */
export class CachedValue<T> implements Accessible<T> {
  private isCacheInvalid = true;
  private cachedState: T | undefined = undefined;

  /**
   * Creates a new instance of CachedValue. The new instance is initialized with an invalid cached state.
   * @param source The accessible that is the source of the new cached value.
   */
  private constructor(private readonly source: Accessible<T>) {
  }

  /**
   * Creates a new instance of CachedValue. The new instance is initialized with an invalid cached state.
   * @param source The accessible that is the source of the new cached value.
   * @returns A new instance of CachedValue backed by the specified Accessible.
   */
  public static create<T>(source: Accessible<T>): CachedValue<T> {
    return new CachedValue(source);
  }

  /**
   * Gets the cached state of this value. If the cached state is valid, then the cached state will be returned as-is.
   * Otherwise, the cached state will be updated with the state of this value's source Accessible before it is
   * returned, and the cached state will be marked as valid.
   * @returns This value's cached state.
   */
  public get(): T {
    if (this.isCacheInvalid) {
      this.cachedState = this.source.get();
      this.isCacheInvalid = false;
      return this.cachedState;
    }

    return this.cachedState as T;
  }

  /**
   * Invalidates the cached state of this value. The next time `get()` is called, the cached state will be updated with
   * with the state of this value's source Accessible.
   */
  public invalidate(): void {
    this.isCacheInvalid = true;
    this.cachedState = undefined;
  }
}
