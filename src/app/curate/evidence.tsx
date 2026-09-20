import type { QueuePlace } from "@/bll/curation";

// Overture contact fields are third-party strings; only real http(s) URLs
// become links.
const isHttpUrl = (value: string) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

export const humanise = (category: string) =>
  category.charAt(0).toUpperCase() + category.slice(1).replaceAll("_", " ");

/** What Overture knows about a candidate, plus links to check it against. */
export function Evidence({ place }: { place: QueuePlace }) {
  const { attrs } = place;
  const at = `${place.lat},${place.lon}`;
  const searchText = [place.name, attrs.locality].filter(Boolean).join(" ");

  const links = [
    [
      "Google Maps (pin)",
      `https://www.google.com/maps/search/?api=1&query=${at}`,
    ],
    [
      "Google Maps (name)",
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchText)}`,
    ],
    [
      "OpenStreetMap",
      `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=18/${place.lat}/${place.lon}`,
    ],
    [
      "Web search",
      `https://www.google.com/search?q=${encodeURIComponent(searchText)}`,
    ],
  ] as const;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{place.name}</h2>
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${
              place.tier === "verified"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {place.tier}
          </span>
          {place.lastDecision === "skip" && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              skipped before
            </span>
          )}
        </div>
        {place.nameKa && (
          <p className="text-zinc-600 dark:text-zinc-400">{place.nameKa}</p>
        )}
        <p className="text-sm text-zinc-500">
          {humanise(place.category)}
          {typeof attrs.confidence === "number" &&
            ` · Overture confidence ${attrs.confidence.toFixed(2)}`}
        </p>
        {place.lastNote && (
          <p className="mt-1 text-sm italic text-zinc-500">
            “{place.lastNote}”
          </p>
        )}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <Row label="Address" values={[attrs.address, attrs.locality]} />
        <Row label="Phone" values={attrs.phones} />
        <Row label="Web" values={attrs.websites} links />
        <Row label="Social" values={attrs.socials} links />
        <Row label="Email" values={attrs.emails} />
        <Row label="Brand" values={[attrs.brand]} />
      </dl>

      <div className="flex flex-wrap gap-2">
        {links.map(([label, href]) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {label} ↗
          </a>
        ))}
      </div>
    </section>
  );
}

function Row({
  label,
  values,
  links = false,
}: {
  label: string;
  values: (string | null | undefined)[] | undefined;
  links?: boolean;
}) {
  const present = (values ?? []).filter((v): v is string => Boolean(v));
  if (present.length === 0) return null;
  return (
    <>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="flex flex-col break-all">
        {present.map((v) =>
          links && isHttpUrl(v) ? (
            <a
              key={v}
              href={v}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {v}
            </a>
          ) : (
            <span key={v}>{v}</span>
          ),
        )}
      </dd>
    </>
  );
}
