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
  /** Slug de la calculadora (ver `src/features/calculators/registry.ts`). */
  slug?: string;
  /**
   * Bloque divulgativo de la wiki que se pinta bajo el aviso legal. Lo compone la ruta (no el
   * shell) para que `calculators` no dependa de `wiki`.
   */
  explainer?: React.ReactNode;
};

/** Estructura común a todas las páginas de calculadora. */
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
          El proveedor de estado envuelve la calculadora aquí porque este es el único punto
          por el que pasan TODAS las páginas de calculadora y el que conoce el slug: así el
          estado en la URL, el botón de copiar enlace y los escenarios guardados existen una
          sola vez y no calculadora a calculadora. Añade además la barra de acciones cuando
          la calculadora declara sus campos (ver `CalculatorState.tsx`).
        */}
        {slug ? <CalculatorStateProvider slug={slug}>{children}</CalculatorStateProvider> : children}

        <p className="mt-8 text-xs text-muted">{t("disclaimerShort")}</p>

        {explainer}
      </div>
    </section>
  );
}
