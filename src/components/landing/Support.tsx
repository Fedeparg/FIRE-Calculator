import { useTranslations } from "next-intl";

import DonationWidget from "@/components/donations/DonationWidget";
import { DONATIONS_ENABLED } from "@/components/donations/config";
import { Link } from "@/i18n/navigation";

/**
 * Bloque de apoyo del landing: explica que Sextante es gratis y obra de una persona,
 * y ofrece el widget de donación. Solo se renderiza si las donaciones están activas
 * (NEXT_PUBLIC_DONATIONS_ENABLED=1); si no, no aparece nada.
 */
export default function Support() {
  const t = useTranslations("donations.landing");
  if (!DONATIONS_ENABLED) return null;

  return (
    <section id="apoya" className="mx-auto max-w-5xl px-4 py-12">
      <div className="grid items-center gap-8 rounded-3xl border border-border bg-surface-2 p-8 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <span className="text-2xl" aria-hidden>
            ☕
          </span>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{t("title")}</h2>
          <p className="mt-3 max-w-xl text-muted">{t("body")}</p>
          <Link
            href="/sobre-mi"
            className="mt-4 inline-block text-sm font-medium text-brand transition hover:opacity-80"
          >
            {t("aboutLink")}
          </Link>
        </div>
        <DonationWidget />
      </div>
    </section>
  );
}
