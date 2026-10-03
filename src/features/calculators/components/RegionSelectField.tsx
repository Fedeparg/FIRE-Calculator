"use client";

import { useTranslations } from "next-intl";
import { REGION_CODES, UNSUPPORTED_REGIONS, type RegionSelection } from "@sextante/core/fiscal/regions";
import SelectField from "@/shared/ui/SelectField";

type Props = {
  value: RegionSelection;
  onChange: (value: RegionSelection) => void;
};

/**
 * Autonomous community (region) selector for the IRPF (Spanish income tax) calculators. Shared
 * by all four (gross→net, withholding, self-employed and pension plan) so the list, the order
 * and the notices are always the same.
 *
 * The foral territories and Ceuta/Melilla appear disabled with the reason: omitting them would
 * lead someone living there to believe the generic result applies to them.
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
