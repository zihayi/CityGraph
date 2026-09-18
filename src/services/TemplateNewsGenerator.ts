import type { CityEvent, NewsArticle, WorldContext } from "../model/AI";

function hash(value: string): string {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619) >>> 0;
  return result.toString(36);
}

function text(payload: Record<string, unknown>, key: string, fallback: string): string {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function copy(event: CityEvent): Pick<NewsArticle, "headline" | "summary" | "body"> {
  const name = text(event.payload, "entityName", "该城市实体");
  const oldValue = number(event.payload, "oldValue");
  const newValue = number(event.payload, "newValue");
  const count = number(event.payload, "count") ?? 1;
  if (event.type === "ranking-changed" || event.type === "district-ranking-changed") {
    const fact = oldValue !== undefined && newValue !== undefined ? `排名由第${oldValue}位变为第${newValue}位` : "排名资料发生变化";
    return { headline: `${name}排名资料更新`, summary: `${name}${fact}。`, body: `城市事件记录显示，${name}${fact}。本报道不补充事件记录以外的信息。` };
  }
  if (event.type === "market-value-changed" || event.type === "gdp-changed") {
    const metric = event.type === "gdp-changed" ? "地区生产总值" : "市场价值";
    const fact = oldValue !== undefined && newValue !== undefined ? `由${oldValue}变为${newValue}` : "资料发生变化";
    return { headline: `${name}${metric}资料更新`, summary: `${name}${metric}${fact}。`, body: `城市事件记录显示，${name}的${metric}${fact}。本报道仅复述已记录的数据变化。` };
  }
  if (event.type === "specialties-changed") {
    const added = Array.isArray(event.payload.added) ? event.payload.added.map(String) : [];
    const removed = Array.isArray(event.payload.removed) ? event.payload.removed.map(String) : [];
    const facts = [added.length ? `新增：${added.join("、")}` : "", removed.length ? `移除：${removed.join("、")}` : ""].filter(Boolean).join("；");
    return { headline: `${name}专科资料更新`, summary: `${name}的专科资料发生变化。`, body: `城市事件记录显示，${name}的专科资料发生变化${facts ? `，${facts}` : ""}。` };
  }
  if (event.type === "bus-stop-created") {
    return { headline: `${name}新增${count}处公交站点记录`, summary: `${name}记录了${count}处新增公交站点。`, body: `城市交通事件记录显示，${name}新增${count}处公交站点记录。具体状态以事件载荷中的明确信息为准。` };
  }
  const action: Record<string, string> = {
    "university-created": "新增高校记录",
    "company-created": "新增企业记录",
    "hospital-created": "新增医院记录",
    "district-created": "新增城区记录",
    "campus-created": "新增校区记录",
    "hospital-campus-created": "新增院区记录",
    "facility-created": "新增设施记录",
    "bus-line-opened": "新增公交线路记录",
    "rail-line-opened": "新增轨道线路记录",
    "rail-station-enabled": "新增线路启用车站记录",
    "road-completed": "新增道路记录",
  };
  const fact = action[event.type] ?? "城市资料更新";
  return { headline: `${name}${fact}`, summary: `城市事件中记录了${name}的${fact}。`, body: `本期城市事件记录了${name}的${fact}。除事件载荷明确提供的内容外，本报道不推断项目状态、原因或影响。` };
}

export function generateTemplateNews(events: readonly CityEvent[], _context: WorldContext, issueDate: string, maximumArticles = 8): NewsArticle[] {
  return events.slice(0, Math.max(0, Math.min(8, maximumArticles))).map((event, index) => {
    const articleCopy = copy(event);
    return {
      id: `template-news-${hash(`${issueDate}:${index}:${event.id}`)}`,
      date: issueDate,
      category: event.category,
      ...articleCopy,
      importance: event.importance,
      sourceEventIds: [event.id],
      relatedEntityIds: [...new Set(event.relatedEntityIds)],
      ...(event.location ? { location: { ...event.location } } : {}),
    };
  });
}

export class TemplateNewsGenerator {
  generate(events: readonly CityEvent[], context: WorldContext, issueDate: string, maximumArticles = 8): NewsArticle[] {
    return generateTemplateNews(events, context, issueDate, maximumArticles);
  }
}
