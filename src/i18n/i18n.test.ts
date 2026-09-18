import { describe, expect, it } from "vitest";
import enUS from "./en-US";
import zhCN from "./zh-CN";
import { translate } from ".";

describe("i18n", () => {
  it("keeps Chinese and English keys in sync", () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(enUS).sort());
  });
  it("interpolates status values", () => {
    expect(translate("en-US", "save.success", { name: "Harbor" })).toBe("Saved Harbor");
  });
  it("translates the high-speed rail station zone", () => {
    expect(translate("en-US", "zone.type.high-speed-rail-station")).toBe("High-Speed Rail Station");
    expect(translate("zh-CN", "zone.type.high-speed-rail-station")).toBe("高铁站");
  });
  it("translates train station and airport zones", () => {
    expect(["train-station", "airport"].map((type) => translate("zh-CN", `zone.type.${type}` as keyof typeof enUS))).toEqual(["火车站", "飞机场"]);
  });
  it("translates recreation zone types", () => {
    expect(["zoo", "amusement-park", "golf-course", "resort"].map((type) => translate("zh-CN", `zone.type.${type}` as keyof typeof enUS))).toEqual(["动物园", "游乐园", "高尔夫球场", "度假村"]);
  });
});
