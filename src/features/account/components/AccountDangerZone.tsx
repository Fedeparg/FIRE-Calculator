"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Link, useRouter } from "@/i18n/navigation";
import Button from "@/shared/ui/Button";
import Notice from "@/shared/ui/Notice";
import { downloadBlob } from "@/shared/format/download";
import { apiErrorKey, apiFetch, type ApiErrorKey } from "@/shared/api/client";
import { useApiMutation } from "@/shared/api/use-api-mutation";

/** Claves de error que define el namespace `account` (no tiene `errorInvalid`). */
type ErrorKey = Exclude<ApiErrorKey, "errorInvalid">;

/** Traduce el fallo (red, sesión, servidor) a un mensaje específico, sin volcar el body crudo de la API. */
function errorKeyFor(error: unknown): ErrorKey {
  const key = apiErrorKey(error);
  return key === "errorInvalid" ? "errorGeneric" : key;
}

type Props = {
  /** Email del usuario autenticado (del servidor). Sirve para confirmar el borrado. */
  email: string;
};

/**
 * Zona de cuenta con los dos derechos RGPD: exportar mis datos (descarga un JSON) y
 * borrar mi cuenta. El borrado exige escribir el propio correo para confirmar; la
 * autorización y el scoping por usuario los decide SIEMPRE la API (userId del JWT).
 */
export default function AccountDangerZone({ email }: Props) {
  const t = useTranslations("account");
  const router = useRouter();

  // Exportación.
  const exportData = useApiMutation();
  const exporting = exportData.status === "pending";

  // Borrado.
  const [confirmEmail, setConfirmEmail] = useState("");
  const deletion = useApiMutation();
  const deleteError = deletion.error === null ? null : errorKeyFor(deletion.error);

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
    await exportData.run(async () => {
      const res = await apiFetch("/api/auth/account/export");
      downloadBlob(await res.blob(), "sextante-datos.json");
    });
  }

  /** Borra la cuenta tras confirmar el correo; al terminar, redirige al inicio. */
  async function handleDelete() {
    if (!emailMatches || deletion.status === "pending" || deletion.status === "success") return;
    const result = await deletion.run(() => apiFetch("/api/auth/account", { method: "DELETE" }));
    if (!result.ok) return;
    // Breve pausa para que el usuario vea el aviso antes de salir.
    redirectTimer.current = setTimeout(() => {
      router.replace("/");
      router.refresh();
    }, 1500);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Exportar mis datos */}
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-foreground">{t("export.title")}</h2>
        <p className="text-sm text-muted">{t("export.description")}</p>
        <Button variant="secondary" size="lg" onClick={handleExport} disabled={exporting} className="self-start">
          {exporting ? t("export.exporting") : t("export.button")}
        </Button>
        {exportData.status === "error" && <p className="text-sm text-warning">{t("export.error")}</p>}
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
            disabled={deletion.status === "success"}
            className="w-full max-w-sm rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-danger focus:ring-2 focus:ring-danger/30"
          />
        </div>

        <Button
          variant="danger"
          size="lg"
          onClick={handleDelete}
          disabled={!emailMatches || deletion.status === "pending" || deletion.status === "success"}
          className="self-start"
        >
          {deletion.status === "pending" ? t("delete.deleting") : t("delete.button")}
        </Button>

        {deletion.status === "success" && <Notice variant="info">{t("delete.success")}</Notice>}

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
