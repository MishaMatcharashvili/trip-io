import {
  type Platform,
  registerDevice as register,
  unregisterDevice as unregister,
} from "../dal/devices.ts";

// Where an interrupt can reach a traveller. The native shell registers its push
// token at sign-in and on every launch (a re-registration is the app saying it
// is still installed), and signs it out on sign-out.

export type { Platform };

export function registerDevice(
  userId: string,
  token: string,
  platform: Platform,
): Promise<void> {
  return register(userId, token, platform);
}

/** False when the token was not this user's, or was already signed out. */
export function unregisterDevice(
  userId: string,
  token: string,
): Promise<boolean> {
  return unregister(userId, token);
}
