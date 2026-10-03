import type { Metadata } from "next";
import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import VerifyClient from "@/features/auth/components/VerifyClient";
import RouteMessages from "@/i18n/RouteMessages";

type Props = { params: Promise<{ locale: string }> };

// Ephemeral magic-link callback: crawlable but never indexable. It is not added to the
// robots Disallow list so that Google can read this noindex if it reaches the URL.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function VerifyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <RouteMessages route="auth/verify">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-24">
        <Suspense>
          <VerifyClient />
        </Suspense>
      </div>
    </RouteMessages>
  );
}
