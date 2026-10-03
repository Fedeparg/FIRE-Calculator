"use client";

import { useTranslations } from "next-intl";

import Notice from "@/shared/ui/Notice";
import { Link } from "@/i18n/navigation";

/**
 * Notice that Sextante does not track derivative prices. Shared by the portfolio section and the
 * import preview so the message is always the same.
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
