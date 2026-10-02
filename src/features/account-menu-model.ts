import type { IconName } from "../ui/icon.tsx";

// What the account menu holds, decided apart from how it looks. The menu is
// the one place the things that are not a trip's own screens live: the AI's
// record of what it told you, the watch's settings, the account itself. Inside
// a trip it carries that trip's; outside one it carries only the account's.

export type MenuLink = {
  label: string;
  /** One line under the label: what is behind it. */
  hint?: string;
  href: string;
  icon: IconName;
};

export type Who =
  | { kind: "unknown" }
  | { kind: "signed-out" }
  | { kind: "guest" }
  | { kind: "member"; name: string; email: string };

export function menuLinks(tripId: string | undefined, who: Who): MenuLink[] {
  const links: MenuLink[] = [];

  if (tripId && who.kind !== "signed-out") {
    links.push(
      {
        label: "Everything I’ve told you",
        hint: "What the watch said, and what you did about it",
        href: `/trips/${tripId}/alerts`,
        icon: "sparkle",
      },
      {
        label: "Watch settings",
        hint: "Channels, quiet hours and sources",
        href: `/trips/${tripId}/watch`,
        icon: "signal",
      },
    );
  }

  if (who.kind === "signed-out") {
    links.push(
      { label: "Sign in", href: "/sign-in", icon: "user" },
      { label: "Create an account", href: "/sign-up", icon: "userPlus" },
    );
  } else {
    links.push({ label: "Account", href: "/account", icon: "user" });
    if (who.kind === "guest") {
      links.push({
        label: "Create an account",
        hint: "Keep the trip you are planning",
        href: "/sign-up?next=/account",
        icon: "userPlus",
      });
    }
  }
  links.push({
    label: "Plans",
    hint: "What watching costs",
    href: "/plans",
    icon: "bookmark",
  });
  return links;
}

/** The line at the head of the menu. */
export function whoLine(who: Who): { title: string; detail: string } | null {
  switch (who.kind) {
    case "member":
      return { title: who.name, detail: who.email };
    case "guest":
      return { title: "Guest", detail: "Planning without an account" };
    default:
      return null;
  }
}
