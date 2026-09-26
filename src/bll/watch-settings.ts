import { withTransaction } from "../dal/tx.ts";
import {
  loadWatch,
  lockWatch,
  saveWatchSettings,
  type Watch,
} from "../dal/watches.ts";
import { isMute } from "../domain/watch/interrupt.ts";
import type { QuietHours } from "../domain/watch/route.ts";
import type { Channel } from "../domain/watch/settings.ts";

// A trip's watch, as the traveller sets it: which channels may reach them and
// when they may not be woken. The settings screen (Phase 6) and the native
// shell (Phase 7) both write through here; so does nothing else, because the
// one thing this does besides saving is notice a mute.

export type WatchSettingsPatch = {
  channels?: readonly Channel[];
  quietHours?: QuietHours | null;
  mutedSources?: readonly string[];
  verbosity?: "affecting" | "nearby";
};

export type { Watch };

/** A trip's watch as the settings screen shows it, or null before it has stops. */
export function watchSettings(tripId: string): Promise<Watch | null> {
  return loadWatch(tripId);
}

/**
 * The traveller's own channels and quiet hours. Push switched off while the
 * watch is awake is a mute, stamped once (src/dal/watches.ts) — the settings
 * half of the kill criterion the card's mute button is the other half of.
 */
export async function updateWatchSettings(
  tripId: string,
  patch: WatchSettingsPatch,
  now: Date = new Date(),
): Promise<boolean> {
  return withTransaction(async (tx) => {
    const watch = await lockWatch(tx, tripId);
    if (!watch) return false;
    const channels = patch.channels ?? watch.channels;
    await saveWatchSettings(tx, tripId, {
      channels,
      quietHours:
        patch.quietHours === undefined ? watch.quietHours : patch.quietHours,
      muted: isMute({ before: watch.channels, after: channels, now, ...watch }),
      mutedSources: patch.mutedSources ?? watch.mutedSources,
      verbosity: patch.verbosity ?? watch.verbosity,
    });
    return true;
  });
}
