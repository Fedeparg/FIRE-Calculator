# Tax engine (`packages/core/src/fiscal`)

Scope, assumptions, sources and limitations of each module. All figures are
**indicative** and refer to tax year `FISCAL_YEAR` (`brackets.ts`). This is not
tax advice.

## `brackets.ts`

Official scales, employment-income constants and the progressive-bracket engine. It is the
single source of truth for tax rates.

- **Annual review**: `FISCAL_REVIEW_BY` marks when to review the `FISCAL_YEAR` figures
  (scales, minimums, Social Security, `withholding-rates.ts`). From that date a test in
  `brackets.test.ts` fails: it is a reminder, not an expiry date.
- **Wealth Tax, Gift Tax and pension plans**: the exempt minimum and the primary-residence
  exemption of the Wealth Tax (Ley 19/1991), the thresholds and kinship coefficients of the
  Inheritance and Gift Tax, ISD (Ley 29/1987, art. 22.2), and the 30% cap on pension plans
  (art. 52 LIRPF) also live here; the calculators only import them.

- **General state scale** (art. 63.1.1º LIRPF): applied as is. The law already gives it
  halved (rates 9.50 to 24.50); multiplying it by 0.5 would halve it twice. Source: AEAT,
  Manual práctico de Renta 2025, "Gravamen estatal".
- **Default regional scale (escala autonómica supletoria)** (art. 65 LIRPF): matches the
  state scale up to €60,000, but its last bracket is a flat 22.50%, without the split at
  €300,000 to 24.50%. Mixing them up overstates income above €300,000 (49% instead of the
  actual 47%). Since 2011 there is no real fallback: it only applies to Ceuta and Melilla
  (DA 32ª LIRPF) and to residents abroad, and it is the one used when no region is given.
- **General scale** `IRPF_GENERAL_SCALE` = state + default regional scale, bracket by bracket
  (the final 47% comes from 24.50 + 22.50).
- **Savings, Wealth Tax (Ley 19/1991, art. 30) and Inheritance Tax (Ley 29/1987, art. 21)**:
  state scales; the regions (CCAA) may pass their own.
- **Employee Social Security**: 6.50% permanent contract (common contingencies 4.70 +
  unemployment 1.55 + vocational training (FP) 0.10 + MEI 0.15), 6.55% temporary contract;
  maximum base €5,101.20/month × 12. Source: Orden de cotización 2026.
- **Hard-to-justify expenses (gastos de difícil justificación)** (simplified direct assessment,
  estimación directa simplificada, art. 30 RIRPF, RD 439/2007): 5% capped at €2,000. The 7%
  was a one-off for 2023.
- **Employment income reduction (reducción por rendimientos del trabajo)** (art. 20 LIRPF):
  decreasing scale with three tiers; above the third limit it is 0.
- **Pension plans** (art. 52 LIRPF): individual limit €1,500, up to €8,500 more for employer
  contributions, joint limit €10,000 and, on top of that, 30% of net employment and business
  income.
- **Minimums** (arts. 57-60 LIRPF): descendants count at 100%; if shared with the other parent
  they would count at half.

## `irpf.ts`

Employment income for the gross-to-net salary, withholding, pension-plan and self-employed IRPF
calculators. It approximates the AEAT calculation with the two-scale method:
tax(base) − tax(personal and family minimum).

- **No region**: combined scale `IRPF_GENERAL_SCALE` and the state minimum (the behaviour of
  Ceuta and Melilla).
- **With a region**: state tax (state scale and minimum) + regional tax (the region's scale and
  its own minimum, if it has one), each floored at zero separately. The regional minimum only
  feeds the regional tax (art. 46.1.a Ley 22/2009).
- **Limitations**: regional deductions are not modelled (there are many and they have a large
  effect on the actual result).

## `regions.ts`

Regional scales and personal and family minimums (mínimo personal y familiar) of the 15
common-regime regions (comunidades autónomas de régimen común).

- **Combination**: `generalGrossTax = stateScaleTax(BLG) + regionalScaleTax(BLG)` (cuota
  íntegra general over the base liquidable general, BLG), with no 0.5 factor. Each tax is
  independent: `scaleTax(BLG) − scaleTax(minimum)`, floored at zero separately.
- **No "the region did not legislate" branch**: since 2011 the fallback application of the state
  rules to the regional rate no longer applies, and all 15 regions have their own scale.
- **Savings base (base del ahorro)**: not a regional competence (arts. 66.1 and 76 LIRPF; it is
  set by state law), so it is not parameterised by region.
- **Sources**: AEAT, Manual práctico de Renta 2025 (updated in March 2026), chapter 15
  "Gravamen autonómico"; cross-checked against Hacienda, _Tributación Autonómica. Medidas 2026_
  (29/04/2026), which confirms that no region changed its 2026 scale from 2025: they hold for
  both tax years.
- **Canarias, last bracket**: Hacienda's Annex I says 26% for a taxable base above €121,200
  (original: «26 % para BL > 121.200 €»), but the text is identical in the Medidas 2025 and
  2026 PDFs, boilerplate that predates the 2.1% deflation (121,200 × 1.021 = 123,745.2). The
  right value is €123,745, which is what the AEAT gives. Do not "fix" it to 121,200.
- **Regional minimums**: tax year 2025 amounts (AEAT, "Cuadro comparativo de los importes de los
  mínimos personales y familiares, estatal y autonómicos para 2025", 17/03/2026). Hacienda
  confirms that in 2026 the same regions exercise the competence on the same terms, but it does
  not publish 2026 amounts and the Renta 2026 manual does not exist yet: continuity is
  reasonable but unverified. Declared gap. The amounts per age bracket are cumulative totals,
  not increments. Neither the increase for ascendants over 75 nor third-party care expenses are
  modelled.
- **Illes Balears without its own minimum, on purpose**: the AEAT table says "€5,550 a year,
  in general. €6,105 a year if over 65 + €1,265 a year, over 65 + 1,540 more, over 75"
  (original: «5.550 euros anuales, en general. 6.105 euros anuales si tiene más de 65 años +
  1.265 euros anuales, mayor de 65 años + 1.540 adicionales, mayor de 75») and is ambiguous
  about whether 6,105 replaces 5,550 or adds to the +1,265. Before coding it, read art. 1 of
  the Balearic consolidated text (Decreto Legislativo 1/2014). Until then the state minimum is
  used: better a declared gap than a made-up number.
- **La Rioja without its own minimum**: it only changes the minimum for descendants with a
  disability (3,300 / 9,900), which the calculators do not model (only the taxpayer's own
  disability, where it keeps the state amounts).
- **Unsupported territories**: shown disabled in the selector instead of omitted, because
  someone who does not see their territory assumes the generic result applies to them.
  - Foral regime (régimen foral: Álava, Bizkaia, Gipuzkoa, Navarra): Concierto/Convenio
    Económico with their own law. Their scale is the whole tax, not a half added to the state
    one, and the Basque Country has three scales (one per territory). There is no foral figure
    in the module.
  - Ceuta and Melilla: their scale is the default one (art. 65 LIRPF), but the deduction for
    income earned there (art. 68.4 LIRPF, 60%) is not modelled, and it dominates the result;
    giving the tax without it would mislead.
- **Limitations**: regional deductions are not modelled (≈358 in force).

## `plusvalias.ts`

Capital gains and losses (ganancias y pérdidas patrimoniales) from transfers of homogeneous
securities (valores homogéneos): FIFO lot matching (the tax lives separately in
`savings-tax.ts`). It is used by the "what if I sell?" simulation and by the realised-gains
report (`realised-gains.ts`), with the same rules.

**Models**

- Mandatory FIFO for homogeneous securities: art. 37.2 Ley 35/2006 (listed securities) and
  art. 37.1.b (units in collective investment undertakings, IIC). Neither lot picking nor
  average cost.
- Acquisition value = amount + purchase costs and fees (art. 35.1); a lot's fees are prorated
  across its remaining units.
- Transfer value = amount received − sale costs and fees (art. 35.2).
- **Bonus issues (ampliaciones liberadas)** (art. 37.1.a LIRPF): the total cost of the old
  shares is spread across old and new shares, and the new ones inherit the holding period of
  the old ones. A purchase at **price 0 and with no fees** is read as fully paid-up bonus shares
  (that is how Trade Republic exports them, `BONUS_ISSUE`) and `walkLots` spreads it
  proportionally across the lots open at that moment (only if the price is a genuine 0: a
  non-numeric price, sanitised to 0, stays an ordinary purchase): each lot gains shares and
  keeps its total cost and its date (and its FIFO order). With this, the gain matches the
  example in the Manual práctico de Renta 2025 (Part 1, pp. 885-887: 900 shares from 2001 + 600
  bonus shares + 500 partly paid-up shares from 2011; sale of 1,600 at €10 → 6,000 + 500 =
  €6,500). Assumptions: **partly paid-up** bonus shares (something is paid) are not told apart
  from an ordinary purchase and stay a purchase; with no open lots, a purchase at price 0 is an
  ordinary purchase. It also affects `simulateSale` and `buildOpenLots`. Pending review by the
  tax adviser: a manual purchase at 0 (a gift, a typo) is spread as well; the complete fix is an
  explicit bonus-issue flag written by the importer. Source: Ley 35/2006, art. 37.1.a,
  https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764

**Does not model** (indicative result only)

- The two-month rule in the sale simulation (`simulateSale` looks at the sale in isolation); the
  annual report does apply it, through `wash-sale.ts`.
- Offsetting against other gains and losses: the simulation looks at the sale in isolation, so a
  loss gives a tax of 0 instead of the actual tax saving. (The annual report does offset the
  sales of the same tax year.)
- The rest of the savings base (dividends, interest, other sales), which can push the gain into
  a higher bracket.
- Withholding, reduction coefficients (coeficientes de abatimiento, DT 9ª), non-residents,
  tax-deferred fund switches (traspasos, art. 94) and foral specifics.

## `fx-reference.ts`

ECB reference exchange rate in force on a date, to convert foreign-currency transactions to
euros. The API (`apps/api/src/fx-reference/`) downloads and caches the series from the ECB Data
Portal (series `EXR.D.<CURRENCY>.EUR.SP00.A`), which are the rates published by the Banco de
España.

- **Holidays and weekends:** the ECB does not publish; the last publication before the date
  applies. If the last one is more than `MAX_RATE_GAP_DAYS` (7) days old, it is not a holiday
  but a missing series, and there is no rate (better no figure than a rate that does not
  belong to the date).
- **No later publication:** a rate from a day after the transaction is never used.
- **Before 1999** there is no series (the euro was born on 4 January 1999).

## `realised-gains.ts`

Annual report of realised gains and losses: sales already recorded, matched by FIFO
(`walkLots`), converted to euros, grouped by tax year and offset within it.

**Models**

- FIFO, acquisition and transfer values with fees (see `plusvalias.ts`).
- FIFO per security, not per position: the rule applies to all of the taxpayer's units,
  whatever broker they are held at. If the same symbol is in two positions, a sale in either
  matches the oldest purchase of the two first; each sale is attributed to the position where
  it was recorded.
- Netting and offsetting within the tax year (integración y compensación, art. 49.1.b LIRPF):
  gains and losses of the same year are added up and the tax is estimated on the balance if it
  is positive.
- **Foreign-currency securities (DGT criterion):** the gain is computed in the currency the
  securities are denominated in, and the difference is converted to euros at the rate in force
  on the sale date. The transfer and acquisition values are converted at that same rate, so
  their difference is the gain. Sources: binding rulings V2422-20, V0706-22 and V0152-26
  (27/01/2026), which repeat word for word the criterion of a ruling of 6 July 2017: the
  calculation must be done in the currency the shares are denominated in, converting the
  resulting difference to euros at the exchange rate in force on the date of the capital
  change (original: «debiendo efectuarse dicho cálculo en la moneda en que se encuentren
  denominadas las acciones y efectuar la conversión de la diferencia resultante a euros al tipo
  de cambio vigente en la fecha en la que haya tenido lugar la alteración patrimonial»).
- **FX differences (diferencias de cambio):** converting the currency to euros is a separate
  gain or loss (art. 33 LIRPF; V2466-08, cited in V0152-26), for the difference between what
  the currency cost and what is received for it. The report computes it per sold lot as
  `acquisition / sale rate − acquisition / purchase rate`, **assuming the currency was bought on
  the purchase date and converted to euros on the sale date** (what a broker with a euro
  account does). Under that assumption, gain + FX difference is exactly converting each
  transaction at the rate of its own date (a property test checks it). If the user keeps the
  currency in an account, the difference is recognised when they convert it (art. 14.2.e LIRPF)
  and the report cannot know it: it warns about it on screen.
- **Two-month rule** (`wash-sale.ts`): the deferred loss does not count in the tax year of its
  sale (`deferred`, `eur.deferredLoss`) but does in the year of the final sale of the
  repurchased securities (`integrated`, `eur.integratedLoss`); `gains`, `losses`, `net`, `total`
  and `tax` already reflect the rule (`computableGain = gain − deferredLoss + integratedLoss`).
  The loss is converted to euros at the rate of the day of the sale that caused it and is
  integrated for that amount, not at the rate of the later sale (if that sale has no rate, the
  integrating sale's rate is used). The FX difference is not a transfer of securities and is not
  deferred. Derivatives (`isDerivative`) are not grouped with a share of the same symbol, but
  they are subject to the rule: the ones in the portfolio are warrants and certificates with an
  ISIN, which are transferable securities (DGT V1790-07); V2172-21 and V3755-16 only exclude
  contracts such as options and futures (which Sextante does not tell apart: declared
  limitation). A sale without a rate for its date (`unconverted`) is left out of the totals,
  including the deferred amounts.
- **No rate for the sale date** (a currency the ECB does not publish, series unavailable): the
  sale goes to `unconverted`, in its currency and out of the totals and the tax. **No rate for
  some purchase** (before 1999): the gain is converted but the FX difference is not
  (`fxIncomplete`).

**Does not model** (the report warns about it on screen)

- Offsetting against capital income (rendimientos del capital mobiliario) (25%) and carrying
  forward negative balances from the four previous tax years are not here: `savings-base.ts`
  does them on this report's balance and the income payments (`savings-return.ts`).
- Fees in a currency other than the position's: they are assumed to be in the position's
  currency, like the lot's other amounts.

## `wash-sale.ts`

Two-month rule (art. 33.5.f LIRPF): losses from transferring securities admitted to trading are
not computed if the taxpayer acquires homogeneous securities in the two months before or after;
the loss is integrated as the repurchased securities are transferred for good. (For unlisted
securities the period is one year: out of scope, everything is treated as listed.)
`computeWashSales(lots, walk?)` is pure, works in the position's currency and receives the
history of one security and its `walkLots(lots, { trackOpenLots: true })`; it returns, per
sale, the deferred loss (`deferredLoss`, ≤ 0), the blocked shares and what is integrated
(`integratedLoss`, with its originating sale).

**Criteria (interpretations)**

- **"Date to date" window** (art. 5.1 Código Civil), both ends included: sale on 16/07 → from
  16/05 to 16/09. If the target month has no such day, its last day (31/12 + 2 months →
  28/02). A purchase on 16/09 blocks; one on 17/09 does not. Same rule backwards (16/05 yes,
  15/05 no).
- **Which purchases block:** those in the window whose shares are still held after the sale
  (earlier ones) or do not exist yet (later ones). Shares sold in the transaction itself do not
  count. Bonus issues are not purchases. A purchased share blocks at most once.
- **Proportionality:** each FIFO piece of the sale is analysed, and only those with a loss; if
  fewer shares are repurchased than were sold at a loss, `loss × repurchased / sold at a loss`
  is deferred. With several sales, they are handled in chronological order and each one
  consumes the oldest purchases in its window first.
- **Integration:** selling shares that block a loss releases the part proportional to what was
  sold (FIFO). It is only integrated if that transfer is "definitive" (Manual: a transfer is
  considered definitive when no homogeneous securities are acquired again in the two months
  before or after it; original: «Una transmisión se considerará definitiva cuando, en los dos
  meses anteriores o posteriores a ella, no se adquieran nuevamente valores homogéneos»); if
  there is another repurchase, the proportional part moves to the new shares, keeping its
  originating sale.
- **Derivatives:** subject to the rule if they are transferable securities (warrants,
  certificates, turbos with an ISIN: V1790-07); contracts such as options and futures are not
  (V2172-21, V3755-16). Sextante does not tell them apart and applies the rule to all of them:
  its imported derivatives are Trade Republic warrants and certificates.
- **Sources:** Ley 35/2006, art. 33.5.f,
  https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764 ; AEAT, Manual práctico de Renta 2025,
  ch. 11 «Pérdidas patrimoniales que no se computan como tales»,
  https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c11-ganancias-perdidas-patrimoniales/ganancias-perdidas-patrimoniales-que-no-bi/perdidas-patrimoniales-que-no-se-tales.html
  (the text box with the Manual quotes was verified; the T.S.A. worked example (1,000 shares,
  16/07/2025, €12,000 against €16,800, repurchase on 16/08/2025) is reproduced as a test as it
  appears in the brief, without having been able to locate its text on that page).

**Does not model:** unlisted securities (one-year period), nor telling apart homogeneous
securities that do not share symbol and currency (e.g. one company with two listings).

## `income.ts`

Capital income for the tax year (art. 25 LIRPF): dividends, interest and broker rewards
(saveback, stockperk), with their gross amount and their withholding.

- **Rewards as interest:** Trade Republic reports them in the account-interest box with 19%
  withholding (its 2025 tax reports, German and Spanish periods). We follow that criterion; the
  purchase they are invested in enters at its cost.
- **Already in the draft return (borrador):** what the payer reported to the AEAT
  (`reportedToAeat`) is kept apart from what has to be added by hand. At Trade Republic, that is
  everything after custody moved to its Spanish branch, which withholds and reports on forms
  187, 189, 193 and 196.
- **Currency:** each payment is converted at the ECB rate of its payment date
  (`fx-reference.ts`).
- **Provenance (`ValueSource`):** each figure says where it comes from: `broker` (as is in the
  file), `derived` (arithmetic on it), `market` (market dividend per share), `estimate` (the
  country's statutory rate, unconfirmed) or `manual`. An estimate is never presented as exact:
  the screen flags it and counts it separately.

## `dividend-resolution.ts`

Splits an imported dividend into gross amount, withholding at source and Spanish withholding,
in layers.

1. **Broker** (`resolveFromBroker`). The Trade Republic export changes meaning depending on the
   period and the issuer; it is told apart by the `tax/amount` ratio (verified against its 2025
   tax reports: Spanish period exact to the cent):
   - before the Spanish branch, `amount` is the gross amount and `tax` the withholding at source;
   - afterwards, Spain withholds 19% of the amount received net of source withholding. If
     `tax/amount` ≈ 19%, the payment arrived net of source withholding and `tax` is only the
     Spanish one (ASML); if ≈ source + 19% of the rest, `amount` is the gross amount and `tax`
     adds up both (US with W-8BEN, 15%).
   - **Base of the 19%:** the amount net of withholding at source. Set by DGT rulings V2505-10
     and V2506-10 (with the TEAC decision of 25/09/2008), which replace the earlier criterion of
     V1491-08 (gross amount); the AEAT explains it the same way in "Obtención de dividendos
     procedentes de otro país" and it is what Trade Republic applies.
   - Grossing up a net amount with an assumed rate (Netherlands 15%) is an **estimate**.
2. **Market** (`resolveWithMarket`): shares × market dividend per share (Yahoo, without the
   adjustment for later splits), in the payment currency. If it matches what was paid, the
   broker gave the gross amount; if it is larger, the difference is the withholding at source,
   whatever the country. The comparison is made in the payment currency and the derived figures
   are converted to euros at the broker's implied rate, so that gross, withholdings and net add
   up. A figure lower than what was paid, or one implying withholding above 40%, is discarded.
   Only the quote in the payment currency is used.
3. **Estimate** (`estimateWithStatutoryRate`): with no market data, the rate the country
   withholds by law, with its source, flagged as an estimate.

**Does not model:** withholding at source recovered later (refunds from Switzerland,
Germany…), nor dividends from securities with no market data in the payment currency (they stay
as an estimate or unknown, with a warning).

## `countries.ts`

Single registry, per country (ISO 3166-1 alpha-2) and **in %**, of dividend rates: the treaty
rate (`treatyPct`), the withholding the country actually applies (`statutory`, with its source)
and the one the broker applies (`brokerAppliedPct`). `TREATY_DIVIDEND_RATES` (in %),
`STATUTORY_DIVIDEND_WITHHOLDING` and the broker table in `dividend-resolution.ts` (as fractions)
are views of this registry, each with its unit at the edge. It also defines
`SPAIN_SAVINGS_WITHHOLDING_PCT` (19%, art. 90 RIRPF), used by the dividend resolution and the
calculators' default value.

## `withholding-rates.ts`

Withholding each country actually applies to the dividends of an individual resident in Spain.
It only serves to **estimate** the withholding at source when both the broker figure and the
market figure are missing; whatever comes out of here is flagged as an estimate and the screen
warns about it.

- Per-country sources in `countries.ts`: IRS, AEAT, Vero, issuer notices and, above all, PwC
  Worldwide Tax Summaries (a secondary source: medium confidence). The tax authorities of
  Germany, Switzerland, the Netherlands, Italy, Norway, Canada and Japan could not be consulted.
- Left out: Ireland (25%, or 0% with a non-resident declaration) and Australia (30% or 0%
  depending on whether the dividend is "franked"): the rate depends on a fact we do not have.
- Different from the treaty (`double-taxation.ts`): what is withheld above the treaty rate is
  not deductible in Spain and is reclaimed at source (Switzerland 35% → 15%, Germany 26.375% →
  15%).

## `tax-boxes.ts`

Boxes (casillas) of form 100 (modelo 100) in which each figure is reported. They change every
tax year: a year without a verified table is shown without box numbers, never with another
year's.

- **2025:** Orden HAC/277/2026, de 25 de marzo (BOE-A-2026-7041), numbers read from the form
  itself; the capital-income boxes and 0597 cross-checked against the Manual práctico de
  Renta 2025. Shares per issuing entity (0326-0340: transfer value 0328 and acquisition value
  0331, aggregate amounts per entity); funds and ETFs not subject to withholding (2224-2236);
  IIC with withholding (0310-0325, when the Spanish custodian withholds on redemption); other
  assets (1624-1654).
- **Derivatives:** the form does not name them. They go under other assets: the DGT sends
  warrants to "otras ganancias y pérdidas patrimoniales" (V1790-07) and Trade Republic puts them
  there in its tax report. The key for block (4) is by exclusion: low confidence.
- **Funds and ETFs:** the IIC of art. 75.3.j RIRPF (ETFs) go in 2224-2236 even if the custodian
  has withheld: the title of block 0310-0325 expressly excludes them.
- **Double taxation:** only the aggregate amount (0588); the per-country breakdown is not in
  the Orden.

## `savings-base.ts`

Netting and offsetting of the savings tax base (base imponible del ahorro). Pure and text-free:
it returns figures and the trace of each offset.

- **What it models** (arts. 46, 48 and 49 LIRPF): two groups, capital gains and losses from
  transfers (art. 49.1.b) and capital income (art. 49.1.a). A negative balance is offset
  against the positive balance of the **other** group up to **25%** of that positive balance
  (limit in force since 2018). What does not fit stays pending for **four years** "in the same
  order set out in the previous paragraphs" («en el mismo orden establecido en los párrafos
  anteriores», art. 49.1): first against the positive balance of its own group and then against
  the other's with the 25%. It is offset "for the maximum amount each tax year allows" («en la
  cuantía máxima que permita cada uno de los ejercicios», art. 49.2). Balances originating
  before `tax year − 4` expire.
- **Order applied** (Manual práctico de Renta 2025, ch. 12 and its worked example): first the
  current tax year's negative balance against the other group; then all pending balances
  against their own group (no percentage limit), from oldest to newest; and finally, with what
  is left, against the other group. The 25% is a single allowance per positive group (on its
  positive balance for the tax year before offsetting), shared by the current tax year and the
  carry-forwards ("joint limit", per the manual). No source sets the order between pending
  balances of the same group from different years: oldest first, so that as little as possible
  expires.
- The tax on the resulting base is computed by `savingsTax` (`savings-tax.ts`).
- **Does not model**: the art. 55 LIRPF reduction (remainder that reduces the savings base,
  art. 50.2), deductions or exempt income. A test reproduces the worked example of chapter 12
  of the Manual práctico de Renta 2025 (savings base of €200).
- **Sources**: Ley 35/2006, arts. 46, 48, 49 and 50.2 (art. 49 as worded by Ley 26/2014, de 27
  de noviembre), https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764

## `savings-tax.ts`

The single implementation of the savings-scale tax (`IRPF_SAVINGS_SCALE`, arts. 66 and 76
LIRPF).

- `savingsTax(base)`: gross tax liability (cuota íntegra) and average effective rate in %
  (`null` with base 0). Used by the savings base of the tax return report (`savings-return.ts`).
- `estimateSavingsTax(gain)`: the tax on an isolated gain (a loss gives 0), with the average and
  marginal rates; it relies on `savingsTax`. Used by the sale simulator and the summary in
  `realised-gains.ts`.

## `report-inputs.ts`

Tax report inputs shared by the web app, the API (`TaxReturnService`) and MCP, so that all
three channels build it the same way: `toRealisedGainsPositions` distributes the transactions
among their positions and `referenceRatesRequest` merges the ECB rates that sales and income
payments need.

## `double-taxation.ts`

> Cross-check of 2026-10-03: the DGT table dates from 2018. Japan is at 5% (BOE-A-2021-2977).
> Ireland, 0%: art. 10.1.c) of its treaty exempts the Spanish resident at source (the table's
> 15% is letter b, the tax-credit regime); what is withheld there is not deductible in Spain and
> is reclaimed from Revenue (form V2A), the principle of ruling V0220-12. Denmark (no treaty
> since 2009) and the Cayman Islands have no treaty: everything paid is creditable, up to the
> average rate. The average rate used is the savings-scale one; the art. 80.2 one is total net
> tax liability (cuota líquida) × (savings gross tax / total gross tax) / savings taxable base
> (example in the Manual de Renta 2025, ch. 18), which requires the general base, which
> Sextante does not know.

Foreign tax credit (deducción por doble imposición internacional, art. 80 LIRPF) for foreign
dividends. Pure: warnings are codes (`origin_unknown`, `no_treaty_rate`, `excess_withholding`)
with country and amount.

- **What it models**: credit = min(a) tax paid abroad, b) average effective rate × income taxed
  abroad), art. 80.1, **country by country** and summed. The law does not say whether limit b)
  applies per country or in aggregate; art. 80.1.a) speaks of the tax "on said income" («sobre
  dichos rendimientos»: income by income, as the DGT does in V2393-25) and nothing allows
  offsetting one country's excess with another's headroom. Aggregating would give the same or
  more: the per-country criterion is the prudent one (medium confidence). Per country, the
  creditable amount is min(withholding, treaty rate × gross); withholding above the treaty rate
  is returned as `excessReclaimable` (reclaimed at source, not deductible in Spain). The
  average rate is rounded to two decimals (art. 80.2).
- **`TREATY_DIVIDEND_RATES` table** (view of `countries.ts`): the «General» dividend rate from
  the DGT table (update of 01/01/2018), only countries with a single rate and no footnote. It
  does not include the parent-subsidiary clause or treaty changes after 2018. Review when the
  tax year changes.
- **Prudence**: without a confirmed rate in the table (country with no treaty or not verified)
  nothing is deducted and a warning is raised. The same with unknown withholding.
- **Simplifications**: the art. 80.2 average effective rate is total net tax liability /
  taxable base; here the savings-scale one is received (gross tax / base, `savingsTax`), with
  no deductions. Limit b) uses the gross amount of all foreign income, without deducting
  expenses. It does not model foreign interest, royalties or gains, nor the actual refund at
  source.
- **Sources**: Ley 35/2006, art. 80,
  https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764 ; DGT, «Límites de imposición
  sobre dividendos, intereses y cánones resultantes de los CDI»,
  https://www.hacienda.gob.es/SGT/NormativaDoctrina/Tributaria/CDI/Documentacion/Limites_Imposicion_CDI.pdf
