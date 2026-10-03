"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { TAX_CURRENCY } from "@sextante/core/fiscal/fx-reference";
import type { RealisedGainsRow, RealisedGainsYear } from "@sextante/core/fiscal/realised-gains";
import type { TaxBoxes } from "@sextante/core/fiscal/tax-boxes";
import { ASSET_CLASSES, type AssetClass } from "@sextante/core/portfolio/types";
import { setAssetClass } from "@/features/portfolio/api";
import { useApiMutation } from "@/shared/api/use-api-mutation";
import { useFormat } from "@/shared/format/use-format";
import CopyValue from "@/shared/ui/CopyValue";
import { inputClass } from "@/shared/ui/field-classes";
import Notice from "@/shared/ui/Notice";
import { formatTaxBox } from "@sextante/core/money";

/** Bloques de la declaración en que van las ventas, en el orden del modelo 100. */
type Block = "shares" | "funds" | "other" | "unclassified";

const BLOCK_OF: Record<AssetClass, Block> = { stock: "shares", fund: "funds", derivative: "other", other: "other" };
const BLOCKS: readonly Block[] = ["shares", "funds", "other", "unclassified"];

const signColor = (value: number) => (value > 0 ? "text-success" : value < 0 ? "text-danger" : "text-foreground");

type Props = {
  year: RealisedGainsYear;
  showFx: boolean;
  assetClasses: Readonly<Record<string, AssetClass | null>>;
  boxes: TaxBoxes | null;
};

/**
 * Ventas del ejercicio en euros, agrupadas por el bloque de la declaración en que se declaran:
 * acciones admitidas a negociación (por entidad), fondos y ETF, y otros elementos patrimoniales
 * (derivados). Cada importe lleva su casilla y un botón para copiarlo.
 */
export default function SalesBlocks({ year, showFx, assetClasses, boxes }: Props) {
  const t = useTranslations("portfolio.realisedGains");
  const { formatCurrency } = useFormat();
  const eur = (value: number) => formatCurrency(value, TAX_CURRENCY);
  const signed = (value: number) => `${value > 0 ? "+" : ""}${eur(value)}`;

  const byBlock = new Map<Block, RealisedGainsRow[]>();
  for (const row of year.rows) {
    const assetClass = assetClasses[row.positionId] ?? null;
    const block = assetClass ? BLOCK_OF[assetClass] : "unclassified";
    byBlock.set(block, [...(byBlock.get(block) ?? []), row]);
  }

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold text-foreground">{t("salesTitle")}</h2>

      <dl className={`grid grid-cols-1 gap-4 ${showFx ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted">{t("gains")}</dt>
          <dd className="text-lg font-semibold tabular-nums text-success">{eur(year.gains)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted">{t("losses")}</dt>
          <dd className="text-lg font-semibold tabular-nums text-danger">{eur(year.losses)}</dd>
        </div>
        {showFx && (
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted">{t("fxDifference")}</dt>
            <dd className={`text-lg font-semibold tabular-nums ${signColor(year.fxDifference)}`}>
              {signed(year.fxDifference)}
            </dd>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted">{t("net")}</dt>
          <dd className={`text-lg font-semibold tabular-nums ${signColor(year.total)}`}>{signed(year.total)}</dd>
        </div>
      </dl>

      {!boxes && <p className="text-xs text-muted">{t("noBoxes", { year: year.year })}</p>}

      {BLOCKS.filter((block) => byBlock.has(block)).map((block) => (
        <BlockTable
          key={block}
          block={block}
          rows={byBlock.get(block) ?? []}
          showFx={showFx}
          boxes={boxes}
          eur={eur}
          signed={signed}
        />
      ))}
    </section>
  );
}

function BlockTable({
  block,
  rows,
  showFx,
  boxes,
  eur,
  signed,
}: {
  block: Block;
  rows: readonly RealisedGainsRow[];
  showFx: boolean;
  boxes: TaxBoxes | null;
  eur: (value: number) => string;
  signed: (value: number) => string;
}) {
  const t = useTranslations("portfolio.realisedGains");
  const { formatQuantity } = useFormat();
  // Casillas de valor de transmisión y de adquisición del bloque, si el modelo las da por valor.
  const columns = block === "shares" ? boxes?.shares : block === "funds" ? boxes?.fundsWithoutWithholding : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold text-foreground">{t(`blocks.${block}.title`)}</h3>
        <p className="text-xs text-muted">
          {t(`blocks.${block}.note`, {
            shares: boxes
              ? `${boxes.shares.entity}, ${boxes.shares.transferValue}, ${boxes.shares.acquisitionValue}`
              : "—",
            funds: boxes
              ? `${boxes.fundsWithoutWithholding.transferValue}, ${boxes.fundsWithoutWithholding.acquisitionValue}`
              : "—",
            other: boxes?.otherAssets ?? "—",
          })}
        </p>
      </div>
      {block === "unclassified" && <Notice variant="warning">{t("unclassifiedNotice")}</Notice>}

      {/* En pantallas estrechas, una tarjeta por valor: la tabla obligaría a deslizar para ver las cifras. */}
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border sm:hidden">
        {rows.map((row) => (
          <li key={row.positionId} className="flex flex-col gap-2 p-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="min-w-0">
                <EntityName row={row} entityBox={block === "shares" ? boxes?.shares.entity : undefined} />
              </span>
              <span className={`font-semibold tabular-nums ${signColor(row.gain)}`}>{signed(row.gain)}</span>
            </div>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted">
                {t("transferValue")}
                {columns && ` · ${t("box", { box: columns.transferValue })}`}
              </dt>
              <dd className="text-right tabular-nums text-foreground">
                {eur(row.transferValue)}
                <CopyValue value={formatTaxBox(row.transferValue)} label={`${row.ticker} ${t("transferValue")}`} />
              </dd>
              <dt className="text-muted">
                {t("acquisitionValue")}
                {columns && ` · ${t("box", { box: columns.acquisitionValue })}`}
              </dt>
              <dd className="text-right tabular-nums text-foreground">
                {eur(row.acquisitionValue)}
                <CopyValue
                  value={formatTaxBox(row.acquisitionValue)}
                  label={`${row.ticker} ${t("acquisitionValue")}`}
                />
              </dd>
              {showFx && row.currency !== TAX_CURRENCY && (
                <>
                  <dt className="text-muted">{t("fxDifference")}</dt>
                  <dd className={`text-right tabular-nums ${signColor(row.fxDifference)}`}>
                    {signed(row.fxDifference)}
                  </dd>
                </>
              )}
            </dl>
            <WashSaleNote row={row} eur={eur} />
            {block === "unclassified" && <ClassifySelect positionId={row.positionId} ticker={row.ticker} />}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <caption className="sr-only">{t(`blocks.${block}.title`)}</caption>
          <thead>
            <tr className="border-b border-border text-muted">
              <th scope="col" className="px-3 py-2 font-medium">
                {t("position")}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {t("quantity")}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {t("transferValue")}
                {columns && (
                  <span className="block text-xs font-normal">{t("box", { box: columns.transferValue })}</span>
                )}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {t("acquisitionValue")}
                {columns && (
                  <span className="block text-xs font-normal">{t("box", { box: columns.acquisitionValue })}</span>
                )}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {t("gain")}
              </th>
              {showFx && (
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("fxDifference")}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.positionId} className="border-b border-border last:border-0">
                <th scope="row" className="px-3 py-2 font-normal">
                  <EntityName row={row} entityBox={columns === boxes?.shares ? boxes?.shares.entity : undefined} />
                  {row.sales > 1 && (
                    <span className="block text-xs text-muted">{t("salesCount", { count: row.sales })}</span>
                  )}
                  {block === "unclassified" && <ClassifySelect positionId={row.positionId} ticker={row.ticker} />}
                </th>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatQuantity(row.quantity)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                  {eur(row.transferValue)}
                  <CopyValue value={formatTaxBox(row.transferValue)} label={`${row.ticker} ${t("transferValue")}`} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                  {eur(row.acquisitionValue)}
                  <CopyValue
                    value={formatTaxBox(row.acquisitionValue)}
                    label={`${row.ticker} ${t("acquisitionValue")}`}
                  />
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${signColor(row.gain)}`}>{signed(row.gain)}</td>
                {showFx && (
                  <td className={`px-3 py-2 text-right tabular-nums ${signColor(row.fxDifference)}`}>
                    {row.currency === TAX_CURRENCY ? "—" : signed(row.fxDifference)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Denominación del valor primero (es lo que pide Renta WEB, casilla de entidad emisora en
 * acciones), con su botón de copiar; debajo, el símbolo o ISIN y la divisa.
 */
function EntityName({ row, entityBox }: { row: RealisedGainsRow; entityBox: string | undefined }) {
  const t = useTranslations("portfolio.realisedGains");
  const name = row.name ?? row.ticker;
  return (
    <>
      <span className="font-medium text-foreground">{name}</span>
      <CopyValue value={name} label={entityBox ? t("box", { box: entityBox }) : name} />
      <span className="block text-xs text-muted">
        {row.name ? row.ticker : null}
        {row.currency !== TAX_CURRENCY && `${row.name ? " · " : ""}${row.currency}`}
        {entityBox && ` · ${t("box", { box: entityBox })}`}
      </span>
    </>
  );
}

/**
 * Pérdidas que la regla de los dos meses deja sin computar (o integra) en esta entidad: Renta WEB
 * separa el importe obtenido del computable, así que hay que verlas valor a valor.
 */
function WashSaleNote({ row, eur }: { row: RealisedGainsRow; eur: (value: number) => string }) {
  const t = useTranslations("portfolio.realisedGains");
  if (row.deferredLoss >= 0 && row.integratedLoss >= 0) return null;
  return (
    <span className="block text-xs text-warning">
      {row.deferredLoss < 0 && t("rowDeferred", { amount: eur(-row.deferredLoss) })}
      {row.deferredLoss < 0 && row.integratedLoss < 0 && " · "}
      {row.integratedLoss < 0 && t("rowIntegrated", { amount: eur(-row.integratedLoss) })}
    </span>
  );
}

/** Clasificar en el sitio una posición sin clase de activo; al guardar, se recalcula la página. */
function ClassifySelect({ positionId, ticker }: { positionId: string; ticker: string }) {
  const t = useTranslations("portfolio.realisedGains");
  const router = useRouter();
  // Controlado: tras un fallo vuelve al placeholder en vez de seguir mostrando una clase que no
  // se guardó.
  const [selected, setSelected] = useState<AssetClass | "">("");
  const save = useApiMutation();
  // El refresco va en una transición: el selector sigue ocupado hasta que la venta cambia de bloque.
  const [refreshing, startTransition] = useTransition();

  async function classify(value: AssetClass) {
    setSelected(value);
    const result = await save.run(() => setAssetClass(positionId, value));
    if (result.ok) startTransition(() => router.refresh());
    else setSelected("");
  }

  return (
    <span className="mt-1 flex flex-col gap-1 print:hidden">
      <select
        aria-label={t("classifyLabel", { ticker })}
        value={selected}
        disabled={save.status === "pending" || refreshing}
        onChange={(e) => void classify(e.target.value as AssetClass)}
        className={`${inputClass} h-8 text-xs`}
      >
        <option value="" disabled>
          {t("classifyPlaceholder")}
        </option>
        {ASSET_CLASSES.map((value) => (
          <option key={value} value={value}>
            {t(`assetClasses.${value}`)}
          </option>
        ))}
      </select>
      {save.status === "error" && <span className="text-xs text-warning">{t("classifyError")}</span>}
    </span>
  );
}
