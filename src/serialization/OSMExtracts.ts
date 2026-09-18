import { SaxesParser } from "saxes";
import { MAX_OSM_FILE_BYTES, OSMImportError } from "./OSMImporter";

type Kind = "node" | "way" | "relation";
interface RawElement { kind: Kind; attributes: Record<string, string>; children: Array<{ name: string; attributes: Record<string, string> }> }

/** The official map API returns full referenced ways/nodes. Adjacent extracts overlap. */
export function mergeOSMExtracts(parts: readonly string[]): string {
  if (!parts.length) throw new OSMImportError("empty");
  let bytes = 0; const encoder = new TextEncoder();
  const elements = { node: new Map<string, RawElement>(), way: new Map<string, RawElement>(), relation: new Map<string, RawElement>() };
  for (const text of parts) {
    bytes += encoder.encode(text).byteLength; if (bytes > MAX_OSM_FILE_BYTES) throw new OSMImportError("tooLarge");
    const parser = new SaxesParser({ xmlns: false }); let depth = 0; let current: RawElement | undefined;
    parser.on("doctype", () => { throw new OSMImportError("invalid"); });
    parser.on("opentag", (tag) => {
      depth += 1;
      if (depth > 8) throw new OSMImportError("invalid");
      if (depth === 1 && (tag.name !== "osm" || tag.attributes.version !== "0.6")) throw new OSMImportError("invalid");
      if (depth === 2 && Object.hasOwn(elements, tag.name)) {
        if (!tag.attributes.id || !/^-?\d+$/.test(tag.attributes.id)) throw new OSMImportError("invalid");
        current = { kind: tag.name as Kind, attributes: tag.attributes, children: [] };
      } else if (depth === 3 && current && ["tag", "nd", "member"].includes(tag.name)) current.children.push({ name: tag.name, attributes: tag.attributes });
    });
    parser.on("closetag", () => {
      if (depth === 2 && current) {
        const collection = elements[current.kind]; const previous = collection.get(current.attributes.id!);
        if (!previous || Number(current.attributes.version ?? 0) >= Number(previous.attributes.version ?? 0)) collection.set(current.attributes.id!, current);
        current = undefined;
      }
      depth -= 1;
    });
    try { parser.write(text).close(); } catch (error) { throw error instanceof OSMImportError ? error : new OSMImportError("invalid"); }
  }
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", "&#10;").replaceAll("\r", "&#13;");
  const attributes = (value: Record<string, string>) => Object.entries(value).map(([key, item]) => `${key}="${escape(item)}"`).join(" ");
  const output = ['<?xml version="1.0" encoding="UTF-8"?>', '<osm version="0.6" generator="CityGraph" attribution="https://www.openstreetmap.org/copyright">'];
  for (const collection of Object.values(elements)) for (const element of collection.values()) {
    const source = element.attributes;
    const identity: Record<string, string> = { id: source.id! };
    if (element.kind === "node") { if (!source.lat || !source.lon) throw new OSMImportError("invalid"); identity.lat = source.lat; identity.lon = source.lon; }
    output.push(`<${element.kind} ${attributes(identity)}>`);
    for (const child of element.children) output.push(`<${child.name} ${attributes(child.attributes)}/>`);
    output.push(`</${element.kind}>`);
  }
  output.push("</osm>"); const xml = output.join("\n");
  if (encoder.encode(xml).byteLength > MAX_OSM_FILE_BYTES) throw new OSMImportError("tooLarge");
  return xml;
}
