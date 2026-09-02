import type { Locale } from "../i18n";
import { facilityDefaultColor } from "./City";

export interface FacilityCatalogEntry {
  type: string;
  icon: string;
  iconUrl: string;
  color: string;
  englishName: string;
}

const iconModules = import.meta.glob<string>("../../assets/facility/*.svg", {
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
  "gas-station": "加油站",
  habor: "港口",
  hotel: "酒店",
  lab: "实验室",
  parking: "停车场",
  "pet-shop": "宠物店",
  restaurant: "餐厅",
  store: "商店",
  supermarket: "超市",
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

export function facilityTypeName(type: string, locale: Locale): string {
  return locale === "zh-CN" ? chineseNames[type] ?? formatFacilityName(type) : formatFacilityName(type);
}

export function facilityIconUrl(icon: string, type: string): string | undefined {
  return facilityCatalog.find((entry) => entry.icon === icon)?.iconUrl
    ?? facilityCatalog.find((entry) => entry.type === type)?.iconUrl;
}
