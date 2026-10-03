"use client";

import { useState } from "react";

import { todayUtc } from "@sextante/core/dates";

/**
 * Today in UTC (`YYYY-MM-DD`), read ONCE on mount. `useState` with an initializer keeps the value
 * across renders: the clock is not queried on every render, and everything derived from "today"
 * (current year, default tax year, end point of a series) stays stable while the component
 * lives. In UTC, like the dates of lots, income and prices.
 */
export function useTodayUtc(): string {
  const [today] = useState(todayUtc);
  return today;
}
