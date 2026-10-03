import type { ReactNode } from "react";

// Full class names are literals (not `lg:grid-cols-${n}`): Tailwind only generates the
// classes it sees written in the source.
const COLUMNS = {
  3: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4",
} as const;

type Props = {
  /** Columns from `lg` up; 2 on medium screens and 1 on mobile. */
  columns?: keyof typeof COLUMNS;
  children: ReactNode;
};

/** Responsive grid of `Stat` cards for a calculator's results. */
export default function StatGrid({ columns = 4, children }: Props) {
  return <div className={COLUMNS[columns]}>{children}</div>;
}
