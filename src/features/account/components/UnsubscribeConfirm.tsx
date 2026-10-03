"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { apiFetch } from "@/shared/api/client";
import { useApiMutation } from "@/shared/api/use-api-mutation";
import Button from "@/shared/ui/Button";

/**
 * Confirmation for unsubscribing from email alerts. Unsubscribing is an explicit POST after the
 * button is pressed, never on page load: email link scanners open everything they see and would
 * unsubscribe people unintentionally. The link's token is the identity (no session needed) and
 * the API responds the same whether it is valid or not, so no distinction is made here.
 */
export default function UnsubscribeConfirm({ token }: { token: string | null }) {
  const t = useTranslations("unsubscribe");
  const unsubscribe = useApiMutation();

  async function confirm() {
    if (!token) return;
    await unsubscribe.run(() =>
      apiFetch(`/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`, { method: "POST" }),
    );
  }

  if (!token) return <p className="text-muted">{t("missingToken")}</p>;

  if (unsubscribe.status === "success") {
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
        disabled={unsubscribe.status === "pending"}
        className="inline-flex items-center justify-center"
      >
        {unsubscribe.status === "pending" ? t("submitting") : t("confirm")}
      </Button>
      {unsubscribe.status === "error" && <p className="text-sm text-warning">{t("error")}</p>}
    </div>
  );
}
