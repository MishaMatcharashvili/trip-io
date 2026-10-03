"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Divider } from "@/ui/card";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icon";
import { ThemeSegmented } from "@/ui/theme";
import { menuLinks, type Who, whoLine } from "./account-menu-model";
import { SignOutButton } from "./sign-out-button";

// The account menu: a dropdown under the person glyph on a wide screen and a
// sheet above the tab bar on a phone. It is where everything that is not a
// trip's own screen lives — the AI's record, the watch's settings, the
// account — so the tab bar can be the trip's two views and nothing else.
//
// Who is signed in is asked of the session once, the first time the menu opens,
// not on every page: most visits never open it.

/** Where the tab bar ends: a phone's sheet rests just above it. */
const ABOVE_TAB_BAR = "bottom-[88px]";

/** The Account tab's icon and label: also what the tab bar shows before it loads. */
export function AccountTabFace({ open = false }: { open?: boolean }) {
  return (
    <>
      <Icon name="user" size={21} strokeWidth={1.7} />
      <span className={cx("text-[10.5px]", open && "font-semibold")}>
        Account
      </span>
    </>
  );
}

export function AccountMenu({
  tripId,
  variant = "avatar",
  size = 30,
  floating = false,
  className,
}: {
  /** Inside a trip, the menu carries that trip's pages. */
  tripId?: string;
  /** The person glyph, or a tab in the bottom bar. */
  variant?: "avatar" | "tab";
  size?: number;
  /** Over the map: surface fill and lift. */
  floating?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<Who>({ kind: "unknown" });
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Who is asking, once, when first wanted.
  const asked = useRef(false);
  useEffect(() => {
    if (!open || asked.current) return;
    asked.current = true;
    authClient
      .getSession()
      .then(({ data }) => {
        const user = data?.user;
        setWho(
          !user
            ? { kind: "signed-out" }
            : user.isAnonymous
              ? { kind: "guest" }
              : { kind: "member", name: user.name, email: user.email },
        );
      })
      // The menu still works without knowing: the links are all real pages.
      .catch(() => {
        asked.current = false;
      });
  }, [open]);

  // Out of it: a tap elsewhere, or Escape, which hands focus back.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const links = menuLinks(tripId, who);
  const head = whoLine(who);

  return (
    <div ref={root} className={cx("relative", className)}>
      {variant === "avatar" ? (
        <button
          ref={trigger}
          type="button"
          aria-label="Account and settings"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen((o) => !o)}
          style={{ width: size, height: size }}
          className={cx(
            "flex shrink-0 items-center justify-center rounded-full border border-control text-ink-muted transition-colors hover:text-ink",
            floating ? "bg-surface shadow-chip" : "bg-fill",
            open && "text-ink",
          )}
        >
          <Icon name="user" size={Math.round(size * 0.53)} strokeWidth={1.7} />
        </button>
      ) : (
        <button
          ref={trigger}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen((o) => !o)}
          className={cx(
            "flex h-full w-full flex-col items-center gap-1 pt-2.5",
            open ? "text-agent" : "text-ink-faint",
          )}
        >
          <AccountTabFace open={open} />
        </button>
      )}

      {open ? (
        <>
          {/* A phone's sheet dims what is behind it; a dropdown does not. */}
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-ink/20 lg:hidden"
          />
          <div
            id={menuId}
            role="menu"
            aria-label="Account and settings"
            className={cx(
              "z-50 overflow-hidden rounded-panel border border-hairline-strong bg-surface shadow-panel",
              `fixed inset-x-3 ${ABOVE_TAB_BAR}`,
              "lg:absolute lg:inset-x-auto lg:bottom-auto lg:right-0 lg:top-[calc(100%+8px)] lg:w-[300px]",
            )}
          >
            {head ? (
              <>
                <div className="flex flex-col px-3.5 py-3">
                  <span className="truncate text-small font-semibold">
                    {head.title}
                  </span>
                  <span className="truncate text-mini text-ink-faint">
                    {head.detail}
                  </span>
                </div>
                <Divider />
              </>
            ) : null}

            <div className="flex flex-col py-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 px-3.5 py-2.5 transition-colors hover:bg-canvas"
                >
                  <Icon
                    name={link.icon}
                    size={16}
                    className="mt-0.5 shrink-0 text-ink-muted"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-small font-medium">{link.label}</span>
                    {link.hint ? (
                      <span className="text-mini text-ink-faint">
                        {link.hint}
                      </span>
                    ) : null}
                  </span>
                </Link>
              ))}
            </div>

            <Divider />
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="flex-1 text-small text-ink-muted">Theme</span>
              <ThemeSegmented />
            </div>

            {who.kind === "member" || who.kind === "guest" ? (
              <>
                <Divider />
                <div className="flex px-3.5 py-2.5">
                  <SignOutButton />
                </div>
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
