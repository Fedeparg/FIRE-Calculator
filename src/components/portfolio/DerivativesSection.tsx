"use client";

import { useTranslations } from "next-intl";

import DerivativesNotice from "./DerivativesNotice";

type Props = {
  /** Nº de derivados visibles (en el título). */
  count: number;
  /** La lista de posiciones del bloque. */
  children: React.ReactNode;
};

/**
 * Derivados de la cartera, plegados por defecto. Un `<details>` nativo da el plegado, el foco y
 * el teclado accesibles sin JavaScript. Van aparte porque Sextante no sigue su precio: no se
 * valoran ni suman a los totales (ver `aggregatePortfolio`), y mezclarlos con el resto
 * sugeriría un P&L que no se calcula.
 */
export default function DerivativesSection({ count, children }: Props) {
  const t = useTranslations("portfolio.derivatives");
  return (
    <details className="group rounded-2xl border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-6 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
        <span className="text-lg font-semibold text-foreground">{t("title", { count })}</span>
        <span aria-hidden="true" className="text-muted transition group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="flex flex-col gap-4 px-6 pb-6">
        <DerivativesNotice />
        {children}
      </div>
    </details>
  );
}
