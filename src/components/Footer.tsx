import { useTranslations } from "next-intl";

export default function Footer() {
  const t = useTranslations("footer");

  return (
    <footer className="mt-12 border-t border-border bg-surface">
      <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-muted">
        <p className="max-w-3xl">{t("disclaimer")}</p>
      </div>
    </footer>
  );
}
