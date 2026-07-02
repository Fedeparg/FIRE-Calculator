"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { computeDeposit } from "@/core/calculators/deposito";
import { useFormat } from "@/lib/format";
import NumberField from "../ui/NumberField";
import Stat from "../ui/Stat";
import BreakdownDonut from "../charts/BreakdownDonut";
import CalculatorLayout from "../CalculatorLayout";

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
export default function DepositLikeCalculator({
  namespace,
  principalKey,
  defaultPrincipal,
  defaultApr,
}: Props) {
  const t = useTranslations(`calc.${namespace}`);
  const { formatEUR } = useFormat();
  const [principal, setPrincipal] = useState(defaultPrincipal);
  const [apr, setApr] = useState(defaultApr);
  const [years, setYears] = useState(1);
  const [withholdingRate, setWithholdingRate] = useState(19);
  const [inflationRate, setInflationRate] = useState(2.5);

  const result = useMemo(
    () => computeDeposit({ principal, apr, years, withholdingRate, inflationRate }),
    [principal, apr, years, withholdingRate, inflationRate],
  );

  return (
    <CalculatorLayout
      inputCount={5}
      inputs={
        <>
          <NumberField label={t(principalKey)} value={principal} onChange={setPrincipal} step={1000} help={t(`help.${principalKey}`)} />
          <NumberField label={t("apr")} value={apr} onChange={setApr} step={0.1} max={100} help={t("help.apr")} />
          <NumberField label={t("years")} value={years} onChange={setYears} step={0.5} help={t("help.years")} />
          <NumberField label={t("withholdingRate")} value={withholdingRate} onChange={setWithholdingRate} step={1} max={100} help={t("help.withholdingRate")} />
          <NumberField label={t("inflationRate")} value={inflationRate} onChange={setInflationRate} step={0.5} max={100} help={t("help.inflationRate")} />
        </>
      }
      results={
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t("finalNet")} value={formatEUR(result.finalNet)} highlight />
            <Stat label={t("realFinalNet")} value={formatEUR(result.realFinalNet)} />
            <Stat label={t("netInterest")} value={formatEUR(result.netInterest)} />
            <Stat label={t("withheld")} value={formatEUR(result.withheld)} />
          </div>

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
