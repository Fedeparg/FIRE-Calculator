import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import RowActions from "./RowActions";

const labels = (item: string) => ({
  edit: "Editar",
  delete: "Eliminar",
  confirm: "Sí, eliminar",
  cancel: "Cancelar",
  editLabel: `Editar ${item}`,
  deleteLabel: `Eliminar ${item}`,
  confirmLabel: `Sí, eliminar ${item}`,
});

/** Two rows with the confirmation state lifted up, as in `LotList`. */
function Rows({ onEdit = vi.fn(), onConfirm = vi.fn() }) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  return (
    <ul>
      {["Compra · 01/03/2025", "Venta · 02/04/2025"].map((item) => (
        <li key={item}>
          <RowActions
            labels={labels(item)}
            confirming={confirmingId === item}
            busy={false}
            onEdit={() => onEdit(item)}
            onAskDelete={() => setConfirmingId(item)}
            onCancelDelete={() => setConfirmingId(null)}
            onConfirmDelete={() => onConfirm(item)}
          />
        </li>
      ))}
    </ul>
  );
}

describe("RowActions", () => {
  it("names each button after its row", async () => {
    const onEdit = vi.fn();
    render(<Rows onEdit={onEdit} />);

    await userEvent.click(screen.getByRole("button", { name: "Editar Venta · 02/04/2025" }));

    expect(onEdit).toHaveBeenCalledWith("Venta · 02/04/2025");
    expect(screen.getAllByRole("button", { name: /^Eliminar / })).toHaveLength(2);
  });

  it("moves focus to confirm on delete request, and back to delete on cancel", async () => {
    const user = userEvent.setup();
    render(<Rows />);

    await user.click(screen.getByRole("button", { name: "Eliminar Compra · 01/03/2025" }));
    expect(screen.getByRole("button", { name: "Sí, eliminar Compra · 01/03/2025" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("button", { name: "Eliminar Compra · 01/03/2025" })).toHaveFocus();
  });

  it("confirm calls back with its own row", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Rows onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Eliminar Venta · 02/04/2025" }));
    await user.keyboard("{Enter}");

    expect(onConfirm).toHaveBeenCalledWith("Venta · 02/04/2025");
  });
});
