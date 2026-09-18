import type { CityEvent, NewsArticle, NewsCategory, WorldContext } from "../model/AI";
import { CityGraphAIError, type CityGraphAIService, type JSONDecoder, type JSONValue } from "./CityGraphAIService";

export interface NewsIssueRequest {
  events: readonly CityEvent[];
  context: WorldContext;
  recentNews: readonly NewsArticle[];
  issueDate: string;
  articleCount?: number;
}

interface ArticleDraft {
  headline: string;
  summary: string;
  body: string;
  sourceEventIds: string[];
}

const unsafeArticleText = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]|<\/?(?:script|iframe|object|embed)[^>]*>|javascript:/i;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function safeText(value: unknown, maximum: number): string {
  if (typeof value !== "string") return "";
  const result = value.trim();
  return result && Array.from(result).length <= maximum && !unsafeArticleText.test(result) ? result : "";
}

function validEvent(event: CityEvent): boolean {
  return Boolean(event.id)
    && Number.isFinite(event.timestamp)
    && typeof event.type === "string"
    && ["city", "transport", "university", "healthcare", "business", "district"].includes(event.category)
    && Number.isFinite(event.importance)
    && event.importance >= 0
    && event.importance <= 100
    && Array.isArray(event.relatedEntityIds)
    && Boolean(record(event.payload));
}

function articleDraftDecoder(expectedCount: number): JSONDecoder<ArticleDraft[]> {
  return (value: unknown): ArticleDraft[] => {
    const root = record(value);
    if (!root || Object.keys(root).length !== 1 || !Array.isArray(root.articles) || root.articles.length !== expectedCount) throw new Error("articles schema expected");
    return root.articles.map((item) => {
      const draft = record(item);
      if (!draft || Object.keys(draft).length !== 4 || Object.keys(draft).some((key) => !["headline", "summary", "body", "sourceEventIds"].includes(key))) throw new Error("exact article draft schema expected");
      const headline = safeText(draft.headline, 100);
      const summary = safeText(draft.summary, 300);
      const body = safeText(draft.body, 3_000);
      const sourceEventIds = Array.isArray(draft.sourceEventIds) ? [...new Set(draft.sourceEventIds.map((id) => safeText(id, 200)).filter(Boolean))] : [];
      if (!headline || !summary || Array.from(body).length < 20 || sourceEventIds.length === 0) throw new Error("invalid article fields");
      return { headline, summary, body, sourceEventIds };
    });
  };
}

function stableHash(value: string): string {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619) >>> 0;
  return result.toString(36);
}

function recentNewsForPrompt(news: readonly NewsArticle[]): JSONValue[] {
  return news.slice(0, 10).map((article) => ({ date: article.date, headline: article.headline, summary: article.summary }));
}

function primarySource(events: readonly CityEvent[]): CityEvent {
  return [...events].sort((left, right) => right.importance - left.importance || left.id.localeCompare(right.id))[0]!;
}

function derivedLocation(events: readonly CityEvent[]): { x: number; y: number } | undefined {
  const source = [...events].sort((left, right) => right.importance - left.importance).find((event) => event.location);
  return source?.location ? { ...source.location } : undefined;
}

export class NewsAIService {
  constructor(private readonly ai: Pick<CityGraphAIService, "requestJSON">) {}

  async generateIssue(request: NewsIssueRequest): Promise<NewsArticle[]> {
    const events = request.events.filter(validEvent).sort((left, right) => right.importance - left.importance || left.timestamp - right.timestamp || left.id.localeCompare(right.id));
    if (events.length === 0) throw new CityGraphAIError("invalid-prompt", "At least one valid city event is required.");
    const articleCount = request.articleCount ?? Math.min(5, events.length);
    if (!Number.isInteger(articleCount) || articleCount < 1 || articleCount > Math.min(8, events.length)) throw new CityGraphAIError("invalid-prompt", "The article count must be between 1 and 8 and cannot exceed the event count.");
    const topEvents = events.slice(0, Math.min(8, Math.max(5, articleCount), events.length));

    const drafts = await this.ai.requestJSON({
      task: "Produce all articles for one issue of a fictional local newspaper in a single response.",
      language: "zh-CN",
      issueDate: request.issueDate,
      worldContext: request.context as unknown as JSONValue,
      events: topEvents as unknown as JSONValue,
      recentNews: recentNewsForPrompt(request.recentNews),
      outputSchema: { articles: [{ headline: "string", summary: "string", body: "string", sourceEventIds: ["known event id"] }] },
      constraints: [
        `Return exactly ${articleCount} articles in one articles array.`,
        "Use restrained, factual Simplified Chinese and only claims supported by supplied event payloads.",
        "Every sourceEventIds value must exactly match a supplied event id; do not output category, importance, location, date, article id, or entity ids.",
        "Do not invent quotations, people, numbers, causes, completion states, consequences, or real-world facts.",
        "Return the exact documented JSON fields and no Markdown.",
      ],
    }, articleDraftDecoder(articleCount));

    const eventsById = new Map(topEvents.map((event) => [event.id, event]));
    return drafts.map((draft, index) => {
      const sourceEvents = draft.sourceEventIds.map((id) => eventsById.get(id));
      if (sourceEvents.some((event) => !event)) throw new CityGraphAIError("invalid-response", "An article references an unknown source event.");
      const knownSources = sourceEvents as CityEvent[];
      const primary = primarySource(knownSources);
      const category: NewsCategory = primary.category;
      const location = derivedLocation(knownSources);
      return {
        id: `ai-news-${stableHash(`${request.issueDate}:${index}:${draft.headline}:${draft.sourceEventIds.join(",")}`)}`,
        date: request.issueDate,
        category,
        headline: draft.headline,
        summary: draft.summary,
        body: draft.body,
        importance: Math.max(...knownSources.map((event) => event.importance)),
        sourceEventIds: [...draft.sourceEventIds],
        relatedEntityIds: [...new Set(knownSources.flatMap((event) => event.relatedEntityIds))],
        ...(location ? { location } : {}),
      };
    });
  }
}
