import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { asLocale } from "@/i18n/types";
import { SITE_NAME } from "@/shared/seo/site";
import { calculatorSchema } from "@/shared/seo/json-ld";
import CalculatorStateProvider from "./CalculatorState";
import Breadcrumbs from "@/shared/seo/Breadcrumbs";
import JsonLd from "@/shared/seo/JsonLd";

type Props = {
  title: string;
  intro: string;
  children: React.ReactNode;
  /** Calculator slug (see `src/features/calculators/registry.ts`). */
  slug?: string;
  /**
   * Explanatory wiki block rendered below the legal notice. The route composes it (not the
   * shell) so `calculators` does not depend on `wiki`.
   */
  explainer?: React.ReactNode;
};

/** Layout shared by every calculator page. */
export default function CalculatorShell({ title, intro, children, slug, explainer }: Props) {
  const t = useTranslations("common");
  const tNav = useTranslations("nav");
  const locale = asLocale(useLocale());

  return (
    <section className="mx-auto max-w-4xl px-4 py-8">
      {slug ? (
        <Breadcrumbs
          items={[
            { name: SITE_NAME, path: "/" },
            { name: tNav("home"), path: "/calculadoras" },
            { name: title, path: `/calculadoras/${slug}` },
          ]}
        />
      ) : (
        <Link href="/calculadoras" className="text-sm font-medium text-brand hover:underline">
          ← {t("back")}
        </Link>
      )}

      {slug && <JsonLd data={calculatorSchema({ locale, slug, name: title, description: intro })} />}

      <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-muted">{intro}</p>

      <div className="mt-6">
        {/*
          The state provider wraps the calculator here because this is the only point that
          ALL calculator pages go through and the one that knows the slug: that way URL
          state, the copy-link button and saved scenarios exist once rather than per
          calculator. It also adds the actions bar when the calculator declares its fields
          (see `CalculatorState.tsx`).
        */}
        {slug ? <CalculatorStateProvider slug={slug}>{children}</CalculatorStateProvider> : children}

        <p className="mt-8 text-xs text-muted">{t("disclaimerShort")}</p>

        {explainer}
      </div>
    </section>
  );
}
