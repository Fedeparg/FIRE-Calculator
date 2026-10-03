import { useTranslations } from "next-intl";
import { WaveDivider } from "@/shared/illustrations";
import CtaLink from "./CtaLink";

/** Invitation to the "Aprende" (Learn) wiki. */
export default function LearnCallout() {
  const t = useTranslations("landing.learn");

  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <WaveDivider className="h-10 w-full" />
        <div className="flex flex-col items-start gap-6 px-6 pb-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{t("heading")}</h2>
            <p className="mt-3 max-w-xl text-muted">{t("body")}</p>
          </div>
          <CtaLink href="/aprende" variant="primary" className="shrink-0">
            {t("cta")}
          </CtaLink>
        </div>
      </div>
    </section>
  );
}
