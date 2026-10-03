import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { pickMessages } from "@/i18n/pick-messages";
import { CHROME_NAMESPACES } from "@/i18n/route-namespaces";
import { asLocale } from "@/i18n/types";
import { SITE_NAME, SITE_URL } from "@/shared/seo/site";
import { organizationSchema, websiteSchema } from "@/shared/seo/json-ld";
import JsonLd from "@/shared/seo/JsonLd";
import AuthNav from "@/features/auth/components/AuthNav";
import { DONATIONS_ENABLED } from "@/features/donations/config";
import Header from "@/shared/layout/Header";
import Footer from "@/shared/layout/Footer";
import ThemeScript from "@/shared/layout/ThemeScript";
import AnalyticsScript from "@/shared/analytics/components/AnalyticsScript";
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
    // Resolves the relative canonical, hreflang and OG URLs to absolute ones.
    metadataBase: new URL(SITE_URL),
    // Pages pass their bare title; the template appends the brand. The home
    // page (with no title of its own) uses `default` without a duplicated suffix.
    title: { default: t("title"), template: `%s | ${SITE_NAME}` },
    description: t("tagline"),
    applicationName: SITE_NAME,
    // Open Graph defaults for any page that does not set them;
    // `buildMetadata` enriches them per page (canonical, image, type…).
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
  // Without `messages` the provider inherits the whole catalog; see `src/i18n/route-namespaces.ts`.
  const messages = pickMessages(await getMessages(), CHROME_NAMESPACES);

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeScript />
        <JsonLd data={[organizationSchema(), websiteSchema(asLocale(locale))]} />
        <NextIntlClientProvider messages={messages}>
          <Header authSlot={<AuthNav />} />
          <main className="flex-1">{children}</main>
          <Footer showDonations={DONATIONS_ENABLED} />
        </NextIntlClientProvider>
        <AnalyticsScript />
      </body>
    </html>
  );
}
