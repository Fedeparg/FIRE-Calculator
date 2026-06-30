import type { Metadata } from "next";
import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import VerifyClient from "@/components/auth/VerifyClient";

type Props = { params: Promise<{ locale: string }> };

// Callback efímero del magic link: rastreable pero nunca indexable. No se pone en
// robots Disallow para que Google sí pueda leer este noindex si llega a la URL.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function VerifyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-24">
      <Suspense>
        <VerifyClient />
      </Suspense>
    </div>
  );
}
