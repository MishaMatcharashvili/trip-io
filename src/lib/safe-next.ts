/** Only same-site paths, so `?next=` can't bounce someone to another origin. */
export function safeNext(next: string | undefined) {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/";
}
