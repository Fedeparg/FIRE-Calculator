import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export type LandingCategory = {
  id: string;
  label: string;
  count: number;
};

type Props = {
  categories: LandingCategory[];
};

/** Featured calculator categories (real data from the registry). */
export default function Categories({ categories }: Props) {
  const t = useTranslations("landing.categories");

  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{t("heading")}</h2>
          <p className="mt-3 max-w-2xl text-muted">{t("subheading")}</p>
        </div>
        <Link href="/calculadoras" className="text-sm font-semibold text-brand hover:underline">
          {t("cta")} →
        </Link>
      </div>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => (
          <li key={category.id}>
            <Link
              href="/calculadoras"
              className="flex h-full items-center justify-between gap-3 rounded-xl border border-border bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-sm"
            >
              <span className="font-semibold text-foreground">{category.label}</span>
              <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
                {t("count", { count: category.count })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
