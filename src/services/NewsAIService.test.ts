import { describe, expect, it, vi } from "vitest";
import type { CityEvent, NewsArticle, WorldContext } from "../model/AI";
import type { CityGraphAIService, JSONDecoder } from "./CityGraphAIService";
import { NewsAIService } from "./NewsAIService";

const context: WorldContext = {
  worldMode: "fictional",
  city: { id: "city", kind: "city", facts: { name: "澄江市" } },
  entities: [],
  relations: [],
  recentNews: [],
};

const events: CityEvent[] = [{
  id: "event-1",
  timestamp: 1_757_728_000_000,
  type: "market-value-changed",
  category: "business",
  importance: 60,
  relatedEntityIds: ["company-1"],
  payload: { entityName: "远帆科技", oldValue: 100, newValue: 120, sourceEventIds: ["event-1"] },
  location: { x: 10, y: 20 },
}];

function mockedNewsService(response: unknown) {
  const requestJSON = vi.fn(async (_prompt: unknown, decode: JSONDecoder<unknown>) => decode(response));
  return { service: new NewsAIService({ requestJSON: requestJSON as CityGraphAIService["requestJSON"] }), requestJSON };
}

describe("NewsAIService", () => {
  it("makes one call and derives all canonical metadata from known source events", async () => {
    const response = { articles: [{ headline: "远帆科技估值资料更新", summary: "企业估值变化已记录。", body: "城市事件记录显示，远帆科技的市场价值发生变化，本报道不增加事件之外的事实。", sourceEventIds: ["event-1"] }] };
    const { service, requestJSON } = mockedNewsService(response);
    const articles = await service.generateIssue({ events, context, recentNews: [], issueDate: "2026-09-13", articleCount: 1 });

    expect(requestJSON).toHaveBeenCalledOnce();
    expect(articles[0]).toEqual({
      id: expect.stringMatching(/^ai-news-/),
      date: "2026-09-13",
      category: "business",
      headline: response.articles[0]!.headline,
      summary: response.articles[0]!.summary,
      body: response.articles[0]!.body,
      importance: 60,
      sourceEventIds: ["event-1"],
      relatedEntityIds: ["company-1"],
      location: { x: 10, y: 20 },
    });
    expect(Object.keys(articles[0]!).sort()).toEqual(["body", "category", "date", "headline", "id", "importance", "location", "relatedEntityIds", "sourceEventIds", "summary"].sort());
  });

  it("sends only bounded canonical recent-news metadata", async () => {
    const response = { articles: [{ headline: "标题", summary: "摘要内容完整。", body: "这是一段足够长的正式新闻内容，只记录城市事件中明确提供的变化。", sourceEventIds: ["event-1"] }] };
    const { service, requestJSON } = mockedNewsService(response);
    const recent: NewsArticle[] = [{ id: "old", date: "2026-09-12", category: "city", headline: "旧闻", summary: "旧闻摘要", body: "not sent", importance: 30, sourceEventIds: [], relatedEntityIds: [] }];
    await service.generateIssue({ events, context, recentNews: recent, issueDate: "2026-09-13", articleCount: 1 });
    expect((requestJSON.mock.calls[0]?.[0] as { recentNews: unknown }).recentNews).toEqual([{ date: "2026-09-12", headline: "旧闻", summary: "旧闻摘要" }]);
  });

  it("rejects extra draft fields and unknown source references", async () => {
    const malformed = mockedNewsService({ articles: [{ headline: "标题", summary: "摘要", body: "这是一段足够长的正文，用于严格模式结构测试。", sourceEventIds: ["event-1"], category: "city" }] });
    await expect(malformed.service.generateIssue({ events, context, recentNews: [], issueDate: "2026-09-13", articleCount: 1 })).rejects.toThrow();
    const unknown = mockedNewsService({ articles: [{ headline: "标题", summary: "摘要内容", body: "这是一段足够长的正式新闻内容，用于测试未知来源事件会被拒绝。", sourceEventIds: ["unknown"] }] });
    await expect(unknown.service.generateIssue({ events, context, recentNews: [], issueDate: "2026-09-13", articleCount: 1 })).rejects.toMatchObject({ code: "invalid-response" });
  });
});
