"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { useMediaQuery } from "@/shared/ui/use-media-query";

/** From `lg` (64rem) up the panel is a side panel; below that, a modal sheet. */
const DESKTOP_QUERY = "(min-width: 64rem)";

type Props = {
  /** Panel id (referenced by the rows via `aria-controls`). */
  id: string;
  /** Id of the content title, which names the panel. */
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Container for a position's detail, create and edit views. It is the SAME component in two
 * presentations, chosen purely with CSS:
 *
 * - Desktop (`lg`): a sticky side panel next to the list, to see the row and its detail at the
 *   same time.
 * - Mobile: a sheet that slides up from the bottom over a dimmed backdrop; tapping the backdrop
 *   closes it.
 *
 * On open it receives focus (so keyboard and screen reader reach it without walking the list),
 * Escape closes it, and on close it returns focus to where it was (the row or the button that
 * opened it). It is not `aria-modal`: on desktop the list stays usable beside it, and marking it
 * modal would hide that list from screen readers. On mobile, however, the sheet covers the page:
 * everything else is marked `inert` (no focus, screen reader or clicks can reach behind it) and
 * background scrolling is locked while it is open.
 */
export default function PositionPanel({ id, labelledBy, onClose, children }: Props) {
  const t = useTranslations("portfolio.panel");
  const panelRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  const isSheet = !useMediaQuery(DESKTOP_QUERY);

  // Only on mount and unmount: remembers who had focus, moves it to the panel and returns it on
  // close. It is separate from the Escape effect so it does not rerun when `onClose` changes. On
  // close, React cleans up effects in declaration order, so this one runs BEFORE the sheet effect
  // removes `inert` from the rest of the page, and the browser does not allow focusing something
  // inert (focus would land on `body`). That is why it is returned in a microtask: by then every
  // unmount cleanup has already run.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => {
      queueMicrotask(() => {
        if (previous?.isConnected) previous.focus();
      });
    };
  }, []);

  // Modal sheet on mobile: `inert` on everything except the panel (walking up its ancestors to
  // `body`, so the chain that contains it is left alone) and no scrolling behind. The dimmed
  // backdrop is excluded because tapping it closes the sheet.
  useEffect(() => {
    const panel = panelRef.current;
    if (!isSheet || !panel) return;
    const inerted: Element[] = [];
    for (let node: HTMLElement = panel; node !== document.body && node.parentElement; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling !== node && sibling !== scrimRef.current && !sibling.hasAttribute("inert")) {
          // Attribute rather than the `inert` property: it is the same to the browser, and the React
          // compiler does not allow assigning properties to values that come from a ref.
          sibling.setAttribute("inert", "");
          inerted.push(sibling);
        }
      }
    }
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      for (const element of inerted) element.removeAttribute("inert");
      document.body.style.overflow = overflow;
    };
  }, [isSheet]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // `defaultPrevented`: an inner control (the search dropdown) already consumed the Escape.
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      {/* Sheet backdrop on mobile. It is a button (not a div with onClick) so it is a real
          action; out of the tab order and hidden from screen readers because the close
          button already covers keyboard and accessibility: here it would be a duplicate control. */}
      <button
        ref={scrimRef}
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-30 bg-foreground/40 lg:hidden"
      />
      <section
        ref={panelRef}
        id={id}
        role="dialog"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="@container fixed inset-x-0 bottom-0 z-40 flex max-h-[88vh] flex-col overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 pt-3 shadow-xl outline-hidden lg:sticky lg:inset-auto lg:top-6 lg:z-auto lg:max-h-[calc(100vh-3rem)] lg:rounded-2xl lg:p-6 lg:shadow-md"
      >
        <span aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-border lg:hidden" />
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-xl border border-border text-muted transition hover:bg-surface-2 hover:text-foreground lg:h-9 lg:w-9"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        {children}
      </section>
    </>
  );
}
