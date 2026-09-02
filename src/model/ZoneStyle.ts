import type { ZoneType } from "./City";

export const editableZoneTypes = ["residential", "commercial", "education", "medical", "government", "industrial", "office", "green", "mixed", "custom"] as const satisfies readonly ZoneType[];

export const defaultZoneColors: Record<ZoneType, string> = {
  residential: "#cfc2a3", commercial: "#b7a8c9", education: "#9fbfd0", medical: "#d8a6aa", government: "#9eafb9", industrial: "#a59aac", office: "#9caebd", green: "#9fbea5", mixed: "#b7aa9d", custom: "#aab2b5", public: "#9eafb9",
};

export const zoneIconIds = ["house-line", "shopping-bag-open", "graduation-cap", "first-aid", "building-office", "factory", "briefcase", "park", "coffee", "fork-knife", "book-open-text", "letter-circle-p"] as const;

export const defaultZoneIcons: Record<ZoneType, string> = {
  residential: "house-line", commercial: "shopping-bag-open", education: "graduation-cap", medical: "first-aid", government: "building-office", industrial: "factory", office: "briefcase", green: "park", mixed: "coffee", custom: "letter-circle-p", public: "building-office",
};

export const defaultZoneIconColors: Record<ZoneType, string> = {
  residential: "#9b8968", commercial: "#88749d", education: "#668fa3", medical: "#ad747a", government: "#6d838e", industrial: "#786b83", office: "#687f90", green: "#66866d", mixed: "#88776a", custom: "#6e8187", public: "#6d838e",
};
