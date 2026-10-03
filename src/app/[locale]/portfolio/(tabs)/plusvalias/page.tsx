import { permanentRedirect } from "next/navigation";

import { getPathname } from "@/i18n/navigation";
import { asLocale } from "@/i18n/types";

type Props = { params: Promise<{ locale: string }> };

/** La pestaña Plusvalías pasó a ser Declaración: los enlaces antiguos siguen funcionando. */
export default async function LegacyGainsPage({ params }: Props) {
  const { locale } = await params;
  permanentRedirect(getPathname({ href: "/portfolio/declaracion", locale: asLocale(locale) }));
}
