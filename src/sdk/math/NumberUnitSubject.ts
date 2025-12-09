import { AbstractSubscribable } from '../sub/AbstractSubscribable';
import { MappedSubscribable, MutableSubscribable, Subscribable } from '../sub/Subscribable';
import { NumberUnit, NumberUnitInterface, Unit } from './NumberUnit';
import { MappedSubject } from '../sub/MappedSubject';
import { SubscribableUtils } from '../sub/SubscribableUtils';

/**
 * A Subject which provides a {@link NumberUnitInterface} value.
 */
export class NumberUnitSubject<F extends string, U extends Unit<F> = Unit<F>>
  extends AbstractSubscribable<NumberUnitInterface<F, U>>
  implements MutableSubscribable<NumberUnitInterface<F, U>>, MutableSubscribable<NumberUnitInterface<F, U>, number> {

  /** @inheritdoc */
  public readonly isMutableSubscribable = true;

  /**
   * Constructor.
   * @param value The value of this subject.
   */
  private constructor(private readonly value: NumberUnit<F, U>) {
    super();
  }

  /**
   * Creates a NumberUnitSubject.
   * @param initialVal The initial value.
   * @returns A NumberUnitSubject.
   */
  public static create<F extends string, U extends Unit<F>>(initialVal: NumberUnit<F, U>): NumberUnitSubject<F, U> {
    return new NumberUnitSubject(initialVal);
  }

  /**
   * Creates a NumberUnitSubject.
   * @param initialVal The initial value.
   * @returns A NumberUnitSubject.
   * @deprecated Use `NumberUnitSubject.create()` instead.
   */
  public static createFromNumberUnit<F extends string, U extends Unit<F>>(initialVal: NumberUnit<F, U>): NumberUnitSubject<F, U> {
    return new NumberUnitSubject(initialVal);
  }

  /** @inheritdoc */
  public get(): NumberUnitInterface<F, U> {
    return this.value.readonly;
  }

  /**
   * Sets the new value and notifies the subscribers if the value changed.
   * @param value The new value.
   */
  public set(value: NumberUnitInterface<F>): void;
  /**
   * Sets the new value and notifies the subscribers if the value changed.
   * @param value The numeric part of the new value.
   * @param unit The unit type of the new value. Defaults to the unit type of the NumberUnit used to create this
   * subject.
   */
  public set(value: number, unit?: Unit<F>): void;
  // eslint-disable-next-line jsdoc/require-jsdoc
  public set(arg1: NumberUnitInterface<F> | number, arg2?: Unit<F>): void {
    const isArg1Number = typeof arg1 === 'number';
    const equals = isArg1Number ? this.value.equals(arg1 as number, arg2) : this.value.equals(arg1 as NumberUnitInterface<F>);
    if (!equals) {
      isArg1Number ? (this.value as NumberUnit<F, U>).set(arg1 as number, arg2) : (this.value as NumberUnit<F, U>).set(arg1 as NumberUnitInterface<F>);
      this.notify();
    }
  }

  /**
   * Maps this subject to a new subscribable whose value is this subject's value converted to a given unit type.
   * @param unit The unit type in which the mapped subscribable's value is to be expressed.
   * @returns A new mapped subscribable whose value is this subject's value converted to the specified unit type.
   */
  public asUnit(unit: Unit<F> | Subscribable<Unit<F>>): MappedSubscribable<number> {
    return MappedSubject.create(
      inputs => inputs[0].asUnit(inputs[1]),
      this,
      SubscribableUtils.toSubscribable(unit, true)
    );
  }
}