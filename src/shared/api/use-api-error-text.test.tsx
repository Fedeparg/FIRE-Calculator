import { screen } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { describe, expect, it } from "vitest";

import { renderWithIntl } from "@/test/render";

import es from "../../../messages/es.json";
import { useApiErrorText } from "./use-api-error-text";

/** Pinta el texto de cada clave con el traductor del namespace indicado. */
function Messages({ namespace, keys }: { namespace: string; keys: string[] }) {
  const t = useTranslations(namespace);
  const errorText = useApiErrorText(t);
  return (
    <ul>
      {keys.map((key) => (
        <li key={key}>{errorText(key)}</li>
      ))}
    </ul>
  );
}

const texts = () => screen.getAllByRole("listitem").map((item) => item.textContent);

describe("useApiErrorText", () => {
  it("red, servidor y sesión salen de common.apiError en cualquier namespace", () => {
    renderWithIntl(<Messages namespace="portfolio.lots" keys={["errorNetwork", "errorServer", "errorSession"]} />);

    expect(texts()).toEqual([es.common.apiError.network, es.common.apiError.server, es.common.apiError.session]);
  });

  it("un errorGeneric con contexto propio gana al común; si no lo hay, cae al común", () => {
    renderWithIntl(<Messages namespace="portfolio.import" keys={["errorGeneric"]} />);
    expect(texts()).toEqual([es.portfolio.import.errorGeneric]);
  });

  it("sin errorGeneric propio usa el genérico común, y las claves propias salen de la feature", () => {
    renderWithIntl(<Messages namespace="portfolio.lots" keys={["errorGeneric", "errorInvalid"]} />);

    expect(texts()).toEqual([es.common.apiError.generic, es.portfolio.lots.errorInvalid]);
  });
});
