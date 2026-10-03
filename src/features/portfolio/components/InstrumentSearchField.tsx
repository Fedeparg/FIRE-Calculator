"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { MIN_INSTRUMENT_QUERY_LENGTH } from "@sextante/core/contracts";
import type { InstrumentSearchResult, InstrumentType } from "@sextante/core/portfolio/types";
import { isAbortError } from "@/shared/api/client";
import { searchInstruments } from "@/features/portfolio/api";

/** Delay after the last keystroke before searching: avoids one request per character. */
const DEBOUNCE_MS = 300;

type Props = {
  /** Current symbol value (free text from the input; sent as-is on save). */
  value: string;
  /** Free text editing (lets the user type an ISIN or symbol and submit it without picking). */
  onChange: (value: string) => void;
  /** The user picked an instrument from the dropdown (exact symbol + name). */
  onSelect: (result: InstrumentSearchResult) => void;
  id: string;
  placeholder: string;
  inputClass: string;
  maxLength?: number;
};

/** Short label per type, for the result badge (the semantic icon is separate). */
const TYPE_ICON: Record<InstrumentType, string> = {
  crypto: "₿",
  equity: "📈",
  etf: "📊",
  fund: "🏦",
  index: "Σ",
  currency: "$",
  other: "•",
};

/**
 * Symbol field with autocomplete against `GET /api/instruments/search`. It removes the ambiguity
 * of a bare ticker at the root: the user types ("bitcoin", "apple") and picks the specific
 * instrument, so we store the source's EXACT symbol ("BTC-USD") instead of guessing. Free input
 * is preserved: if nothing is picked, the typed text is sent (useful for an ISIN, which the
 * backend resolves via OpenFIGI).
 *
 * Accessible combobox: `role="combobox"` + `listbox`, navigation with arrows/Enter/Escape.
 */
export default function InstrumentSearchField({
  value,
  onChange,
  onSelect,
  id,
  placeholder,
  inputClass,
  maxLength,
}: Props) {
  const t = useTranslations("portfolio.form.search");
  const [results, setResults] = useState<InstrumentSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();

  // Symbol just picked: avoids relaunching the search (and reopening the dropdown) right
  // after selecting, when `value` becomes exactly that symbol.
  const justSelected = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = value.trim();
    if (justSelected.current === query || query.length < MIN_INSTRUMENT_QUERY_LENGTH) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const found = await searchInstruments(query, controller.signal);
        if (controller.signal.aborted) return;
        setResults(found);
        setActiveIndex(-1);
        setOpen(true);
      } catch (error) {
        // A new keystroke cancels this request: the next effect already handles `loading`, and
        // touching it here would turn it off while the new search waits for its debounce.
        if (isAbortError(error)) return;
        // Network or API failure: degrades to "no results".
        setResults([]);
        setOpen(false);
      }
      setLoading(false);
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [value]);

  function pick(result: InstrumentSearchResult) {
    justSelected.current = result.symbol;
    onSelect(result);
    setOpen(false);
    setResults([]);
    setActiveIndex(-1);
  }

  function handleChange(next: string) {
    justSelected.current = null;
    onChange(next);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // With the dropdown open, Escape only closes it: it must not reach the panel that holds the
    // form (it would close the whole panel and lose what was typed).
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (!open || results.length === 0) {
      if (event.key === "ArrowDown" && results.length > 0) setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      // If the list got shorter, the active index may be out of range: nothing is picked.
      const result = results[activeIndex];
      if (result) pick(result);
    }
  }

  // Closes when focus leaves the container (click elsewhere, Tab out).
  function handleBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (!containerRef.current?.contains(event.relatedTarget as Node)) {
      setOpen(false);
    }
  }

  const showDropdown = open && (loading || results.length > 0);

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <input
        id={id}
        type="text"
        required
        autoComplete="off"
        maxLength={maxLength}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={inputClass}
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
      />

      {showDropdown && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-surface shadow-lg"
        >
          {loading && results.length === 0 ? (
            // Status row, not selectable: a listbox only accepts options as children.
            <li role="option" aria-disabled="true" aria-selected={false} className="px-3 py-2 text-sm text-muted">
              {t("searching")}
            </li>
          ) : (
            results.map((r, i) => (
              // The option IS the `li`: a `button` inside a `role="option"` would nest one interactive
              // control in another and the screen reader would announce two things. The keyboard does
              // not get here (the combobox handles it with `aria-activedescendant`); the mouse does.
              <li
                key={`${r.symbol}-${i}`}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                // `onMouseDown` (not `onClick`): it fires before the input's blur, so
                // the selection is not lost when the dropdown closes.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(r);
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition ${
                  i === activeIndex ? "bg-surface-2" : "hover:bg-surface-2"
                }`}
              >
                <span aria-hidden className="w-5 shrink-0 text-center text-muted">
                  {TYPE_ICON[r.type]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{r.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {r.symbol}
                    {r.exchange ? ` · ${r.exchange}` : ""} · {t(`type.${r.type}`)}
                  </span>
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
