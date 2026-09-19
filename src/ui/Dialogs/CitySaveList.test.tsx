import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { translate, type TranslationKey } from "../../i18n";
import { CitySaveList } from "./CitySaveList";

describe("CitySaveList", () => {
  it("bounds a large library's initial DOM and mounts history only for the expanded city", () => {
    const saves = Array.from({ length: 100 }, (_, city) => Array.from({ length: 50 }, (_, slot) => ({ cityId: `city-${city}`, folderName: `city-${city}-${slot}`, mapName: `CITY-${city}`, saveName: `Save ${slot}`, createdAt: "2026-01-01", updatedAt: "2026-01-01", autosave: slot > 0 }))).flat();
    const html = renderToStaticMarkup(<CitySaveList saves={saves} locale="en-US" onLoad={() => undefined} t={(key: TranslationKey) => translate("en-US", key)}/>);
    expect(html.match(/<details/g)).toHaveLength(12); expect(html.match(/<article/g)).toHaveLength(50); expect(html).toContain("Show more cities"); expect(html).not.toContain("CITY-99");
  });
});
