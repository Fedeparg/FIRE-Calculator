"use client";

import { Fragment, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { FIRE_CALCULATOR_SLUG, GOAL_MODES, type GoalMode } from "@sextante/core/portfolio/goal";
import { MAX_SCENARIOS_PER_USER } from "@sextante/core/contracts";
import {
  DEFAULT_TARGET_AMOUNT,
  amountsFromSettings,
  buildGoalInputs,
  computeGoal,
  paramsFromSettings,
  showAmounts,
  type GoalAmounts,
  type GoalParams,
} from "@/features/portfolio/model/goal-amounts";
import { goalSettingsFromInputs } from "@/features/portfolio/model/goal-scenario";
import type { SavedScenario } from "@/features/scenarios/saved-scenarios";
import { useSavedScenarios } from "@/features/scenarios/use-saved-scenarios";
import Notice from "@/shared/ui/Notice";
import SelectField from "@/shared/ui/SelectField";
import ToggleGroup from "@/shared/ui/ToggleGroup";
import PortfolioGoalFields from "./PortfolioGoalFields";
import PortfolioGoalPlanForm from "./PortfolioGoalPlanForm";
import PortfolioGoalResults from "./PortfolioGoalResults";
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

/** Valores iniciales de la calculadora FIRE (los mismos que `GOAL_FIELD_SPECS`). */
const DEFAULT_PARAMS: GoalParams = {
  mode: "fire",
  frequency: "monthly",
  annualReturn: 5,
  withdrawalRate: 4,
  targetYears: 10,
  volatility: 15,
  retirementYears: 40,
};

/**
 * "Tu objetivo": une la calculadora de independencia financiera con la cartera real. El
 * usuario define su gasto anual y su tasa de retiro, y ve el patrimonio objetivo, cuánto lleva
 * de verdad (la valoración de sus posiciones), cuánto le falta y en cuánto tiempo llegaría al
 * ritmo de aportación actual.
 *
 * El cálculo NO vive aquí: es `computeGoal` (core puro y testeado) sobre `computePortfolioGoal`,
 * que a su vez delega en `computeFire` y en el motor de proyección. Este componente orquesta el
 * estado; los campos, los resultados y el formulario de guardado son subcomponentes.
 *
 * **Divisa.** Los importes del objetivo se expresan siempre en la divisa elegida para el total
 * de la cartera. Al cambiarla, se convierten con las mismas tasas FX que usa el resumen; si
 * falta la tasa, se avisa en vez de comparar importes en divisas distintas.
 *
 * **Persistencia.** Se reutiliza el CRUD de escenarios guardados (`useSavedScenarios`) con el
 * slug de la calculadora FIRE: no hace falta almacenamiento nuevo y el objetivo aparece también
 * en la calculadora. Al abrir se carga el plan activo (`active`, el que enseña el Resumen). Sin
 * sesión válida el bloque sigue calculando en local, simplemente no ofrece guardar.
 */
export default function PortfolioGoal({ marketValue, valued, total, display, rates }: Props) {
  const t = useTranslations("portfolio.goal");
  const ts = useTranslations("calculator.scenarios");

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
  const [params, setParams] = useState<GoalParams>(DEFAULT_PARAMS);

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
    setAmounts(amountsFromSettings(settings));
    setParams(paramsFromSettings(settings));
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

  const shown = useMemo(() => showAmounts(amounts, display, rates), [amounts, display, rates]);
  const goal = useMemo(() => computeGoal(shown, params, marketValue), [shown, params, marketValue]);

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
  function handleModeChange(mode: GoalMode) {
    setParams((prev) => ({ ...prev, mode }));
    if (mode === "amount" && shown.targetAmount <= 0) {
      updateAmounts({ targetAmount: DEFAULT_TARGET_AMOUNT });
      setVersion((current) => current + 1);
    }
  }

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
   * (POST).
   */
  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    const loaded = scenarios.find((s) => s.id === selectedId);
    const updating = loaded !== undefined && loaded.name === trimmed;
    const inputs = buildGoalInputs(loadedInputs, shown, params, display, goal.current);

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

  const quotaReached = scenarios.length >= MAX_SCENARIOS_PER_USER;
  const updating = scenarios.some((s) => s.id === selectedId && s.name === name.trim());

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">
          {t(params.mode === "amount" ? "titleAmount" : "title")}
        </h2>
        <p className="text-sm text-muted">{t(params.mode === "amount" ? "introAmount" : "intro")}</p>
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
        value={params.mode}
        options={GOAL_MODES.map((m) => ({ value: m, label: t(`mode.${m}`) }))}
        onChange={handleModeChange}
        size="md"
      />

      {/* La `key` remonta los campos al cargar un escenario o al cambiar de divisa. */}
      <Fragment key={`${version}-${display}`}>
        <PortfolioGoalFields
          display={display}
          shown={shown}
          params={params}
          onAmountsChange={updateAmounts}
          onParamsChange={(patch) => setParams((prev) => ({ ...prev, ...patch }))}
        />
      </Fragment>

      <PortfolioGoalResults goal={goal} display={display} valued={valued} total={total} note={shown.note} />

      <Notice variant="info">{t("assumptions")}</Notice>

      {/* La simulación mide si el dinero DURA un retiro: solo tiene sentido en modo FIRE. Misma
          `key` que los campos de arriba: cargar un escenario remonta también estos. */}
      {params.mode === "fire" && (
        <PortfolioGoalSimulation
          key={`sim-${version}`}
          annualExpenses={shown.annualExpenses}
          contribution={shown.contribution}
          frequency={params.frequency}
          withdrawalRate={params.withdrawalRate}
          annualReturn={params.annualReturn}
          currentValue={goal.current}
          volatility={params.volatility}
          onVolatilityChange={(volatility) => setParams((prev) => ({ ...prev, volatility }))}
          retirementYears={params.retirementYears}
          onRetirementYearsChange={(retirementYears) => setParams((prev) => ({ ...prev, retirementYears }))}
        />
      )}

      {listStatus === "ready" && (
        <PortfolioGoalPlanForm
          name={name}
          onNameChange={setName}
          updating={updating}
          quotaReached={quotaReached}
          saving={saving}
          onSubmit={handleSave}
        />
      )}

      {errorKey && <p className="text-sm text-warning">{ts(errorKey)}</p>}

      {/* Guardar y cargar cambian cifras de golpe: se anuncia, no solo se ve. */}
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
    </section>
  );
}
