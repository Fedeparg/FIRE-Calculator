"use client";

import { useEffect, useId, useRef, useState, type FocusEvent, type PointerEvent } from "react";
import { useTranslations } from "next-intl";

/**
 * Reusable "?" button with an explanatory popover.
 *
 * Accessibility decisions:
 * - The button's accessible name is short and translated ("More information"). Using the full
 *   text as the `aria-label` forced users to hear the whole paragraph just to learn what the
 *   control is.
 * - The long text is exposed as a DESCRIPTION via `aria-describedby`, which is how a screen
 *   reader announces contextual help.
 * - The content is ALWAYS in the DOM (hidden with `sr-only` when closed) so `aria-describedby`
 *   always resolves to an existing node: a reference to an unmounted node is ignored and the
 *   description is lost.
 * - It also opens on click/tap: there is no hover on mobile, so the text used to be simply
 *   unreachable.
 * - It closes on `Escape`, on blur and on an outside click.
 */
export default function HelpTooltip({ text }: { text: string }) {
  const t = useTranslations("common");
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    // An outside click closes it: on touch devices the button's `blur` is unreliable.
    function handlePointerDown(event: globalThis.PointerEvent) {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  // Only a mouse pointer opens on hover: on touch the browser emulates
  // `pointerenter` right before the click, and the click's toggle would close it.
  function handlePointerEnter(event: PointerEvent<HTMLSpanElement>) {
    if (event.pointerType === "mouse") setOpen(true);
  }
  function handlePointerLeave(event: PointerEvent<HTMLSpanElement>) {
    if (event.pointerType === "mouse") setOpen(false);
  }

  // Only keyboard focus opens it. With mouse or touch, focus arrives together with
  // the click, which already controls opening.
  function handleFocus(event: FocusEvent<HTMLButtonElement>) {
    if (event.target.matches(":focus-visible")) setOpen(true);
  }

  return (
    <span
      ref={containerRef}
      className="relative inline-flex"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <button
        type="button"
        aria-label={t("moreInfo")}
        aria-describedby={tooltipId}
        onClick={() => setOpen((prev) => !prev)}
        onFocus={handleFocus}
        onBlur={() => setOpen(false)}
        className="relative grid h-4 w-4 cursor-pointer place-items-center rounded-full after:absolute after:-inset-2 after:content-[''] border border-border text-[10px] font-bold leading-none text-muted transition-colors hover:border-brand hover:text-brand focus-visible:border-brand focus-visible:text-brand focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/30"
      >
        ?
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={
          open
            ? "absolute left-1/2 top-6 z-20 w-56 -translate-x-1/2 rounded-lg border border-border bg-surface p-2.5 text-xs font-normal leading-relaxed text-foreground shadow-lg"
            : "sr-only"
        }
      >
        {text}
      </span>
    </span>
  );
}
