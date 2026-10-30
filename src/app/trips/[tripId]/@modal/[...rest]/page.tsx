// The popup slot on every other address under the trip — the plan, a day, the
// alerts — for the same reason as ../page.tsx: a link out of a stop closes it.
// A stop opened from inside the trip is still the intercepting route, which
// is matched first.
export default function NoPopup() {
  return null;
}
