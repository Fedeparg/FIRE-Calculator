import { useTranslations } from "next-intl";
import {
  IconSuite,
  IconTax,
  IconLearn,
  IconPortfolio,
} from "@/components/illustrations";

const PILLARS = [
  { key: "suite", Icon: IconSuite },
  { key: "tax", Icon: IconTax },
  { key: "portfolio", Icon: IconPortfolio },
  { key: "learn", Icon: IconLearn },
] as const;

/** Propuesta de valor: cuatro pilares con ilustración. */
export default function Pillars() {
  const t = useTranslations("landing.pillars");

  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {t("heading")}
      </h2>
      <p className="mt-3 max-w-2xl text-muted">{t("subheading")}</p>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PILLARS.map(({ key, Icon }) => (
          <li
            key={key}
            className="flex h-full flex-col rounded-xl border border-border bg-surface p-5"
          >
            <Icon className="h-12 w-12" />
            <h3 className="mt-4 font-semibold text-foreground">{t(`items.${key}.title`)}</h3>
            <p className="mt-2 text-sm text-muted">{t(`items.${key}.body`)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
