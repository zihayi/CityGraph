import type { Point } from "./Point";
import type { Block } from "../model/City";

export interface BlockGridRoad {
  start: Point;
  end: Point;
}

export interface BlockGridPlan {
  blocks: Block[];
  roads: BlockGridRoad[];
}

const MIN_BLOCK_SIZE = 4;

export function createBlockGrid(first: Point, opposite: Point, rows: number, columns: number, roadWidth: number): BlockGridPlan | undefined {
  const rowCount = Math.round(rows);
  const columnCount = Math.round(columns);
  const width = Math.abs(opposite.x - first.x);
  const height = Math.abs(opposite.y - first.y);
  if (!Number.isFinite(roadWidth) || roadWidth <= 0 || rowCount < 1 || columnCount < 1) return undefined;

  const minX = Math.min(first.x, opposite.x);
  const maxX = Math.max(first.x, opposite.x);
  const minY = Math.min(first.y, opposite.y);
  const maxY = Math.max(first.y, opposite.y);
  const cellWidth = (width - (columnCount + 1) * roadWidth) / columnCount;
  const cellHeight = (height - (rowCount + 1) * roadWidth) / rowCount;
  if (cellWidth < MIN_BLOCK_SIZE || cellHeight < MIN_BLOCK_SIZE) return undefined;

  const verticalRoads = Array.from({ length: columnCount + 1 }, (_, index) => minX + roadWidth / 2 + index * (cellWidth + roadWidth));
  const horizontalRoads = Array.from({ length: rowCount + 1 }, (_, index) => minY + roadWidth / 2 + index * (cellHeight + roadWidth));
  const roads: BlockGridRoad[] = [
    ...verticalRoads.map((x) => ({ start: { x, y: minY + roadWidth / 2 }, end: { x, y: maxY - roadWidth / 2 } })),
    ...horizontalRoads.map((y) => ({ start: { x: minX + roadWidth / 2, y }, end: { x: maxX - roadWidth / 2, y } })),
  ];
  const blocks: Block[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      const left = verticalRoads[column]! + roadWidth / 2;
      const right = verticalRoads[column + 1]! - roadWidth / 2;
      const top = horizontalRoads[row]! + roadWidth / 2;
      const bottom = horizontalRoads[row + 1]! - roadWidth / 2;
      blocks.push({
        id: `block-${crypto.randomUUID()}`,
        polygon: [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }],
      });
    }
  }
  return { blocks, roads };
}
