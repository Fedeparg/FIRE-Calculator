import { screen } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { describe, expect, it } from "vitest";

import { renderWithIntl } from "@/test/render";

import es from "../../../messages/es.json";
import { useApiErrorText } from "./use-api-error-text";

/** Renders each key's text with the given namespace's translator. */
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
  it("takes network, server and session errors from common.apiError in any namespace", () => {
    renderWithIntl(<Messages namespace="portfolio.lots" keys={["errorNetwork", "errorServer", "errorSession"]} />);

    expect(texts()).toEqual([es.common.apiError.network, es.common.apiError.server, es.common.apiError.session]);
  });

  it("prefers a feature-specific errorGeneric over the common one", () => {
    renderWithIntl(<Messages namespace="portfolio.import" keys={["errorGeneric"]} />);
    expect(texts()).toEqual([es.portfolio.import.errorGeneric]);
  });

  it("without its own errorGeneric uses the common one, and feature keys come from the feature", () => {
    renderWithIntl(<Messages namespace="portfolio.lots" keys={["errorGeneric", "errorInvalid"]} />);

    expect(texts()).toEqual([es.common.apiError.generic, es.portfolio.lots.errorInvalid]);
  });
});
