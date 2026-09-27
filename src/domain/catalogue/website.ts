// Which of a place's listed websites is its own. Overture's `websites` often
// holds a Facebook page or a booking listing instead, and the icon of one of
// those is somebody else's logo: a guesthouse drawn with Booking.com's "B"
// would be worse than a plain bed.

/** Hosts whose pages belong to a platform, not to the place listed on them. */
const PLATFORMS = [
  "facebook.com",
  "fb.com",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "linkedin.com",
  "linktr.ee",
  "t.me",
  "wa.me",
  "google.com",
  "goo.gl",
  "business.site",
  "booking.com",
  "airbnb.com",
  "tripadvisor.com",
  "expedia.com",
  "hotels.com",
  "agoda.com",
  "trip.com",
  "ostrovok.ru",
  "yandex.ru",
  "2gis.ge",
  "wolt.com",
  "glovoapp.com",
  "linktree.com",
  "wixsite.com",
  "wordpress.com",
  "blogspot.com",
];

const isPlatform = (host: string) =>
  PLATFORMS.some((p) => host === p || host.endsWith(`.${p}`));

/**
 * The place's own site, normalised to its origin, or null when the listing
 * is a platform page, not a web address, or not http(s).
 */
export function ownSite(website: string | null | undefined): URL | null {
  if (!website) return null;
  const raw = website.trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!host.includes(".") || isPlatform(host)) return null;
  return new URL(url.origin);
}
