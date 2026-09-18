import type { CityEvent, EntityContext, WorldContext } from "../model/AI";
import type { City } from "../model/City";
import { CityGraphAIError, type CityGraphAIService, type JSONDecoder, type JSONValue } from "./CityGraphAIService";
import { buildWorldContext } from "./WorldContextBuilder";

export interface CityAssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CityAssistantAnswer {
  answer: string;
  relatedEntityIds: string[];
}

export interface CityAssistantRequest {
  city: City;
  question: string;
  history?: readonly CityAssistantMessage[];
  language?: "zh-CN" | "en-US";
}

const MAX_QUERY_LENGTH = 1_000;
const MAX_HISTORY_MESSAGES = 6;
const MAX_ENTITY_RESULTS = 50;
const MAX_EVENT_RESULTS = 10;
const unsafeAnswer = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]|<\/?[a-z][^>]*>|javascript:/i;

interface SearchableEntity {
  id: string;
  name: string;
  group: "university" | "hospital" | "company" | "district" | "zone" | "facility" | "building" | "road" | "bus" | "rail";
}

function searchableEntities(city: City): SearchableEntity[] {
  const rankedUniversities = [...city.universities].sort((left, right) => (left.ranking ?? Number.POSITIVE_INFINITY) - (right.ranking ?? Number.POSITIVE_INFINITY));
  const rankedHospitals = [...city.hospitals].sort((left, right) => (left.ranking ?? Number.POSITIVE_INFINITY) - (right.ranking ?? Number.POSITIVE_INFINITY));
  const rankedCompanies = [...city.companies].sort((left, right) => (right.marketValue ?? Number.NEGATIVE_INFINITY) - (left.marketValue ?? Number.NEGATIVE_INFINITY));
  const rankedDistricts = [...city.districts].sort((left, right) => (right.gdp ?? Number.NEGATIVE_INFINITY) - (left.gdp ?? Number.NEGATIVE_INFINITY));
  return [
    ...rankedUniversities.map((item) => ({ id: item.id, name: item.name, group: "university" as const })),
    ...rankedHospitals.map((item) => ({ id: item.id, name: item.name, group: "hospital" as const })),
    ...rankedCompanies.map((item) => ({ id: item.id, name: item.name, group: "company" as const })),
    ...rankedDistricts.map((item) => ({ id: item.id, name: item.name, group: "district" as const })),
    ...city.zones.map((item) => ({ id: item.id, name: item.name ?? "", group: "zone" as const })),
    ...city.facilities.map((item) => ({ id: item.id, name: item.name, group: "facility" as const })),
    ...city.buildings.map((item) => ({ id: item.id, name: item.name ?? "", group: "building" as const })),
    ...city.roads.map((item) => ({ id: item.id, name: item.name, group: "road" as const })),
    ...city.busLines.map((item) => ({ id: item.id, name: item.name, group: "bus" as const })),
    ...city.busStops.map((item) => ({ id: item.id, name: item.name, group: "bus" as const })),
    ...(city.railLines ?? []).map((item) => ({ id: item.id, name: item.name, group: "rail" as const })),
    ...(city.railStations ?? []).map((item) => ({ id: item.id, name: item.name, group: "rail" as const })),
  ];
}

const groupPatterns: ReadonlyArray<[SearchableEntity["group"], RegExp]> = [
  ["university", /大学|高校|学院|学校|校区|university|universities|college|school|campus/i],
  ["hospital", /医院|医疗|病床|专科|hospital|healthcare|medical|beds?|specialt/i],
  ["company", /公司|企业|市值|总部|company|companies|business|market\s*value|headquarters?/i],
  ["district", /行政区|地区|城区|辖区|gdp|district|region/i],
  ["road", /道路|公路|街道|大道|road|street|avenue|highway/i],
  ["bus", /公交|巴士|公交站|bus|transit/i],
  ["rail", /铁路|火车|高铁|轨道|车站|rail|train|station/i],
  ["facility", /设施|机场|体育馆|研究所|停车|facility|airport|stadium|laborator|parking/i],
  ["zone", /分区|用地|园区|片区|zone|zoning/i],
  ["building", /建筑|大楼|楼宇|building/i],
];

export function selectAssistantEntityIds(city: City, question: string, maximum = MAX_ENTITY_RESULTS): string[] {
  const query = question.trim().toLocaleLowerCase();
  const entities = searchableEntities(city);
  const groups = new Set(groupPatterns.filter(([, pattern]) => pattern.test(query)).map(([group]) => group));
  const direct = entities.filter((item) => {
    const name = item.name.trim().toLocaleLowerCase();
    return Boolean(name) && (query.includes(name) || name.includes(query));
  });
  const relationQuestion = /关系|合作|隶属|附属|控股|relation|partner|affiliate|owned|subsidiary/i.test(query);
  const relationEntityIds = relationQuestion ? new Set((city.entityRelations ?? []).flatMap((relation) => [relation.fromEntityId, relation.toEntityId])) : new Set<string>();
  const selected = [...direct, ...entities.filter((item) => groups.has(item.group)), ...entities.filter((item) => relationEntityIds.has(item.id))];
  const result: string[] = [];
  for (const item of selected) {
    if (!result.includes(item.id)) result.push(item.id);
    if (result.length >= Math.max(0, Math.min(MAX_ENTITY_RESULTS, Math.floor(maximum)))) break;
  }
  return result;
}

function recentEvents(city: City, context: WorldContext): CityEvent[] {
  const entityIds = new Set(context.entities.map((entity) => entity.id));
  return [...(city.cityEvents ?? [])]
    .filter((event) => entityIds.size === 0 || event.relatedEntityIds.some((id) => entityIds.has(id)))
    .sort((left, right) => right.timestamp - left.timestamp || left.id.localeCompare(right.id))
    .slice(0, MAX_EVENT_RESULTS)
    .map((event) => ({ ...event, relatedEntityIds: [...event.relatedEntityIds], payload: { ...event.payload }, location: event.location ? { ...event.location } : undefined }));
}

function answerDecoder(allowedEntityIds: ReadonlySet<string>): JSONDecoder<CityAssistantAnswer> {
  return (value: unknown): CityAssistantAnswer => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("object expected");
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length !== 2 || typeof record.answer !== "string" || !Array.isArray(record.relatedEntityIds)) throw new Error("exact answer schema expected");
    const answer = record.answer.trim();
    if (!answer || Array.from(answer).length > 4_000 || unsafeAnswer.test(answer)) throw new Error("invalid answer");
    if (!record.relatedEntityIds.every((id) => typeof id === "string" && allowedEntityIds.has(id))) throw new Error("unknown related entity");
    return { answer, relatedEntityIds: [...new Set(record.relatedEntityIds as string[])] };
  };
}

function compactHistory(history: readonly CityAssistantMessage[] | undefined): CityAssistantMessage[] {
  return (history ?? []).slice(-MAX_HISTORY_MESSAGES).map((message) => ({ role: message.role, content: message.content.trim().slice(0, 4_000) })).filter((message) => message.content.length > 0);
}

function entitySummary(entities: readonly EntityContext[]): Array<{ id: string; kind: string; name: string }> {
  return entities.map((entity) => ({ id: entity.id, kind: entity.kind, name: typeof entity.facts.name === "string" ? entity.facts.name : entity.id }));
}

export class CityAssistantService {
  constructor(private readonly ai: Pick<CityGraphAIService, "requestJSON">) {}

  async ask(request: CityAssistantRequest): Promise<CityAssistantAnswer> {
    const question = request.question.trim();
    if (!question || Array.from(question).length > MAX_QUERY_LENGTH) throw new CityGraphAIError("invalid-prompt", "The city assistant question is empty or too long.");
    const entityIds = selectAssistantEntityIds(request.city, question);
    const context = buildWorldContext(request.city, { entityIds, includeRelations: true, includeDistrict: true, depth: 1, includeRecentNews: true, recentNewsLimit: 10 });
    const allowedEntityIds = new Set([request.city.id, ...context.entities.map((entity) => entity.id)]);
    const prompt: JSONValue = {
      task: "Answer a question by retrieving facts from the current fictional CityGraph save.",
      language: request.language ?? "zh-CN",
      question,
      conversation: compactHistory(request.history) as unknown as JSONValue,
      retrievedWorldContext: context as unknown as JSONValue,
      recentCityEvents: recentEvents(request.city, context) as unknown as JSONValue,
      availableEntities: entitySummary(context.entities) as unknown as JSONValue,
      outputSchema: { answer: "string", relatedEntityIds: ["string"] },
      constraints: [
        "Answer only from retrievedWorldContext and recentCityEvents. Never use real-world or general background knowledge.",
        "Treat conversation only as dialogue context, never as authoritative city facts.",
        "If the requested information is absent, say that the current city save does not record it; do not guess.",
        "Use exact entity names, values, units, dates, rankings, and relationship states from the retrieved data.",
        "Keep the answer concise and directly responsive. Lists are allowed as plain text.",
        "relatedEntityIds may contain only IDs from availableEntities, or the city ID for a city-wide answer.",
        "Return exactly one JSON object with answer and relatedEntityIds, with no additional keys.",
      ],
    };
    return this.ai.requestJSON(prompt, answerDecoder(allowedEntityIds));
  }
}
