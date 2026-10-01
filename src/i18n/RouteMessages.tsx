import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { pickMessages } from "./pick-messages";
import { ROUTE_NAMESPACES, type RouteKey } from "./route-namespaces";

type Props = {
  route: RouteKey;
  /** Namespaces que dependen de la URL (p. ej. `calc.<slug>`). */
  extra?: readonly string[];
  children: ReactNode;
};

/**
 * Provider de mensajes de una ruta: solo serializa los namespaces declarados en
 * `ROUTE_NAMESPACES`. Sustituye (no fusiona) los del layout raíz; ver `route-namespaces.ts`.
 */
export default async function RouteMessages({ route, extra = [], children }: Props) {
  const messages = pickMessages(await getMessages(), [...ROUTE_NAMESPACES[route], ...extra]);
  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
