import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

// The layout decides `showDonations`: `shared` cannot depend on `features/donations`.
export default function Footer({ showDonations }: { showDonations: boolean }) {
  const t = useTranslations("footer");

  return (
    <footer className="mt-12 border-t border-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 text-sm text-muted">
        <p className="max-w-3xl">{t("disclaimer")}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p>
            {t.rich("madeBy", {
              author: (chunks) => (
                <a
                  href="https://fpardo.net"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground transition hover:text-brand"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
          {showDonations && (
            <Link
              href="/sobre-mi#apoya"
              className="inline-flex items-center gap-1 font-medium text-foreground transition hover:text-brand"
            >
              <span aria-hidden>☕</span>
              {t("coffee")}
            </Link>
          )}
          <Link href="/novedades" className="font-medium text-foreground transition hover:text-brand">
            {t("changelog")}
          </Link>
          <Link href="/legal/privacidad" className="font-medium text-foreground transition hover:text-brand">
            {t("privacy")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
