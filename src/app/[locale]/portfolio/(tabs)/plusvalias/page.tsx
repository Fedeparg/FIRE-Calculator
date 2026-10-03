import { permanentRedirect } from "next/navigation";

import { getPathname } from "@/i18n/navigation";
import { asLocale } from "@/i18n/types";

type Props = { params: Promise<{ locale: string }> };

/** The Capital gains (Plusvalías) tab became Tax return (Declaración): old links keep working. */
export default async function LegacyGainsPage({ params }: Props) {
  const { locale } = await params;
  permanentRedirect(getPathname({ href: "/portfolio/declaracion", locale: asLocale(locale) }));
}
