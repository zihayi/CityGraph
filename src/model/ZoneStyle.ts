import type { ZoneType } from "./City";
import { zoneIconIds as assetZoneIconIds } from "./ZoneIconAssets";

export const editableZoneTypes = ["residential", "commercial", "education", "medical", "government", "industrial", "office", "green", "tourism", "zoo", "amusement-park", "golf-course", "resort", "high-speed-rail-station", "train-station", "airport", "ferry-terminal", "custom"] as const satisfies readonly ZoneType[];

export const defaultZoneColors: Record<ZoneType, string> = {
  "ferry-terminal": "#a5c8cc",
  residential: "#cfc2a3", commercial: "#b7a8c9", education: "#9fbfd0", medical: "#d8a6aa", government: "#9eafb9", industrial: "#a59aac", office: "#9caebd", green: "#9fbea5", tourism: "#d7bd8a", zoo: "#afc392", "amusement-park": "#d7a7a2", "golf-course": "#9fc49d", resort: "#cab78f", "high-speed-rail-station": "#a7c2cb", "train-station": "#b8c4cf", airport: "#b9c9d7", mixed: "#b7aa9d", custom: "#aab2b5", public: "#9eafb9",
};

export const zoneIconIds = assetZoneIconIds;

export const defaultZoneIcons: Record<ZoneType, string> = {
  "ferry-terminal": "ferry-terminal",
  residential: "residential", commercial: "commercial", education: "education", medical: "medical", government: "government", industrial: "industrial", office: "office", green: "park", tourism: "tourism", zoo: "zoo", "amusement-park": "amusement-park", "golf-course": "golf-course", resort: "resort", "high-speed-rail-station": "high-speed-rail-station", "train-station": "train-station", airport: "airport", mixed: "commercial", custom: "custom", public: "government",
};

export const defaultZoneIconColors: Record<ZoneType, string> = {
  "ferry-terminal": "#367f95",
  residential: "#9b8968", commercial: "#88749d", education: "#668fa3", medical: "#ad747a", government: "#6d838e", industrial: "#786b83", office: "#687f90", green: "#66866d", tourism: "#9c743c", zoo: "#557b43", "amusement-park": "#a95d62", "golf-course": "#4d7d52", resort: "#8b6937", "high-speed-rail-station": "#2f7580", "train-station": "#526c82", airport: "#48718f", mixed: "#88776a", custom: "#6e8187", public: "#6d838e",
};
