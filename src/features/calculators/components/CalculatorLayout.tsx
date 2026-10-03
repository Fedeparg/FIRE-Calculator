/** Titled group of fields, for calculators with many inputs of different kinds. */
export type FieldGroup = {
  /** Stable (React) key of the group. */
  id: string;
  title: string;
  fields: React.ReactNode;
  /** Columns from `lg` up (at `sm` there are always two). */
  columns?: 2 | 3;
};

type Props =
  | {
      /**
       * `sidebar`: few fields, a sidebar with the results next to it.
       * `grid`: many fields, a grid on top and results below (avoids a mile-long side
       * column). Chosen by hand rather than inferred from a field count, which drifted
       * whenever a field was added or removed.
       */
      layout: "sidebar" | "grid";
      inputs: React.ReactNode;
      results: React.ReactNode;
      notice?: React.ReactNode;
    }
  | {
      /** Like `grid`, but with the fields split into titled groups (e.g. basic and personal details). */
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
