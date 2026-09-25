---
title: "How the FIRE Monte Carlo simulator works"
---

The [FIRE calculator](/calculadoras/independencia-financiera) assumes the market returns **exactly the same every year**. Reality is different: there are +25% years and −30% years, and **the order in which they arrive matters**. This simulator answers the question that really counts: **how likely am I to reach FIRE and have my money last through retirement?**

**What a Monte Carlo is.** Instead of computing a single future, it simulates **5,000 financial lives**. Each one follows a random sequence of annual returns with the average and volatility you enter. Then it counts how many turn out well. Each life has two phases:

1. **Accumulation.** Your wealth grows with that year's return plus your savings until it reaches the FIRE number (annual spending ÷ withdrawal rate).
2. **Retirement.** From then on you stop contributing and withdraw your annual spending for the number of retirement years you chose. If at some point there isn't enough to cover a year, that life fails.

**How to read the results.**

- **Probability of success**: lives that reach FIRE and don't run out of money, out of the total. 85% means that in 15 out of 100 scenarios something goes wrong: either you don't get there or the money runs out too early.
- **Years to FIRE**: the median and the range covering the middle 80% of scenarios.
- **The fan chart** shows how your wealth evolves. The light band covers 80% of scenarios; the darker one, the middle 50%.

**Worked example** (default values). With €24,000 of annual spending, €20,000 invested, €800/month of savings, a 5% average real return, 15% volatility, a 4% withdrawal rate and 40 years of retirement:

- Without volatility you would get there in **28 years**, and at a constant 5% the money would never run out.
- With volatility, the median becomes **29 years** (21 to 41 in the middle 80%) and the probability of success drops to **around 71%**.

**Why volatility hurts even with the same average.** Losing 20% and then gaining 20% doesn't leave you where you started: it leaves you at 96%. The more returns swing, the more the typical portfolio grows below the average (this is *volatility drag*). On top of that there is [**sequence-of-returns risk**](/aprende/riesgo-secuencia-retornos): a big crash right as you start withdrawing forces you to sell low, and that part of the portfolio doesn't come back when the market rebounds.

**[The 4% rule](/aprende/regla-del-4).** It comes from the *Trinity study* (1998), which checked against US historical data that withdrawing 4% in the first year, adjusted for inflation, lasted 30 years in the vast majority of periods. For longer retirements, like FIRE ones, it is wise to lower the withdrawal rate or accept more risk. Try 50 years of retirement and 3.5% to see it.

**Model limitations.**

- Each year's return is **independent** of the others and follows a lognormal distribution. Real markets have streaks and specific crises that this model does not reproduce.
- Everything is in **today's euros** (real terms), so the return you enter should be net of inflation.
- It includes **no taxes or fees**. When you sell to withdraw money, capital gains are taxed. If you want a margin, lower the return.
- Spending is fixed. In real life you can cut back in bad years, which greatly improves the odds of success.
- Scenarios use a fixed seed, so the same inputs always give the same result.

It is a tool to understand risk, not a prediction or investment advice.
