import { invoke } from "@tauri-apps/api/core";

export const CITYGRAPH_AI_SYSTEM_PROMPT = [
  "你是 CityGraph 架空世界中的 AI 助手。CityGraph 是完全架空的世界。",
  "University、Company、Hospital、Facility、District、Zone、Transit、EntityRelation、CityEvent、NewsArticle 等输入数据，是这个世界的事实。即使实体名称与现实世界完全相同，也不得使用现实世界知识解释该实体。",
  "当前 CityGraph 存档中的设定拥有最高优先级。例如，如果输入中的 NVIDIA 是新能源汽车公司，你必须把它描述为新能源汽车公司，不得提到输入中不存在的 GPU、CUDA、美国公司、现实高管等信息。",
  "事实优先顺序：1. 当前 CityGraph Save；2. 当前 CityEvent；3. EntityRelation；4. CityGraph 历史 NewsArticle。",
  "禁止使用现实世界公司资料、现实大学资料、现实排名、现实人物、现实地理资料以及模型记忆中的现实实体信息，除非明确进入 Real World Mode。当前模式始终为 fictional。",
  "例如，不得因为输入实体名为哈佛大学而补充美国马萨诸塞州等现实信息。",
  "你只能基于输入事实生成内容，缺少的数据不要猜测。严禁虚构人物、金额、人口、面积、排名、员工数量、学生数量、投资额、机构、历史、合作关系和科研成果。",
  "严格区分已发生事实、规划、提议和资料变更。除非输入明确说明，禁止声称项目已建成、已开放、已投入使用、已产生影响，或无历史新闻支撑地使用“此前”。",
  "按任务要求的语言写作，文字应自然、正式、克制、简洁，并严格遵守长度和输出字段要求。",
  "只返回一个有效 JSON 值。禁止 Markdown 代码块、解释、前言、注释或任何 JSON 之外的文字。",
].join("\n");

export interface CityGraphAISettings {
  apiKey: string;
  model: string;
}

export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | { readonly [key: string]: JSONValue } | readonly JSONValue[];
export type JSONDecoder<T> = (value: unknown) => T;
export type CityGraphAIErrorCode = "invalid-config" | "invalid-prompt" | "request-failed" | "invalid-response";

export class CityGraphAIError extends Error {
  readonly code: CityGraphAIErrorCode;

  constructor(code: CityGraphAIErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CityGraphAIError";
    this.code = code;
  }
}

type Invoke = (command: string, args: Record<string, unknown>) => Promise<unknown>;
const MAX_RESPONSE_LENGTH = 1_000_000;

function normalizedSettings(settings: CityGraphAISettings): CityGraphAISettings {
  const apiKey = settings.apiKey.trim();
  const model = settings.model.trim();
  if (!apiKey || !model) throw new CityGraphAIError("invalid-config", "An API key and model are required.");
  return { apiKey, model };
}

function promptText(prompt: string | JSONValue): string {
  if (typeof prompt === "string") {
    const value = prompt.trim();
    if (!value) throw new CityGraphAIError("invalid-prompt", "The AI prompt cannot be empty.");
    return value;
  }
  try {
    return JSON.stringify(prompt);
  } catch (cause) {
    throw new CityGraphAIError("invalid-prompt", "The AI prompt must be JSON serializable.", { cause });
  }
}

export function parseAIJSON(content: string): unknown {
  if (typeof content !== "string" || content.length > MAX_RESPONSE_LENGTH) throw new CityGraphAIError("invalid-response", "The AI response is missing or too large.");
  const source = content.trim().replace(/^\uFEFF/, "");
  if (!source) throw new CityGraphAIError("invalid-response", "The AI returned an empty response.");
  try {
    return JSON.parse(source) as unknown;
  } catch (cause) {
    throw new CityGraphAIError("invalid-response", "The AI response is not valid JSON.", { cause });
  }
}

export class CityGraphAIService {
  #settings: CityGraphAISettings;
  readonly #invoke: Invoke;

  constructor(settings: CityGraphAISettings, invokeCommand: Invoke = invoke) {
    this.#settings = normalizedSettings(settings);
    this.#invoke = invokeCommand;
  }

  configure(settings: Partial<CityGraphAISettings>): void {
    this.#settings = normalizedSettings({ ...this.#settings, ...settings });
  }

  async requestJSON<T>(prompt: string | JSONValue, decode: JSONDecoder<T>): Promise<T> {
    const text = promptText(prompt);
    let content: string;
    try {
      const response = await this.#invoke("deepseek_citygraph_ai", {
        apiKey: this.#settings.apiKey,
        model: this.#settings.model,
        systemPrompt: CITYGRAPH_AI_SYSTEM_PROMPT,
        prompt: text,
      });
      if (typeof response !== "string") throw new Error("non-string response");
      content = response;
    } catch (cause) {
      throw new CityGraphAIError("request-failed", "The CityGraph AI request failed.", { cause });
    }
    const parsed = parseAIJSON(content);
    try {
      return decode(parsed);
    } catch (cause) {
      if (cause instanceof CityGraphAIError) throw cause;
      throw new CityGraphAIError("invalid-response", "The AI response does not match the requested schema.", { cause });
    }
  }
}
