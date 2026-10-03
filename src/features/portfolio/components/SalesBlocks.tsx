"use client";

import { useTranslations } from "next-intl";

import { TAX_CURRENCY } from "@sextante/core/fiscal/fx-reference";
import type { RealisedGainsRow, RealisedGainsYear } from "@sextante/core/fiscal/realised-gains";
import type { TaxBoxes } from "@sextante/core/fiscal/tax-boxes";
import type { AssetClass } from "@sextante/core/portfolio/types";
import { signedTone } from "@/shared/format/signed-tone";
import { useFormat } from "@/shared/format/use-format";
import CopyValue from "@/shared/ui/CopyValue";
import DataTable, { type DataTableColumn } from "@/shared/ui/DataTable";
import Notice from "@/shared/ui/Notice";
import { formatTaxBox } from "@sextante/core/money";
import ClassifySelect from "./ClassifySelect";
import { EntityName, WashSaleNote } from "./SaleRowParts";

/** Tax-return blocks the sales go into, in modelo 100 (Spanish income tax return) order. */
type Block = "shares" | "funds" | "other" | "unclassified";

const BLOCK_OF: Record<AssetClass, Block> = { stock: "shares", fund: "funds", derivative: "other", other: "other" };
const BLOCKS: readonly Block[] = ["shares", "funds", "other", "unclassified"];

type Props = {
  year: RealisedGainsYear;
  showFx: boolean;
  assetClasses: Readonly<Record<string, AssetClass | null>>;
  boxes: TaxBoxes | null;
};

/**
 * Sales for the tax year in euros, grouped by the tax-return block they are declared in: shares
 * admitted to trading (per issuer), funds and ETFs, and other capital assets (derivatives). Each
 * amount carries its box (casilla) and a button to copy it.
 */
export default function SalesBlocks({ year, showFx, assetClasses, boxes }: Props) {
  const t = useTranslations("portfolio.realisedGains");
  const { formatCurrency, formatSignedCurrency } = useFormat();
  const eur = (value: number) => formatCurrency(value, TAX_CURRENCY);
  const signed = (value: number) => formatSignedCurrency(value, TAX_CURRENCY);

  const byBlock = new Map<Block, RealisedGainsRow[]>();
  for (const row of year.rows) {
    const assetClass = assetClasses[row.positionId] ?? null;
    const block = assetClass ? BLOCK_OF[assetClass] : "unclassified";
    const rows = byBlock.get(block);
    if (rows) rows.push(row);
    else byBlock.set(block, [row]);
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
            <dd className={`text-lg font-semibold tabular-nums ${signedTone(year.fxDifference)}`}>
              {signed(year.fxDifference)}
            </dd>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted">{t("net")}</dt>
          <dd className={`text-lg font-semibold tabular-nums ${signedTone(year.total)}`}>{signed(year.total)}</dd>
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
  // Transfer and acquisition value boxes for the block, if the form provides them per security.
  const columns = block === "shares" ? boxes?.shares : block === "funds" ? boxes?.fundsWithoutWithholding : undefined;
  const entityBox = block === "shares" ? boxes?.shares.entity : undefined;
  const boxLabel = (box: string | undefined) =>
    box && <span className="block text-xs font-normal">{t("box", { box })}</span>;
  const copyable = (row: RealisedGainsRow, value: number, label: string) => (
    <>
      {eur(value)}
      <CopyValue value={formatTaxBox(value)} label={`${row.ticker} ${label}`} />
    </>
  );
  const amount = "tabular-nums text-foreground";

  const tableColumns: DataTableColumn<RealisedGainsRow>[] = [
    {
      key: "position",
      header: t("position"),
      rowHeader: true,
      cell: (row) => (
        <>
          <EntityName row={row} entityBox={entityBox} />
          {row.sales > 1 && <span className="block text-xs text-muted">{t("salesCount", { count: row.sales })}</span>}
          {block === "unclassified" && <ClassifySelect positionId={row.positionId} ticker={row.ticker} />}
        </>
      ),
    },
    {
      key: "quantity",
      header: t("quantity"),
      align: "right",
      cellClassName: amount,
      cell: (row) => formatQuantity(row.quantity),
    },
    {
      key: "transfer",
      header: (
        <>
          {t("transferValue")}
          {boxLabel(columns?.transferValue)}
        </>
      ),
      align: "right",
      cellClassName: amount,
      cell: (row) => copyable(row, row.transferValue, t("transferValue")),
    },
    {
      key: "acquisition",
      header: (
        <>
          {t("acquisitionValue")}
          {boxLabel(columns?.acquisitionValue)}
        </>
      ),
      align: "right",
      cellClassName: amount,
      cell: (row) => copyable(row, row.acquisitionValue, t("acquisitionValue")),
    },
    {
      key: "gain",
      header: t("gain"),
      align: "right",
      cellClassName: (row) => `tabular-nums ${signedTone(row.gain)}`,
      cell: (row) => signed(row.gain),
    },
    ...(showFx
      ? [
          {
            key: "fx",
            header: t("fxDifference"),
            align: "right" as const,
            cellClassName: (row: RealisedGainsRow) => `tabular-nums ${signedTone(row.fxDifference)}`,
            cell: (row: RealisedGainsRow) => (row.currency === TAX_CURRENCY ? "—" : signed(row.fxDifference)),
          },
        ]
      : []),
  ];

  /** On narrow screens, one card per security: the table would force scrolling to see the figures. */
  const renderCard = (row: RealisedGainsRow) => (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="min-w-0">
          <EntityName row={row} entityBox={entityBox} />
        </span>
        <span className={`font-semibold tabular-nums ${signedTone(row.gain)}`}>{signed(row.gain)}</span>
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">
          {t("transferValue")}
          {columns && ` · ${t("box", { box: columns.transferValue })}`}
        </dt>
        <dd className="text-right tabular-nums text-foreground">
          {copyable(row, row.transferValue, t("transferValue"))}
        </dd>
        <dt className="text-muted">
          {t("acquisitionValue")}
          {columns && ` · ${t("box", { box: columns.acquisitionValue })}`}
        </dt>
        <dd className="text-right tabular-nums text-foreground">
          {copyable(row, row.acquisitionValue, t("acquisitionValue"))}
        </dd>
        {showFx && row.currency !== TAX_CURRENCY && (
          <>
            <dt className="text-muted">{t("fxDifference")}</dt>
            <dd className={`text-right tabular-nums ${signedTone(row.fxDifference)}`}>{signed(row.fxDifference)}</dd>
          </>
        )}
      </dl>
      <WashSaleNote row={row} eur={eur} />
      {block === "unclassified" && <ClassifySelect positionId={row.positionId} ticker={row.ticker} />}
    </>
  );

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

      <DataTable
        caption={t(`blocks.${block}.title`)}
        columns={tableColumns}
        rows={rows}
        rowKey={(row) => row.positionId}
        minWidthClass="min-w-[44rem]"
        renderCard={renderCard}
      />
    </div>
  );
}
