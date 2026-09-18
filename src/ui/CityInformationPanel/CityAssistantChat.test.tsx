import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { translate, type TranslationKey } from "../../i18n";
import { CityAssistantChat } from "./CityAssistantChat";

const t = (key: TranslationKey) => translate("en-US", key);

describe("CityAssistantChat", () => {
  it("offers AI configuration without exposing a composer when no key is configured", () => {
    const html = renderToStaticMarkup(<CityAssistantChat messages={[]} configured={false} busy={false} onAsk={vi.fn()} onConfigure={vi.fn()} t={t}/>);
    expect(html).toContain("Connect DeepSeek");
    expect(html).toContain("Open AI Settings");
    expect(html).not.toContain("<textarea");
  });

  it("renders grounded suggestions, conversation, and the busy state", () => {
    const html = renderToStaticMarkup(<CityAssistantChat messages={[{ role: "user", content: "Which company ranks first?" }, { role: "assistant", content: "City Works ranks first." }]} configured busy error="Request failed" onAsk={vi.fn()} onConfigure={vi.fn()} t={t}/>);
    expect(html).toContain("Which company ranks first?");
    expect(html).toContain("City Works ranks first.");
    expect(html).toContain("Searching the city records...");
    expect(html).toContain("Answers use only facts recorded in this CityGraph save.");
    expect(html).toContain("Request failed");
  });
});
