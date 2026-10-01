"use client";

import { usePortfolioData } from "./PortfolioDataProvider";
import PortfolioGoal from "./PortfolioGoal";

/**
 * Pestaña Objetivo FIRE. Con la cartera vacía sigue siendo útil (patrimonio actual = 0): es
 * justo cuando más ayuda ver la cifra a la que apuntar.
 */
export default function PortfolioGoalTab() {
  const { agg, display, rates } = usePortfolioData();
  return (
    <PortfolioGoal
      marketValue={agg.marketValue}
      valued={agg.valued}
      total={agg.total}
      display={display}
      rates={rates}
    />
  );
}
