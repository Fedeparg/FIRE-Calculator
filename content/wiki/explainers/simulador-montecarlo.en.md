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

**Historical model.** Instead of drawing random returns, you can pick the **historical** model: each life chains together **real 10-year stretches** of the US market (1871–2023, data from Robert J. Shiller), each starting at a random year. Crises show up exactly as they happened (1929–1932, the 1973–1974 stagflation, 2008), with their runs of bad years in a row, which is precisely what makes sequence risk worse. You choose the share in stocks and the rest goes into 10-year Treasury bonds, rebalanced every year. This model does not use the return or volatility you typed: they come from the data.

With the default values and a 60/40 portfolio, the probability of success rises to **around 90%** and the median drops to **25 years**. The model is not optimistic by construction: the average real return of that mix in the US has been a little over 6%, above the conservative 5% the random model starts with.

**Sensitivity table.** Below the fan chart you will see the probability of success at withdrawal rates from 3% to 5%, with everything else unchanged and **the same market scenarios**, so the differences between rows come only from the rate. A higher rate lowers the target (you get there sooner) but asks more of the portfolio during retirement. With the default values in the random model, going from 4% to 3% raises success from 70% to 86%.

**[The 4% rule](/aprende/regla-del-4).** It comes from the *Trinity study* (1998), which checked against US historical data that withdrawing 4% in the first year, adjusted for inflation, lasted 30 years in the vast majority of periods. For longer retirements, like FIRE ones, it is wise to lower the withdrawal rate or accept more risk. Try 50 years of retirement and 3.5% to see it.

**Model limitations.**

- In the random model, each year's return is **independent** of the others and follows a lognormal distribution. Real markets have streaks and specific crises that this model does not reproduce; that is what the historical model is for.
- The historical model uses **the US only**, one of the best-performing markets of the last century and a half (*survivorship bias*: others, like Japan since 1990, fared much worse). And history does not repeat exactly.
- Everything is in **today's euros** (real terms), so the return you enter should be net of inflation.
- It includes **no taxes or fees**. When you sell to withdraw money, capital gains are taxed. If you want a margin, lower the return.
- Spending is fixed. In real life you can cut back in bad years, which greatly improves the odds of success.
- Scenarios use a fixed seed, so the same inputs always give the same result.

It is a tool to understand risk, not a prediction or investment advice.
