import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "../../editor/Editor";
import { createEmptyCompany, createEmptyHospital, createEmptyUniversity } from "../../model/City";
import { createNewCity } from "../../model/mapGenerator";
import { translate, type TranslationKey } from "../../i18n";
import { UniversityPanel } from "./UniversityPanel";

vi.mock("../../app/store/editorStore", () => ({
  useEditorStore: Object.assign((select: (state: { locale: "en-US" }) => unknown) => select({ locale: "en-US" }), { getState: () => ({}) }),
}));

const t = (key: TranslationKey) => translate("en-US", key);

function fixture() {
  const city = createNewCity({ name: "Alumni", size: "small", terrain: "flat", lakeCount: 1 });
  const university = { ...createEmptyUniversity("university"), name: "City University", alumniCompanies: [{ id: "legacy", name: "Legacy Entry", logo: "", notes: "No valuation data" }] };
  const campus = { id: "campus", name: "Main Campus", type: "education" as const, polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }], source: "custom" as const, opacity: 0.5, universityId: university.id, campusRole: "main" as const };
  city.universities = [university];
  city.zones = [campus];
  city.companies = [
    { ...createEmptyCompany("small"), name: "Small Alumni", alumniUniversityId: university.id, marketValue: 50 },
    { ...createEmptyCompany("large"), name: "Large Alumni", alumniUniversityId: university.id, marketValue: 200 },
    { ...createEmptyCompany("unknown"), name: "Unknown Alumni", alumniUniversityId: university.id, marketValue: null },
    { ...createEmptyCompany("unmapped"), name: "Unmapped Alumni", alumniUniversityId: university.id, marketValue: 100 },
    { ...createEmptyCompany("other"), name: "Other University", alumniUniversityId: "other", marketValue: 900 },
  ];
  city.facilities = city.companies.filter((company) => company.id !== "unmapped").map((company) => ({ id: `${company.id}-office`, type: "company", name: company.name, position: { x: 10, y: 10 }, icon: "", color: "#4776a8", companyId: company.id }));
  return { editor: new Editor(city), campus };
}

describe("UniversityPanel alumni valuation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the market value total in the university overview", () => {
    const { editor, campus } = fixture();
    const html = renderToStaticMarkup(<UniversityPanel editor={editor} campus={campus} onClose={vi.fn()} t={t}/>);
    expect(html).toContain("Alumni Company Market Value");
    expect(html).toContain("350 CNY 100M");
    expect(html).toContain("4 Alumni Companies");
    expect(html).not.toContain("1,250 CNY 100M");
  });

  it("orders linked alumni by value, displays university-specific ranks and preserves legacy entries", () => {
    const { editor, campus } = fixture();
    const html = renderToStaticMarkup(<UniversityPanel editor={editor} campus={campus} initialTab="alumni" onClose={vi.fn()} t={t}/>);
    const names = ["Large Alumni", "Unmapped Alumni", "Small Alumni", "Unknown Alumni"];
    expect(names.map((name) => html.indexOf(name))).toEqual([...names.map((name) => html.indexOf(name))].sort((a, b) => a - b));
    expect(html).toContain("350 CNY 100M");
    expect(html).toContain("Alumni companies without a market value: 1");
    expect(html).toContain("Alumni Market Value Rank: #1");
    expect(html).toContain("Alumni Market Value Rank: #2");
    expect(html).toContain("Alumni Market Value Rank: #3");
    expect(html).toContain("Not ranked by market value");
    expect(html).toContain("No mapped locations");
    expect(html).toContain("Legacy Entry");
    expect(html).not.toContain("Other University");
  });
});

describe("UniversityPanel affiliated hospitals", () => {
  it("shows hospital names once across campuses and preserves unassigned medical affiliations", () => {
    const { editor, campus } = fixture(); const city = editor.state.city;
    city.hospitals = [
      { ...createEmptyHospital("hospital"), name: "University General Hospital", grade: "Grade III", affiliatedUniversityId: "university" },
      { ...createEmptyHospital("independent"), name: "Independent Hospital" },
    ];
    city.zones.push(
      { ...campus, id: "medical-main", name: "", type: "medical", universityId: undefined, campusRole: undefined, hospitalId: "hospital", hospitalCampusRole: "main", affiliatedUniversityId: "university" },
      { ...campus, id: "medical-branch", name: "East Campus", type: "medical", universityId: undefined, campusRole: undefined, hospitalId: "hospital", hospitalCampusRole: "branch", affiliatedUniversityId: "university" },
      { ...campus, id: "unassigned", name: "Legacy Medical Zone", type: "medical", universityId: undefined, campusRole: undefined, affiliatedUniversityId: "university" },
    );
    const html = renderToStaticMarkup(<UniversityPanel editor={editor} campus={campus} initialTab="hospitals" onClose={vi.fn()} t={t}/>);
    expect(html.match(/University General Hospital/g)).toHaveLength(1);
    expect(html).toContain("Grade III");
    expect(html).toContain("2 Campuses");
    expect(html).toContain("Legacy Medical Zone");
    expect(html).not.toContain("Independent Hospital");
    expect(html).not.toContain(t("university.unnamedAffiliation"));
  });

  it("uses the hospital affiliation even when campus metadata is missing", () => {
    const { editor, campus } = fixture();
    editor.state.city.hospitals = [{ ...createEmptyHospital("hospital"), name: "Unmapped Hospital", affiliatedUniversityId: "university" }];
    const html = renderToStaticMarkup(<UniversityPanel editor={editor} campus={campus} initialTab="hospitals" onClose={vi.fn()} t={t}/>);
    expect(html).toContain("Unmapped Hospital");
    expect(html).not.toContain(t("university.noAffiliatedHospitals"));
  });
});
