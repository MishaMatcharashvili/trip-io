import { authClient } from "./auth-client";

/**
 * An API call from someone who may not have a session yet. A visitor plans
 * anonymously (context/architecture.md): on a 401 they are given a guest
 * session and the call is made once more. What they plan is theirs when they
 * sign up.
 */
export async function withGuestSession<R extends { status: number }>(
  call: () => Promise<R>,
): Promise<R> {
  const res = await call();
  if (res.status !== 401) return res;
  const { error } = await authClient.signIn.anonymous();
  if (error) throw new Error("Couldn’t start a session to plan in.");
  return call();
}
