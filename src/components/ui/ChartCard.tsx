"use client";

import { ResponsiveContainer } from "recharts";
import type { ReactElement } from "react";

type Props = {
  title: string;
  height?: number;
  children: ReactElement;
};

export default function ChartCard({ title, height = 300, children }: Props) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-medium text-foreground">{title}</h2>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </div>
  );
}
