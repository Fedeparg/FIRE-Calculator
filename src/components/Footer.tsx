import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export default function Footer() {
  const t = useTranslations("footer");

  return (
    <footer className="mt-12 border-t border-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 text-sm text-muted">
        <p className="max-w-3xl">{t("disclaimer")}</p>
        <Link
          href="/legal/privacidad"
          className="font-medium text-foreground transition hover:text-brand"
        >
          {t("privacy")}
        </Link>
      </div>
    </footer>
  );
}
