"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "./actions";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/trips", label: "Customers & trips" },
  { href: "/admin/news", label: "News feed" },
  { href: "/admin/events", label: "Region updates" },
  { href: "/admin/regions", label: "Regions" },
  { href: "/admin/sources", label: "Sources" },
] as const;

export function AdminNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Admin"
      className="flex flex-wrap gap-1 border-b border-zinc-200 pb-3 dark:border-zinc-800"
    >
      {TABS.map((t) => {
        const here =
          t.href === "/admin" ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={here ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-sm ${here ? "bg-foreground text-background" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"}`}
          >
            {t.label}
          </Link>
        );
      })}
      <form action={logout} className="ml-auto">
        <button
          type="submit"
          className="rounded-full px-3 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
        >
          Sign out
        </button>
      </form>
    </nav>
  );
}
