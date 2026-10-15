import { Transform } from 'class-transformer';

/**
 * Query-string number: `?page=` (empty) and a missing param both mean "not
 * given". Plain `@Type(() => Number)` would turn the empty string into 0.
 * Pair with `@IsOptional() @IsInt()`; non-numeric text becomes NaN and fails.
 */
export function OptionalQueryNumber(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (value == null) return undefined;
    if (typeof value === 'string') {
      return value.trim() === '' ? undefined : Number(value);
    }
    return value;
  });
}
