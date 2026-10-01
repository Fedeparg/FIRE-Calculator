"use client";

import { useTranslations } from "next-intl";
import {
  REGION_CODES,
  UNSUPPORTED_REGIONS,
  type RegionSelection,
} from "@sextante/core/fiscal/regions";
import SelectField from "../ui/SelectField";

type Props = {
  value: RegionSelection;
  onChange: (value: RegionSelection) => void;
};

/**
 * Selector de comunidad autónoma para las calculadoras de IRPF. Compartido por
 * las cuatro (bruto→neto, retención, autónomos y plan de pensiones) para que la
 * lista, el orden y los avisos sean siempre los mismos.
 *
 * Los territorios forales y Ceuta/Melilla aparecen deshabilitados con el motivo:
 * omitirlos haría creer a quien vive allí que el resultado genérico le sirve.
 */
export default function RegionSelectField({ value, onChange }: Props) {
  const t = useTranslations("region");

  const options = [
    { value: "" as RegionSelection, label: t("none") },
    ...REGION_CODES.map((code) => ({
      value: code as RegionSelection,
      label: t(`name.${code}`),
    })),
    ...UNSUPPORTED_REGIONS.map(({ code, reason }) => ({
      value: code as RegionSelection,
      label: `${t(`name.${code}`)} — ${t(`reason.${reason}`)}`,
      disabled: true,
    })),
  ];

  return (
    <SelectField<RegionSelection>
      label={t("label")}
      value={value}
      options={options}
      onChange={onChange}
      help={t("help")}
    />
  );
}
