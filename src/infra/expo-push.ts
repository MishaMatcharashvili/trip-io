import type {
  Pusher,
  PushMessage,
  PushTicket,
} from "../domain/watch/interrupt.ts";

// Push delivery through Expo's push service, which fronts APNs and FCM for the
// native shell (context/architecture.md: expo-notifications + EAS). The APNs
// key and FCM credentials are uploaded to EAS, not held here, so this adapter
// needs no secret to work — `EXPO_ACCESS_TOKEN` is only the optional hardening
// that makes the project refuse pushes not signed with it.
//
// Plain `fetch` rather than `expo-server-sdk`: one endpoint, one request shape,
// and one fewer dependency to keep current.

const ENDPOINT = "https://exp.host/--/api/v2/push/send";

/** Expo accepts at most this many messages per request. */
const BATCH = 100;

/** What an Expo push token looks like; anything else is refused at registration. */
export const EXPO_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/;

type ExpoTicket =
  | { status: "ok"; id: string }
  | {
      status: "error";
      message: string;
      details?: { error?: string };
    };

export const pushWithExpo: Pusher = async (
  message: PushMessage,
  tokens: readonly string[],
): Promise<PushTicket[]> => {
  const tickets: PushTicket[] = [];

  for (let i = 0; i < tokens.length; i += BATCH) {
    const batch = tokens.slice(i, i + BATCH);
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(process.env.EXPO_ACCESS_TOKEN
          ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(
        batch.map((to) => ({
          to,
          title: message.title,
          body: message.body,
          // Opened on tap by the native shell: the intervention card.
          data: { url: message.url, interventionId: message.interventionId },
          sound: "default",
          // An interrupt passed a two-hour test to get here; a push that
          // arrives after the moment has gone is a briefing item that cost a
          // slot. High priority is what stops Android batching it.
          priority: "high",
        })),
      ),
    });

    // The service itself failed. Thrown, because the job's backoff is the
    // right answer to a 5xx and the per-token results below are not.
    if (!response.ok) {
      throw new Error(
        `expo push returned ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    }

    const { data } = (await response.json()) as { data: ExpoTicket[] };
    batch.forEach((token, j) => {
      const ticket = data?.[j];
      if (ticket?.status === "ok") {
        tickets.push({ token, ok: true });
        return;
      }
      const code = ticket?.details?.error ?? "no ticket";
      tickets.push({
        token,
        ok: false,
        error: ticket ? `${code}: ${ticket.message}` : code,
        // The only error that says the token will never work again. Anything
        // else (rate limits, a message too big) is about this push, not the
        // phone.
        dead: code === "DeviceNotRegistered",
      });
    });
  }

  return tickets;
};
