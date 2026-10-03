import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import es from "../../../../messages/es.json";
import { renderWithIntl } from "@/test/render";

import PositionDeleteBar from "./PositionDeleteBar";

vi.mock("@/features/portfolio/api", () => ({ deletePosition: vi.fn() }));

const STRONG_WARNING = es.portfolio.list.confirmDeleteWithSales;

async function openConfirmation(hasSales: boolean | null) {
  const user = userEvent.setup();
  renderWithIntl(<PositionDeleteBar positionId="p1" hasSales={hasSales} onEdit={vi.fn()} onDeleted={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: es.portfolio.detail.deletePosition }));
}

describe("PositionDeleteBar", () => {
  it("avisa de que se perderán las ventas si la posición tiene ventas", async () => {
    await openConfirmation(true);

    expect(screen.getByRole("alert")).toHaveTextContent(STRONG_WARNING);
  });

  it("también avisa mientras no se sabe (lotes cargando o con error), que es lo seguro", async () => {
    await openConfirmation(null);

    expect(screen.getByRole("alert")).toHaveTextContent(STRONG_WARNING);
  });

  it("no muestra el aviso fuerte si se sabe que no hay ventas", async () => {
    await openConfirmation(false);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: es.portfolio.list.confirm })).toBeInTheDocument();
  });

  it("lleva el foco a confirmar y, al cancelar, lo devuelve a eliminar", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PositionDeleteBar positionId="p1" hasSales={false} onEdit={vi.fn()} onDeleted={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: es.portfolio.detail.deletePosition }));
    expect(screen.getByRole("button", { name: es.portfolio.list.confirm })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: es.portfolio.list.cancel }));
    expect(screen.getByRole("button", { name: es.portfolio.detail.deletePosition })).toHaveFocus();
  });
});
