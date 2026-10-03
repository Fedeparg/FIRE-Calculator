import "server-only";

import { createTranslator } from "next-intl";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { CALCULATORS, isCalculatorSlug } from "@/features/calculators/registry";
import { CATEGORIES } from "@/features/calculators/types";
import { getArticle, getLegalDoc } from "@/features/wiki/content";
import { asLocale, type Locale } from "@/i18n/types";
import { OG_CARD_PARAM, OG_PAGES, type OgPage } from "@/shared/seo/seo";
import { SITE_NAME } from "@/shared/seo/site";

/** What the card renders. */
export type ResolvedOgCard = { title: string; subtitle: string | null; locale: Locale };

const MESSAGES = { es, en } as const;

/** Where each fixed page's title comes from: the same text as its `generateMetadata`. */
const PAGE_TITLES = {
  home: "landing.meta.title",
  learn: "wiki.heading",
  calculators: "selector.heading",
  changelog: "changelog.heading",
  about: "about.meta.title",
} as const satisfies Record<OgPage, string>;

function isOgPage(value: string): value is OgPage {
  return (OG_PAGES as readonly string[]).includes(value);
}

/**
 * Card title and subtitle from the `/og` query (`?calc=<slug>`, `?article=<slug>`,
 * `?legal=<slug>` or `?page=<id>`, plus `locale`). It only renders text that already exists in
 * Sextante; anything else (an unknown slug, a legacy `?title=`) yields the generic card with
 * the site name.
 */
export async function resolveOgCard(params: URLSearchParams): Promise<ResolvedOgCard> {
  const locale = asLocale(params.get("locale") ?? "");
  const t = createTranslator({ locale, messages: MESSAGES[locale] });
  const generic: ResolvedOgCard = { title: SITE_NAME, subtitle: null, locale };

  const page = params.get(OG_CARD_PARAM.page);
  if (page !== null) {
    if (!isOgPage(page)) return generic;
    return { title: t(PAGE_TITLES[page]), subtitle: null, locale };
  }

  const calc = params.get(OG_CARD_PARAM.calculator);
  if (calc !== null) {
    if (!isCalculatorSlug(calc)) return generic;
    const category = CALCULATORS.find((c) => c.slug === calc)?.category;
    return {
      title: t(`calc.${calc}.title`),
      subtitle: category ? CATEGORIES[category][locale] : null,
      locale,
    };
  }

  const article = params.get(OG_CARD_PARAM.article);
  if (article !== null) {
    const found = await getArticle(article, locale);
    return found ? { title: found.title, subtitle: null, locale } : generic;
  }

  const legal = params.get(OG_CARD_PARAM.legal);
  if (legal !== null) {
    const found = await getLegalDoc(legal, locale);
    return found ? { title: found.title, subtitle: null, locale } : generic;
  }

  return generic;
}
