import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import es from "../../../../messages/es.json";

import CalculatorStateProvider from "./CalculatorState";
import FinancialHealthQuiz from "./FinancialHealthQuiz";

// El panel de escenarios habla con la API.
vi.mock("./ScenarioPanel", () => ({ default: () => null }));

const texts = es.calc["salud-financiera"];

function renderQuiz() {
  return renderWithIntl(
    <CalculatorStateProvider slug="salud-financiera">
      <FinancialHealthQuiz />
    </CalculatorStateProvider>,
  );
}

/** La puntuación es el número grande bajo "Tu puntuación". */
function score(): string {
  return screen.getByText(texts.score).nextElementSibling?.textContent ?? "";
}

describe("FinancialHealthQuiz", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/calculadoras/salud-financiera");
  });

  it("sin respuestas puntúa 0", () => {
    renderQuiz();

    expect(score()).toBe("0");
  });

  it("las respuestas viajan en la URL, por pregunta", async () => {
    const user = userEvent.setup();
    renderQuiz();

    await user.selectOptions(
      screen.getByRole("combobox", { name: texts.questions.emergencyFund.label }),
      texts.questions.emergencyFund.o3,
    );

    // emergencyFund pesa 0,22 y la mejor opción puntúa 1.
    expect(score()).toBe("22");
    await waitFor(() => expect(window.location.search).toBe("?emergencyFund=3"));
  });

  it("aplica un enlace compartido e ignora valores fuera de rango", async () => {
    window.history.replaceState(null, "", "/calculadoras/salud-financiera?emergencyFund=3&debt=3&tracking=9");

    renderQuiz();

    // 0,22 + 0,18 = 40; `tracking=9` no es una opción válida y cuenta como la primera.
    await waitFor(() => expect(score()).toBe("40"));
    expect(screen.getByRole("combobox", { name: texts.questions.tracking.label })).toHaveValue("0");
  });
});
