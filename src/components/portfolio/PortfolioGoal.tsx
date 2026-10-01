"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  decodeCalculatorInputs,
  type FieldSpecs,
  type FieldValues,
} from "@/core/calculator-url-state";
import { convertCurrency } from "@sextante/core/fx";
import { computePortfolioGoal, FIRE_CALCULATOR_SLUG } from "@/core/portfolio-goal";
import { FREQUENCIES, type Frequency } from "@/core/projection";
import { useFormat } from "@/lib/format";
import { PORTFOLIO_CURRENCIES } from "@/lib/portfolio";
import {
  MAX_SCENARIOS_PER_USER,
  SCENARIO_NAME_MAX_LENGTH,
  scenarioErrorKeyForResponse,
  scenarioErrorKeyForStatus,
  type SavedScenario,
  type ScenarioErrorKey,
} from "@/lib/scenarios";
import Notice from "../ui/Notice";
import NumberField from "../ui/NumberField";
import SelectField from "../ui/SelectField";
import Stat from "../ui/Stat";
import PortfolioGoalSimulation from "./PortfolioGoalSimulation";

type Props = {
  /**
   * Valor de mercado de la cartera, en `display`. Es EXACTAMENTE el mismo agregado que muestra
   * el resumen (lo calcula `PortfolioClient` una sola vez): comparar el objetivo con otra cifra
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

/**
 * Campos del objetivo, con las MISMAS claves que la calculadora de independencia financiera
 * (`FireCalculator`), para que un escenario guardado en cualquiera de los dos sitios se cargue
 * en el otro. `currentSavings` no se declara a propósito: aquí el patrimonio actual no se
 * teclea, lo pone la cartera.
 *
 * `goalCurrency` es una clave PROPIA de este bloque: la calculadora no la registra, así que
 * `decodeCalculatorInputs` la ignora allí y `completeValues` no la reescribe. Sirve para saber
 * en qué divisa se guardaron los importes; si falta (escenario creado en la calculadora, que
 * es solo en euros) se asume EUR.
 */
const GOAL_FIELD_SPECS: FieldSpecs = {
  annualExpenses: { kind: "number", defaultValue: 24000 },
  savings: { kind: "number", defaultValue: 800 },
  frequency: { kind: "option", defaultValue: "monthly", allowed: FREQUENCIES },
  annualReturn: { kind: "number", defaultValue: 5 },
  withdrawalRate: { kind: "number", defaultValue: 4 },
  // Mismas claves que el simulador Monte Carlo: la calculadora FIRE no las registra, así que
  // allí se ignoran y `handleSave` las conserva al actualizar.
  volatility: { kind: "number", defaultValue: 15 },
  retirementYears: { kind: "number", defaultValue: 40 },
  goalCurrency: { kind: "option", defaultValue: "EUR", allowed: PORTFOLIO_CURRENCIES },
};

/** Importes del objetivo, con la divisa en la que se introdujeron o se guardaron. */
type GoalAmounts = { currency: string; annualExpenses: number; contribution: number };

/** Aviso sobre la divisa de los importes cuando no coincide con la que se está viendo. */
type CurrencyNote = { kind: "converted" | "notConvertible"; from: string; to: string } | null;

/** Importes ya expresados en la divisa que se está viendo, con el aviso que toque. */
type ShownAmounts = { annualExpenses: number; contribution: number; note: CurrencyNote };

/** Estrecha el valor decodificado de un escenario al tipo `Frequency`, sin casts. */
function isFrequency(value: unknown): value is Frequency {
  return typeof value === "string" && (FREQUENCIES as readonly string[]).includes(value);
}

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
 * la calculadora. Sin sesión válida el bloque sigue calculando en local, simplemente no ofrece
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
  });
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

  // Escenarios guardados de la calculadora FIRE (los mismos que se ven en su página).
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const [canSave, setCanSave] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  /**
   * `inputs` completos del escenario cargado. Se conservan para que al actualizarlo no se
   * pierdan las claves que este bloque no edita (p. ej. el crecimiento del ahorro que sí tiene
   * la calculadora): se guarda el original con los campos de aquí sobrescritos.
   */
  const [loadedInputs, setLoadedInputs] = useState<Record<string, unknown>>({});
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<ScenarioErrorKey | null>(null);
  // Último mensaje de estado (guardado/actualizado/cargado) para la región viva.
  const [status, setStatus] = useState("");

  // Carga inicial de escenarios. Un 401 (sesión caducada mientras se navegaba) deja el bloque
  // calculando en local: la autorización la decide la API, aquí solo se refleja su respuesta.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/scenarios?slug=${FIRE_CALCULATOR_SLUG}`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.status === 401) return;
        if (!res.ok) {
          setErrorKey(scenarioErrorKeyForStatus(res.status));
          return;
        }
        setScenarios((await res.json()) as SavedScenario[]);
        setCanSave(true);
      } catch {
        // Sin respuesta, el objetivo se sigue calculando; simplemente no se ofrece guardar.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Importes en la divisa que se está viendo. Es una DERIVACIÓN, no estado sincronizado con un
   * efecto: el estado guarda los importes en su divisa original y aquí se convierten con las
   * mismas tasas FX que usa el total. Si falta la tasa no se inventa nada —se muestran tal cual
   * y `note` lo dice—, en vez de comparar importes de divisas distintas.
   */
  const shown = useMemo<ShownAmounts>(() => {
    const { currency, annualExpenses, contribution } = amounts;
    if (currency === display) return { annualExpenses, contribution, note: null };
    const expenses = convertCurrency(annualExpenses, currency, display, rates);
    const periodic = convertCurrency(contribution, currency, display, rates);
    if (expenses === null || periodic === null) {
      return {
        annualExpenses,
        contribution,
        note: { kind: "notConvertible", from: currency, to: display },
      };
    }
    return {
      annualExpenses: toCents(expenses),
      contribution: toCents(periodic),
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
    });
  }

  const goal = useMemo(
    () =>
      computePortfolioGoal({
        annualExpenses: shown.annualExpenses,
        withdrawalRate,
        currentValue: marketValue,
        contribution: shown.contribution,
        frequency,
        annualReturn,
      }),
    [shown, withdrawalRate, marketValue, frequency, annualReturn],
  );

  /**
   * Aplica un escenario guardado. Los importes se guardan en SU divisa (`goalCurrency`, o EUR
   * si viene de la calculadora, que solo trabaja en euros): la conversión a lo que se está
   * viendo la hace `shown`.
   */
  function handleLoad(id: string) {
    setSelectedId(id);
    const scenario = scenarios.find((s) => s.id === id);
    if (!scenario) return;

    const values: FieldValues = decodeCalculatorInputs(scenario.inputs, GOAL_FIELD_SPECS);
    setAmounts({
      currency: typeof values.goalCurrency === "string" ? values.goalCurrency : "EUR",
      annualExpenses: typeof values.annualExpenses === "number" ? values.annualExpenses : 0,
      contribution: typeof values.savings === "number" ? values.savings : 0,
    });
    if (typeof values.withdrawalRate === "number") setWithdrawalRate(values.withdrawalRate);
    if (typeof values.annualReturn === "number") setAnnualReturn(values.annualReturn);
    if (isFrequency(values.frequency)) setFrequency(values.frequency);
    if (typeof values.volatility === "number") setVolatility(values.volatility);
    if (typeof values.retirementYears === "number") setRetirementYears(values.retirementYears);

    setLoadedInputs(scenario.inputs);
    setName(scenario.name);
    setStatus(t("loaded", { name: scenario.name }));
    setVersion((current) => current + 1);
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
    if (!trimmed) {
      setErrorKey("errorInvalid");
      return;
    }
    const loaded = scenarios.find((s) => s.id === selectedId);
    const updating = loaded !== undefined && loaded.name === trimmed;

    setSaving(true);
    setErrorKey(null);
    try {
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
      };
      const res = await fetch(
        updating ? `/api/scenarios/${loaded.id}` : "/api/scenarios",
        {
          method: updating ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            updating
              ? { name: trimmed, inputs }
              : { slug: FIRE_CALCULATOR_SLUG, name: trimmed, inputs },
          ),
        },
      );
      if (!res.ok) {
        setErrorKey(await scenarioErrorKeyForResponse(res));
        return;
      }
      const saved = (await res.json()) as SavedScenario;
      setScenarios((prev) =>
        updating ? prev.map((s) => (s.id === saved.id ? saved : s)) : [saved, ...prev],
      );
      setSelectedId(saved.id);
      setLoadedInputs(saved.inputs);
      setStatus(t(updating ? "updated" : "saved", { name: saved.name }));
    } catch {
      setErrorKey("errorNetwork");
    } finally {
      setSaving(false);
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
        <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
        <p className="text-sm text-muted">{t("intro")}</p>
      </div>

      {/* La `key` remonta los campos al cargar un escenario o al cambiar de divisa. */}
      <Fragment key={`${version}-${display}`}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <Stat label={t("eta")} value={etaValue} />
      </div>

      {goal.progress !== null && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">{t("progressAria")}</span>
            <span className="font-semibold tabular-nums text-foreground">
              {formatPercent(goal.progress)}
            </span>
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
            <div
              className="h-full rounded-full bg-brand transition-[width]"
              style={{ width: `${goal.progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1 text-xs text-muted">
        {goal.reached && <p className="text-success">{t("reached")}</p>}
        {!goal.reached && goal.yearsToTarget === null && <p>{t("etaNever")}</p>}
        {!goal.reached && goal.yearsToTarget !== null && (
          // El año se deriva en el render. Servidor y cliente pintan el mismo salvo que la
          // hidratación cruzara la medianoche del 31 de diciembre, y React lo corregiría solo.
          <p>{t("etaYear", { year: new Date().getFullYear() + goal.yearsToTarget })}</p>
        )}
        {valued === 0 && <p>{t("noValuation")}</p>}
        {excluded > 0 && <p>{tp("excluded", { count: excluded, total })}</p>}
        <p>{t("currencyHint", { currency: display })}</p>
        {shown.note && (
          <p className={shown.note.kind === "notConvertible" ? "text-warning" : undefined}>
            {t(
              shown.note.kind === "converted" ? "currencyConverted" : "currencyNotConvertible",
              { from: shown.note.from, to: shown.note.to },
            )}
          </p>
        )}
      </div>

      <Notice variant="info">{t("assumptions")}</Notice>

      {/* Misma `key` que los campos de arriba: cargar un escenario remonta también estos. */}
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

      {canSave && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-foreground">{t("scenarioTitle")}</h3>
            <p className="text-xs text-muted">{t("scenarioHint")}</p>
          </div>

          {scenarios.length > 0 && (
            <SelectField
              label={t("loadLabel")}
              value={selectedId}
              onChange={handleLoad}
              options={[
                { value: "", label: t("loadPlaceholder") },
                ...scenarios.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          )}

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
