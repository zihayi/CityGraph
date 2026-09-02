import { Container, Graphics } from "pixi.js";
import type { City } from "../model/City";
import type { EditorSelection } from "../editor/Editor";

export class BuildingRenderer {
  public render(city: City, selection: EditorSelection = null): Container {
    const container = new Container();

    for (const building of city.buildings) {
      const isPublic = building.type === "public";
      const shape = new Graphics()
        .roundRect(0, 0, building.width, building.height, 2)
        .fill({ color: isPublic ? 0xd7b4a4 : 0xe3e1db })
        .stroke({ color: selection?.kind === "building" && selection.id === building.id ? 0x168cff : isPublic ? 0xb88975 : 0xc8c7c1, width: selection?.kind === "building" && selection.id === building.id ? 3 : 1.2 });
      shape.position.set(building.x, building.y);
      shape.rotation = building.rotation;
      container.addChild(shape);
    }

    return container;
  }
}
