"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_SECONDS,
  checkCredentials,
  issueToken,
  safeNext,
} from "@/lib/admin-session";
import { adminConfig } from "./config";

/** `username` is handed back so a wrong guess does not empty the field. */
export type LoginState = { error: string; username?: string } | undefined;

/** A wrong guess costs a second, which is all the brute-force defence a form without a store gets. */
const WRONG_GUESS_MS = 1_000;

export async function login(
  _previous: LoginState,
  form: FormData,
): Promise<LoginState> {
  const config = adminConfig();
  if (!config) return { error: "The admin login is not configured." };

  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  if (!checkCredentials(config, username, password)) {
    await new Promise((r) => setTimeout(r, WRONG_GUESS_MS));
    return { error: "Wrong username or password.", username };
  }

  (await cookies()).set(ADMIN_COOKIE, issueToken(config, new Date()), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: ADMIN_SESSION_SECONDS,
  });
  redirect(safeNext(String(form.get("next") ?? "")));
}

export async function logout() {
  (await cookies()).delete({ name: ADMIN_COOKIE, path: "/admin" });
  redirect("/admin");
}
