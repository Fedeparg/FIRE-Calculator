---
title: "TAE vs TIN (and APY): how to actually compare a financial product"
description: "The TIN is the pure rate; the TAE includes fees and the compounding frequency. We explain both with examples and why the TAE is the figure you should compare between banks."
level: basico
keywords:
  - TAE
  - TIN
  - APY
  - compounding
  - comparison
---

# TAE vs TIN (and APY)

When you sign up for a deposit, a high-yield account, a mortgage or a loan, you
will see two percentages that look the same but **are not**: the **TIN** and the
**TAE** (the Spanish terms). Knowing how to tell them apart is what lets you
compare offers without being fooled by a pretty number.

## TIN: the nominal interest rate

The **TIN (nominal interest rate)** is the "pure" rate of the product: the
percentage applied to the capital to calculate interest. **It does not include
fees, costs or how often interest is paid.** It is useful for calculating
payments or interest, but **it is no good for comparing** products, because two
offers with the same TIN can cost (or yield) different things.

## TAE: the annual equivalent rate

The **TAE (annual equivalent rate)** is the **real annual** cost or yield of the
product. It includes:

- The **TIN**.
- The **fees** and some associated costs.
- The **compounding frequency**, that is, how often interest is paid or added
  (monthly, quarterly, annually…).

That is why the TAE is **the number you should use to compare** products of the
same type across different banks. By construction, on a deposit the TAE is
usually slightly **higher** than the TIN (because it compounds), while on a loan
the TAE is **higher** than the TIN because of the fees.

## Why the compounding frequency changes the result

Imagine a deposit with a **3 % TIN**. If interest is paid **once a year**, the
TAE is exactly 3 %. But if it is paid **monthly** and reinvested, the TAE rises a
little, because you start earning interest on interest:

```
TAE = (1 + TIN / m) ^ m − 1
```

where **m** is the number of times it compounds per year. With a 3 % TIN and
monthly payment (m = 12):

> TAE = (1 + 0.03 / 12)¹² − 1 ≈ **3.04 %**

The difference is small at low rates, but it grows at higher rates.

## And the APY? It's the "American" TAE

If you read international blogs or products (especially crypto or US banks), you
will see the term **APY (Annual Percentage Yield)**. It is exactly the same
concept as the TAE of a **savings** product: the annual yield **with compounding
already included**. Its loan equivalent is the **APR**, similar to the TIN. In
short: **APY ≈ savings TAE** and **APR ≈ loan TIN/TAE**.

## Quick table

| Concept | Includes fees? | Includes compounding? | What is it for? |
|---------|----------------|-----------------------|-----------------|
| **TIN** | No             | No                    | Calculating the payment or interest |
| **TAE** | Yes            | Yes                   | Comparing products with each other |
| **APY** | (savings)      | Yes                   | Anglo equivalent of the savings TAE |

## What the TAE does NOT tell you on a mortgage

The TAE is the best figure for comparison, but it has an important blind spot: on
a **variable-rate mortgage**, the TAE shown in the offer is computed **assuming the
Euribor never changes** for the whole life of the loan. It's a still photo of a
rate that will move. So comparing only first-year TAEs between a fixed and a
variable mortgage can lead you to the wrong conclusion. Also look at the **spread**,
the tie-in products (insurance, cards) and what happens if rates rise.

## Common mistakes

- **Comparing deposits by TIN** when one pays monthly and another at maturity:
  they yield differently despite the same TIN.
- **Focusing on a loan's low TIN** and ignoring arrangement or study fees that the
  TAE does capture.
- **Taking a crypto "X % APY" as a guaranteed TAE.** The calculation concept is the
  same; the **risk** behind it is not.

Between two offers of the same type, the one with the **better TAE** almost always
wins, not the one with the flashier TIN.
