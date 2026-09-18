import { describe, expect, it, vi } from "vitest";
import { createEmptyCompany, createEmptyHospital, createEmptyUniversity } from "../model/City";
import { createNewCity } from "../model/mapGenerator";
import type { CityGraphAIService, JSONDecoder } from "./CityGraphAIService";
import { CityAssistantService, selectAssistantEntityIds } from "./CityAssistantService";

function fixture() {
  const city = createNewCity({ name: "澄江市", size: "small", terrain: "flat", lakeCount: 1 });
  city.universities = [{ ...createEmptyUniversity("university"), name: "澄江大学", ranking: 2 }];
  city.hospitals = [{ ...createEmptyHospital("hospital"), name: "中央医院", beds: 800 }];
  city.companies = [{ ...createEmptyCompany("company"), name: "星海汽车", marketValue: 120, marketValueRank: 1 }];
  city.districts = [{ id: "district", name: "滨江区", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], gdp: 300, gdpYear: 2026 }];
  city.entityRelations = [{ id: "relation", fromEntityId: "company", toEntityId: "district", type: "located_in" }];
  city.cityEvents = [{ id: "event", timestamp: 2_000, type: "company-value-changed", category: "business", importance: 60, relatedEntityIds: ["company"], payload: { oldValue: 100, newValue: 120 } }];
  return city;
}

function mockedService(response: unknown) {
  const requestJSON = vi.fn(async (_prompt: unknown, decode: JSONDecoder<unknown>) => decode(response));
  return { service: new CityAssistantService({ requestJSON: requestJSON as CityGraphAIService["requestJSON"] }), requestJSON };
}

describe("CityAssistantService", () => {
  it("retrieves named entities and category-wide records locally", () => {
    const city = fixture();
    expect(selectAssistantEntityIds(city, "星海汽车位于哪里？")).toContain("company");
    expect(selectAssistantEntityIds(city, "有哪些大学？")).toEqual(["university"]);
    expect(selectAssistantEntityIds(city, "医院和公司情况")).toEqual(expect.arrayContaining(["hospital", "company"]));
    expect(selectAssistantEntityIds(city, "有哪些实体关系？")).toEqual(expect.arrayContaining(["company", "district"]));
  });

  it("sends only grounded context, recent events, and bounded dialogue", async () => {
    const city = fixture();
    const { service, requestJSON } = mockedService({ answer: "星海汽车当前市值为120，排名第1。", relatedEntityIds: ["company"] });
    const history = Array.from({ length: 8 }, (_, index) => ({ role: index % 2 ? "assistant" as const : "user" as const, content: `message-${index}` }));
    await expect(service.ask({ city, question: "星海汽车的市值是多少？", history })).resolves.toEqual({ answer: "星海汽车当前市值为120，排名第1。", relatedEntityIds: ["company"] });
    const prompt = requestJSON.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(prompt).toMatchObject({ question: "星海汽车的市值是多少？", language: "zh-CN" });
    expect(prompt.conversation).toHaveLength(6);
    expect(JSON.stringify(prompt)).toContain("company-value-changed");
    expect(prompt.retrievedWorldContext).toMatchObject({ worldMode: "fictional", entities: expect.arrayContaining([expect.objectContaining({ id: "company" })]), relations: [expect.objectContaining({ id: "relation" })] });
  });

  it("supports city-wide count questions without sending every entity", async () => {
    const city = fixture();
    const { service, requestJSON } = mockedService({ answer: "当前存档记录1所大学。", relatedEntityIds: [city.id] });
    await service.ask({ city, question: "这座城市有多少所学校？" });
    const context = (requestJSON.mock.calls[0]?.[0] as Record<string, any>).retrievedWorldContext;
    expect(context.city.facts.counts).toMatchObject({ universities: 1, hospitals: 1, companies: 1, districts: 1 });
  });

  it("rejects empty questions, extra response keys, and invented entity references", async () => {
    const city = fixture();
    await expect(mockedService({ answer: "x", relatedEntityIds: [] }).service.ask({ city, question: " " })).rejects.toMatchObject({ code: "invalid-prompt" });
    await expect(mockedService({ answer: "x", relatedEntityIds: [], note: "extra" }).service.ask({ city, question: "城市名称？" })).rejects.toThrow();
    await expect(mockedService({ answer: "x", relatedEntityIds: ["unknown"] }).service.ask({ city, question: "城市名称？" })).rejects.toThrow();
  });
});
