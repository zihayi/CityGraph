import { describe, expect, it, vi } from "vitest";
import { CITYGRAPH_AI_SYSTEM_PROMPT, CityGraphAIError, CityGraphAIService, parseAIJSON } from "./CityGraphAIService";

describe("CityGraphAIService", () => {
  it("uses one runtime-key request and the Chinese fictional-world JSON policy", async () => {
    const invoke = vi.fn(async () => "{\"answer\":42}");
    const service = new CityGraphAIService({ apiKey: " secret ", model: " deepseek-chat " }, invoke);
    await expect(service.requestJSON({ task: "answer" }, (value) => value as { answer: number })).resolves.toEqual({ answer: 42 });

    expect(invoke).toHaveBeenCalledWith("deepseek_citygraph_ai", {
      apiKey: "secret",
      model: "deepseek-chat",
      systemPrompt: CITYGRAPH_AI_SYSTEM_PROMPT,
      prompt: '{"task":"answer"}',
    });
    expect(CITYGRAPH_AI_SYSTEM_PROMPT).toContain("优先顺序");
    expect(CITYGRAPH_AI_SYSTEM_PROMPT).toContain("哈佛大学");
    expect(CITYGRAPH_AI_SYSTEM_PROMPT).toContain("美国马萨诸塞州");
    expect(CITYGRAPH_AI_SYSTEM_PROMPT).toContain("已投入使用");
    expect(CITYGRAPH_AI_SYSTEM_PROMPT).toContain("只返回一个有效 JSON 值");
  });

  it("keeps transport failures opaque and supports runtime reconfiguration", async () => {
    const invoke = vi.fn(async (_command: string, _args: Record<string, unknown>) => { throw new Error("secret backend detail"); });
    const service = new CityGraphAIService({ apiKey: "first", model: "old" }, invoke);
    service.configure({ apiKey: "second", model: "new" });
    await expect(service.requestJSON("request", (value) => value)).rejects.toMatchObject({ code: "request-failed", message: "The CityGraph AI request failed." });
    expect(invoke.mock.calls[0]?.[1]).toMatchObject({ apiKey: "second", model: "new" });
  });

  it("accepts plain JSON and rejects fenced or mixed responses", () => {
    expect(parseAIJSON("\uFEFF[1,2,3]")).toEqual([1, 2, 3]);
    expect(() => parseAIJSON("```json\n{\"ok\":true}\n```")).toThrowError(CityGraphAIError);
    expect(() => parseAIJSON("Here is JSON: {\"ok\":true}")).toThrowError(CityGraphAIError);
  });

  it("validates configuration, prompts, and decoded schemas", async () => {
    expect(() => new CityGraphAIService({ apiKey: "", model: "model" })).toThrowError("API key and model");
    const service = new CityGraphAIService({ apiKey: "key", model: "model" }, async () => "{\"wrong\":true}");
    await expect(service.requestJSON(" ", (value) => value)).rejects.toMatchObject({ code: "invalid-prompt" });
    await expect(service.requestJSON("valid", () => { throw new Error("schema"); })).rejects.toMatchObject({ code: "invalid-response" });
  });
});
