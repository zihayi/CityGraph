import { Container } from "pixi.js";
import type { EditorSelection } from "../editor/Editor";

export function selectedEntityIds(selection: EditorSelection, kind: "zone" | "park" | "district" | "water" | "building" | "poi"): Set<string> {
  if (selection?.kind === "spatial-group") return new Set(selection.items.filter((item) => item.kind === kind).map((item) => item.id));
  if (kind === "building" && selection?.kind === "building-multi") return new Set(selection.ids);
  return new Set(selection?.kind === kind ? [selection.id] : []);
}

/** Model refresh owns record rebinding; selection work only visits changed IDs. */
export class RetainedRegionLayer<T extends { id: string }> {
  public readonly container: Container;
  public readonly records = new Map<string, { model: T; container: Container; index: number }>();
  private selected: Set<string>;

  public constructor(models: readonly T[], selected: Set<string>, private readonly draw: (model: T, selected: boolean, index: number, container: Container) => void, container = new Container()) {
    this.container = container;
    this.selected = selected;
    models.forEach((model, index) => {
      const entity = new Container({ label: `entity:${model.id}` });
      this.records.set(model.id, { model, container: entity, index });
      this.draw(model, selected.has(model.id), index, entity);
      container.addChild(entity);
    });
  }

  public setSelection(selected: Set<string>, invalidate?: "selected" | "all"): void {
    const dirty = invalidate === "all" ? this.records.keys() : new Set([...this.selected, ...selected]);
    for (const id of dirty) {
      if (!invalidate && this.selected.has(id) === selected.has(id)) continue;
      const record = this.records.get(id);
      if (!record) continue;
      record.container.removeChildren().forEach((child) => child.destroy({ children: true }));
      this.draw(record.model, selected.has(id), record.index, record.container);
    }
    this.selected = selected;
  }
}
