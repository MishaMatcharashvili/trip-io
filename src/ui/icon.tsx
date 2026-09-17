/**
 * The icon set, lifted verbatim from the design canvas so stroke weights and
 * corner radii stay consistent with the artboards. Every glyph is drawn on a
 * 24×24 grid with `currentColor`, so colour comes from the surrounding text.
 */

const glyphs = {
  signal: (
    <>
      <circle cx="12" cy="12" r="2.4" />
      <path d="M12 5.6A6.4 6.4 0 0 1 18.4 12" />
      <path d="M12 2.2A9.8 9.8 0 0 1 21.8 12" />
    </>
  ),
  signalShort: (
    <>
      <circle cx="12" cy="12" r="2.4" />
      <path d="M12 5.6A6.4 6.4 0 0 1 18.4 12" />
    </>
  ),
  mic: (
    <>
      <path d="M12 15.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 1 0-7 0v6a3.5 3.5 0 0 0 3.5 3.5z" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18.5v3" />
    </>
  ),
  sparkle: (
    <path d="M12 3.6l2.1 6.3 6.3 2.1-6.3 2.1L12 20.4l-2.1-6.3L3.6 12l6.3-2.1z" />
  ),
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  rain: (
    <>
      <path d="M7 15a4 4 0 0 1 .6-7.96 5.5 5.5 0 0 1 10.6 1.7A3.5 3.5 0 0 1 17.5 15z" />
      <path d="M8 18.4l-1 2M12 18.4l-1 2M16 18.4l-1 2" />
    </>
  ),
  arrowRight: <path d="M5 12h13M12 5l7 7-7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  calendar: (
    <>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
      <path d="M8 2.8v3.4M16 2.8v3.4M3.5 9.5h17" />
    </>
  ),
  map: (
    <>
      <path d="M9 3.5L3.5 6v14.5L9 18l6 2.5 5.5-2.5V3.5L15 6z" />
      <path d="M9 3.5V18M15 6v14.5" />
    </>
  ),
  list: <path d="M5 4.5h14M5 12h14M5 19.5h9" />,
  warning: (
    <>
      <path d="M12 3.8L21 19.5H3z" />
      <path d="M12 10v4M12 16.8v.2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.8v.2" />
    </>
  ),
  revert: (
    <>
      <path d="M4 11.5a8 8 0 1 1 2.4 5.7" />
      <path d="M4 6.5v5h5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  locate: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  offline: (
    <>
      <path d="M3 4l18 16" />
      <path d="M5 12.5a10 10 0 0 1 4.2-2.3M2 8.6a15 15 0 0 1 4.6-2.7M17.6 15.2a10 10 0 0 0-3.1-2M21.5 9a15 15 0 0 0-8.6-3.4" />
      <path d="M12 19.5v.2" />
    </>
  ),
  photo: (
    <>
      <path d="M3 18l5-9 4 6 3-4 6 7z" />
      <circle cx="8" cy="6" r="2" />
    </>
  ),
  route: (
    <>
      <path d="M5 19c3-1 3-5 7-6s4-5 7-6" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="7" r="2" />
    </>
  ),
  explore: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15 9l-2 4.2-4 2 2-4.2z" />
    </>
  ),
  bookmark: <path d="M6.5 4h11v16l-5.5-4-5.5 4z" />,
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  filter: <path d="M5 7h14M7.5 12h9M10 17h4" />,
  // Not on the canvas — drawn to the same grid and stroke for the theme switch.
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  display: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M8.5 20h7M12 16.5V20" />
    </>
  ),
} as const;

export type IconName = keyof typeof glyphs;

export function Icon({
  name,
  size = 16,
  strokeWidth = 1.6,
  className,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className ?? ""}`}
    >
      {glyphs[name]}
    </svg>
  );
}
