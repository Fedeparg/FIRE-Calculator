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
  /** Namespace de i18n ("deposito-plazo-fijo" | "cuenta-remunerada"). */
  namespace: string;
  /** Clave del primer campo: "principal" (depósito) o "balance" (cuenta). */
  principalKey: "principal" | "balance";
  /** Capital/saldo inicial por defecto. */
  defaultPrincipal: number;
  /** TAE por defecto (el depósito y la cuenta suelen diferir). */
  defaultApr: number;
};

/**
 * Motor de UI compartido por el depósito a plazo fijo y la cuenta remunerada:
 * mismos cálculos (`computeDeposit`) y misma estructura, solo cambian las
 * etiquetas (namespace), la clave del primer campo y los valores por defecto.
 * Así no duplicamos la maquetación entre dos calculadoras casi idénticas.
 */
export default function DepositLikeCalculator({ namespace, principalKey, defaultPrincipal, defaultApr }: Props) {
  const t = useTranslations(`calc.${namespace}`);
  const { formatEUR } = useFormat();
  // La clave de la URL es la del campo ("principal" o "balance"), no un nombre fijo: el
  // enlace compartido describe así lo que de verdad es cada calculadora.
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
