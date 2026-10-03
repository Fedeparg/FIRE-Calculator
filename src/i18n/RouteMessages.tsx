import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { pickMessages } from "./pick-messages";
import { ROUTE_NAMESPACES, type RouteKey } from "./route-namespaces";

type Props = {
  route: RouteKey;
  /** Namespaces that depend on the URL (e.g. `calc.<slug>`). */
  extra?: readonly string[];
  children: ReactNode;
};

/**
 * Per-route message provider: it only serializes the namespaces declared in
 * `ROUTE_NAMESPACES`. It replaces (does not merge) the root layout's; see `route-namespaces.ts`.
 */
export default async function RouteMessages({ route, extra = [], children }: Props) {
  const messages = pickMessages(await getMessages(), [...ROUTE_NAMESPACES[route], ...extra]);
  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
