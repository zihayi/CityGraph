import type { Locale } from "../i18n";
import { facilityDefaultColor } from "./City";

export interface FacilityCatalogEntry {
  type: string;
  icon: string;
  iconUrl: string;
  color: string;
  englishName: string;
}

export type UniversityFacilityCategory = "college" | "laboratory" | "institute" | "library" | "dormitory" | "canteen" | "sports" | "administration" | "medical" | "other";

const iconModules = import.meta.glob<string>("../../assets/facility/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});

const universityIconModules = import.meta.glob<string>("../../assets/university/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});

const chineseNames: Record<string, string> = {
  bakery: "面包店",
  bar: "酒吧",
  bookstore: "书店",
  "bubble-tea": "奶茶店",
  "coffee-shop": "咖啡店",
  company: "公司",
  college: "学院",
  laboratory: "实验室",
  library: "图书馆",
  dormitory: "宿舍",
  canteen: "食堂",
  administration: "行政楼",
  "student-center": "学生活动中心",
  "campus-clinic": "校医院",
  gymnasium: "体育馆",
  "gas-station": "加油站",
  habor: "港口",
  hotel: "酒店",
  lab: "实验室",
  parking: "停车场",
  "pet-shop": "宠物店",
  restaurant: "餐厅",
  store: "商店",
  supermarket: "超市",
  theater: "剧院",
  cinema: "电影院",
  museum: "博物馆",
  hospital: "医院",
  pharmacy: "药店",
  bank: "银行",
  "police-station": "派出所",
  "fire-station": "消防站",
  "post-office": "邮局",
  "community-center": "社区中心",
  "experience-hall": "体验馆",
};

export function formatFacilityName(type: string): string {
  return type.split(/[-_]+/).filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export const facilityCatalog: FacilityCatalogEntry[] = Object.entries(iconModules)
  .map(([path, iconUrl]) => {
    const icon = path.split("/").at(-1) ?? "";
    const type = icon.replace(/\.svg$/i, "");
    return { type, icon, iconUrl, color: facilityDefaultColor(type), englishName: formatFacilityName(type) };
  })
  .filter((entry) => entry.type)
  .sort((a, b) => a.englishName.localeCompare(b.englishName));

const universityOrder = ["college", "laboratory", "library", "dormitory", "canteen", "administration", "student-center", "campus-clinic", "gymnasium"];

export const universityFacilityCatalog: FacilityCatalogEntry[] = Object.entries(universityIconModules)
  .map(([path, iconUrl]) => {
    const icon = path.split("/").at(-1) ?? "";
    const type = icon.replace(/\.svg$/i, "");
    return { type, icon, iconUrl, color: facilityDefaultColor(type), englishName: formatFacilityName(type) };
  })
  .filter((entry) => universityOrder.includes(entry.type))
  .sort((a, b) => universityOrder.indexOf(a.type) - universityOrder.indexOf(b.type));

export function isUniversityFacilityType(type: string): boolean { return universityOrder.includes(type); }

export function universityFacilityCategory(type: string): UniversityFacilityCategory {
  if (type === "college") return "college";
  if (type === "laboratory" || type === "lab") return "laboratory";
  if (type === "institute" || type === "research-institute") return "institute";
  if (type === "library") return "library";
  if (type === "dormitory") return "dormitory";
  if (type === "canteen") return "canteen";
  if (type === "gymnasium" || type === "sports" || type === "athletics") return "sports";
  if (type === "administration") return "administration";
  if (type === "campus-clinic" || type === "hospital" || type === "clinic") return "medical";
  return "other";
}

export function facilityTypeName(type: string, locale: Locale): string {
  return locale === "zh-CN" ? chineseNames[type] ?? formatFacilityName(type) : formatFacilityName(type);
}

export function facilityIconUrl(icon: string, type: string): string | undefined {
  return [...facilityCatalog, ...universityFacilityCatalog].find((entry) => entry.icon === icon)?.iconUrl
    ?? [...facilityCatalog, ...universityFacilityCatalog].find((entry) => entry.type === type)?.iconUrl;
}
