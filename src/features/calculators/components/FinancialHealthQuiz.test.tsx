import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import es from "../../../../messages/es.json";

import CalculatorStateProvider from "./CalculatorState";
import FinancialHealthQuiz from "./FinancialHealthQuiz";

// The scenario panel talks to the API.
vi.mock("./ScenarioPanel", () => ({ default: () => null }));

const texts = es.calc["salud-financiera"];

function renderQuiz() {
  return renderWithIntl(
    <CalculatorStateProvider slug="salud-financiera">
      <FinancialHealthQuiz />
    </CalculatorStateProvider>,
  );
}

/** The score is the large number under "Tu puntuación" (`score`). */
function score(): string {
  return screen.getByText(texts.score).nextElementSibling?.textContent ?? "";
}

describe("FinancialHealthQuiz", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/calculadoras/salud-financiera");
  });

  it("scores 0 with no answers", () => {
    renderQuiz();

    expect(score()).toBe("0");
  });

  it("answers travel in the URL, one per question", async () => {
    const user = userEvent.setup();
    renderQuiz();

    await user.selectOptions(
      screen.getByRole("combobox", { name: texts.questions.emergencyFund.label }),
      texts.questions.emergencyFund.o3,
    );

    // emergencyFund weighs 0.22 and the best option scores 1.
    expect(score()).toBe("22");
    await waitFor(() => expect(window.location.search).toBe("?emergencyFund=3"));
  });

  it("applies a shared link and ignores out-of-range values", async () => {
    window.history.replaceState(null, "", "/calculadoras/salud-financiera?emergencyFund=3&debt=3&tracking=9");

    renderQuiz();

    // 0.22 + 0.18 = 40; `tracking=9` is not a valid option and counts as the first one.
    await waitFor(() => expect(score()).toBe("40"));
    expect(screen.getByRole("combobox", { name: texts.questions.tracking.label })).toHaveValue("0");
  });
});
