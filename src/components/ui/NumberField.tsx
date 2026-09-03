"use client";

import { useId, useState, type KeyboardEvent } from "react";

import {
  addStep,
  clampNumber,
  formatDecimalInput,
  parseDecimalInput,
  sanitizeDecimalInput,
  stripLeadingZeros,
} from "@/core/number-input";
import { useFormat } from "@/lib/format";
import HelpTooltip from "./HelpTooltip";

type Props = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
  /**
   * Oculta la etiqueta visualmente (sigue en el DOM y sigue siendo el nombre
   * accesible del input). Para filas repetidas donde la etiqueta ya se ve una
   * vez en la cabecera: se evita repetirla en pantalla sin dejar el campo
   * anónimo para un lector de pantalla.
   */
  hideLabel?: boolean;
};

/**
 * Campo numérico con teclado decimal en móvil.
 *
 * Es `type="text"` a propósito, no `type="number"`: el teclado decimal de un móvil
 * en español ofrece coma, y `type="number"` descarta todo lo que no sea un número
 * con punto, así que la coma nunca llegaba al handler y no se podían escribir
 * decimales. A cambio perdemos las flechas nativas del spinner, que se reimplementan
 * aquí; como allí, `min`/`max` gobiernan las flechas y no lo que se teclea.
 */
export default function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  help,
  hideLabel = false,
}: Props) {
  const id = useId();
  const { decimalSeparator } = useFormat();
  // Estado de texto interno: permite el campo vacío mientras se edita (sin
  // forzar un "0" que dejaría ceros feos a la izquierda) y conserva el separador
  // tal y como lo escribe el usuario.
  const [text, setText] = useState(() => formatDecimalInput(value, decimalSeparator));

  function handleChange(raw: string) {
    const next = stripLeadingZeros(sanitizeDecimalInput(raw));
    setText(next);
    onChange(parseDecimalInput(next) ?? 0);
  }

  /**
   * Al salir, el texto se resincroniza con el número ("3," → "3", "" → "0"). No se
   * acota a [min, max]: `type="number"` tampoco lo hacía al teclear, y hay tasas que
   * son legítimamente negativas pese al `min = 0` por defecto (un año en pérdidas,
   * deflación). Los extremos solo gobiernan las flechas, como el spinner nativo.
   */
  function handleBlur() {
    const parsed = parseDecimalInput(text) ?? 0;
    if (parsed !== value) onChange(parsed);
    setText(formatDecimalInput(parsed, decimalSeparator));
  }

  /** Reemplaza las flechas del spinner nativo, que `type="text"` no trae. */
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();

    const current = parseDecimalInput(text) ?? 0;
    const next = clampNumber(addStep(current, event.key === "ArrowUp" ? step : -step), min, max);
    setText(formatDecimalInput(next, decimalSeparator));
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <label
          htmlFor={id}
          className={hideLabel ? "sr-only" : "text-sm font-medium text-foreground"}
        >
          {label}
        </label>
        {help && <HelpTooltip text={help} />}
      </div>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        role="spinbutton"
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
    </div>
  );
}
