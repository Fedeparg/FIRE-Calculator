import { act, render, screen, waitFor } from "@testing-library/react";
import type { Position } from "@sextante/core/portfolio/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PortfolioDataProvider, { usePortfolioData, usePortfolioFreshness } from "./PortfolioDataProvider";

const POSITION: Position = {
  id: "p1",
  ticker: "VWCE.DE",
  name: "Vanguard FTSE All-World",
  quantity: 10,
  avgPrice: 100,
  broker: "TR",
  currency: "EUR",
  isDerivative: false,
  assetClass: "fund",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const PRICES = {
  "VWCE.DE": {
    symbol: "VWCE.DE",
    close: 120,
    currency: "EUR",
    date: "2026-10-02",
    fetchedAt: "2026-10-02T17:00:00.000Z",
    previousClose: 119,
  },
};

const FX = { asOf: "2026-10-02", rates: { USD: 1, EUR: 1.1 } };

/** Respuestas de la API por ruta; cada llamada devuelve objetos NUEVOS con el mismo contenido. */
function respond(url: string): unknown {
  if (url.startsWith("/api/positions")) return [{ ...POSITION }];
  if (url.startsWith("/api/prices/fx")) return { ...FX, rates: { ...FX.rates } };
  if (url.startsWith("/api/prices")) return { "VWCE.DE": { ...PRICES["VWCE.DE"] } };
  throw new Error(`Ruta inesperada en el test: ${url}`);
}

const fetchMock = vi.fn((input: RequestInfo | URL) =>
  Promise.resolve(new Response(JSON.stringify(respond(String(input))), { status: 200 })),
);

const calls = (prefix: string): number =>
  fetchMock.mock.calls.filter(
    ([input]) => String(input).startsWith(prefix) && !String(input).startsWith(`${prefix}/fx`),
  ).length;

/** Se llama en cada render del consumidor de datos: cuenta cuántas veces se re-renderiza. */
const onDataRender = vi.fn();

/** Consumidor SOLO de los datos. */
function DataConsumer() {
  const { agg } = usePortfolioData();
  onDataRender();
  return <p data-testid="value">{agg.marketValue}</p>;
}

/** Consumidor de la frescura: enseña cuándo se comprobaron los precios. */
function FreshnessConsumer() {
  const { pricesCheckedAt } = usePortfolioFreshness();
  return <p data-testid="checked">{pricesCheckedAt ?? "none"}</p>;
}

function renderProvider() {
  return render(
    <PortfolioDataProvider initialPositions={[POSITION]}>
      <DataConsumer />
      <FreshnessConsumer />
    </PortfolioDataProvider>,
  );
}

function returnToTab() {
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("PortfolioDataProvider", () => {
  beforeEach(() => {
    onDataRender.mockClear();
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    // jsdom arranca como pestaña oculta; el auto-refresco solo corre con la pestaña visible.
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no re-renderiza a quien solo lee datos cuando un refresco trae lo mismo", async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("value")).toHaveTextContent("1200"));
    await waitFor(() => expect(screen.getByTestId("checked")).not.toHaveTextContent("none"));
    const settledRenders = onDataRender.mock.calls.length;
    const firstCheck = screen.getByTestId("checked").textContent;

    vi.spyOn(Date, "now").mockReturnValue(Number(firstCheck) + 60_000);
    returnToTab();
    await waitFor(() => expect(screen.getByTestId("checked")).toHaveTextContent(String(Number(firstCheck) + 60_000)));
    vi.restoreAllMocks();

    // La frescura avanzó, pero posiciones y precios son iguales: sus referencias se conservan.
    expect(calls("/api/prices")).toBe(2);
    expect(onDataRender).toHaveBeenCalledTimes(settledRenders);
  });

  it("refresca una sola vez al volver a la pestaña (sin el doble disparo de focus)", async () => {
    renderProvider();
    await waitFor(() => expect(calls("/api/prices")).toBe(1));
    const positionsBefore = calls("/api/positions");

    returnToTab();
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => expect(calls("/api/positions")).toBe(positionsBefore + 1));
    await waitFor(() => expect(calls("/api/prices")).toBe(2));
  });
});
