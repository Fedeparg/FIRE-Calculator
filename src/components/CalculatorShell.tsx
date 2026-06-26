import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import AdSlot from "./AdSlot";
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

  return (
    <section className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/" className="text-sm font-medium text-brand hover:underline">
        ← {t("back")}
      </Link>

      <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h1>
      <p className="mt-2 max-w-2xl text-muted">{intro}</p>

      <div className="mt-6">{children}</div>

      <p className="mt-8 text-xs text-muted">{t("disclaimerShort")}</p>

      <AdSlot className="mt-6" />

      {slug && <CalculatorExplainer calcSlug={slug} />}
    </section>
  );
}
