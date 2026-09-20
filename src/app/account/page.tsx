import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/features/chrome";
import { SignOutButton } from "@/features/sign-out-button";
import { getAuth } from "@/infra/auth.ts";
import { ButtonLink } from "@/ui/button";
import { Card, Divider, SectionRule } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { Icon } from "@/ui/icon";
import { BottomNav, homeTabs } from "@/ui/nav";
import { Display, Eyebrow, Prose } from "@/ui/text";
import { ThemeSegmented } from "@/ui/theme";

export const metadata: Metadata = { title: "Account" };

type SessionUser = {
  name: string;
  email: string;
  isAnonymous?: boolean | null;
};

/**
 * Reads the session, telling "signed out" apart from "the account service is
 * down" — the second must not bounce you to a sign-in page that would fail too.
 */
async function loadUser(): Promise<{
  user: SessionUser | null;
  unavailable: boolean;
}> {
  try {
    const session = await getAuth().api.getSession({
      headers: await headers(),
    });
    return { user: session?.user ?? null, unavailable: false };
  } catch {
    return { user: null, unavailable: true };
  }
}

export default async function AccountPage() {
  const { user, unavailable } = await loadUser();
  if (!user && !unavailable) redirect("/sign-in?next=/account");

  const guest = Boolean(user?.isAnonymous);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar watch="none" />

      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-5 px-4 pb-28 pt-6 lg:pb-12 lg:pt-10">
        <Display className="text-[26px]">Account</Display>

        {unavailable ? (
          <Card accent="alert" tint className="flex items-start gap-3 p-4">
            <Icon name="warning" size={16} className="mt-0.5 text-alert" />
            <div className="flex-1">
              <div className="text-small font-semibold">
                Accounts are unavailable right now
              </div>
              <Prose>
                I couldn&rsquo;t reach the account service. Your trips
                aren&rsquo;t affected.
              </Prose>
            </div>
          </Card>
        ) : null}

        {user ? (
          <section className="flex flex-col gap-2.5">
            <SectionRule>You</SectionRule>
            <Card className="overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3.5">
                <span className="flex size-10 items-center justify-center rounded-full border border-control bg-fill text-ink-muted">
                  <Icon name="user" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-small font-semibold">
                    {guest ? "Guest" : user.name}
                  </div>
                  <div className="truncate text-mini text-ink-faint">
                    {guest ? "Planning without an account" : user.email}
                  </div>
                </div>
                {guest ? <Chip size="sm">Guest</Chip> : <SignOutButton />}
              </div>
              {guest ? (
                <>
                  <Divider />
                  <div className="flex flex-col gap-3 px-4 py-3.5">
                    <Prose>
                      Create an account to keep the trip you are planning and
                      let the watch layer follow it. Nothing you have planned is
                      lost.
                    </Prose>
                    <div className="flex gap-2">
                      <ButtonLink
                        href="/sign-up?next=/account"
                        variant="primary"
                        size="sm"
                      >
                        Create account
                      </ButtonLink>
                      <ButtonLink href="/sign-in?next=/account" size="sm">
                        Sign in
                      </ButtonLink>
                    </div>
                  </div>
                </>
              ) : null}
            </Card>
          </section>
        ) : null}

        <section className="flex flex-col gap-2.5">
          <SectionRule>Plan</SectionRule>
          <Card className="flex items-center gap-3 px-4 py-3.5">
            <div className="flex-1">
              <div className="text-small font-medium">Free</div>
              <div className="text-mini text-ink-faint">
                Planning is free. Watching is the upgrade.
              </div>
            </div>
            <ButtonLink href="/plans" size="sm">
              See plans
            </ButtonLink>
          </Card>
        </section>

        <section className="flex flex-col gap-2.5">
          <SectionRule>Appearance</SectionRule>
          <Card className="flex items-center gap-3 px-4 py-2.5">
            <span className="flex-1 text-small font-medium">Theme</span>
            <ThemeSegmented />
          </Card>
        </section>

        <div className="flex flex-col gap-1.5 pt-2">
          <Eyebrow>Watch settings</Eyebrow>
          <Link
            href="/trips/georgia/watch"
            className="text-small font-medium text-agent"
          >
            What I watch on your Georgia trip
          </Link>
        </div>
      </main>

      <BottomNav items={homeTabs} active="Profile" />
    </div>
  );
}
