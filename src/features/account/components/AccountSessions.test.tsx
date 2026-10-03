import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import AccountSessions from "./AccountSessions";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
const apiFetch = vi.hoisted(() => vi.fn());

vi.mock("@/i18n/navigation", () => ({ useRouter: () => router }));
vi.mock("@/shared/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/api/client")>()),
  apiFetch,
}));

describe("AccountSessions", () => {
  beforeEach(() => {
    router.replace.mockClear();
    router.refresh.mockClear();
    apiFetch.mockReset();
  });

  it("signs out all sessions in the API and returns to the login page", async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    renderWithIntl(<AccountSessions />);

    await userEvent.click(screen.getByRole("button", { name: "Cerrar todas las sesiones" }));

    expect(apiFetch).toHaveBeenCalledWith("/api/auth/sessions/revoke", { method: "POST" });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/entrar"));
  });

  it("warns and stays on the page if the API fails", async () => {
    apiFetch.mockRejectedValue(new Error("red caída"));
    renderWithIntl(<AccountSessions />);

    await userEvent.click(screen.getByRole("button", { name: "Cerrar todas las sesiones" }));

    expect(await screen.findByText("No se pudieron cerrar las sesiones. Inténtalo de nuevo.")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
