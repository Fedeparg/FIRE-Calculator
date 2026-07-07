import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { asLocale } from "@/core/types";
import { SITE_NAME } from "@/lib/site";
import { calculatorSchema } from "@/lib/jsonld";
import Breadcrumbs from "./seo/Breadcrumbs";
import JsonLd from "./seo/JsonLd";
import CalculatorExplainer from "./wiki/CalculatorExplainer";

type Props = {
  title: string;
  intro: string;
  children: React.ReactNode;
  /**
   * Slug de la calculadora (ver `src/core/registry.ts`). Si se indica, se
   * renderiza debajo el bloque divulgativo + chips de la wiki. Si se omite (o
   * no hay contenido para ese slug), no se muestra nada.
   */
  slug?: string;
};

/** Estructura común a todas las páginas de calculadora. */
export default function CalculatorShell({ title, intro, children, slug }: Props) {
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

      {slug && (
        <JsonLd
          data={calculatorSchema({ locale, slug, name: title, description: intro })}
        />
      )}

      <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h1>
      <p className="mt-2 max-w-2xl text-muted">{intro}</p>

      <div className="mt-6">
        {children}

        <p className="mt-8 text-xs text-muted">{t("disclaimerShort")}</p>

        {slug && <CalculatorExplainer calcSlug={slug} />}
      </div>
    </section>
  );
}
