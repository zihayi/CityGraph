import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { translate, type TranslationKey } from "../../i18n";
import { StartScreen } from "./StartScreen";

const props = { saves: [], loading: false, locale: "en-US" as const, musicEnabled: false, musicVolume: 0.25, autoSaveEnabled: true, onLocale: vi.fn(), onMusicEnabled: vi.fn(), onMusicVolume: vi.fn(), onAutoSaveEnabled: vi.fn(), onNew: vi.fn(), onImport: vi.fn(), onDemo: vi.fn(), onLoad: vi.fn(), onRefresh: vi.fn(), t: (key: TranslationKey) => translate("en-US", key) };
describe("StartScreen", () => {
  it("offers explicit new, import and sample actions with initial preferences", () => {
    const html = renderToStaticMarkup(<StartScreen {...props}/>);
    expect(html).toContain("Your city starts here"); expect(html).toContain('aria-label="New Map"'); expect(html).toContain('aria-label="Import OpenStreetMap"'); expect(html).toContain('aria-label="Open Sample City"');
    expect(html).toContain("No saves yet"); expect(html).toContain("Before you begin"); expect(html).not.toContain("Continue Latest Save");
  });
  it("shows the latest save and autosave indicators without opening a map", () => {
    const saves = [{ folderName: "mine", saveName: "My save", mapName: "My city", createdAt: "2026-01-01", updatedAt: "2026-01-02", autosave: true }];
    const html = renderToStaticMarkup(<StartScreen {...props} saves={saves}/>);
    expect(html).toContain("Continue Latest Save"); expect(html).toContain("My city"); expect(html).toContain("My save"); expect(html).toContain("Auto"); expect(props.onLoad).not.toHaveBeenCalled();
  });
});
