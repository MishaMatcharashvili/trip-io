// Hosts a place's photographs are served from, for `next/image`. A host that is
// not listed makes `<Image>` throw while the page renders, so one photograph
// from an unlisted CDN takes down the whole place page — which is how the
// Wikimedia thumbnail host going from upload.wikimedia.org to
// thumb.wikimedia.org was found: by a page that would not load.
//
// Here rather than inline in next.config.ts so a test can hold the URLs the
// adapters really return against it, without importing the config (which
// validates the environment).

export type ImageHost = {
  protocol: "https";
  hostname: string;
  pathname?: string;
};

export const imageHosts: readonly ImageHost[] = [
  // Tripadvisor serves the photographer's original (up to ~5000px wide, several
  // MB) and the strip draws it 150px wide, so it is the one that needs
  // resizing most.
  {
    protocol: "https",
    hostname: "dynamic-media.tacdn.com",
    pathname: "/media/**",
  },
  // The addresses Google's Place Photos call returns; they carry no key.
  { protocol: "https", hostname: "*.googleusercontent.com" },
  // Wikimedia Commons: originals on upload, thumbnails on thumb. The API's
  // `thumburl` is on thumb.wikimedia.org today and was on upload.wikimedia.org
  // before; both are listed so either keeps working.
  {
    protocol: "https",
    hostname: "upload.wikimedia.org",
    pathname: "/wikipedia/commons/**",
  },
  {
    protocol: "https",
    hostname: "thumb.wikimedia.org",
    pathname: "/wikipedia/commons/**",
  },
];

const matches = (pattern: string, value: string): boolean => {
  const re = new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "\u0000")
      .replace(/\*/g, "[^./]+")
      .replace(/\u0000/g, ".*")}$`,
  );
  return re.test(value);
};

/** Whether `<Image>` would accept this address — next/image's own rule, restated. */
export function isAllowedImage(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return imageHosts.some(
    (h) =>
      h.protocol === parsed.protocol.replace(":", "") &&
      matches(h.hostname, parsed.hostname) &&
      (h.pathname === undefined || matches(h.pathname, parsed.pathname)),
  );
}
