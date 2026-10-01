import { useTranslations } from "next-intl";
import { HeroSextant } from "@/components/illustrations";
import CtaLink from "./CtaLink";

/** Sección principal: marca, tagline, subcopy, CTAs e ilustración del sextante. */
export default function Hero() {
  const t = useTranslations("landing.hero");

  return (
    <section className="mx-auto max-w-5xl px-4 pt-12 pb-8 sm:pt-16">
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <span className="inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted">
            {t("eyebrow")}
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            <span className="text-brand">{t("brand")}</span>
            <span className="mt-2 block text-foreground">{t("tagline")}</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">{t("subcopy")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <CtaLink href="/calculadoras" variant="primary">
              {t("ctaCalculators")}
            </CtaLink>
            <CtaLink href="/portfolio" variant="secondary">
              {t("ctaPortfolio")}
            </CtaLink>
          </div>
        </div>

        <div className="order-first lg:order-last">
          <HeroSextant className="mx-auto h-auto w-full max-w-sm" />
        </div>
      </div>
    </section>
  );
}
