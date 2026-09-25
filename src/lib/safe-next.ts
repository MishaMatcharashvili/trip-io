// A stand-in origin to resolve against. Its only job is to be ours: whatever
// `next` resolves to must still be on it.
const SELF = "http://self.invalid";

/**
 * Only same-site paths, so `?next=` can't bounce someone to another origin.
 *
 * Resolved the way the browser will resolve it, rather than checked by prefix.
 * A prefix check is what `/\evil.com` gets past: the URL parser reads a
 * backslash as a slash, so it lands on `//evil.com`, and it strips tabs and
 * newlines, so `/\t/evil.com` does too.
 */
export function safeNext(next: string | undefined): string {
  if (!next?.startsWith("/")) return "/";
  try {
    const url = new URL(next, SELF);
    if (url.origin !== SELF) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
