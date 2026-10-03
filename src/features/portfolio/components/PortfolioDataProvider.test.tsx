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

/** API responses per route; every call returns NEW objects with the same content. */
function respond(url: string): unknown {
  if (url.startsWith("/api/positions")) return [{ ...POSITION }];
  if (url.startsWith("/api/prices/fx")) return { ...FX, rates: { ...FX.rates } };
  if (url.startsWith("/api/prices")) return { "VWCE.DE": { ...PRICES["VWCE.DE"] } };
  throw new Error(`Unexpected route in test: ${url}`);
}

const fetchMock = vi.fn((input: RequestInfo | URL) =>
  Promise.resolve(new Response(JSON.stringify(respond(String(input))), { status: 200 })),
);

const calls = (prefix: string): number =>
  fetchMock.mock.calls.filter(
    ([input]) => String(input).startsWith(prefix) && !String(input).startsWith(`${prefix}/fx`),
  ).length;

/** Called on every render of the data consumer: counts how many times it re-renders. */
const onDataRender = vi.fn();

/** Consumer of the data ONLY. */
function DataConsumer() {
  const { agg } = usePortfolioData();
  onDataRender();
  return <p data-testid="value">{agg.marketValue}</p>;
}

/** Consumer of the freshness: shows when the prices were checked. */
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
    // jsdom starts as a hidden tab; the auto-refresh only runs while the tab is visible.
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not re-render a data-only reader when a refresh brings the same data", async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("value")).toHaveTextContent("1200"));
    await waitFor(() => expect(screen.getByTestId("checked")).not.toHaveTextContent("none"));
    const settledRenders = onDataRender.mock.calls.length;
    const firstCheck = screen.getByTestId("checked").textContent;

    vi.spyOn(Date, "now").mockReturnValue(Number(firstCheck) + 60_000);
    returnToTab();
    await waitFor(() => expect(screen.getByTestId("checked")).toHaveTextContent(String(Number(firstCheck) + 60_000)));
    vi.restoreAllMocks();

    // The freshness moved forward, but positions and prices are equal: their references are kept.
    expect(calls("/api/prices")).toBe(2);
    expect(onDataRender).toHaveBeenCalledTimes(settledRenders);
  });

  it("refreshes only once when returning to the tab (no double focus trigger)", async () => {
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
