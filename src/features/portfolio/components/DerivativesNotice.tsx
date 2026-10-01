"use client";

import { useTranslations } from "next-intl";

import Notice from "@/shared/ui/Notice";
import { Link } from "@/i18n/navigation";

/**
 * Aviso de que Sextante no sigue el precio de los derivados. Lo comparten la sección de la
 * cartera y la vista previa de la importación para que el mensaje sea siempre el mismo.
 */
export default function DerivativesNotice() {
  const t = useTranslations("portfolio.derivatives");
  return (
    <Notice>
      {t("notice")}{" "}
      <Link href="/aprende/derivados" className="font-medium underline underline-offset-2">
        {t("learnMore")}
      </Link>
    </Notice>
  );
}
