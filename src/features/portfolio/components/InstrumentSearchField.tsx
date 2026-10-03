"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { MIN_INSTRUMENT_QUERY_LENGTH } from "@sextante/core/contracts";
import type { InstrumentSearchResult, InstrumentType } from "@sextante/core/portfolio/types";
import { isAbortError } from "@/shared/api/client";
import { searchInstruments } from "@/features/portfolio/api";

/** Espera tras la última tecla antes de buscar: evita una petición por carácter. */
const DEBOUNCE_MS = 300;

type Props = {
  /** Valor actual del símbolo (texto libre del input; se envía tal cual al guardar). */
  value: string;
  /** Edición libre del texto (permite teclear un ISIN o símbolo y enviarlo sin elegir). */
  onChange: (value: string) => void;
  /** El usuario eligió un instrumento del desplegable (símbolo exacto + nombre). */
  onSelect: (result: InstrumentSearchResult) => void;
  id: string;
  placeholder: string;
  inputClass: string;
  maxLength?: number;
};

/** Etiqueta corta por tipo, para el badge del resultado (icono semántico aparte). */
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
 * Campo de símbolo con autocompletado contra `GET /api/instruments/search`. Resuelve de raíz
 * la ambigüedad del ticker suelto: el usuario teclea ("bitcoin", "apple") y elige el
 * instrumento concreto, con lo que guardamos el símbolo EXACTO de la fuente ("BTC-USD") en
 * vez de adivinar. Conserva la entrada libre: si no elige nada, se envía lo tecleado (útil
 * para un ISIN, que el backend resuelve vía OpenFIGI).
 *
 * Combobox accesible: `role="combobox"` + `listbox`, navegación con flechas/Enter/Escape.
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

  // Símbolo recién elegido: evita relanzar la búsqueda (y reabrir el desplegable) justo
  // después de seleccionar, cuando el `value` pasa a ser exactamente ese símbolo.
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
        // Una tecla nueva cancela esta petición: el efecto siguiente ya gestiona `loading`, y
        // tocarlo aquí lo apagaría mientras la nueva búsqueda espera su debounce.
        if (isAbortError(error)) return;
        // Fallo de red o de la API: se degrada a "sin resultados".
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
    // Con el desplegable abierto, Escape solo lo cierra: no debe llegar al panel que contiene el
    // formulario (cerraría el panel entero y se perdería lo escrito).
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
      pick(results[activeIndex]);
    }
  }

  // Cierra al perder el foco fuera del contenedor (clic en otro sitio, Tab fuera).
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
            <li className="px-3 py-2 text-sm text-muted">{t("searching")}</li>
          ) : (
            results.map((r, i) => (
              <li key={`${r.symbol}-${i}`} id={`${listboxId}-opt-${i}`} role="option" aria-selected={i === activeIndex}>
                <button
                  type="button"
                  // `onMouseDown` (no `onClick`): se dispara antes del blur del input, así
                  // la selección no se pierde por el cierre del desplegable.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(r);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${
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
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
