/**
 * Applies the `readonly` modifier recursively to all properties of a type. Primitive types are left unchanged.
 * Array types are converted to their `readonly` versions.
 */
export type DeepReadonly<T> = T extends (infer U)[] ? readonly DeepReadonly<U>[] : {
  readonly [P in keyof T as P]: DeepReadonly<T[P]>;
};

/**
 * Removes `null` and `undefined` from a union type.
 * @template T The union type from which to remove `null` and `undefined`.
 */
export type ToNonNullable<T> = T extends null | undefined ? never : T;

/**
 * Returns `true` if two types are equal and `false` otherwise. Unions are **not** distributed. The `any` type is
 * considered to be equal to all types except `never`. The `never` type is considered equal only to itself.
 * @template A The first type to compare.
 * @template B The second type to compare.
 */
export type TypeEquals<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false;

/**
 * Gets the type of another type's property. If the property does not exist, then `never` is returned.
 * @template T The type containing the property for which to get a type.
 * @template K The key of the property for which to get a type.
 */
export type PropertyTypeOf<T, K> = [K] extends [keyof T] ? T[K] : never;

/**
 * Gets the type of another type's property. If the property does not exist, then `undefined` is returned.
 * @template T The type containing the property for which to get a type.
 * @template K The key of the property for which to get a type.
 */
export type OptionalPropertyTypeOf<T, K> = [K] extends [keyof T] ? T[K] : undefined;

/**
 * Gets the type of another type's property. If the parent type is a union, then it will be distributed. If a property
 * exists on at least one distributed parent type and also does not exist on at least one other parent type, then the
 * property type is returned as a union with `undefined`. If a property does not exist on any distributed parent type,
 * then `never` is returned.
 * @template T The type containing the property for which to get a type.
 * @template K The key of the property for which to get a type.
 */
export type PropertyTypeOfDistributed<T, K> = ReplaceExactType<T extends Record<any, any> ? OptionalPropertyTypeOf<T, K> : never, undefined, never>;

/**
 * Gets the type of another type's property. If the parent type is a union, then it will be distributed. If a property
 * does not exist on at least one distributed parent type, then the property type is returned as a union with
 * `undefined`. If a property does not exist on any distributed parent type, then `undefined` is returned.
 * @template T The type containing the property for which to get a type.
 * @template K The key of the property for which to get a type.
 */
export type OptionalPropertyTypeOfDistributed<T, K> = T extends Record<any, any> ? OptionalPropertyTypeOf<T, K> : never;

/**
 * Gets the type of another type's property. If the property does not exist, then `never` is returned. If the property
 * key is a union type, then it is distributed.
 * @template T The type containing the property for which to get a type.
 * @template K The key of the property for which to get a type.
 */
export type DistributedPropertyTypeOf<T, K> = K extends keyof T ? T[K] : never;

/**
 * Gets the type of another type's property. If the property does not exist, then `undefined` is returned. If the
 * property key is a union type, then it is properly distributed.
 * @template T The type containing the property for which to get a type.
 * @template K The key of the property for which to get a type.
 */
export type OptionalDistributedPropertyTypeOf<T, K> = K extends keyof T ? T[K] : undefined;

/**
 * Gets the type of another type's property. If the property key is a union type, then it is distributed. If the parent
 * type is a union, then it will be distributed. If a property exists on at least one distributed parent type and also
 * does not exist on at least one other parent type, then the property type is returned as a union with `undefined`. If
 * a property does not exist on any distributed parent type, then `never` is returned.
 * @template T The type containing the property for which to get a type.
 * @template K The key of the property for which to get a type.
 */
export type DistributedPropertyTypeOfDistributed<T, K> = ReplaceExactType<T extends Record<any, any> ? OptionalPropertyTypeOf<T, K> : never, undefined, never>;

/**
 * Gets the type of another type's property. If the property key is a union type, then it is distributed. If the parent
 * type is a union, then it will be distributed. If a property does not exist on at least one distributed parent type,
 * then the property type is returned as a union with `undefined`. If a property does not exist on any distributed
 * parent type, then `undefined` is returned.
 * @template T The type containing the property for which to get a type.
 * @template K The key of the property for which to get a type.
 */
export type OptionalDistributedPropertyTypeOfDistributed<T, K> = T extends Record<any, any> ? OptionalPropertyTypeOf<T, K> : never;

/**
 * Conditionally replaces a type with another one if the former extends a specified type. The type to replace is
 * **not** distributed if it is a union.
 * @template T The type to replace.
 * @template ConditionType The type that `T` must extend in order to be replaced.
 * @template ReplacementType The type with which to replace `T` if it extends `ConditionType`.
 */
export type ReplaceType<T, ConditionType, ReplacementType> = [T] extends [ConditionType] ? ReplacementType : T;

/**
 * Conditionally replaces a type with another one if the former equals a specified type. The type to replace is
 * **not** distributed if it is a union.
 * @template T The type to replace.
 * @template ConditionType The type that `T` must be equal to in order to be replaced.
 * @template ReplacementType The type with which to replace `T` if it equals `ConditionType`.
 */
export type ReplaceExactType<T, ConditionType, ReplacementType> = [T] extends [ConditionType] ? [ConditionType] extends [T] ? ReplacementType : T : T;

/**
 * Conditionally replaces a type with another one if the former extends a specified type. The type to replace is
 * distributed if it is a union.
 * @template T The type to replace.
 * @template ConditionType The type that `T` must extend in order to be replaced.
 * @template ReplacementType The type with which to replace `T` if it extends `ConditionType`.
 */
export type ReplaceTypeDistributed<T, ConditionType, ReplacementType> = T extends ConditionType ? ReplacementType : T;

/** Takes a number type from 1 to 8 and returns a union type ranging from 1 to E inclusive, 8 is the limit. */
export type NumberToRangeUnion<E extends number | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8> =
  E extends 1 ? 1
  : E extends 2 ? 1 | 2
  : E extends 3 ? 1 | 2 | 3
  : E extends 4 ? 1 | 2 | 3 | 4
  : E extends 5 ? 1 | 2 | 3 | 4 | 5
  : E extends 6 ? 1 | 2 | 3 | 4 | 5 | 6
  : E extends 7 ? 1 | 2 | 3 | 4 | 5 | 6 | 7
  : E extends 8 ? 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  : number;
