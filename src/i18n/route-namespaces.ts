/**
 * Namespaces de mensajes que cada ruta envía al cliente.
 *
 * `NextIntlClientProvider` serializa en el HTML todo lo que recibe, y sin `messages` hereda el
 * catálogo entero (~100 KB). Por eso el layout raíz solo pasa `CHROME_NAMESPACES` (lo que usan
 * los componentes de cliente de la cabecera, la home y "sobre mí") y cada ruta que renderiza
 * componentes de cliente con otros namespaces monta un `RouteMessages` con su entrada de
 * `ROUTE_NAMESPACES`. Un provider anidado REEMPLAZA los mensajes del padre (no los fusiona), así
 * que cada entrada debe listar todo lo que necesita su subárbol, incluido lo "común".
 *
 * Solo importan los componentes de cliente: los de servidor leen del request config
 * (`getTranslations`/`useTranslations` en servidor) y no dependen del provider.
 * `route-namespaces.test.ts` falla si un componente de cliente usa un namespace que no llega a
 * su ruta; al añadir una ruta o un `useTranslations`, hay que actualizarlo aquí.
 */

/** Cabecera (menú de usuario, tema) y componentes de cliente de la home y de "sobre mí". */
export const CHROME_NAMESPACES = ["nav", "auth.nav", "auth.portfolio", "donations"] as const;

/**
 * Clave = carpeta de la ruta bajo `src/app/[locale]/`; el `layout.tsx` o `page.tsx` de esa
 * carpeta monta `<RouteMessages route="<clave>">`. Las rutas que no aparecen aquí usan solo
 * `CHROME_NAMESPACES`.
 */
export const ROUTE_NAMESPACES = {
  "alertas/baja": ["unsubscribe"],
  "auth/verify": ["auth.verify"],
  calculadoras: ["selector"],
  // Se le suma `calc.<slug>` (ver `calculatorNamespace`): cada calculadora solo envía el suyo.
  "calculadoras/[slug]": ["common", "calculator", "chart", "frequency", "region"],
  entrar: ["auth.login"],
  "oauth/consent": ["oauth.consent"],
  portfolio: ["common", "calculator", "chart", "frequency", "portfolio", "account"],
} as const satisfies Record<string, readonly string[]>;

export type RouteKey = keyof typeof ROUTE_NAMESPACES;

/** Namespace de una calculadora, el único `calc.*` que envía su ruta. */
export const calculatorNamespace = (slug: string): string => `calc.${slug}`;
