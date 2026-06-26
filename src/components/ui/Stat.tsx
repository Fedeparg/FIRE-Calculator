type Props = {
  label: string;
  value: string;
  highlight?: boolean;
};

export default function Stat({ label, value, highlight = false }: Props) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight
          ? "border-brand bg-brand-soft"
          : "border-border bg-surface"
      }`}
    >
      <div className="text-sm text-muted">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold ${
          highlight ? "text-brand" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
