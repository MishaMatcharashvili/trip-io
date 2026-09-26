import { placeExists } from "../dal/places.ts";
import {
  type SavedPlaceRow,
  savedIds,
  savedPlacesOf,
  savePlace,
  unsavePlace,
} from "../dal/saved.ts";

export type { SavedPlaceRow };

/** Keep a place. False when there is no such place. */
export async function keepPlace(
  userId: string,
  placeId: string,
): Promise<boolean> {
  if (!(await placeExists(placeId))) return false;
  await savePlace(userId, placeId);
  return true;
}

export function forgetPlace(userId: string, placeId: string): Promise<void> {
  return unsavePlace(userId, placeId);
}

export function savedPlaceIds(userId: string): Promise<string[]> {
  return savedIds(userId);
}

export function savedPlaces(userId: string): Promise<SavedPlaceRow[]> {
  return savedPlacesOf(userId);
}
