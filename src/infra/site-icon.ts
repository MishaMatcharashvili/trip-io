import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// A place's logo, as its own website publishes it: the apple-touch-icon when
// there is one (180 px, drawn to sit in a rounded tile), else the largest
// declared icon, else /favicon.ico.
//
// The URL comes from the catalogue, so this is a server fetching an address it
// did not choose. Every hop — the page, each redirect, the icon — must resolve
// to a public address, and nothing large or scriptable comes back: raster
// images only, never SVG, which could carry script onto our own origin.

export type SiteIcon = { bytes: Uint8Array<ArrayBuffer>; contentType: string };

const USER_AGENT =
  "trip.io/1 (+https://github.com/MishaMatcharashvili/trip-io)";
const TIMEOUT_MS = 4_000;
const MAX_HTML = 256 * 1024;
const MAX_ICON = 200 * 1024;
const MAX_REDIRECTS = 3;

/** Is an address one a server on the public internet could have? */
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (isIP(address) === 6) {
    const v6 = address.toLowerCase();
    if (v6.startsWith("::ffff:")) return isPublicAddress(v6.slice(7));
    return !(
      v6 === "::" ||
      v6 === "::1" ||
      /^f[cd]/.test(v6) ||
      /^fe[89ab]/.test(v6) ||
      v6.startsWith("ff")
    );
  }
  return false;
}

async function resolvesPublic(url: URL): Promise<boolean> {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.port && url.port !== "80" && url.port !== "443") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return false;
  try {
    const addresses = await lookup(host, { all: true });
    return (
      addresses.length > 0 && addresses.every((a) => isPublicAddress(a.address))
    );
  } catch {
    return false;
  }
}

/** GET, following redirects by hand so each hop is checked. */
async function get(start: URL, accept: string): Promise<Response | null> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await resolvesPublic(url))) return null;
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT, Accept: accept },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      url = new URL(location, url);
      continue;
    }
    return res.ok ? res : null;
  }
  return null;
}

/**
 * At most `max` bytes of a body. Longer is null, or the first `max` bytes
 * when `truncate` — a page's icon links are in its head.
 */
async function readCapped(
  res: Response,
  max: number,
  truncate = false,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.byteLength > max) {
      await reader.cancel();
      if (!truncate) return null;
      chunks.push(value.subarray(0, max - size));
      size = max;
      break;
    }
    size += value.byteLength;
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** The raster formats a logo may be, told by their first bytes. */
function sniff(b: Uint8Array): string | null {
  const starts = (...sig: number[]) => sig.every((v, i) => b[i] === v);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (starts(0x00, 0x00, 0x01, 0x00)) return "image/x-icon";
  if (starts(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45)
    return "image/webp";
  return null;
}

/**
 * Icon URLs a page declares, best first: touch icons, then icons by their
 * largest declared size. SVG icons are skipped (see the header).
 */
export function iconLinks(html: string, base: URL): URL[] {
  const found: { url: URL; score: number }[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attr = (name: string) =>
      tag
        .match(
          new RegExp(
            `\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`,
            "i",
          ),
        )
        ?.slice(2)
        .find((v) => v !== undefined);
    const rel = attr("rel")?.toLowerCase().split(/\s+/) ?? [];
    const href = attr("href");
    if (
      !href ||
      !rel.some((r) => r === "icon" || r.startsWith("apple-touch-icon"))
    )
      continue;
    if (/\.svg(\?|$)/i.test(href) || attr("type")?.includes("svg")) continue;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    const size = Math.max(
      0,
      ...(attr("sizes") ?? "")
        .split(/\s+/)
        .map((s) => Number.parseInt(s, 10) || 0),
    );
    const touch = rel.some((r) => r.startsWith("apple-touch-icon"));
    found.push({
      url,
      score: (touch ? 1000 : 0) + (size || (touch ? 180 : 16)),
    });
  }
  return found.sort((a, b) => b.score - a.score).map((f) => f.url);
}

async function image(url: URL): Promise<SiteIcon | null> {
  try {
    const res = await get(url, "image/*");
    if (!res) return null;
    const bytes = await readCapped(res, MAX_ICON);
    const contentType = bytes && bytes.byteLength > 0 ? sniff(bytes) : null;
    return bytes && contentType ? { bytes, contentType } : null;
  } catch {
    return null;
  }
}

/** The best icon the site publishes, or null when it publishes none we can use. */
export async function siteIcon(site: URL): Promise<SiteIcon | null> {
  let declared: URL[] = [];
  try {
    const page = await get(site, "text/html");
    const body = page ? await readCapped(page, MAX_HTML, true) : null;
    if (body) {
      const html = new TextDecoder().decode(body);
      declared = iconLinks(html, new URL(page?.url || site));
    }
  } catch {
    // An unreachable page still has a /favicon.ico worth trying.
  }
  for (const url of [...declared.slice(0, 3), new URL("/favicon.ico", site)]) {
    const icon = await image(url);
    if (icon) return icon;
  }
  return null;
}
