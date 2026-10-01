import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { asLocale } from "@/core/types";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { organizationSchema, websiteSchema } from "@/lib/jsonld";
import JsonLd from "@/components/seo/JsonLd";
import Header from "@/shared/layout/Header";
import Footer from "@/shared/layout/Footer";
import ThemeScript from "@/shared/layout/ThemeScript";
import AnalyticsScript from "@/features/analytics/components/AnalyticsScript";
import "../globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site" });
  return {
    // Resuelve a absolutas las URLs relativas de canonical, hreflang y OG.
    metadataBase: new URL(SITE_URL),
    // Las páginas pasan su título "a secas"; la plantilla añade la marca. La
    // home (sin título propio) usa el `default` sin sufijo duplicado.
    title: { default: t("title"), template: `%s | ${SITE_NAME}` },
    description: t("tagline"),
    applicationName: SITE_NAME,
    // Defaults de Open Graph para cualquier página que no los especifique;
    // `buildMetadata` los enriquece por página (canonical, imagen, tipo…).
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: locale === "es" ? "es_ES" : "en_US",
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeScript />
        <JsonLd data={[organizationSchema(), websiteSchema(asLocale(locale))]} />
        <NextIntlClientProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </NextIntlClientProvider>
        <AnalyticsScript />
      </body>
    </html>
  );
}
