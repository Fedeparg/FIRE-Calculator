---
title: "Monte Carlo simulations for FIRE: what a probability of success means"
description: "Why a financial independence plan is better measured in probabilities than with a date, how to read an 85% success rate, the difference between the random and the historical model, and how to use the withdrawal-rate table."
level: avanzado
keywords:
  - monte carlo
  - probability of success
  - FIRE
  - historical data
  - withdrawal rate
  - bootstrap
---

# Monte Carlo simulations: thinking about your plan in probabilities

A calculator with a fixed return gives you **a date**: "you get there in 24 years".
The market will not give you that return every year, and the **order** of good and
bad years changes the outcome (that is [sequence
risk](/aprende/riesgo-secuencia-retornos)). A Monte Carlo simulation rehearses
**thousands of possible futures** and counts how many turn out well.

## How to read a probability of success

In the [simulator](/calculadoras/simulador-montecarlo), a life "succeeds" if it
**reaches the goal** and the money then **lasts every year of retirement** you
chose.

- **85%** does not mean "almost certain": in 15 futures out of 100 something fails.
- **100%** is not a guarantee either: it only says none of the simulated futures
  failed under those assumptions.
- More useful than the exact figure is **how it changes** when you pull a lever:
  saving more, withdrawing less, retiring a year later.

Many FIRE plans aim for 85-95% and add **flexibility**: spending a bit less in bad
years raises the real probability a lot (see [dynamic withdrawal
strategies](/aprende/estrategias-retirada-dinamicas)).

## Two ways to imagine the future

**Random model.** Each year a return is drawn with the **mean** and **volatility**
you set. It is flexible (you can model any portfolio) but treats every year as
independent: it does not reproduce streaks like three bad years in a row.

**Historical model.** Instead of drawing, it chains **real 10-year stretches** of the
US market since 1871 (Robert J. Shiller's data), each starting at a random year. So
1929-1932, the 1973-1974 stagflation or 2008 show up **exactly as they happened**,
streaks included. You choose the share in stocks and the rest goes into 10-year
Treasury bonds, rebalanced every year.

With the simulator's default values (€24,000 spending, €20,000 invested, €800/month,
4% withdrawal and 40 years of retirement), the random model with 5% real return and
15% volatility gives **around 70%** success, and the historical one with a 60/40
portfolio **around 90%**. The gap is not magic: a 60/40 mix in the US has averaged a
little over 6% real, above the random model's conservative 5%.

**The historical trap**: the US has been one of the best markets in the world over
the last century and a half. Others, like Japan since 1990, fared much worse. Use the
historical model to see how your plan copes with **real crises**, not as a promise of
returns.

## The withdrawal-rate table

Below the fan chart, the simulator shows the probability of success at withdrawal
rates from 3% to 5%, with everything else unchanged and **the same simulated
futures**. A higher rate lowers the target (you get there sooner) but asks more of
the portfolio in retirement. With the default values, going from 4% to 3% raises
success from 70% to 86%: it is the strongest lever for long retirements (see [the 4%
rule](/aprende/regla-del-4)).

## On your real portfolio

In the [portfolio](/portfolio), the **Your financial independence goal** block runs
the same simulation **starting from the real value of your investments**: no need to
type your net worth. Volatility and retirement years are saved with the goal, and a
link opens the simulator with the same data so you can try the historical model or
the table.

## What no simulation knows

- Everything is in **today's money**: the return you enter must be after inflation.
- There are **no taxes or fees**: if you want a margin, lower the return.
- Spending is **fixed**, with no state pension or extra income.
- Scenarios use a **fixed seed**: the same inputs always give the same result, which
  lets you compare changes without noise.

---

*Educational information, not financial advice. Simulations describe assumptions;
they do not predict the future.*
