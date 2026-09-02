import type { Point } from "../geometry/Point";
import { createBuildingPreset } from "../geometry/BuildingGeometry";
import type {
  Block,
  Building,
  BuildingType,
  City,
  Road,
  RoadEdge,
  RoadNode,
  RoadSubtype,
} from "./City";

const roadNodes: RoadNode[] = [];
const roads: Road[] = [];
const roadEdges: RoadEdge[] = [];
let roadNodeId = 0;
let roadEdgeId = 0;

function addRoadPath(points: Point[], subtype: RoadSubtype, width: number, name = ""): void {
  if (points.length < 2) return;
  const roadId = `road-${roads.length}`;
  const nodes = points.map((point) => ({ id: `node-${roadNodeId++}`, ...point }));
  roadNodes.push(...nodes);
  const segmentIds: string[] = [];
  for (let index = 1; index < nodes.length; index += 1) {
    const start = nodes[index - 1]; const end = nodes[index];
    if (!start || !end) continue;
    const segmentId = `edge-${roadEdgeId++}`; segmentIds.push(segmentId);
    roadEdges.push({ id: segmentId, roadId, name, startNodeId: start.id, endNodeId: end.id, structure: "ground", level: 0, geometry: { type: "line" } });
  }
  roads.push({ id: roadId, category: subtype === "highway" || subtype === "ramp" ? "highway" : "normal", subtype, width, name, segmentIds });
}

function createRoadNetwork(): void {
  roadNodes.length = 0;
  roads.length = 0;
  roadEdges.length = 0;
  roadNodeId = 0;
  roadEdgeId = 0;

  addRoadPath(
    [
      { x: 30, y: 500 },
      { x: 350, y: 470 },
      { x: 650, y: 485 },
      { x: 860, y: 490 },
      { x: 1120, y: 475 },
      { x: 1560, y: 420 },
    ],
    "large",
    22,
    "Harbor Avenue",
  );
  addRoadPath(
    [
      { x: 70, y: 280 },
      { x: 350, y: 305 },
      { x: 660, y: 300 },
      { x: 860, y: 285 },
      { x: 1180, y: 292 },
      { x: 1540, y: 305 },
    ],
    "medium",
    16,
    "Northbank Road",
  );
  addRoadPath(
    [
      { x: 780, y: 30 },
      { x: 782, y: 280 },
      { x: 790, y: 485 },
      { x: 795, y: 760 },
      { x: 800, y: 950 },
    ],
    "large",
    21,
    "Civic Axis",
  );
  addRoadPath(
    [
      { x: 1180, y: 45 },
      { x: 1160, y: 250 },
      { x: 1185, y: 470 },
      { x: 1140, y: 690 },
      { x: 1050, y: 900 },
    ],
    "medium",
    15,
    "East Park Road",
  );
  addRoadPath(
    [
      { x: 180, y: 850 },
      { x: 390, y: 700 },
      { x: 610, y: 585 },
      { x: 790, y: 490 },
      { x: 970, y: 350 },
    ],
    "highway",
    27,
    "Riverside Connector",
  );

  for (const x of [120, 245, 370, 495, 620, 930, 1055, 1320, 1445]) {
    addRoadPath(
      [
        { x, y: 70 },
        { x: x + 8, y: 280 },
        { x: x - 5, y: 500 },
        { x: x + 12, y: 740 },
      ],
      "small",
      9,
    );
  }

  for (const y of [120, 200, 375, 610, 700]) {
    addRoadPath(
      [
        { x: 45, y },
        { x: 350, y: y + 4 },
        { x: 650, y: y - 3 },
      ],
      "small",
      9,
    );
    addRoadPath(
      [
        { x: 900, y: y - 5 },
        { x: 1180, y: y + 2 },
        { x: 1550, y },
      ],
      "small",
      9,
    );
  }
}

function seededNoise(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function createBuildings(): Building[] {
  const buildings: Building[] = [];
  const rectangle = (buildingId: string, x: number, y: number, width: number, depth: number, type: BuildingType, name?: string): Building => ({ id: buildingId, footprint: createBuildingPreset("rectangle", { x: x + width / 2, y: y + depth / 2 }, width, depth), type, subtype: "", floors: type === "residential" ? 3 : 2, height: type === "residential" ? 10 : 8, style: "modern", name });
  const ranges = [
    { from: 65, to: 650 },
    { from: 900, to: 1540 },
  ];
  let id = 0;

  for (const range of ranges) {
    for (let y = 82; y < 755; y += 58) {
      for (let x = range.from; x < range.to; x += 66) {
        const noise = seededNoise(id + 4);
        if (noise < 0.16 || (x > 930 && x < 1150 && y > 330 && y < 610)) {
          id += 1;
          continue;
        }

        const types: BuildingType[] = ["residential", "residential", "commercial", "office"];
        const type = types[id % types.length] ?? "residential";
        const width = 31 + seededNoise(id + 20) * 18; const depth = 20 + seededNoise(id + 30) * 16;
        buildings.push(rectangle(`building-${id}`, x + noise * 9, y + seededNoise(id + 10) * 8, width, depth, type));
        id += 1;
      }
    }
  }

  buildings.push(
    rectangle("city-hall-building", 825, 405, 74, 48, "government", "City Hall"),
    rectangle("hospital-building", 650, 210, 62, 42, "medical", "Riverside Hospital"),
    rectangle("school-building", 1230, 175, 68, 46, "education", "Northfield School"),
  );

  return buildings;
}

function createBlocks(): Block[] {
  return [
    {
      id: "block-central",
      polygon: [{ x: 810, y: 330 }, { x: 960, y: 330 }, { x: 960, y: 460 }, { x: 810, y: 460 }],
      zoneType: "public",
      districtId: "central",
    },
    {
      id: "block-northfield",
      polygon: [{ x: 1205, y: 135 }, { x: 1370, y: 135 }, { x: 1370, y: 255 }, { x: 1205, y: 255 }],
      zoneType: "residential",
      districtId: "northfield",
    },
    {
      id: "block-westgate",
      polygon: [{ x: 210, y: 570 }, { x: 430, y: 570 }, { x: 430, y: 720 }, { x: 210, y: 720 }],
      zoneType: "industrial",
      districtId: "westgate",
    },
  ];
}

export function createDemoCity(): City {
  createRoadNetwork();

  return {
    id: "riverside-bay",
    name: "Riverside Bay Plan",
    bounds: { x: 0, y: 0, width: 1600, height: 980 },
    mapSize: "small",
    terrain: "lakes",
    roadNodes: [...roadNodes],
    roads: [...roads],
    roadEdges: [...roadEdges],
    zones: [],
    buildings: createBuildings(),
    blocks: createBlocks(),
    parks: [
      {
        id: "pinewood-park",
        name: "Pinewood Park",
        points: [
          { x: 80, y: 60 }, { x: 520, y: 55 }, { x: 575, y: 180 }, { x: 510, y: 300 },
          { x: 250, y: 310 }, { x: 100, y: 230 },
        ],
      },
      {
        id: "central-park",
        name: "Central Park",
        points: [
          { x: 940, y: 330 }, { x: 1170, y: 320 }, { x: 1175, y: 555 }, { x: 960, y: 565 },
        ],
      },
    ],
    waters: [
      {
        id: "river",
        name: "Aster River",
        points: [
          { x: 650, y: 0 }, { x: 735, y: 0 }, { x: 730, y: 180 }, { x: 700, y: 350 },
          { x: 720, y: 520 }, { x: 690, y: 700 }, { x: 620, y: 850 }, { x: 560, y: 980 },
          { x: 420, y: 980 }, { x: 540, y: 760 }, { x: 590, y: 580 }, { x: 575, y: 420 },
          { x: 610, y: 240 },
        ],
      },
      {
        id: "east-channel",
        points: [
          { x: 1430, y: 0 }, { x: 1515, y: 0 }, { x: 1480, y: 210 }, { x: 1525, y: 430 },
          { x: 1490, y: 650 }, { x: 1540, y: 980 }, { x: 1425, y: 980 }, { x: 1395, y: 710 },
          { x: 1435, y: 470 }, { x: 1395, y: 230 },
        ],
      },
      {
        id: "harbor",
        name: "Riverside Bay",
        points: [
          { x: 430, y: 810 }, { x: 600, y: 760 }, { x: 820, y: 785 }, { x: 1030, y: 750 },
          { x: 1240, y: 785 }, { x: 1450, y: 760 }, { x: 1600, y: 760 }, { x: 1600, y: 980 },
          { x: 430, y: 980 },
        ],
      },
      {
        id: "central-lake",
        points: [
          { x: 1030, y: 395 }, { x: 1080, y: 375 }, { x: 1120, y: 405 }, { x: 1100, y: 460 },
          { x: 1050, y: 475 }, { x: 1015, y: 440 },
        ],
      },
    ],
    pois: [
      { id: "poi-city-hall", x: 862, y: 393, type: "city-hall", name: "City Hall" },
      { id: "poi-hospital", x: 680, y: 198, type: "hospital", name: "City Hospital" },
      { id: "poi-school", x: 1265, y: 160, type: "school", name: "Northfield School" },
      { id: "poi-harbor", x: 820, y: 790, type: "harbor", name: "Harbor Terminal" },
    ],
    facilities: [],
    transitStations: [
      { id: "station-west", x: 330, y: 475, type: "train", name: "Westgate" },
      { id: "station-civic", x: 790, y: 485, type: "metro", name: "Civic Center" },
      { id: "station-east", x: 1180, y: 470, type: "metro", name: "East Park" },
      { id: "station-north", x: 1160, y: 288, type: "bus", name: "Northfield" },
    ],
    transitLines: [
      { id: "line-river", name: "River Line", color: 0x4f82d7, stationIds: ["station-west", "station-civic", "station-east", "station-north"] },
    ],
    busTerminals: [],
    busLines: [],
    busStops: [],
    labels: [
      { id: "label-riverside", x: 180, y: 340, text: "RIVERSIDE", type: "district" },
      { id: "label-central", x: 835, y: 350, text: "CENTRAL", type: "district" },
      { id: "label-northfield", x: 1220, y: 105, text: "NORTHFIELD", type: "district" },
      { id: "label-westgate", x: 280, y: 650, text: "WESTGATE", type: "district" },
      { id: "label-harborview", x: 690, y: 865, text: "HARBORVIEW", type: "district" },
    ],
  };
}
