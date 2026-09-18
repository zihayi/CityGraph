import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Editor } from "../../editor/Editor";
import { createEmptyCompany, createEmptyUniversity, type City } from "../../model/City";
import { createNewCity } from "../../model/mapGenerator";
import { translate, type TranslationKey } from "../../i18n";
import { CityInformationPanel } from "./CityInformationPanel";
import { DistrictPanel } from "../RightPanel/DistrictPanel";

vi.mock("../../app/store/editorStore", () => ({ useEditorStore: (select: (state: { locale: string }) => unknown) => select({ locale: "en-US" }) }));

const t = (key: TranslationKey) => translate("en-US", key);
function fixture(): City {
  const city = createNewCity({ name: "Statistics", size: "small", terrain: "flat", lakeCount: 1 });
  const points = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }];
  city.districts = [{ id: "harbor", name: "Harbor District", points, gdp: 300, gdpYear: 2026 }];
  city.companies = [
    { ...createEmptyCompany("known"), name: "Known HQ Company", marketValue: 150 },
    { ...createEmptyCompany("unknown"), name: "Unknown HQ Company" },
    { ...createEmptyCompany("branch"), name: "Branch Only Company", marketValue: 999 },
  ];
  city.facilities = city.companies.map((company, index) => ({ id: company.id, name: `${company.id} office`, type: "company", position: { x: 100 + index * 10, y: 100 }, color: "#4776a8", icon: "", companyId: company.id, isCompanyHeadquarters: company.id !== "branch" }));
  city.universities = [{ ...createEmptyUniversity("university"), name: "Harbor University" }];
  city.zones = ["main", "branch"].map((id) => ({ id, name: id, type: "education", polygon: points, source: "custom", opacity: 0.5, universityId: "university" }));
  return city;
}
const ranking = (city: City, kind: "district" | "company") => renderToStaticMarkup(<CityInformationPanel city={city} locale="en-US" selected={{ kind, id: "harbor" }} onSelect={vi.fn()} onReorderUniversityRankings={vi.fn()} onUpdateCompanyMarketValue={vi.fn()} onClose={vi.fn()} t={t}/>);
const detail = (city: City) => renderToStaticMarkup(<DistrictPanel editor={{ state: { city } } as Editor} district={city.districts[0]!} t={t}/>);

describe("District statistics presentation", () => {
  it("shows all seven ranking choices, district counts, year and known HQ subtotal", () => {
    const html = ranking(fixture(), "district");
    for (const metric of ["gdp", "area", "facilities", "zones", "universities", "headquarters", "headquartersMarketValue"]) expect(html).toContain(`value="${metric}"`);
    expect(html).toContain("1 km\u00b2");
    expect(html).toContain("2026");
    expect(html).toContain("150 CNY 100M");
    expect(html).toContain("Headquartered companies without a valuation");
    expect(html).toContain("<b>3</b><small>Facilities</small>");
    expect(html).toContain("<b>2</b><small>Zones</small>");
    expect(html).toContain("<b>1</b><small>Universities</small>");
    expect(html).toContain("<b>2</b><small>Headquarters</small>");
    expect(html).not.toContain("999 CNY");
  });

  it("renders named directories with deduplicated universities and no branch valuation", () => {
    const html = detail(fixture());
    for (const name of ["Harbor District", "Known HQ Company", "Unknown HQ Company", "Harbor University", "branch office"]) expect(html).toContain(name);
    expect(html).toContain("150 CNY 100M");
    expect(html).toContain("2 campuses");
    expect(html).toContain("How Statistics Are Calculated");
    expect(html).not.toContain("999 CNY");
  });

  it("distinguishes entirely unknown valuations from an empty district's zero total", () => {
    const city = fixture();
    city.companies[0]!.marketValue = null;
    expect(detail(city)).toContain("<strong>Not set</strong>");
    expect(detail(city)).not.toContain("<strong>0 CNY 100M</strong>");
    city.facilities = []; city.zones = [];
    const empty = detail(city);
    expect(empty).toContain("0 CNY 100M");
    expect(empty).toContain("No facilities in this district.");
    expect(empty).toContain("No zones in this district.");
    expect(empty).toContain("No campuses linked to a university");
  });

  it("shows headquarters district in company rankings", () => {
    const html = ranking(fixture(), "company");
    expect(html).toContain("Headquarters: Harbor District");
    expect(html).toContain("150 CNY 100M");
    expect(html).toContain('aria-label="Edit market value"');
  });
});
