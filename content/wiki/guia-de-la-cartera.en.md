---
title: "Sextante portfolio guide: what you can do and where everything is"
description: "A tour of the portfolio: adding positions and transactions, hourly prices, history and breakdown, your FIRE goal with probability of success, simulating a sale, the capital gains report, email notices and connecting an AI assistant."
level: basico
keywords:
  - portfolio
  - guide
  - investment tracking
  - capital gains
  - FIRE goal
  - email notices
---

# Portfolio guide

The [portfolio](/portfolio) brings together what you have invested across all your
brokers. It needs an account (you sign in with a link sent to your email, no
password) and your data is stored on Sextante's server, not in your browser. This
guide walks through the page from top to bottom.

## 1. Adding what you own

In **Add position** you search for the security by name, symbol or **ISIN**, and
enter the quantity, average purchase price, currency and, optionally, the broker. If
you already hold that security with the same broker, it offers to **combine** the
purchase with the existing position.

For detailed tracking, open **Lots** on a position's row: there you record each
**purchase and sale** with its date, price and fees. The position's quantity and
average price come from those transactions, and so does the capital gains report.

> If a position already has recorded sales, its quantity and average price are
> changed from its transactions, not from the edit form, so the sale history is not
> lost.

### Importing from Trade Republic

If you trade with Trade Republic you do not have to type anything in: from
[Import from Trade Republic](/portfolio/importar) you upload its transaction
export and Sextante creates your positions with all their buys and sells.

1. In the Trade Republic app, open **Profile → Account statements →
   Transaction export**.
2. Pick the period **since account opening** and download the CSV.
3. Upload it to Sextante: before anything is written you will see a preview with
   the new positions, the ones that will be extended and the transactions that
   were already imported.
4. Confirm. You can import the same file (or a newer one) again safely: the
   transactions already imported are not duplicated.

**Buys and sells** are imported (savings plan executions too), with their fee.
Dividends, interest and cash movements are **not imported yet**. The file is not
stored, and the third-party data it carries is discarded.

**Derivatives** (knock-outs, warrants and the like) are imported with their
transactions and count in the capital gains report, but Sextante **does not track
their price**: they go to a separate, collapsed section and do not add to the
totals. Here is [what derivatives are](/aprende/derivados) and why. Positions sold
in full are hidden from the list; tick *Show closed positions* to see them.

## 2. The summary and prices

**Portfolio total** shows the amount invested, the market value and the gain or
loss, in the currency you choose in **Show in**. Prices refresh **every hour from
9:00 to 21:00 (Spanish time) on weekdays**, and with the close at around 22:30;
below the total you will see **how long ago** they were updated. The page picks up
new prices on its own while it is open.

In the positions table you can sort by column and switch the gain between percentage
and amount. **Download CSV** takes the portfolio to a spreadsheet.

## 3. History and breakdown

**Portfolio history** draws the value day by day (a point is saved every night) and
**Portfolio composition** splits the portfolio by asset, broker or currency.

## 4. Your financial independence goal

In **Your financial independence goal** you enter your annual spending and
withdrawal rate, and see the wealth you need, how much you **actually** have and how
much is left. Below it, **What if the market doesn't cooperate?** works out the
**probability of success** with thousands of scenarios starting from your portfolio's
real value (more in [Monte Carlo simulations](/aprende/simulacion-monte-carlo)). You
can **save** the goal: it also shows up in the [FIRE
calculator](/calculadoras/independencia-financiera).

## 5. What if I sell?

Inside each position's **Lots**, the sale simulator tells you the gain or loss you
would have if you sold a given quantity now, which lots would go out under FIFO and
an estimate of the tax. It records nothing: it is a what-if.

## 6. The capital gains report

The **Capital gains** button in the portfolio header opens a summary of your sales
**by tax year**: gains and losses netted, the estimated tax and a **CSV with one row
per sale** for your tax return. What it covers and what it does not: [capital gains
when selling](/aprende/plusvalias-al-vender).

## 7. My account

In **My account** (also in the header) you will find:

- **Email notices**: if you turn them on, we email you when your portfolio crosses
  25, 50, 75 and 100% of your goal. One notice per milestone, never repeated, with
  one-click unsubscribe from any email.
- **Connected applications**: connect an MCP-compatible AI assistant (Claude,
  ChatGPT…) so it can read or change your portfolio for you, prepare the year's
  realised gains for your tax return or run any of the calculators, and revoke access
  whenever you like.
- **Export my data** and **Delete my account**.

## What's new?

Every visible change is announced in [What's new](/novedades), summarised by day.

---

*Sextante computes and explains; it does not recommend. Nothing it shows is
financial or tax advice.*
