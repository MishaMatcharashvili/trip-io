/**
 * A version 4 UUID. It names a build request so that asking twice builds once;
 * it guards nothing, so `Math.random` is enough and no native module is needed.
 */
export function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
