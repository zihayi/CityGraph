export interface UniversityLogoAsset { key: string; name: string; url: string }

const rootLogoModules = import.meta.glob<string>("../../assets/logo/*.{svg,png,jpg,jpeg,webp}", {
  eager: true,
  query: "?url",
  import: "default",
});
const universityLogoModules = import.meta.glob<string>("../../assets/university/Logo/*.{svg,png,jpg,jpeg,webp}", { eager: true, query: "?url", import: "default" });
const companyLogoModules = import.meta.glob<string>("../../assets/enterprise/Logo/*.{svg,png,jpg,jpeg,webp}", { eager: true, query: "?url", import: "default" });

function createCatalog(modules: Record<string, string>, prefix: string, label: string): UniversityLogoAsset[] {
  return Object.entries(modules).sort(([left], [right]) => left.localeCompare(right)).map(([path, url], index) => { const filename = path.split("/").at(-1) ?? path; const originalName = filename.replace(/\.[^.]+$/, ""); return { key: `asset:${prefix}${filename}`, name: /^ChatGPT Image /i.test(originalName) ? `${label} ${index + 1}` : originalName, url }; });
}

const rootLogoCatalog = createCatalog(rootLogoModules, "", "Logo");
export const universityLogoCatalog: UniversityLogoAsset[] = [...rootLogoCatalog, ...createCatalog(universityLogoModules, "university/", "University Logo")];
export const alumniCompanyLogoCatalog: UniversityLogoAsset[] = [...rootLogoCatalog, ...createCatalog(companyLogoModules, "enterprise/", "Company Logo")];
const allLogoCatalog = [...universityLogoCatalog, ...alumniCompanyLogoCatalog];

export function universityLogoUrl(reference: string): string | undefined {
  if (reference.startsWith("data:image/")) return reference;
  return allLogoCatalog.find((asset) => asset.key === reference)?.url;
}
