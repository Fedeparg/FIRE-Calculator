import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { asLocale } from "@/core/types";
import { SITE_NAME } from "@/lib/site";
import { calculatorSchema } from "@/lib/jsonld";
import AdSlot from "./AdSlot";
import { ADS_ENABLED } from "./ads";
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
    // Con publicidad activa se ensancha para dar sitio al lateral; sin ella, el
    // ancho clásico de lectura (max-w-4xl) y una sola columna.
    <section className={`mx-auto px-4 py-8 ${ADS_ENABLED ? "max-w-7xl" : "max-w-4xl"}`}>
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

      {/* Dos columnas (contenido + lateral fijo) solo si hay publicidad y a partir
          de lg. En móvil el lateral se oculta y el banner del final cubre. */}
      <div className={ADS_ENABLED ? "mt-6 lg:flex lg:items-start lg:gap-8" : "mt-6"}>
        <div className={ADS_ENABLED ? "min-w-0 lg:flex-1" : ""}>
          {children}

          <p className="mt-8 text-xs text-muted">{t("disclaimerShort")}</p>

          {/* Banner horizontal tras la herramienta (todos los tamaños). */}
          <AdSlot className="mt-6" />

          {slug && <CalculatorExplainer calcSlug={slug} />}
        </div>

        {/* Lateral fijo: solo desktop y solo con publicidad. Sticky en el propio
            <aside> para que siga visible al hacer scroll (no en un div hijo). */}
        {ADS_ENABLED && (
          <aside className="sticky top-24 hidden w-[300px] shrink-0 lg:block">
            <AdSlot previewMinH="min-h-[600px]" />
          </aside>
        )}
      </div>
    </section>
  );
}
