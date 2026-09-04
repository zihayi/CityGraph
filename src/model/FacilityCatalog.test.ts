import { describe, expect, it } from "vitest";
import { facilityCatalog, facilityTypeName, universityFacilityCatalog } from "./FacilityCatalog";
import { facilityDefaultColor } from "./City";

describe("facility catalog", () => {
  it("includes uploaded facility icons with localized names", () => {
    expect(facilityCatalog.find((entry) => entry.type === "company")?.icon).toBe("company.svg");
    expect(facilityCatalog.find((entry) => entry.type === "lab")?.icon).toBe("lab.svg");
    expect(facilityCatalog.find((entry) => entry.type === "theater")?.icon).toBe("theater.svg");
    expect(facilityCatalog.find((entry) => entry.type === "experience-hall")?.icon).toBe("experience-hall.svg");
    expect(facilityTypeName("company", "zh-CN")).toBe("公司");
    expect(facilityTypeName("lab", "zh-CN")).toBe("实验室");
    expect(facilityTypeName("theater", "zh-CN")).toBe("剧院");
    expect(facilityTypeName("experience-hall", "zh-CN")).toBe("体验馆");
  });

  it("uses the current city palette as each facility type default", () => {
    const expected = {
      bakery: "#ab8f03", parking: "#5389d0", restaurant: "#f09833", supermarket: "#2d9f9b",
      "bubble-tea": "#099584", "coffee-shop": "#98502a", store: "#5f68dd", hotel: "#7749bc",
      "gas-station": "#cb102c", bookstore: "#9f702d", bar: "#dcb7d4", "pet-shop": "#c4b464", habor: "#0078c2",
    };
    for (const [type, color] of Object.entries(expected)) expect(facilityDefaultColor(type)).toBe(color);
    expect(facilityCatalog.every((entry) => entry.color === facilityDefaultColor(entry.type))).toBe(true);
  });

  it("loads every university facility icon in the requested order", () => {
    expect(universityFacilityCatalog.map((entry) => entry.type)).toEqual(["college", "laboratory", "library", "dormitory", "canteen", "administration", "student-center", "campus-clinic", "gymnasium"]);
    expect(facilityTypeName("student-center", "zh-CN")).toBe("学生活动中心");
  });
});
