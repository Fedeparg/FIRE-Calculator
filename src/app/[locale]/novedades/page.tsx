import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { localizeReleases } from "@/core/changelog";
import { asLocale } from "@/core/types";
import { getChangelog } from "@/components/changelog/content";
import ChangelogTimeline from "@/components/changelog/ChangelogTimeline";
import { buildMetadata } from "@/lib/seo";

// ISR: igual que la wiki, el contenido se lee de un fichero de `content/` en
// runtime, así que regenerar `releases.json` en el servidor se publica solo, sin
// redesplegar. El filtrado vive en cliente precisamente para no perder esto: leer
// aquí `searchParams` volvería la ruta dinámica, así que los filtros viajan en la
// URL desde el cliente (`history.replaceState`, lectura tras el montaje) y esta
// página se sigue prerenderizando en su estado por defecto. Ver `ChangelogTimeline`.
export const revalidate = 3600;

// El slug no se traduce, igual que `/calculadoras` y `/aprende`: una única URL por
// página en los dos idiomas, con `/en` como prefijo del inglés.
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "changelog" });
  return buildMetadata({
    locale,
    path: "/novedades",
    title: t("heading"),
    description: t("subheading"),
  });
}

export default async function ChangelogPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("changelog");

  const { releases } = await getChangelog();
  // La resolución de idioma y el descarte de lo ilegible se hacen en servidor: al
  // cliente solo viaja el texto de un idioma, ya limpio.
  const localized = localizeReleases(releases, asLocale(locale));

  return (
    <section className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {t("heading")}
      </h1>
      <p className="mt-3 max-w-2xl text-muted">{t("subheading")}</p>

      {localized.length === 0 ? (
        <p className="mt-10 text-muted">{t("empty")}</p>
      ) : (
        <ChangelogTimeline releases={localized} locale={asLocale(locale)} />
      )}
    </section>
  );
}
