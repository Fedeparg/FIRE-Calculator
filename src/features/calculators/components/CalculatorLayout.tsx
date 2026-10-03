/** Grupo de campos con título, para calculadoras con muchas entradas de naturaleza distinta. */
export type FieldGroup = {
  /** Clave estable (React) del grupo. */
  id: string;
  title: string;
  fields: React.ReactNode;
  /** Columnas a partir de `lg` (en `sm` siempre son dos). */
  columns?: 2 | 3;
};

type Props =
  | {
      /**
       * `sidebar`: pocos campos, barra lateral con los resultados al lado.
       * `grid`: muchos campos, rejilla arriba y resultados debajo (evita una columna
       * lateral kilométrica). Se elige a mano, no se deduce de un recuento de campos,
       * que se desfasaba al añadir o quitar uno.
       */
      layout: "sidebar" | "grid";
      inputs: React.ReactNode;
      results: React.ReactNode;
      notice?: React.ReactNode;
    }
  | {
      /** Como `grid`, pero con los campos repartidos en grupos con título (p. ej. datos básicos y personales). */
      layout: "grouped";
      groups: readonly FieldGroup[];
      results: React.ReactNode;
      notice?: React.ReactNode;
    };

const GROUP_COLUMNS: Record<NonNullable<FieldGroup["columns"]>, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
};

export default function CalculatorLayout(props: Props) {
  const { results, notice } = props;
  return (
    <div className="grid gap-6">
      {notice}

      {props.layout === "grouped" ? (
        <>
          <div className="grid gap-6 rounded-xl border border-border bg-surface p-5">
            {props.groups.map((group, index) => (
              <section key={group.id} className={`grid gap-3${index > 0 ? " border-t border-border pt-5" : ""}`}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{group.title}</h3>
                <div className={`grid gap-4 ${GROUP_COLUMNS[group.columns ?? 2]}`}>{group.fields}</div>
              </section>
            ))}
          </div>
          <div className="grid gap-6">{results}</div>
        </>
      ) : props.layout === "grid" ? (
        <>
          <div className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2 lg:grid-cols-3">
            {props.inputs}
          </div>
          <div className="grid gap-6">{results}</div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
          <div className="grid gap-4 rounded-xl border border-border bg-surface p-4 content-start">{props.inputs}</div>
          <div className="grid gap-6 content-start">{results}</div>
        </div>
      )}
    </div>
  );
}
