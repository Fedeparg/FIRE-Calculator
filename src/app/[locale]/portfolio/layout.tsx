import type { ReactNode } from "react";
import RouteMessages from "@/i18n/RouteMessages";

/** Todo `/portfolio/*` (pestañas, importar, cuenta) comparte los mensajes de cliente de la cartera. */
export default function PortfolioLayout({ children }: { children: ReactNode }) {
  return <RouteMessages route="portfolio">{children}</RouteMessages>;
}
