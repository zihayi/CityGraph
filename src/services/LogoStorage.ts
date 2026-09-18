import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";

export const MAX_CUSTOM_LOGO_BYTES = 8 * 1024 * 1024;
const customLogoPattern = /^custom-logo:([0-9a-f]{64}\.(?:png|jpg|webp))$/;
const supportedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export type LogoStorageErrorCode = "type" | "size" | "read" | "store";

export class LogoStorageError extends Error {
  public constructor(public readonly code: LogoStorageErrorCode) { super(code); }
}

export function isCustomLogoReference(reference: string): boolean {
  return customLogoPattern.test(reference);
}

export function customLogoUrl(reference: string): string | undefined {
  const filename = customLogoPattern.exec(reference)?.[1];
  return filename && isTauri() ? convertFileSrc(filename, "citygraph-logo") : undefined;
}

async function readDataUrl(file: File): Promise<string> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return `data:${file.type};base64,${btoa(binary)}`;
  } catch {
    throw new LogoStorageError("read");
  }
}

export async function storeUploadedLogo(file: File): Promise<string> {
  if (!supportedTypes.has(file.type)) throw new LogoStorageError("type");
  if (file.size > MAX_CUSTOM_LOGO_BYTES) throw new LogoStorageError("size");
  const dataUrl = await readDataUrl(file);
  if (!isTauri()) return dataUrl;
  try {
    const reference = await invoke<string>("store_custom_logo", { dataUrl });
    if (!isCustomLogoReference(reference)) throw new Error("Invalid custom logo reference");
    return reference;
  } catch {
    throw new LogoStorageError("store");
  }
}
