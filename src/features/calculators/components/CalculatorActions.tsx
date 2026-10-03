"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { trackEvent } from "@/shared/analytics/track";
import { useCalculatorState } from "./CalculatorState";
import ScenarioPanel from "./ScenarioPanel";
import Button from "@/shared/ui/Button";

/** Outcome of the last copy attempt (clipboard access may be denied). */
type CopyStatus = "idle" | "copied" | "error";

/** How long the copy confirmation stays visible. */
const COPY_FEEDBACK_MS = 3000;

/**
 * Actions bar below the calculator: copy the link to the calculation and (with a session) the
 * scenarios saved to the account.
 *
 * `CalculatorStateProvider` mounts it, so it shows up on its own in any calculator that declares
 * its fields with `useNumberField`/`useOptionField`; those that declare none (non-scalar inputs)
 * have nothing to share and do not show it.
 */
export default function CalculatorActions() {
  const t = useTranslations("calculator.share");
  const state = useCalculatorState();
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  // The confirmation clears itself: if it stayed put, it would stop reading as the response
  // to the last click.
  useEffect(() => {
    if (copyStatus === "idle") return;
    const timer = setTimeout(() => setCopyStatus("idle"), COPY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  if (!state?.hasFields) return null;

  async function handleCopy() {
    if (!state) return;
    // `flushUrl` writes the URL without waiting for the delay: that way the current state is
    // copied rather than the one from a quarter of a second ago.
    const href = state.flushUrl();
    try {
      await navigator.clipboard.writeText(href);
      setCopyStatus("copied");
      trackEvent({ name: "share-link-copied", data: { calculator: state.slug } });
    } catch {
      // The clipboard may be blocked (permission denied, insecure context).
      setCopyStatus("error");
    }
  }

  return (
    <section className="mt-6 grid gap-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="mr-auto text-sm font-semibold text-foreground">{t("title")}</h2>
        <Button variant="accent" size="sm" onClick={handleCopy}>
          {t("copyLink")}
        </Button>
        {/*
          Live region: the button's state change is ANNOUNCED, not just coloured. It is always
          in the DOM (not created on copy) so the screen reader observes it.
        */}
        <p
          role="status"
          aria-live="polite"
          className={`text-sm ${copyStatus === "error" ? "text-warning" : "text-accent-text"}`}
        >
          {copyStatus === "copied" ? t("copied") : copyStatus === "error" ? t("copyError") : ""}
        </p>
      </div>

      <p className="text-xs text-muted">{t("hint")}</p>

      <ScenarioPanel />
    </section>
  );
}
