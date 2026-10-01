import type { ReactNode } from "react";

// Las clases completas van como literales (no `lg:grid-cols-${n}`): Tailwind solo genera
// las que ve escritas en el código.
const COLUMNS = {
  3: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4",
} as const;

type Props = {
  /** Columnas a partir de `lg`; en pantallas medianas son 2 y en móvil 1. */
  columns?: keyof typeof COLUMNS;
  children: ReactNode;
};

/** Rejilla responsive de tarjetas `Stat` de los resultados de una calculadora. */
export default function StatGrid({ columns = 4, children }: Props) {
  return <div className={COLUMNS[columns]}>{children}</div>;
}
