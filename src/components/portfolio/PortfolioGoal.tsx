"use client";

import { Fragment, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { goalSettingsFromInputs, type GoalOutcome } from "@/core/portfolio-goal-scenario";
import { convertCurrency } from "@sextante/core/fx";
import {
  computeAmountGoal,
  computePortfolioGoal,
  FIRE_CALCULATOR_SLUG,
  GOAL_MODES,
  type GoalMode,
} from "@sextante/core/portfolio-goal";
import { MAX_SCENARIOS_PER_USER, SCENARIO_NAME_MAX_LENGTH } from "@sextante/core/contracts";
import { MAX_YEARS } from "@sextante/core/calculators/fire";
import { FREQUENCIES, type Frequency } from "@sextante/core/projection";
import { useFormat } from "@/lib/format";
import type { SavedScenario } from "@/shared/api/saved-scenarios";
import { useSavedScenarios } from "@/shared/api/use-saved-scenarios";
import Notice from "../ui/Notice";
import NumberField from "../ui/NumberField";
import SelectField from "../ui/SelectField";
import Stat from "../ui/Stat";
import ToggleGroup from "../ui/ToggleGroup";
import PortfolioGoalSimulation from "./PortfolioGoalSimulation";

type Props = {
  /**
   * Valor de mercado de la cartera, en `display`. Es EXACTAMENTE el mismo agregado que muestra
   * el resumen (lo calcula `PortfolioDataProvider` una sola vez): comparar el objetivo con otra cifra
   * daría dos "patrimonios actuales" distintos en la misma pantalla.
   */
  marketValue: number;
  /** Posiciones incluidas en ese total. */
  valued: number;
  /** Posiciones totales: si sobran, parte de la cartera no entra y hay que decirlo. */
  total: number;
  /** Divisa elegida en la cartera. Gobierna también los importes del objetivo. */
  display: string;
  /** USD por unidad de cada divisa, para convertir los importes al cambiar de divisa. */
  rates: Record<string, number>;
};

/** Importes del objetivo, con la divisa en la que se introdujeron o se guardaron. */
type GoalAmounts = { currency: string; annualExpenses: number; contribution: number; targetAmount: number };

/** Aviso sobre la divisa de los importes cuando no coincide con la que se está viendo. */
type CurrencyNote = { kind: "converted" | "notConvertible"; from: string; to: string } | null;

/** Importes ya expresados en la divisa que se está viendo, con el aviso que toque. */
type ShownAmounts = Omit<GoalAmounts, "currency"> & { note: CurrencyNote };

/** Cifra de ejemplo del modo cantidad (en la divisa que se está viendo). */
const DEFAULT_TARGET_AMOUNT = 100000;

/** Redondeo a céntimos: los importes convertidos no deben arrastrar decimales binarios. */
function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * "Tu objetivo": une la calculadora de independencia financiera con la cartera real. El
 * usuario define su gasto anual y su tasa de retiro, y ve el patrimonio objetivo, cuánto lleva
 * de verdad (la valoración de sus posiciones), cuánto le falta y en cuánto tiempo llegaría al
 * ritmo de aportación actual.
 *
 * El cálculo NO vive aquí: es `computePortfolioGoal` (core puro y testeado), que a su vez
 * delega en `computeFire` y en el motor de proyección. Este componente solo es la interfaz.
 *
 * **Divisa.** Los importes del objetivo se expresan siempre en la divisa elegida para el total
 * de la cartera. Al cambiarla, se convierten con las mismas tasas FX que usa el resumen; si
 * falta la tasa, se avisa en vez de comparar importes en divisas distintas.
 *
 * **Persistencia.** Se reutiliza el CRUD de escenarios guardados (`/api/scenarios`) con el slug
 * de la calculadora FIRE: no hace falta almacenamiento nuevo y el objetivo aparece también en
 * la calculadora. Al abrir se carga el plan activo (`activeScenario`, el que enseña el Resumen). Sin sesión válida el bloque sigue calculando en local, simplemente no ofrece
 * guardar.
 */
export default function PortfolioGoal({ marketValue, valued, total, display, rates }: Props) {
  const t = useTranslations("portfolio.goal");
  const tp = useTranslations("portfolio.summary");
  const ts = useTranslations("calculator.scenarios");
  const tf = useTranslations("frequency");
  const { formatCurrency, formatPercent } = useFormat();

  /**
   * Importes del objetivo CON la divisa en la que se introdujeron (o en la que se guardó el
   * escenario). No se reescriben al cambiar la divisa de la cartera: la conversión se DERIVA en
   * cada render (`shown`), que es lo que evita tener que sincronizar estado con un efecto.
   */
  const [amounts, setAmounts] = useState<GoalAmounts>({
    currency: display,
    annualExpenses: 24000,
    contribution: 800,
    targetAmount: DEFAULT_TARGET_AMOUNT,
  });
  const [mode, setMode] = useState<GoalMode>("fire");
  const [targetYears, setTargetYears] = useState(10);
  const [withdrawalRate, setWithdrawalRate] = useState(4);
  const [annualReturn, setAnnualReturn] = useState(5);
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [volatility, setVolatility] = useState(15);
  const [retirementYears, setRetirementYears] = useState(40);

  /**
   * Cambia cada vez que los importes se aplican de golpe (cargar un escenario o convertir de
   * divisa) y sirve de `key` de los campos, forzando su remontaje. Hace falta porque
   * `NumberField` guarda el texto que se está tecleando en un estado propio que solo se
   * inicializa al montar (mismo motivo que en `CalculatorStateProvider`).
   */
  const [version, setVersion] = useState(0);

  // Escenarios guardados de la calculadora FIRE (los mismos que se ven en su página). Un 401
  // (sesión caducada mientras se navegaba) o un fallo de red dejan el bloque calculando en
  // local: la autorización la decide la API, aquí solo se refleja su respuesta.
  const {
    status: listStatus,
    scenarios,
    active,
    error: errorKey,
    create,
    update,
    activate,
  } = useSavedScenarios(FIRE_CALCULATOR_SLUG);
  const canSave = listStatus === "ready";
  const [selectedId, setSelectedId] = useState("");
  /**
   * `inputs` completos del escenario cargado. Se conservan para que al actualizarlo no se
   * pierdan las claves que este bloque no edita (p. ej. el crecimiento del ahorro que sí tiene
   * la calculadora): se guarda el original con los campos de aquí sobrescritos.
   */
  const [loadedInputs, setLoadedInputs] = useState<Record<string, unknown>>({});
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  // Último mensaje de estado (guardado/actualizado/cargado) para la región viva.
  const [status, setStatus] = useState("");

  /**
   * Aplica un escenario guardado. Los importes se guardan en SU divisa (`goalCurrency`, o EUR
   * si viene de la calculadora, que solo trabaja en euros): la conversión a lo que se está
   * viendo la hace `shown`.
   */
  function applyScenario(scenario: SavedScenario) {
    const settings = goalSettingsFromInputs(scenario.inputs);
    setAmounts({
      currency: settings.currency,
      annualExpenses: settings.annualExpenses,
      contribution: settings.contribution,
      targetAmount: settings.targetAmount,
    });
    setMode(settings.mode);
    setTargetYears(settings.targetYears);
    setWithdrawalRate(settings.withdrawalRate);
    setAnnualReturn(settings.annualReturn);
    setFrequency(settings.frequency);
    setVolatility(settings.volatility);
    setRetirementYears(settings.retirementYears);

    setSelectedId(scenario.id);
    setLoadedInputs(scenario.inputs);
    setName(scenario.name);
    setVersion((current) => current + 1);
  }

  // Al terminar la carga inicial se aplica el plan activo (el mismo que enseña la tarjeta del
  // Resumen), una sola vez. Se ajusta durante el render, el patrón de React para derivar
  // estado de un cambio (aquí, del hook), en vez de un efecto que lo sincronice a posteriori.
  const [initialApplied, setInitialApplied] = useState(false);
  if (!initialApplied && listStatus !== "loading") {
    setInitialApplied(true);
    if (active) applyScenario(active);
  }

  /**
   * Importes en la divisa que se está viendo. Es una DERIVACIÓN, no estado sincronizado con un
   * efecto: el estado guarda los importes en su divisa original y aquí se convierten con las
   * mismas tasas FX que usa el total. Si falta la tasa no se inventa nada —se muestran tal cual
   * y `note` lo dice—, en vez de comparar importes de divisas distintas.
   */
  const shown = useMemo<ShownAmounts>(() => {
    const { currency, ...original } = amounts;
    if (currency === display) return { ...original, note: null };
    const expenses = convertCurrency(original.annualExpenses, currency, display, rates);
    const periodic = convertCurrency(original.contribution, currency, display, rates);
    const target = convertCurrency(original.targetAmount, currency, display, rates);
    if (expenses === null || periodic === null || target === null) {
      return { ...original, note: { kind: "notConvertible", from: currency, to: display } };
    }
    return {
      annualExpenses: toCents(expenses),
      contribution: toCents(periodic),
      targetAmount: toCents(target),
      note: { kind: "converted", from: currency, to: display },
    };
  }, [amounts, display, rates]);

  /**
   * Escribir en un importe lo fija en la divisa que se está viendo: se guardan los dos ya
   * convertidos, para no acabar con un campo en euros y el otro en dólares. Si no había tasa
   * (los importes se estaban mostrando sin convertir), editar uno da por hecho que ambos son ya
   * de esta divisa: es lo que significa teclear en un campo etiquetado con ella.
   */
  function updateAmounts(next: Partial<Omit<GoalAmounts, "currency">>) {
    setAmounts({
      currency: display,
      annualExpenses: next.annualExpenses ?? shown.annualExpenses,
      contribution: next.contribution ?? shown.contribution,
      targetAmount: next.targetAmount ?? shown.targetAmount,
    });
  }

  /**
   * Un plan FIRE no trae cifra objetivo: al pasar a modo cantidad se propone la de ejemplo
   * en vez de un objetivo de 0 que se daría por alcanzado.
   */
  function handleModeChange(next: GoalMode) {
    setMode(next);
    if (next === "amount" && shown.targetAmount <= 0) {
      updateAmounts({ targetAmount: DEFAULT_TARGET_AMOUNT });
      setVersion((current) => current + 1);
    }
  }

  const goal = useMemo<GoalOutcome>(() => {
    const common = {
      currentValue: marketValue,
      contribution: shown.contribution,
      frequency,
      annualReturn,
    };
    return mode === "amount"
      ? { mode, ...computeAmountGoal({ ...common, targetAmount: shown.targetAmount, years: targetYears }) }
      : { mode, ...computePortfolioGoal({ ...common, annualExpenses: shown.annualExpenses, withdrawalRate }) };
  }, [mode, shown, withdrawalRate, marketValue, frequency, annualReturn, targetYears]);

  /**
   * Elegir un plan lo convierte en el activo: se aplica ya y se "toca" en la API (PATCH sin
   * cambios, que renueva `updatedAt`) para que el Resumen y los avisos lo sigan. Si ese PATCH
   * falla, el plan se queda cargado aquí pero se avisa de que no se ha podido activar.
   */
  async function handleSelect(id: string) {
    const scenario = scenarios.find((s) => s.id === id);
    if (!scenario) return;
    applyScenario(scenario);
    const activated = await activate(id);
    if (activated) setStatus(t("activated", { name: activated.name }));
  }

  /**
   * Guarda el objetivo como escenario de la calculadora FIRE. Si el nombre coincide con el del
   * escenario cargado se ACTUALIZA ese (PATCH); si se cambia el nombre, se crea uno nuevo
   * (POST). El `currentSavings` que se guarda es el patrimonio real de la cartera, de modo que
   * abrir el escenario en la calculadora reproduce el mismo cálculo.
   */
  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    const loaded = scenarios.find((s) => s.id === selectedId);
    const updating = loaded !== undefined && loaded.name === trimmed;
    const inputs = {
      ...loadedInputs,
      annualExpenses: shown.annualExpenses,
      currentSavings: toCents(goal.current),
      savings: shown.contribution,
      frequency,
      annualReturn,
      withdrawalRate,
      volatility,
      retirementYears,
      goalCurrency: display,
      goalMode: mode,
      targetAmount: shown.targetAmount,
      targetYears,
    };

    setSaving(true);
    // Guardar renueva `updatedAt`: el plan guardado pasa a ser el activo (primero de la lista).
    const saved = updating
      ? await update(loaded.id, { name: trimmed, inputs }, { promote: true })
      : await create(trimmed, inputs);
    setSaving(false);
    if (saved) {
      setSelectedId(saved.id);
      setLoadedInputs(saved.inputs);
      setStatus(t(updating ? "updated" : "saved", { name: saved.name }));
    }
  }

  const excluded = total - valued;
  const quotaReached = scenarios.length >= MAX_SCENARIOS_PER_USER;
  const updating = scenarios.some((s) => s.id === selectedId && s.name === name.trim());
  const frequencyOptions = FREQUENCIES.map((f) => ({ value: f, label: tf(f) }));

  const etaValue = goal.reached
    ? t("etaReached")
    : goal.yearsToTarget === null
      ? "—"
      : t("etaYears", { years: goal.yearsToTarget });

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">{t(mode === "amount" ? "titleAmount" : "title")}</h2>
        <p className="text-sm text-muted">{t(mode === "amount" ? "introAmount" : "intro")}</p>
      </div>

      {scenarios.length > 0 && (
        <SelectField
          label={t("planLabel")}
          value={selectedId}
          onChange={(id) => void handleSelect(id)}
          options={scenarios.map((s) => ({ value: s.id, label: s.name }))}
          help={t("planHint")}
        />
      )}
      {listStatus !== "loading" && scenarios.length === 0 && <Notice variant="info">{t("noPlan")}</Notice>}

      <ToggleGroup
        label={t("modeLabel")}
        value={mode}
        options={GOAL_MODES.map((m) => ({ value: m, label: t(`mode.${m}`) }))}
        onChange={handleModeChange}
        size="md"
      />

      {/* La `key` remonta los campos al cargar un escenario o al cambiar de divisa. */}
      <Fragment key={`${version}-${display}`}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mode === "fire" ? (
            <>
              <NumberField
                label={t("annualExpenses", { currency: display })}
                value={shown.annualExpenses}
                onChange={(value) => updateAmounts({ annualExpenses: value })}
                step={1000}
                help={t("help.annualExpenses")}
              />
              <NumberField
                label={t("withdrawalRate")}
                value={withdrawalRate}
                onChange={setWithdrawalRate}
                step={0.1}
                min={1}
                max={100}
                help={t("help.withdrawalRate")}
              />
            </>
          ) : (
            <>
              <NumberField
                label={t("targetAmount", { currency: display })}
                value={shown.targetAmount}
                onChange={(value) => updateAmounts({ targetAmount: value })}
                step={1000}
                help={t("help.targetAmount")}
              />
              <NumberField
                label={t("targetYears")}
                value={targetYears}
                onChange={(value) => setTargetYears(Math.round(value))}
                step={1}
                min={0}
                max={MAX_YEARS}
                help={t("help.targetYears")}
              />
            </>
          )}
          <NumberField
            label={t("contribution", { currency: display })}
            value={shown.contribution}
            onChange={(value) => updateAmounts({ contribution: value })}
            step={50}
            help={t("help.contribution")}
          />
          <SelectField
            label={tf("label")}
            value={frequency}
            options={frequencyOptions}
            onChange={setFrequency}
            help={tf("help")}
          />
          <NumberField
            label={t("annualReturn")}
            value={annualReturn}
            onChange={setAnnualReturn}
            step={0.5}
            max={100}
            help={t("help.annualReturn")}
          />
        </div>
      </Fragment>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("target")} value={formatCurrency(goal.target, display)} highlight />
        <Stat label={t("current")} value={formatCurrency(goal.current, display)} />
        <Stat label={t("remaining")} value={formatCurrency(goal.remaining, display)} />
        {goal.mode === "fire" ? (
          <Stat label={t("eta")} value={etaValue} />
        ) : (
          <Stat
            label={t("requiredContribution")}
            value={goal.requiredContribution === null ? "—" : formatCurrency(goal.requiredContribution, display)}
          />
        )}
      </div>

      {goal.progress !== null && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">{t("progressAria")}</span>
            <span className="font-semibold tabular-nums text-foreground">{formatPercent(goal.progress)}</span>
          </div>
          <div
            role="progressbar"
            aria-label={t("progressAria")}
            aria-valuemin={0}
            aria-valuemax={100}
            // Sin redondear a entero: un 4,43 % anunciado como "4" pierde precisión sin
            // motivo (ARIA admite decimales). Se acota a dos para no arrastrar el ruido
            // de la coma flotante.
            aria-valuenow={Math.round(goal.progress * 100) / 100}
            aria-valuetext={t("progressValue", { percent: formatPercent(goal.progress) })}
            className="h-3 w-full overflow-hidden rounded-full bg-surface-2"
          >
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${goal.progress}%` }} />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1 text-xs text-muted">
        {goal.reached && <p className="text-success">{t("reached")}</p>}
        {goal.mode === "amount" && !goal.reached && (
          <p className={goal.onTrack ? "text-success" : undefined}>
            {t(goal.onTrack ? "amountOnTrack" : "amountOffTrack", {
              projected: formatCurrency(goal.projectedAtDeadline, display),
              year: new Date().getFullYear() + goal.deadlineYears,
            })}
          </p>
        )}
        {goal.mode === "fire" && !goal.reached && goal.yearsToTarget === null && <p>{t("etaNever")}</p>}
        {goal.mode === "fire" && !goal.reached && goal.yearsToTarget !== null && (
          // El año se deriva en el render. Servidor y cliente pintan el mismo salvo que la
          // hidratación cruzara la medianoche del 31 de diciembre, y React lo corregiría solo.
          <p>{t("etaYear", { year: new Date().getFullYear() + goal.yearsToTarget })}</p>
        )}
        {valued === 0 && <p>{t("noValuation")}</p>}
        {excluded > 0 && <p>{tp("excluded", { count: excluded, total })}</p>}
        <p>{t("currencyHint", { currency: display })}</p>
        {shown.note && (
          <p className={shown.note.kind === "notConvertible" ? "text-warning" : undefined}>
            {t(shown.note.kind === "converted" ? "currencyConverted" : "currencyNotConvertible", {
              from: shown.note.from,
              to: shown.note.to,
            })}
          </p>
        )}
      </div>

      <Notice variant="info">{t("assumptions")}</Notice>

      {/* La simulación mide si el dinero DURA un retiro: solo tiene sentido en modo FIRE. Misma
          `key` que los campos de arriba: cargar un escenario remonta también estos. */}
      {mode === "fire" && (
        <PortfolioGoalSimulation
          key={`sim-${version}`}
          annualExpenses={shown.annualExpenses}
          contribution={shown.contribution}
          frequency={frequency}
          withdrawalRate={withdrawalRate}
          annualReturn={annualReturn}
          currentValue={goal.current}
          volatility={volatility}
          onVolatilityChange={setVolatility}
          retirementYears={retirementYears}
          onRetirementYearsChange={setRetirementYears}
        />
      )}

      {canSave && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-foreground">{t("scenarioTitle")}</h3>
            <p className="text-xs text-muted">{t("scenarioHint")}</p>
          </div>

          <form onSubmit={handleSave} className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <label htmlFor="goal-name" className="text-xs font-medium text-muted">
                {ts("nameLabel")}
              </label>
              <input
                id="goal-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={SCENARIO_NAME_MAX_LENGTH}
                placeholder={ts("namePlaceholder")}
                autoComplete="off"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <button
              type="submit"
              disabled={saving || (!updating && quotaReached)}
              className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-fg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? ts("saving") : updating ? t("update") : ts("save")}
            </button>
          </form>

          {!updating && quotaReached && <p className="text-xs text-muted">{ts("quotaReached")}</p>}
        </div>
      )}

      {errorKey && <p className="text-sm text-warning">{ts(errorKey)}</p>}

      {/* Guardar y cargar cambian cifras de golpe: se anuncia, no solo se ve. */}
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
    </section>
  );
}
