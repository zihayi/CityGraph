import { CommandManager } from "../commands/CommandManager";
import { MoveRoadNodeCommand, RoadSnapshotCommand, UpdateRoadCommand, type RoadSnapshot } from "../commands/RoadCommands";
import { ZoneSnapshotCommand } from "../commands/ZoneCommands";
import { BuildingSnapshotCommand } from "../commands/BuildingCommands";
import { FacilitySnapshotCommand } from "../commands/FacilityCommands";
import type { Point } from "../geometry/Point";
import { distance } from "../geometry/RoadGeometry";
import { isValidBuildingFootprint, mirrorFootprint, rotateFootprint, scaleFootprint, translateFootprint } from "../geometry/BuildingGeometry";
import { sampleLogicalRoad, sampleRoad } from "../geometry/RoadGeometry";
import type { Building, City, FacilityPOI, Road, RoadGeometry, RoadStructure, Zone } from "../model/City";
import { buildRoadCreation, splitRoadEdge, type RoadCreationInput } from "./RoadGraph";
import { roadIdentityGroupEdges, selectedRoadEdge } from "./RoadIdentity";
import { EditorState } from "./EditorState";

export type EditorSelection = { kind: "road"; id: string; edgeId?: string } | { kind: "node"; id: string } | { kind: "zone"; id: string } | { kind: "building"; id: string } | { kind: "facility"; id: string } | null;
export type EditorChange = "city" | "roads" | "zones" | "buildings" | "facilities" | "selection" | "history";

export class Editor {
  public readonly state: EditorState;
  public readonly commands = new CommandManager();
  public selection: EditorSelection = null;
  private readonly listeners = new Set<(change: EditorChange) => void>();

  public constructor(city: City) { this.state = new EditorState(city); }
  public subscribe(listener: (change: EditorChange) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  public replaceCity(city: City): void { this.state.replaceCity(city); this.selection = null; this.commands.clear(); this.emit("city"); this.emit("selection"); }
  public select(selection: EditorSelection): void { this.selection = selection; this.emit("selection"); }

  public createRoad(input: RoadCreationInput): { startNodeId: string; endNodeId: string; roadId: string } {
    const city = this.state.city; const before = this.snapshot(); const after = buildRoadCreation(city, input);
    this.commands.execute(new RoadSnapshotCommand("Create road segment", city, before, after, () => this.emit("roads")));
    this.emit("history"); return { startNodeId: after.startNodeId, endNodeId: after.endNodeId, roadId: after.roadId };
  }

  public createRoadPath(points: Point[], input: Omit<RoadCreationInput, "start" | "end" | "startNodeId" | "endNodeId" | "roadId" | "geometry">, geometries?: RoadGeometry[]): string | undefined {
    if (points.length < 2) return undefined;
    const city = this.state.city; const before = this.snapshot(); let working: City = { ...city, ...structuredClone(before) }; let roadId: string | undefined; let startNodeId: string | undefined; let previousNodeId: string | undefined;
    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1]; const end = points[index]; if (!start || !end || distance(start, end) < 0.01) continue;
      const closesPath = index === points.length - 1 && distance(end, points[0]!) < 0.01;
      const result = buildRoadCreation(working, { ...input, start, end, startNodeId: previousNodeId, endNodeId: closesPath ? startNodeId : undefined, roadId, geometry: geometries?.[index - 1] ?? { type: "line" } });
      roadId = result.roadId; startNodeId ??= result.startNodeId; previousNodeId = result.endNodeId;
      working = { ...working, roadNodes: result.roadNodes, roads: result.roads, roadEdges: result.roadEdges };
    }
    if (!roadId) return undefined;
    this.commands.execute(new RoadSnapshotCommand("Create road path", city, before, { roadNodes: working.roadNodes, roads: working.roads, roadEdges: working.roadEdges }, () => this.emit("roads")));
    this.emit("history"); return roadId;
  }

  public splitRoadEdge(edgeId: string, point: Point): string {
    const city = this.state.city; const before = this.snapshot(); const after = splitRoadEdge(city, edgeId, point);
    if (after.changed) { this.commands.execute(new RoadSnapshotCommand("Split road edge", city, before, after, () => this.emit("roads"))); this.emit("history"); }
    return after.nodeId;
  }

  public canDissolveRoadNode(nodeId: string): boolean {
    const incident = this.state.city.roadEdges.filter((edge) => edge.startNodeId === nodeId || edge.endNodeId === nodeId);
    return incident.length === 2 && incident[0]!.roadId === incident[1]!.roadId && incident[0]!.name === incident[1]!.name && incident[0]!.structure === incident[1]!.structure && incident[0]!.level === incident[1]!.level;
  }

  public dissolveRoadNode(nodeId: string): void {
    if (!this.canDissolveRoadNode(nodeId)) return;
    const city = this.state.city; const before = this.snapshot(); const incident = city.roadEdges.filter((edge) => edge.startNodeId === nodeId || edge.endNodeId === nodeId); const first = incident[0]!; const second = incident[1]!;
    const nodes = new Map(city.roadNodes.map((node) => [node.id, node])); let firstPath = sampleRoad(first, nodes); let secondPath = sampleRoad(second, nodes);
    if (first.startNodeId === nodeId) firstPath = [...firstPath].reverse(); if (second.endNodeId === nodeId) secondPath = [...secondPath].reverse();
    const combined = [...firstPath, ...secondPath.slice(1)]; const startNodeId = first.startNodeId === nodeId ? first.endNodeId : first.startNodeId; const endNodeId = second.startNodeId === nodeId ? second.endNodeId : second.startNodeId;
    const geometry: RoadGeometry = combined.length <= 2 ? { type: "line" } : { type: "polyline", points: combined.slice(1, -1).map((point) => ({ x: point.x, y: point.y })) };
    const merged = { ...first, startNodeId, endNodeId, geometry }; const removedIds = new Set([first.id, second.id]); const roadEdges = structuredClone(city.roadEdges).filter((edge) => !removedIds.has(edge.id)); roadEdges.push(merged);
    const roads = structuredClone(city.roads).map((road) => { if (road.id !== first.roadId) return road; const index = Math.min(...[first.id, second.id].map((id) => road.segmentIds.indexOf(id)).filter((value) => value >= 0)); const segmentIds = road.segmentIds.filter((id) => !removedIds.has(id)); segmentIds.splice(Number.isFinite(index) ? index : segmentIds.length, 0, merged.id); return { ...road, segmentIds }; });
    const roadNodes = structuredClone(city.roadNodes).filter((node) => node.id !== nodeId); this.commands.execute(new RoadSnapshotCommand("Dissolve road node", city, before, { roadNodes, roads, roadEdges }, () => this.emit("roads"))); this.select({ kind: "road", id: first.roadId, edgeId: merged.id }); this.emit("history");
  }

  public deleteSelected(): void {
    const selection = this.selection; if (!selection) return;
    if (selection.kind === "zone") { const city = this.state.city; const before = structuredClone(city.zones); const after = before.filter((zone) => zone.id !== selection.id); if (after.length === before.length) return; this.commands.execute(new ZoneSnapshotCommand("Delete zone", city, before, after, () => this.emit("zones"))); this.select(null); this.emit("history"); return; }
    if (selection.kind === "building") { const city = this.state.city; const before = structuredClone(city.buildings); const after = before.filter((building) => building.id !== selection.id); if (after.length === before.length) return; this.commands.execute(new BuildingSnapshotCommand("Delete building", city, before, after, () => this.emit("buildings"))); this.select(null); this.emit("history"); return; }
    if (selection.kind === "facility") { const city = this.state.city; const before = structuredClone(city.facilities); const after = before.filter((facility) => facility.id !== selection.id); if (after.length === before.length) return; this.commands.execute(new FacilitySnapshotCommand("Delete facility", city, before, after, () => this.emit("facilities"))); this.select(null); this.emit("history"); return; }
    const city = this.state.city; const before = this.snapshot(); let roads = structuredClone(city.roads); let roadEdges = structuredClone(city.roadEdges);
    if (selection.kind === "road") {
      const anchor = selectedRoadEdge(city, selection); const removedIds = new Set(anchor ? roadIdentityGroupEdges(city, anchor).map((edge) => edge.id) : roadEdges.filter((edge) => edge.roadId === selection.id).map((edge) => edge.id));
      roadEdges = roadEdges.filter((edge) => !removedIds.has(edge.id)); roads = roads.map((road) => ({ ...road, segmentIds: road.segmentIds.filter((edgeId) => !removedIds.has(edgeId)) })).filter((road) => road.segmentIds.length > 0);
    }
    else if (selection.kind === "node") {
      const removedIds = new Set(roadEdges.filter((edge) => edge.startNodeId === selection.id || edge.endNodeId === selection.id).map((edge) => edge.id));
      roadEdges = roadEdges.filter((edge) => !removedIds.has(edge.id));
      const rebuilt: Road[] = [];
      for (const road of roads) {
        const remaining = roadEdges.filter((edge) => edge.roadId === road.id); const unseen = new Set(remaining.map((edge) => edge.id)); let componentIndex = 0;
        while (unseen.size) {
          const component = new Set<string>(); const nodes = new Set<string>(); const first = unseen.values().next().value as string; component.add(first); unseen.delete(first);
          let changed = true;
          while (changed) { changed = false; for (const edge of remaining.filter((candidate) => component.has(candidate.id))) { nodes.add(edge.startNodeId); nodes.add(edge.endNodeId); } for (const edge of remaining) if (unseen.has(edge.id) && (nodes.has(edge.startNodeId) || nodes.has(edge.endNodeId))) { component.add(edge.id); unseen.delete(edge.id); changed = true; } }
          const roadId = componentIndex++ === 0 ? road.id : `road-${crypto.randomUUID()}`; const segmentIds = road.segmentIds.filter((edgeId) => component.has(edgeId));
          for (const edge of roadEdges) if (component.has(edge.id)) edge.roadId = roadId; rebuilt.push({ ...road, id: roadId, segmentIds });
        }
      }
      roads = rebuilt;
    }
    const used = new Set(roadEdges.flatMap((edge) => [edge.startNodeId, edge.endNodeId])); const roadNodes = structuredClone(city.roadNodes).filter((node) => used.has(node.id));
    this.commands.execute(new RoadSnapshotCommand("Delete road", city, before, { roadNodes, roads, roadEdges }, () => this.emit("roads")));
    this.select(null); this.emit("history");
  }

  public createZone(input: Omit<Zone, "id">): string | undefined {
    if (input.polygon.length < 3) return undefined; const city = this.state.city; const id = `zone-${crypto.randomUUID()}`; const before = structuredClone(city.zones); const after = [...before, { ...structuredClone(input), id, opacity: Math.max(0.05, Math.min(1, input.opacity)) }];
    this.commands.execute(new ZoneSnapshotCommand("Create zone", city, before, after, () => this.emit("zones"))); this.select({ kind: "zone", id }); this.emit("history"); return id;
  }

  public updateZone(id: string, changes: Partial<Omit<Zone, "id" | "polygon" | "source">>): void {
    const city = this.state.city; const current = city.zones.find((zone) => zone.id === id); if (!current) return; const before = structuredClone(city.zones); const after = before.map((zone) => zone.id === id ? { ...zone, ...changes, opacity: changes.opacity === undefined ? zone.opacity : Math.max(0.05, Math.min(1, changes.opacity)) } : zone);
    this.commands.execute(new ZoneSnapshotCommand(changes.name !== undefined ? "Change zone name" : changes.type !== undefined ? "Change zone type" : changes.description !== undefined ? "Change zone description" : "Update zone", city, before, after, () => this.emit("zones"))); this.emit("history"); this.emit("selection");
  }

  public moveZone(id: string, beforePolygon: Point[]): void { this.commitZonePolygon(id, beforePolygon, "Move zone"); }
  public moveZoneVertex(id: string, beforePolygon: Point[]): void { this.commitZonePolygon(id, beforePolygon, "Move zone vertex"); }
  public addZoneVertex(id: string, segmentIndex: number, point: Point): void {
    const city = this.state.city; const before = structuredClone(city.zones); const after = structuredClone(before); const zone = after.find((candidate) => candidate.id === id); if (!zone || segmentIndex < 0 || segmentIndex >= zone.polygon.length) return; zone.polygon.splice(segmentIndex + 1, 0, { ...point }); this.commands.execute(new ZoneSnapshotCommand("Add zone vertex", city, before, after, () => this.emit("zones"))); this.emit("history");
  }
  public deleteZoneVertex(id: string, vertexIndex: number): void {
    const city = this.state.city; const before = structuredClone(city.zones); const after = structuredClone(before); const zone = after.find((candidate) => candidate.id === id); if (!zone || zone.polygon.length <= 3 || vertexIndex < 0 || vertexIndex >= zone.polygon.length) return; zone.polygon.splice(vertexIndex, 1); this.commands.execute(new ZoneSnapshotCommand("Delete zone vertex", city, before, after, () => this.emit("zones"))); this.emit("history");
  }

  public createBuilding(input: Omit<Building, "id">): string | undefined {
    if (!isValidBuildingFootprint(input.footprint)) return undefined; const city = this.state.city; const id = `building-${crypto.randomUUID()}`; const before = structuredClone(city.buildings); const after = [...before, { ...structuredClone(input), id, floors: Math.max(1, Math.round(input.floors)), height: Math.max(1, input.height) }]; this.commands.execute(new BuildingSnapshotCommand("Create building", city, before, after, () => this.emit("buildings"))); this.select({ kind: "building", id }); this.emit("history"); return id;
  }

  public createFacility(input: Omit<FacilityPOI, "id">): string {
    const city = this.state.city; const id = `facility-${crypto.randomUUID()}`; const before = structuredClone(city.facilities); const after = [...before, { ...structuredClone(input), id }];
    this.commands.execute(new FacilitySnapshotCommand("Create facility", city, before, after, () => this.emit("facilities"))); this.select({ kind: "facility", id }); this.emit("history"); return id;
  }

  public updateFacility(id: string, changes: Partial<Pick<FacilityPOI, "name">>): void {
    const city = this.state.city; const current = city.facilities.find((facility) => facility.id === id); if (!current || changes.name === undefined || changes.name === current.name) return; const before = structuredClone(city.facilities); const after = before.map((facility) => facility.id === id ? { ...facility, name: changes.name! } : facility);
    this.commands.execute(new FacilitySnapshotCommand("Rename facility", city, before, after, () => this.emit("facilities"))); this.emit("history"); this.emit("selection");
  }

  public moveFacility(id: string, beforePosition: Point): void {
    const city = this.state.city; const current = city.facilities.find((facility) => facility.id === id); if (!current || distance(current.position, beforePosition) < 1e-5) return; const after = structuredClone(city.facilities); const before = structuredClone(after); const previous = before.find((facility) => facility.id === id); if (!previous) return; previous.position = { ...beforePosition };
    this.commands.execute(new FacilitySnapshotCommand("Move facility", city, before, after, () => this.emit("facilities"))); this.select({ kind: "facility", id }); this.emit("history");
  }

  public updateBuilding(id: string, changes: Partial<Omit<Building, "id" | "footprint">>): void {
    const city = this.state.city; const current = city.buildings.find((building) => building.id === id); if (!current) return; const before = structuredClone(city.buildings); const after = before.map((building) => building.id === id ? { ...building, ...changes, floors: changes.floors === undefined ? building.floors : Math.max(1, Math.round(changes.floors)), height: changes.height === undefined ? building.height : Math.max(1, changes.height) } : building); this.commands.execute(new BuildingSnapshotCommand(changes.description !== undefined ? "Change building description" : "Change building properties", city, before, after, () => this.emit("buildings"))); this.emit("history"); this.emit("selection");
  }

  public commitBuildingFootprint(id: string, beforeFootprint: Building["footprint"], label: string): void {
    const city = this.state.city; const current = city.buildings.find((building) => building.id === id); if (!current) return; if (!isValidBuildingFootprint(current.footprint)) { current.footprint = structuredClone(beforeFootprint); this.emit("buildings"); return; } const after = structuredClone(city.buildings); const before = structuredClone(after); const previous = before.find((building) => building.id === id); if (!previous || JSON.stringify(previous.footprint) === JSON.stringify(current.footprint)) return; previous.footprint = structuredClone(beforeFootprint); this.commands.execute(new BuildingSnapshotCommand(label, city, before, after, () => this.emit("buildings"))); this.select({ kind: "building", id }); this.emit("history");
  }

  public addBuildingVertex(id: string, ringIndex: number, edgeIndex: number, point: Point): void { const city = this.state.city; const before = structuredClone(city.buildings); const after = structuredClone(before); const building = after.find((candidate) => candidate.id === id); const ring = building && (ringIndex === 0 ? building.footprint.outer : building.footprint.holes[ringIndex - 1]); if (!building || !ring || edgeIndex < 0 || edgeIndex >= ring.length) return; ring.splice(edgeIndex + 1, 0, { ...point }); if (!isValidBuildingFootprint(building.footprint)) return; this.commands.execute(new BuildingSnapshotCommand("Add building vertex", city, before, after, () => this.emit("buildings"))); this.emit("history"); }
  public deleteBuildingVertex(id: string, ringIndex: number, vertexIndex: number): void { const city = this.state.city; const before = structuredClone(city.buildings); const after = structuredClone(before); const building = after.find((candidate) => candidate.id === id); const ring = building && (ringIndex === 0 ? building.footprint.outer : building.footprint.holes[ringIndex - 1]); if (!building || !ring || ring.length <= 3 || vertexIndex < 0 || vertexIndex >= ring.length) return; ring.splice(vertexIndex, 1); if (!isValidBuildingFootprint(building.footprint)) return; this.commands.execute(new BuildingSnapshotCommand("Delete building vertex", city, before, after, () => this.emit("buildings"))); this.emit("history"); }
  public duplicateBuilding(id: string): string | undefined { const city = this.state.city; const source = city.buildings.find((building) => building.id === id); if (!source) return undefined; const newId = `building-${crypto.randomUUID()}`; const before = structuredClone(city.buildings); const duplicate = { ...structuredClone(source), id: newId, name: source.name ? `${source.name} Copy` : undefined, footprint: translateFootprint(source.footprint, { x: 20, y: 20 }) }; this.commands.execute(new BuildingSnapshotCommand("Duplicate building", city, before, [...before, duplicate], () => this.emit("buildings"))); this.select({ kind: "building", id: newId }); this.emit("history"); return newId; }
  public rotateBuilding(id: string, radians: number): void { this.transformBuilding(id, "Rotate building", (footprint) => rotateFootprint(footprint, radians)); }
  public scaleBuilding(id: string, factor: number): void { if (factor <= 0.05) return; this.transformBuilding(id, "Scale building", (footprint) => scaleFootprint(footprint, factor)); }
  public mirrorBuilding(id: string, vertical = false): void { this.transformBuilding(id, "Mirror building", (footprint) => mirrorFootprint(footprint, vertical)); }

  public moveNode(id: string, before: Point, after: Point, mergeTargetId?: string): void {
    if (!mergeTargetId || mergeTargetId === id) { if (distance(before, after) < 1e-5) return; this.commands.execute(new MoveRoadNodeCommand(this.state.city, id, before, after, () => this.emit("roads"))); this.emit("history"); return; }
    const city = this.state.city; const target = city.roadNodes.find((node) => node.id === mergeTargetId); const moving = city.roadNodes.find((node) => node.id === id);
    if (!target || !moving) return;
    const beforeSnapshot = this.snapshot(); const original = beforeSnapshot.roadNodes.find((node) => node.id === id); if (original) Object.assign(original, before);
    let roadEdges = structuredClone(city.roadEdges).map((edge) => ({ ...edge, startNodeId: edge.startNodeId === id ? mergeTargetId : edge.startNodeId, endNodeId: edge.endNodeId === id ? mergeTargetId : edge.endNodeId }));
    const collapsed = new Set(roadEdges.filter((edge) => edge.startNodeId === edge.endNodeId).map((edge) => edge.id)); roadEdges = roadEdges.filter((edge) => !collapsed.has(edge.id));
    const roads = structuredClone(city.roads).map((road) => ({ ...road, segmentIds: road.segmentIds.filter((edgeId) => !collapsed.has(edgeId)) })).filter((road) => road.segmentIds.length > 0);
    const used = new Set(roadEdges.flatMap((edge) => [edge.startNodeId, edge.endNodeId])); const roadNodes = structuredClone(city.roadNodes).filter((node) => node.id !== id && used.has(node.id));
    this.commands.execute(new RoadSnapshotCommand("Merge road endpoints", city, beforeSnapshot, { roadNodes, roads, roadEdges }, () => this.emit("roads")));
    this.select({ kind: "node", id: mergeTargetId }); this.emit("history");
  }

  public moveRoad(roadId: string, beforePositions: Array<{ id: string; x: number; y: number }>, beforeGeometries: Array<{ id: string; geometry: RoadGeometry }> = []): void {
    const city = this.state.city; const moved = beforePositions.some((before) => { const node = city.roadNodes.find((candidate) => candidate.id === before.id); return node && distance(node, before) >= 1e-5; }); if (!moved) return;
    const after = this.snapshot(); const before = structuredClone(after);
    for (const position of beforePositions) { const node = before.roadNodes.find((candidate) => candidate.id === position.id); if (node) { node.x = position.x; node.y = position.y; } }
    for (const value of beforeGeometries) { const edge = before.roadEdges.find((candidate) => candidate.id === value.id); if (edge) edge.geometry = structuredClone(value.geometry); }
    this.commands.execute(new RoadSnapshotCommand("Move road", city, before, after, () => this.emit("roads"))); this.select({ kind: "road", id: roadId, edgeId: this.selection?.kind === "road" ? this.selection.edgeId : undefined }); this.emit("history");
  }

  public updateRoad(id: string, changes: Partial<Omit<Road, "id" | "segmentIds">>): void {
    const road = this.state.city.roads.find((candidate) => candidate.id === id); if (!road) return;
    if (changes.name !== undefined) {
      const city = this.state.city; const before = this.snapshot(); const roads = structuredClone(city.roads).map((candidate) => candidate.id === id ? { ...candidate, ...changes } : candidate); const roadEdges = structuredClone(city.roadEdges).map((edge) => edge.roadId === id ? { ...edge, name: changes.name! } : edge);
      this.commands.execute(new RoadSnapshotCommand("Update road", city, before, { ...before, roads, roadEdges }, () => this.emit("roads"))); this.emit("history"); this.emit("selection"); return;
    }
    this.commands.execute(new UpdateRoadCommand(this.state.city, id, structuredClone(road), { ...structuredClone(road), ...changes }, () => this.emit("roads")));
    this.emit("history"); this.emit("selection");
  }
  public renameRoadEdge(edgeId: string, name: string, scope: "group" | "segment" = "group"): void {
    const city = this.state.city; const anchor = city.roadEdges.find((edge) => edge.id === edgeId); if (!anchor || anchor.name === name) return;
    const before = this.snapshot(); const affectedIds = new Set(scope === "group" ? roadIdentityGroupEdges(city, anchor).map((edge) => edge.id) : [edgeId]);
    const roadEdges = structuredClone(city.roadEdges).map((edge) => affectedIds.has(edge.id) ? { ...edge, name } : edge);
    const roads = structuredClone(city.roads).map((road) => { const names = roadEdges.filter((edge) => edge.roadId === road.id).map((edge) => edge.name); return names.length > 0 && names.every((value) => value === names[0]) ? { ...road, name: names[0]! } : road; });
    this.commands.execute(new RoadSnapshotCommand(scope === "group" ? "Rename road group" : "Rename road segment", city, before, { ...before, roads, roadEdges }, () => this.emit("roads"))); this.emit("history"); this.emit("selection");
  }
  public updateRoadStructure(id: string, structure: RoadStructure): void {
    const city = this.state.city; const road = city.roads.find((candidate) => candidate.id === id); if (!road) return;
    const before = this.snapshot(); const path = sampleLogicalRoad(road, new Map(city.roadEdges.map((edge) => [edge.id, edge])), new Map(city.roadNodes.map((node) => [node.id, node]))); if (path.length < 2) return;
    let working: City = { ...city, roadNodes: structuredClone(city.roadNodes), roads: structuredClone(city.roads).map((candidate) => candidate.id === id ? { ...candidate, segmentIds: [] } : candidate), roadEdges: structuredClone(city.roadEdges).filter((edge) => edge.roadId !== id) };
    let previousNodeId: string | undefined; let firstNodeId: string | undefined;
    for (let index = 1; index < path.length; index += 1) {
      const start = path[index - 1]!; const end = path[index]!; const closes = index === path.length - 1 && distance(end, path[0]!) < 1e-5;
      const result = buildRoadCreation(working, { start, end, startNodeId: previousNodeId, endNodeId: closes ? firstNodeId : undefined, roadId: id, category: road.category, subtype: road.subtype, width: road.width, name: road.name, structure, geometry: { type: "line" } });
      firstNodeId ??= result.startNodeId; previousNodeId = result.endNodeId; working = { ...working, roadNodes: result.roadNodes, roads: result.roads, roadEdges: result.roadEdges };
    }
    const used = new Set(working.roadEdges.flatMap((edge) => [edge.startNodeId, edge.endNodeId])); working.roadNodes = working.roadNodes.filter((node) => used.has(node.id));
    this.commands.execute(new RoadSnapshotCommand("Update road structure", city, before, { roadNodes: working.roadNodes, roads: working.roads, roadEdges: working.roadEdges }, () => this.emit("roads"))); this.emit("history"); this.emit("selection");
  }
  public straightenRoad(id: string): void {
    const city = this.state.city; const before = this.snapshot(); const roadEdges = structuredClone(city.roadEdges).map((edge) => edge.roadId === id ? { ...edge, geometry: { type: "line" } as const } : edge);
    this.commands.execute(new RoadSnapshotCommand("Straighten road", city, before, { ...before, roadEdges }, () => this.emit("roads"))); this.emit("history");
  }
  public undo(): void { this.commands.undo(); this.normalizeSelection(); this.emit("history"); this.emit("selection"); }
  public redo(): void { this.commands.redo(); this.normalizeSelection(); this.emit("history"); this.emit("selection"); }
  private snapshot(): RoadSnapshot { return { roadNodes: structuredClone(this.state.city.roadNodes), roads: structuredClone(this.state.city.roads), roadEdges: structuredClone(this.state.city.roadEdges) }; }
  private normalizeSelection(): void {
    const selection = this.selection;
    if (selection?.kind === "road" && !(selection.edgeId ? this.state.city.roadEdges.some((edge) => edge.id === selection.edgeId) : this.state.city.roads.some((road) => road.id === selection.id))) this.selection = null;
    if (this.selection?.kind === "node" && !this.state.city.roadNodes.some((node) => node.id === this.selection?.id)) this.selection = null;
    if (this.selection?.kind === "zone" && !this.state.city.zones.some((zone) => zone.id === this.selection?.id)) this.selection = null;
    if (this.selection?.kind === "building" && !this.state.city.buildings.some((building) => building.id === this.selection?.id)) this.selection = null;
    if (this.selection?.kind === "facility" && !this.state.city.facilities.some((facility) => facility.id === this.selection?.id)) this.selection = null;
  }
  private commitZonePolygon(id: string, beforePolygon: Point[], label: string): void {
    const city = this.state.city; const current = city.zones.find((zone) => zone.id === id); if (!current || current.polygon.length !== beforePolygon.length || current.polygon.every((point, index) => distance(point, beforePolygon[index]!) < 1e-5)) return;
    const after = structuredClone(city.zones); const before = structuredClone(after); const zone = before.find((candidate) => candidate.id === id); if (zone) zone.polygon = structuredClone(beforePolygon); this.commands.execute(new ZoneSnapshotCommand(label, city, before, after, () => this.emit("zones"))); this.emit("history");
  }
  private transformBuilding(id: string, label: string, operation: (footprint: Building["footprint"]) => Building["footprint"]): void { const city = this.state.city; const before = structuredClone(city.buildings); const after = structuredClone(before); const building = after.find((candidate) => candidate.id === id); if (!building) return; building.footprint = operation(building.footprint); if (!isValidBuildingFootprint(building.footprint)) return; this.commands.execute(new BuildingSnapshotCommand(label, city, before, after, () => this.emit("buildings"))); this.select({ kind: "building", id }); this.emit("history"); }
  private emit(change: EditorChange): void { for (const listener of this.listeners) listener(change); }
}
