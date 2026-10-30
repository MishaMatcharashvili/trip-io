// What a number field holds while it is being typed into. The text is the
// traveller's until they leave the field: clearing "2" to type "4" must not
// snap the empty box back to the minimum, so nothing is clamped mid-edit.

export type Range = { min: number; max: number };

/** A whole number written in full, or null for anything else ("", "-", "1."). */
const whole = (raw: string) =>
  /^\s*-?\d+\s*$/.test(raw) ? Number(raw.trim()) : null;

/** The value to pass on while typing: only one that is already in range. */
export function typedValue(raw: string, { min, max }: Range): number | null {
  const n = whole(raw);
  return n !== null && n >= min && n <= max ? n : null;
}

/**
 * The value once the field is left: clamped into range, or the last good
 * value when what was left behind is not a number at all.
 */
export function settledValue(
  raw: string,
  { min, max }: Range,
  last: number,
): number {
  const n = whole(raw);
  return n === null ? last : Math.min(max, Math.max(min, n));
}
