"use client";

import { usePortfolioData } from "./PortfolioDataProvider";
import PortfolioGoal from "./PortfolioGoal";

/**
 * FIRE goal tab. With an empty portfolio it is still useful (current net worth = 0): that is
 * exactly when seeing the figure to aim for helps the most.
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
