import { Transform } from 'class-transformer';

/** Canonical form for storing and comparing emails: trimmed, lower-case. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** DTO decorator: normalise before validation so `A@x.ge ` equals `a@x.ge`. */
export function NormalizeEmail(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  );
}

/**
 * WHERE fragment matching rows stored before emails were normalised
 * (`Name@x.ge`). Bind `:email` to an already-normalised address.
 */
export function emailEqualsSql(alias: string): string {
  return `LOWER(${alias}.email) = :email`;
}
