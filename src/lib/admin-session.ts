import { createHmac, timingSafeEqual } from "node:crypto";

// The operator panel's login: one username and password from the environment,
// and a signed cookie once they are given. No account row, no Google. The
// functions here take their config as an argument so they can be tested; the
// panel reads it from `env` (src/app/admin/config.ts).

export type AdminConfig = {
  username: string;
  password: string;
  /** Signs the cookie. Mixed with the password, so changing the password signs everyone out. */
  secret: string;
};

export const ADMIN_COOKIE = "admin_session";
export const ADMIN_SESSION_SECONDS = 12 * 60 * 60;

const digest = (key: string, message: string): Buffer =>
  createHmac("sha256", key).update(message).digest();

/** Equal without leaking, through timing, how much of a guess was right. */
function same(a: string, b: string): boolean {
  const key = "admin-compare";
  return timingSafeEqual(digest(key, a), digest(key, b));
}

export function checkCredentials(
  config: AdminConfig,
  username: string,
  password: string,
): boolean {
  // Both are compared even when the first is wrong, so a wrong username takes as long as a wrong password.
  const user = same(username, config.username);
  const pass = same(password, config.password);
  return user && pass;
}

const signingKey = (c: AdminConfig): Buffer =>
  digest(c.secret, `admin|${c.username}|${c.password}`);

const sign = (c: AdminConfig, expires: number): string =>
  createHmac("sha256", signingKey(c))
    .update(String(expires))
    .digest("base64url");

/** `<expiry seconds>.<signature>`. */
export function issueToken(config: AdminConfig, now: Date): string {
  const expires = Math.floor(+now / 1000) + ADMIN_SESSION_SECONDS;
  return `${expires}.${sign(config, expires)}`;
}

export function verifyToken(
  config: AdminConfig,
  token: string | undefined,
  now: Date,
): boolean {
  if (!token) return false;
  const [expiry, signature, ...rest] = token.split(".");
  if (!expiry || !signature || rest.length > 0 || !/^\d+$/.test(expiry)) {
    return false;
  }
  const expires = Number(expiry);
  if (expires * 1000 < +now) return false;
  return same(signature, sign(config, expires));
}

/** Where to go after signing in: somewhere in the panel, never off-site. */
const PANEL_PATH = /^\/admin(\/[A-Za-z0-9_~-][A-Za-z0-9._~-]*)*$/;

export function safeNext(next: string | null | undefined): string {
  return typeof next === "string" && PANEL_PATH.test(next) ? next : "/admin";
}
