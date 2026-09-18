import { afterEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({ enabled: false, invoke: vi.fn(), convertFileSrc: vi.fn((path: string, protocol: string) => `${protocol}://${path}`) }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => tauri.enabled, invoke: tauri.invoke, convertFileSrc: tauri.convertFileSrc }));

import { customLogoUrl, isCustomLogoReference, LogoStorageError, MAX_CUSTOM_LOGO_BYTES, storeUploadedLogo } from "./LogoStorage";

function imageFile(type = "image/png", bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])): File {
  return { type, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer } as File;
}

afterEach(() => { tauri.enabled = false; tauri.invoke.mockReset(); tauri.convertFileSrc.mockClear(); });

describe("LogoStorage", () => {
  it("keeps browser uploads as data URLs", async () => {
    expect(await storeUploadedLogo(imageFile())).toBe("data:image/png;base64,iVBORw==");
  });

  it("stores desktop uploads once and returns a validated reference", async () => {
    const reference = `custom-logo:${"a".repeat(64)}.png`; tauri.enabled = true; tauri.invoke.mockResolvedValue(reference);
    expect(await storeUploadedLogo(imageFile())).toBe(reference);
    expect(tauri.invoke).toHaveBeenCalledWith("store_custom_logo", { dataUrl: "data:image/png;base64,iVBORw==" });
    expect(customLogoUrl(reference)).toBe(`citygraph-logo://${"a".repeat(64)}.png`);
  });

  it("rejects unsupported, oversized, and unsafe references", async () => {
    await expect(storeUploadedLogo(imageFile("image/svg+xml"))).rejects.toMatchObject({ code: "type" } satisfies Partial<LogoStorageError>);
    await expect(storeUploadedLogo({ ...imageFile(), size: MAX_CUSTOM_LOGO_BYTES + 1 } as File)).rejects.toMatchObject({ code: "size" } satisfies Partial<LogoStorageError>);
    expect(isCustomLogoReference("custom-logo:../secret.png")).toBe(false);
  });
});
