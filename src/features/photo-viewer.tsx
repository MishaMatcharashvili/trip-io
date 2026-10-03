"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import type { Photo } from "@/domain/catalogue/enrichment";
import { Icon } from "@/ui/icon";
import { creditHref, stepIndex } from "./place-voices-model";

// A place's photographs, one at a time, filling the screen. Mounted only while
// open: the native <dialog> gives the top layer (so no panel's overflow or
// stacking can clip it), the focus trap, Esc to close and focus back on the
// photograph that opened it. What is added is the paging.
//
// The picture is the optimiser's, sized to the viewport rather than the
// original, and the next one is fetched while this one is looked at.

/** How far a finger must travel sideways to turn the page. */
const SWIPE_PX = 50;

export function PhotoViewer({
  photos,
  index,
  name,
  onIndex,
  onClose,
}: {
  photos: Photo[];
  index: number;
  name: string;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const touchX = useRef<number | null>(null);
  const many = photos.length > 1;
  const photo = photos[index];
  const next = photos[stepIndex(index, 1, photos.length)];

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    el.showModal();
    // Nothing behind a full-screen photograph should scroll under a finger.
    const scroll = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = scroll;
      el.close();
    };
  }, []);

  if (!photo) return null;
  const go = (delta: number) => onIndex(stepIndex(index, delta, photos.length));

  return (
    <dialog
      ref={dialog}
      aria-label={`Photos of ${name}`}
      onClose={onClose}
      onKeyDown={(e) => {
        if (!many) return;
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const from = touchX.current;
        const to = e.changedTouches[0]?.clientX;
        touchX.current = null;
        if (!many || from === null || to === undefined) return;
        if (Math.abs(to - from) >= SWIPE_PX) go(to < from ? 1 : -1);
      }}
      className="m-0 h-dvh max-h-none w-dvw max-w-none bg-black p-0 text-white backdrop:bg-black"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex-1 text-small text-white/70" aria-live="polite">
            {many ? `${index + 1} of ${photos.length}` : null}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/20"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Empty space around the photograph closes it, as the backdrop would. */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: a convenience; the Close button and Esc do the same for the keyboard */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: as above */}
        <div
          className="relative min-h-0 flex-1"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <Image
            key={photo.id}
            src={photo.url}
            alt={photo.caption ?? `A photo of ${name}`}
            unoptimized={photo.unoptimized}
            fill
            sizes="100vw"
            className="pointer-events-none object-contain"
          />
          {many ? (
            <>
              <Step side="left" label="Previous photo" onClick={() => go(-1)} />
              <Step side="right" label="Next photo" onClick={() => go(1)} />
            </>
          ) : null}
        </div>

        <div className="flex min-h-14 flex-col gap-0.5 px-4 py-3 text-small">
          {photo.caption ? (
            <p className="text-white/90">{photo.caption}</p>
          ) : null}
          {photo.credit ? (
            <a
              href={creditHref(photo.credit, name)}
              target="_blank"
              rel="noreferrer noopener"
              className="self-start text-mini text-white/60 hover:text-white"
            >
              {photo.credit.text}
            </a>
          ) : null}
        </div>
      </div>

      {many && next && next.id !== photo.id ? (
        // The next one, fetched ahead so paging is not a wait.
        <Image
          src={next.url}
          alt=""
          unoptimized={next.unoptimized}
          fill
          sizes="100vw"
          loading="eager"
          className="pointer-events-none invisible"
        />
      ) : null}
    </dialog>
  );
}

function Step({
  side,
  label,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 hover:bg-white/20 ${
        side === "left" ? "left-3" : "right-3"
      }`}
    >
      <Icon name={side === "left" ? "chevronLeft" : "chevronRight"} size={20} />
    </button>
  );
}
