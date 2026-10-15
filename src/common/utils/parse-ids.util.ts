/**
 * Parse comma-separated string into array of numbers.
 * e.g. "1,2,3" -> [1, 2, 3]
 */
export function parseIdList(value: string | undefined): number[] | undefined {
  if (!value?.trim()) return undefined;
  return value
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter(Number.isFinite);
}
