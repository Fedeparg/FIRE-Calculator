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
  it("warns that the sales will be lost if the position has sales", async () => {
    await openConfirmation(true);

    expect(screen.getByRole("alert")).toHaveTextContent(STRONG_WARNING);
  });

  it("also warns while it is unknown (lots loading or failed), which is the safe choice", async () => {
    await openConfirmation(null);

    expect(screen.getByRole("alert")).toHaveTextContent(STRONG_WARNING);
  });

  it("does not show the strong warning if it is known there are no sales", async () => {
    await openConfirmation(false);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: es.portfolio.list.confirm })).toBeInTheDocument();
  });

  it("moves focus to confirm and, on cancel, returns it to delete", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PositionDeleteBar positionId="p1" hasSales={false} onEdit={vi.fn()} onDeleted={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: es.portfolio.detail.deletePosition }));
    expect(screen.getByRole("button", { name: es.portfolio.list.confirm })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: es.portfolio.list.cancel }));
    expect(screen.getByRole("button", { name: es.portfolio.detail.deletePosition })).toHaveFocus();
  });
});
