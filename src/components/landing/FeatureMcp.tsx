import { useTranslations } from "next-intl";
import { IconAi } from "@/components/illustrations";
import CtaLink from "./CtaLink";

/**
 * Bloque destacado del diferenciador de Sextante: la conexión MCP para enchufar tu
 * propio asistente de IA (Claude, ChatGPT) a tu cartera. Resaltado con borde de marca,
 * tile de marca e icono de IA monocromo.
 */
export default function FeatureMcp() {
  const t = useTranslations("landing.mcp");

  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <div className="flex flex-col items-start gap-6 rounded-2xl border border-brand bg-surface p-6 shadow-sm sm:flex-row sm:items-center sm:p-8">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand text-brand-fg">
          <IconAi className="h-9 w-9" />
        </div>
        <div className="flex-1">
          <span className="inline-flex items-center rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-brand">
            {t("badge")}
          </span>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t("heading")}
          </h2>
          <p className="mt-3 max-w-2xl text-muted">{t("body")}</p>
        </div>
        <CtaLink href="/portfolio" variant="primary" className="shrink-0">
          {t("cta")}
        </CtaLink>
      </div>
    </section>
  );
}
