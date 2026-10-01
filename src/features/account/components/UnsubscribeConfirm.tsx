"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { apiFetch } from "@/shared/api/client";
import Button from "@/shared/ui/Button";

type Status = "idle" | "submitting" | "done" | "error";

/**
 * Confirmación de baja de los avisos por email. La baja es un POST explícito tras pulsar el
 * botón, nunca al abrir la página: los escáneres de enlaces del correo abren todo lo que ven y
 * darían de baja a la gente sin querer. El token del enlace es la identidad (no hace falta
 * sesión) y la API responde igual sea válido o no, así que aquí no se distingue.
 */
export default function UnsubscribeConfirm({ token }: { token: string | null }) {
  const t = useTranslations("unsubscribe");
  const [status, setStatus] = useState<Status>("idle");

  async function confirm() {
    if (!token) return;
    setStatus("submitting");
    try {
      await apiFetch(`/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`, { method: "POST" });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (!token) return <p className="text-muted">{t("missingToken")}</p>;

  if (status === "done") {
    return (
      <div className="flex flex-col items-center gap-4">
        <p role="status" className="text-foreground">
          {t("done")}
        </p>
        <Link href="/portfolio/cuenta" className="text-sm font-medium text-brand underline underline-offset-2">
          {t("manage")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <Button
        size="cta"
        onClick={() => void confirm()}
        disabled={status === "submitting"}
        className="inline-flex items-center justify-center"
      >
        {status === "submitting" ? t("submitting") : t("confirm")}
      </Button>
      {status === "error" && <p className="text-sm text-warning">{t("error")}</p>}
    </div>
  );
}
