"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { Position } from "@/lib/portfolio";
import AddPositionForm from "./AddPositionForm";
import PositionList from "./PositionList";

type Props = {
  initialPositions: Position[];
};

/**
 * Island de cliente de la cartera: mantiene la lista en estado y la actualiza sin
 * recargar al añadir o borrar. La carga inicial (SSR) llega por props desde el server
 * component; la autorización y el scoping por usuario los decide siempre la API.
 */
export default function PortfolioClient({ initialPositions }: Props) {
  const t = useTranslations("portfolio");
  const [positions, setPositions] = useState<Position[]>(initialPositions);

  function handleCreated(position: Position) {
    // Más recientes primero, igual que el orden del backend.
    setPositions((prev) => [position, ...prev]);
  }

  function handleDeleted(id: string) {
    setPositions((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="flex flex-col gap-6">
      {positions.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-foreground">{t("empty.title")}</p>
          <p className="mt-1 text-sm text-muted">{t("empty.body")}</p>
        </div>
      ) : (
        <PositionList positions={positions} onDeleted={handleDeleted} />
      )}

      <AddPositionForm onCreated={handleCreated} />
    </div>
  );
}
