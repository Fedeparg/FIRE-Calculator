import type { ReactNode } from "react";
import RouteMessages from "@/i18n/RouteMessages";

/** All of `/portfolio/*` (tabs, import, account) shares the portfolio client messages. */
export default function PortfolioLayout({ children }: { children: ReactNode }) {
  return <RouteMessages route="portfolio">{children}</RouteMessages>;
}
