"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Link, useRouter } from "@/i18n/navigation";
import Notice from "@/components/ui/Notice";
import { downloadBlob } from "@/lib/download";

/** Tipo de error mostrado al usuario, derivado del fallo concreto (status o red). */
type ErrorKey = "errorNetwork" | "errorSession" | "errorServer" | "errorGeneric";

/** Traduce un status HTTP a un mensaje específico (sin volcar el body crudo de la API). */
function errorKeyForStatus(status: number): ErrorKey {
  if (status === 401) return "errorSession";
  if (status >= 500) return "errorServer";
  return "errorGeneric";
}

type Props = {
  /** Email del usuario autenticado (del servidor). Sirve para confirmar el borrado. */
  email: string;
};

type DeleteStatus = "idle" | "deleting" | "done";

const buttonBase = "rounded-lg px-4 py-2.5 font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Zona de cuenta con los dos derechos RGPD: exportar mis datos (descarga un JSON) y
 * borrar mi cuenta. El borrado exige escribir el propio correo para confirmar; la
 * autorización y el scoping por usuario los decide SIEMPRE la API (userId del JWT).
 */
export default function AccountDangerZone({ email }: Props) {
  const t = useTranslations("account");
  const router = useRouter();

  // Exportación.
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);

  // Borrado.
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleteStatus, setDeleteStatus] = useState<DeleteStatus>("idle");
  const [deleteError, setDeleteError] = useState<ErrorKey | null>(null);

  // Limpia el temporizador de redirección si el componente se desmonta antes.
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, []);

  // El correo confirmado debe coincidir con el del usuario (la API lo normaliza a
  // minúsculas al iniciar sesión, así que comparamos en minúsculas).
  const emailMatches = confirmEmail.trim().toLowerCase() === email.toLowerCase();

  /** Descarga el JSON de datos vía blob para poder gestionar errores (401, red…). */
  async function handleExport() {
    setExporting(true);
    setExportError(false);
    try {
      const res = await fetch("/api/auth/account/export");
      if (!res.ok) {
        setExportError(true);
        return;
      }
      downloadBlob(await res.blob(), "sextante-datos.json");
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  }

  /** Borra la cuenta tras confirmar el correo; al terminar, redirige al inicio. */
  async function handleDelete() {
    if (!emailMatches || deleteStatus !== "idle") return;
    setDeleteStatus("deleting");
    setDeleteError(null);
    try {
      const res = await fetch("/api/auth/account", { method: "DELETE" });
      if (res.ok) {
        setDeleteStatus("done");
        // Breve pausa para que el usuario vea el aviso antes de salir.
        redirectTimer.current = setTimeout(() => {
          router.replace("/");
          router.refresh();
        }, 1500);
        return;
      }
      setDeleteError(errorKeyForStatus(res.status));
      setDeleteStatus("idle");
    } catch {
      // La promesa de fetch solo rechaza por fallo de red/conexión.
      setDeleteError("errorNetwork");
      setDeleteStatus("idle");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Exportar mis datos */}
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-foreground">{t("export.title")}</h2>
        <p className="text-sm text-muted">{t("export.description")}</p>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className={`${buttonBase} self-start border border-border text-foreground hover:bg-surface-2`}
        >
          {exporting ? t("export.exporting") : t("export.button")}
        </button>
        {exportError && <p className="text-sm text-warning">{t("export.error")}</p>}
      </section>

      {/* Zona de peligro: borrar mi cuenta */}
      <section className="flex flex-col gap-3 rounded-2xl border border-danger-border bg-danger-soft p-6">
        <h2 className="text-lg font-semibold text-danger">{t("danger.title")}</h2>
        <h3 className="text-base font-medium text-foreground">{t("delete.title")}</h3>
        <p className="text-sm text-muted">{t("delete.description")}</p>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirm-email" className="text-sm font-medium text-foreground">
            {t("delete.confirmLabel", { email })}
          </label>
          <input
            id="confirm-email"
            type="email"
            autoComplete="off"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            placeholder={t("delete.placeholder")}
            disabled={deleteStatus === "done"}
            className="w-full max-w-sm rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-danger focus:ring-2 focus:ring-danger/30"
          />
        </div>

        <button
          type="button"
          onClick={handleDelete}
          disabled={!emailMatches || deleteStatus !== "idle"}
          className={`${buttonBase} self-start bg-danger text-danger-fg hover:opacity-90`}
        >
          {deleteStatus === "deleting" ? t("delete.deleting") : t("delete.button")}
        </button>

        {deleteStatus === "done" && <Notice variant="info">{t("delete.success")}</Notice>}

        {deleteError && (
          <p className="text-sm text-warning">
            {t(deleteError)}
            {deleteError === "errorSession" && (
              <>
                {" "}
                <Link href="/entrar" className="font-medium text-brand underline underline-offset-2">
                  {t("errorSessionLink")}
                </Link>
              </>
            )}
          </p>
        )}
      </section>
    </div>
  );
}
