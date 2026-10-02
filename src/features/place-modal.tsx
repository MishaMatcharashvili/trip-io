"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon } from "@/ui/icon";

// A stop as a popup over the screen it was opened from. A native <dialog>, so
// the page behind is inert and focus stays inside, Escape closes it, and the
// browser draws the backdrop. It is a dialog on a wide screen and a sheet
// rising from the bottom on a phone.
//
// Closing is going back. The popup is a route (@modal, an intercepting route),
// so the address was /place/… while it was open: back returns to the screen it
// covered, with that screen as it was left, and forward reopens it.
//
// It is the layout of the intercepted route, so the frame is drawn once and
// stays while the stop inside it loads and then arrives.

export function PlaceModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    // The page behind does not scroll under the popup.
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = before;
    };
  }, []);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard's way out is Escape, which <dialog> handles natively; the click is only the backdrop
    <dialog
      ref={dialog}
      aria-label="Stop"
      // The browser's `close` is every way out: Escape, the button, a tap on the
      // backdrop. Going back is all any of them mean.
      onClose={() => router.back()}
      onClick={(event) => {
        // The dialog has no padding, so a click on the dialog itself is the backdrop.
        if (event.target === dialog.current) dialog.current?.close();
      }}
      className="m-0 mt-auto flex max-h-[88dvh] w-full max-w-none flex-col overflow-hidden rounded-t-sheet border border-hairline bg-surface p-0 text-ink shadow-sheet backdrop:bg-ink/30 lg:m-auto lg:w-[560px] lg:rounded-sheet"
    >
      <div className="relative flex h-10 shrink-0 items-center justify-center">
        <span
          aria-hidden="true"
          className="h-1 w-9 rounded-full bg-control lg:hidden"
        />
        <button
          type="button"
          aria-label="Close"
          onClick={() => dialog.current?.close()}
          className="absolute right-3 top-2 flex size-8 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-canvas hover:text-ink"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {children}
      </div>
    </dialog>
  );
}
