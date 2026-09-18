import { describe, expect, it } from "vitest";
import type { CityEvent, WorldContext } from "../model/AI";
import { generateTemplateNews, TemplateNewsGenerator } from "./TemplateNewsGenerator";

const context: WorldContext = {
  worldMode: "fictional",
  city: { id: "city", kind: "city", facts: { name: "澄江市" } },
  entities: [], relations: [], recentNews: [],
};

function cityEvent(type: string, payload: Record<string, unknown>, category: CityEvent["category"] = "business"): CityEvent {
  return { id: `${type}:entity-1`, timestamp: 1, type, category, importance: 60, relatedEntityIds: ["entity-1"], payload: { entityId: "entity-1", entityName: type === "gdp-changed" ? "滨江区" : "远帆科技", sourceEventIds: [`${type}:entity-1`], ...payload }, location: { x: 2, y: 3 } };
}

describe("TemplateNewsGenerator", () => {
  it("produces deterministic articles with the exact canonical contract", () => {
    const events = [cityEvent("market-value-changed", { oldValue: 100, newValue: 120 })];
    const first = generateTemplateNews(events, context, "2026-09-13");
    const second = new TemplateNewsGenerator().generate(events, context, "2026-09-13");
    expect(first).toEqual(second);
    expect(first[0]).toEqual({
      id: expect.stringMatching(/^template-news-/), date: "2026-09-13", category: "business", headline: "远帆科技市场价值资料更新",
      summary: "远帆科技市场价值由100变为120。", body: expect.stringContaining("由100变为120"), importance: 60,
      sourceEventIds: [events[0]!.id], relatedEntityIds: ["entity-1"], location: { x: 2, y: 3 },
    });
  });

  it("uses fact-only language and never claims activation without a source fact", () => {
    const events = [cityEvent("facility-created", { facilityType: "airport" }, "transport"), cityEvent("bus-stop-created", { count: 3 }, "transport")];
    const articles = generateTemplateNews(events, context, "2026-09-13");
    expect(articles.map((article) => article.body).join(" ")).not.toContain("投入使用");
    expect(articles.map((article) => article.body).join(" ")).not.toContain("正式开放");
    expect(articles[1]!.headline).toContain("新增3处公交站点记录");
  });

  it("caps an issue at eight articles", () => {
    const events = Array.from({ length: 10 }, (_, index) => ({ ...cityEvent("company-created", {}), id: `created-${index}` }));
    expect(generateTemplateNews(events, context, "2026-09-13")).toHaveLength(8);
  });
});
