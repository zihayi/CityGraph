interface ZoneIconAsset {
  path: string;
  viewBox: string;
}

const iconModules = import.meta.glob<string>("../../assets/zone/*.svg", {
  eager: true,
  query: "?raw",
  import: "default",
});

const assets = new Map<string, ZoneIconAsset>(Object.entries(iconModules).map(([file, raw]) => {
  const id = (file.split("/").at(-1) ?? "custom.svg").replace(/\.svg$/i, "");
  return [id, {
    path: raw.match(/<path\b[^>]*\bd=["']([^"']+)["']/i)?.[1] ?? "",
    viewBox: raw.match(/\bviewBox=["']([^"']+)["']/i)?.[1] ?? "0 0 256 256",
  }];
}));

const legacyAliases: Record<string, string> = {
  "book-open-text": "education",
  briefcase: "office",
  "building-office": "government",
  coffee: "commercial",
  factory: "industrial",
  "first-aid": "medical",
  "fork-knife": "commercial",
  "graduation-cap": "education",
  "house-line": "residential",
  "letter-circle-p": "custom",
  "shopping-bag-open": "commercial",
};

export const zoneIconIds = [...assets.keys()].sort();

function zoneIconAsset(icon: string): ZoneIconAsset {
  return assets.get(icon) ?? assets.get(legacyAliases[icon] ?? "") ?? assets.get("custom") ?? { path: "", viewBox: "0 0 256 256" };
}

export function zoneIconPath(icon: string): string { return zoneIconAsset(icon).path; }
export function zoneIconViewBox(icon: string): string { return zoneIconAsset(icon).viewBox; }
