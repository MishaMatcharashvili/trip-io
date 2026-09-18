import { Panel } from "@/ui/card";
import { BasemapCalm } from "@/ui/map/basemap-calm";
import { Display, Eyebrow, Prose } from "@/ui/text";
import { ThemeToggle } from "@/ui/theme";
import { Brand } from "./chrome";

/**
 * The frame every auth screen shares. Same washed-out map as trip creation —
 * you are about to go somewhere — with one card in the middle and nothing to
 * navigate away to except the logo.
 */
export function AuthShell({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-80">
        <BasemapCalm className="absolute inset-0 size-full" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-canvas/70 to-canvas/95" />

      <header className="relative z-10 flex h-[58px] shrink-0 items-center gap-3 px-4 lg:px-6">
        <Brand />
        <div className="flex-1" />
        <ThemeToggle />
      </header>

      <main className="relative z-10 flex flex-1 items-start justify-center px-4 pb-12 pt-6 lg:items-center lg:pt-0">
        <Panel className="w-full max-w-[420px] p-6 lg:p-7">
          <div className="flex flex-col gap-1.5 pb-6">
            <Eyebrow tone="agent">{eyebrow}</Eyebrow>
            <Display className="text-[26px]">{title}</Display>
            <Prose>{lead}</Prose>
          </div>
          {children}
        </Panel>
      </main>
    </div>
  );
}
