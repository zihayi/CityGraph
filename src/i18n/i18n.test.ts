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
});
