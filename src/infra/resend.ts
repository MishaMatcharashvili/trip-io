import { Resend } from "resend";
import type { Delivery, Mailer, Message } from "../domain/watch/briefing.ts";

// Email delivery. One provider, one call, and a deliberate refusal to throw.
//
// The briefing is written and stored before this runs, so a Resend outage costs
// the traveller their email and not their morning: the in-app briefing is
// already there, and `briefing.email_error` records why the other copy never
// arrived. That is why the port returns a result rather than raising — a thrown
// error here would have to be caught by every caller to mean the same thing.

/**
 * Both are required to send, and neither is required to build. An unset key
 * means email is switched off, which is the correct state until Phase 4's
 * domain is verified — not a crash at import time.
 */
const FROM_ENV = "BRIEFING_FROM";
const KEY_ENV = "RESEND_API_KEY";

let client: Resend | undefined;

export const emailConfigured = (): boolean =>
  Boolean(process.env[KEY_ENV] && process.env[FROM_ENV]);

export const sendWithResend: Mailer = async (
  message: Message,
): Promise<Delivery> => {
  const key = process.env[KEY_ENV];
  const from = process.env[FROM_ENV];
  if (!key || !from) {
    return { sent: false, error: `${KEY_ENV} or ${FROM_ENV} is not set` };
  }

  client ??= new Resend(key);

  try {
    const { data, error } = await client.emails.send({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      // Our own pixel already measures opens (briefing.opened_at), and the
      // click rewrite would break the "see the change" link's origin, which the
      // in-app view authenticates against.
      headers: { "X-Entity-Ref-ID": crypto.randomUUID() },
    });

    if (error) return { sent: false, error: `${error.name}: ${error.message}` };
    if (!data?.id) return { sent: false, error: "resend returned no id" };
    return { sent: true, id: data.id };
  } catch (error) {
    return { sent: false, error: (error as Error).message };
  }
};
