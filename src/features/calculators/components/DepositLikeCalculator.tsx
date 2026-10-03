"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { SPAIN_SAVINGS_WITHHOLDING_PCT } from "@sextante/core/fiscal/countries";
import { computeDeposit } from "@sextante/core/calculators/deposito";
import { useFormat } from "@/shared/format/use-format";
import NumberField from "@/shared/ui/NumberField";
import Stat from "@/shared/ui/Stat";
import BreakdownDonut from "@/shared/charts/BreakdownDonut";
import CalculatorLayout from "@/features/calculators/components/CalculatorLayout";
import { useNumberField } from "./CalculatorState";
import StatGrid from "@/shared/ui/StatGrid";

type Props = {
  /** i18n namespace ("deposito-plazo-fijo" | "cuenta-remunerada"). */
  namespace: string;
  /** Key of the first field: "principal" (deposit) or "balance" (account). */
  principalKey: "principal" | "balance";
  /** Default initial principal/balance. */
  defaultPrincipal: number;
  /** Default APR ("TAE"; the deposit and the account usually differ). */
  defaultApr: number;
};

/**
 * UI engine shared by the fixed-term deposit and the interest-bearing account: same
 * computation (`computeDeposit`) and same structure; only the labels (namespace), the first
 * field's key and the defaults change. This avoids duplicating the layout across two almost
 * identical calculators.
 */
export default function DepositLikeCalculator({ namespace, principalKey, defaultPrincipal, defaultApr }: Props) {
  const t = useTranslations(`calc.${namespace}`);
  const { formatEUR } = useFormat();
  // The URL key is the field's own ("principal" or "balance"), not a fixed name: that way the
  // shared link describes what each calculator really is.
  const [principal, setPrincipal] = useNumberField(principalKey, defaultPrincipal);
  const [apr, setApr] = useNumberField("apr", defaultApr);
  const [years, setYears] = useNumberField("years", 1);
  const [withholdingRate, setWithholdingRate] = useNumberField("withholdingRate", SPAIN_SAVINGS_WITHHOLDING_PCT);
  const [inflationRate, setInflationRate] = useNumberField("inflationRate", 2.5);

  const result = useMemo(
    () => computeDeposit({ principal, apr, years, withholdingRate, inflationRate }),
    [principal, apr, years, withholdingRate, inflationRate],
  );

  return (
    <CalculatorLayout
      layout="sidebar"
      inputs={
        <>
          <NumberField
            label={t(principalKey)}
            value={principal}
            onChange={setPrincipal}
            step={1000}
            help={t(`help.${principalKey}`)}
          />
          <NumberField label={t("apr")} value={apr} onChange={setApr} step={0.1} max={100} help={t("help.apr")} />
          <NumberField label={t("years")} value={years} onChange={setYears} step={0.5} help={t("help.years")} />
          <NumberField
            label={t("withholdingRate")}
            value={withholdingRate}
            onChange={setWithholdingRate}
            step={1}
            max={100}
            help={t("help.withholdingRate")}
          />
          <NumberField
            label={t("inflationRate")}
            value={inflationRate}
            onChange={setInflationRate}
            step={0.5}
            max={100}
            help={t("help.inflationRate")}
          />
        </>
      }
      results={
        <>
          <StatGrid>
            <Stat label={t("finalNet")} value={formatEUR(result.finalNet)} highlight />
            <Stat label={t("realFinalNet")} value={formatEUR(result.realFinalNet)} />
            <Stat label={t("netInterest")} value={formatEUR(result.netInterest)} />
            <Stat label={t("withheld")} value={formatEUR(result.withheld)} />
          </StatGrid>

          <BreakdownDonut
            title={t("donutTitle")}
            centerLabel={t("donutCenter")}
            data={[
              { name: t("sliceCapital"), value: principal, color: "var(--brand)" },
              { name: t("sliceNet"), value: result.netInterest, color: "var(--accent)" },
              { name: t("sliceTax"), value: result.withheld, color: "var(--muted)" },
            ]}
          />
        </>
      }
    />
  );
}
