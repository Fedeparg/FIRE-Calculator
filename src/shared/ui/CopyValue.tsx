"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type Props = {
  /** Text to copy, exactly as typed into the target form (e.g. "1234,56"). */
  value: string;
  /** What is being copied, for screen readers (e.g. "casilla 0328", a tax form box). */
  label: string;
};

/**
 * Small button that copies a value to the clipboard and briefly confirms it. If the browser
 * does not allow copying, it shows the value so it can be copied by hand.
 */
export default function CopyValue({ value, label }: Props) {
  const t = useTranslations("common");
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("failed");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={t("copyLabel", { label })}
      className="rounded-md px-1.5 py-0.5 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-foreground print:hidden"
    >
      {state === "copied" ? t("copied") : state === "failed" ? value : t("copy")}
    </button>
  );
}
