/**
 * Message namespaces each route sends to the client.
 *
 * `NextIntlClientProvider` serializes everything it receives into the HTML, and without
 * `messages` it inherits the whole catalog (~100 KB). That is why the root layout only passes
 * `CHROME_NAMESPACES` (what the header, home and "about me" client components use) and every
 * route that renders client components with other namespaces mounts a `RouteMessages` with its
 * `ROUTE_NAMESPACES` entry. A nested provider REPLACES the parent's messages (it does not merge
 * them), so each entry must list everything its subtree needs, including the "common" ones.
 *
 * Only client components matter: server components read from the request config
 * (`getTranslations`/`useTranslations` on the server) and do not depend on the provider.
 * `route-namespaces.test.ts` fails if a client component uses a namespace that does not reach
 * its route; when adding a route or a `useTranslations`, update it here.
 */

/** Header (user menu, theme) and the client components of the home and "about me" pages. */
export const CHROME_NAMESPACES = ["nav", "auth.nav", "auth.portfolio", "donations"] as const;

/**
 * Key = the route folder under `src/app/[locale]/`; that folder's `layout.tsx` or `page.tsx`
 * mounts `<RouteMessages route="<key>">`. Routes not listed here only use
 * `CHROME_NAMESPACES`.
 */
export const ROUTE_NAMESPACES = {
  "alertas/baja": ["unsubscribe"],
  "auth/verify": ["auth.verify"],
  calculadoras: ["selector"],
  // Plus `calc.<slug>` (see `calculatorNamespace`): each calculator only sends its own.
  "calculadoras/[slug]": ["common", "calculator", "chart", "frequency", "region"],
  entrar: ["auth.login"],
  "oauth/consent": ["oauth.consent"],
  portfolio: ["common", "calculator", "chart", "frequency", "portfolio", "account"],
} as const satisfies Record<string, readonly string[]>;

export type RouteKey = keyof typeof ROUTE_NAMESPACES;

/** A calculator's namespace, the only `calc.*` its route sends. */
export const calculatorNamespace = (slug: string): string => `calc.${slug}`;
