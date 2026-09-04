import { CommandManager } from "../commands/CommandManager";
import { RoadSnapshotCommand, UpdateRoadCommand, type RoadSnapshot } from "../commands/RoadCommands";
import { ZoneSnapshotCommand } from "../commands/ZoneCommands";
import { BuildingSnapshotCommand } from "../commands/BuildingCommands";
import { FacilitySnapshotCommand } from "../commands/FacilityCommands";
import { BusSnapshotCommand, type BusSnapshot } from "../commands/BusCommands";
import { ChangeCanvasCommand, RenameCityCommand } from "../commands/CityCommands";
import { WaterSnapshotCommand } from "../commands/WaterCommands";
import { BlockGridSnapshotCommand } from "../commands/BlockCommands";
import { CampusStateSnapshotCommand, UniversitySnapshotCommand, type CampusStateSnapshot } from "../commands/UniversityCommands";
import type { Point } from "../geometry/Point";
import { distance, pathIntersectsPolygon, pointToSegmentDistance, roadDistance } from "../geometry/RoadGeometry";
import { locatePointOnRoad, pointAtRoadFraction } from "../geometry/BusGeometry";
import { isValidBuildingFootprint, mirrorFootprint, rotateFootprint, scaleFootprint, translateFootprint } from "../geometry/BuildingGeometry";
import { isValidWaterPolygon } from "../geometry/WaterGeometry";
import { sampleLogicalRoad, sampleRoad } from "../geometry/RoadGeometry";
import { createEmptyUniversity, type Building, type BusLine, type BusPathStep, type BusStop, type BusTerminal, type City, type FacilityPOI, type Road, type RoadGeometry, type RoadStructure, type University, type WaterArea, type Zone } from "../model/City";
import type { RoadCategory, RoadSubtype } from "../model/City";
import { createBlockGrid } from "../geometry/BlockGrid";
import { mapDimensions } from "../model/mapGenerator";
import { buildRoadCreation, splitRoadEdge, type RoadCreationInput } from "./RoadGraph";
import { roadIdentityGroupEdges, selectedRoadEdge, selectedRoadEdges, type RoadSelectionScope } from "./RoadIdentity";
import { EditorState } from "./EditorState";

export type EditorSelection = { kind: "road"; id: string; edgeId?: string; scope?: RoadSelectionScope } | { kind: "road-multi"; edgeIds: string[]; nodeIds: string[] } | { kind: "road-control"; id: string; pointIndex: number } | { kind: "node"; id: string } | { kind: "zone"; id: string } | { kind: "water"; id: string } | { kind: "building"; id: string } | { kind: "facility"; id: string } | { kind: "bus-terminal"; id: string } | { kind: "bus-line"; id: string } | { kind: "bus-stop"; id: string } | null;
export type EditorChange = "city" | "city-name" | "map-size" | "roads" | "blocks" | "zones" | "universities" | "waters" | "buildings" | "facilities" | "buses" | "selection" | "history";
export interface CreateBusLoopInput {
  name: string;
  color: string;
  path: BusPathStep[];
  stops: Array<Omit<BusStop, "id" | "lineId">>;
}

function partitionRoadComponents(roads: Road[], roadEdges: City["roadEdges"]): Road[] {
  const result: Road[] = [];
  for (const road of roads) {
    const edges = road.segmentIds.map((id) => roadEdges.find((edge) => edge.id === id)).filter((edge): edge is City["roadEdges"][number] => Boolean(edge)); const unseen = new Set(edges.map((edge) => edge.id)); let componentIndex = 0;
    while (unseen.size) {
      const first = unseen.values().next().value as string; const component = new Set([first]); unseen.delete(first); let expanded = true;
      while (expanded) { expanded = false; const nodeIds = new Set(edges.filter((edge) => component.has(edge.id)).flatMap((edge) => [edge.startNodeId, edge.endNodeId])); for (const edge of edges) if (unseen.has(edge.id) && (nodeIds.has(edge.startNodeId) || nodeIds.has(edge.endNodeId))) { unseen.delete(edge.id); component.add(edge.id); expanded = true; } }
      const roadId = componentIndex++ === 0 ? road.id : `road-${crypto.randomUUID()}`; const segmentIds = road.segmentIds.filter((id) => component.has(id)); for (const edge of roadEdges) if (component.has(edge.id)) edge.roadId = roadId; result.push({ ...road, id: roadId, segmentIds });
    }
  }
  return result;
}

const blockRoadWidths: Record<RoadSubtype, number> = { large: 24, medium: 14, small: 8, pedestrian: 4, highway: 28, ramp: 10 };

export class Editor {
  public readonly state: EditorState;
  public readonly commands = new CommandManager();
  public selection: EditorSelection = null;
  private readonly listeners = new Set<(change: EditorChange) => void>();

  public constructor(city: City) { this.initializeCollections(city); this.state = new EditorState(city); }
  public subscribe(listener: (change: EditorChange) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  public replaceCity(city: City): void { this.initializeCollections(city); this.state.replaceCity(city); this.selection = null; this.commands.clear(); this.emit("city"); this.emit("selection"); }
  public renameCity(name: string): void { const nextName = name.trim(); const currentName = this.state.city.name; if (!nextName || nextName === currentName) return; this.commands.execute(new RenameCityCommand(this.state.city, currentName, nextName, () => this.emit("city-name"))); this.emit("history"); }
  public enableUnlimitedCanvas(): boolean {
    const city = this.state.city; if (city.mapSize === "unlimited") return false; const before = { mapSize: city.mapSize, bounds: structuredClone(city.bounds) }; const dimension = mapDimensions.unlimited; const center = { x: city.bounds.x + city.bounds.width / 2, y: city.bounds.y + city.bounds.height / 2 }; const after = { mapSize: "unlimited" as const, bounds: { x: center.x - dimension / 2, y: center.y - dimension / 2, width: dimension, height: dimension } };
    this.commands.execute(new ChangeCanvasCommand(city, before, after, () => this.emit("map-size"))); this.emit("history"); return true;
  }
  public select(selection: EditorSelection): void { this.selection = selection; this.emit("selection"); }
  public toggleRoadElements(edgeIds: string[] = [], nodeIds: string[] = []): void {
    const city = this.state.city; const currentEdges = this.selection?.kind === "road-multi" ? this.selection.edgeIds : this.selection?.kind === "road" ? selectedRoadEdges(city, this.selection).map((edge) => edge.id) : this.selection?.kind === "road-control" ? [this.selection.id] : []; const currentNodes = this.selection?.kind === "road-multi" ? this.selection.nodeIds : this.selection?.kind === "node" ? [this.selection.id] : [];
    const nextEdges = new Set(currentEdges.filter((id) => city.roadEdges.some((edge) => edge.id === id))); const nextNodes = new Set(currentNodes.filter((id) => city.roadNodes.some((node) => node.id === id))); const validEdges = [...new Set(edgeIds)].filter((id) => city.roadEdges.some((edge) => edge.id === id)); const validNodes = [...new Set(nodeIds)].filter((id) => city.roadNodes.some((node) => node.id === id));
    const removeEdges = validEdges.length > 0 && validEdges.every((id) => nextEdges.has(id)); const removeNodes = validNodes.length > 0 && validNodes.every((id) => nextNodes.has(id)); for (const id of validEdges) if (removeEdges) nextEdges.delete(id); else nextEdges.add(id); for (const id of validNodes) if (removeNodes) nextNodes.delete(id); else nextNodes.add(id);
    this.select(nextEdges.size || nextNodes.size ? { kind: "road-multi", edgeIds: [...nextEdges], nodeIds: [...nextNodes] } : null);
  }

  public createRoad(input: RoadCreationInput): { startNodeId: string; endNodeId: string; roadId: string } {
    const city = this.state.city; const before = this.snapshot(); const after = buildRoadCreation(city, input);
    this.commands.execute(new RoadSnapshotCommand("Create road segment", city, before, this.withReconciledBuses(after), () => this.emit("roads")));
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
    this.commands.execute(new RoadSnapshotCommand("Create road path", city, before, this.withReconciledBuses({ roadNodes: working.roadNodes, roads: working.roads, roadEdges: working.roadEdges }), () => this.emit("roads")));
    this.emit("history"); return roadId;
  }

  public splitRoadEdge(edgeId: string, point: Point): string {
    const city = this.state.city; const before = this.snapshot(); const after = splitRoadEdge(city, edgeId, point);
    if (after.changed) { this.commands.execute(new RoadSnapshotCommand("Split road edge", city, before, this.withReconciledBuses(after), () => this.emit("roads"))); this.emit("history"); }
    return after.nodeId;
  }

  public canDissolveRoadNode(nodeId: string): boolean {
    const incident = this.state.city.roadEdges.filter((edge) => edge.startNodeId === nodeId || edge.endNodeId === nodeId);
    return incident.length === 2 && incident[0]!.roadId === incident[1]!.roadId && incident[0]!.name === incident[1]!.name && incident[0]!.structure === incident[1]!.structure && incident[0]!.level === incident[1]!.level;
  }
  public canMergeRoadNodes(firstId: string, secondId: string): boolean {
    const edges = this.state.city.roadEdges; const levels = (nodeId: string) => new Set(edges.filter((edge) => edge.startNodeId === nodeId || edge.endNodeId === nodeId).map((edge) => `${edge.structure}:${edge.level}`)); const first = levels(firstId); const second = levels(secondId); return first.size > 0 && first.size === second.size && [...first].every((level) => second.has(level));
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
    const roadNodes = structuredClone(city.roadNodes).filter((node) => node.id !== nodeId); this.commands.execute(new RoadSnapshotCommand("Dissolve road node", city, before, this.withReconciledBuses({ roadNodes, roads, roadEdges }), () => this.emit("roads"))); this.select({ kind: "road", id: first.roadId, edgeId: merged.id, scope: "segment" }); this.emit("history");
  }

  public deleteSelected(): void {
    const selection = this.selection; if (!selection) return;
    if (selection.kind === "road-control" || selection.kind === "road-multi") return;
    if (selection.kind === "bus-terminal") {
      const city = this.state.city; const before = this.busSnapshot(); if (!before.busTerminals.some((terminal) => terminal.id === selection.id)) return; const removedLineIds = new Set(before.busLines.filter((line) => line.startTerminalId === selection.id || line.endTerminalId === selection.id).map((line) => line.id)); const after = { busTerminals: before.busTerminals.filter((terminal) => terminal.id !== selection.id), busLines: before.busLines.filter((line) => !removedLineIds.has(line.id)), busStops: before.busStops.filter((stop) => !removedLineIds.has(stop.lineId)) };
      this.commands.execute(new BusSnapshotCommand("Delete bus terminal", city, before, after, () => this.emit("buses"))); this.select(null); this.emit("history"); return;
    }
    if (selection.kind === "bus-line") {
      const city = this.state.city; const before = this.busSnapshot(); if (!before.busLines.some((line) => line.id === selection.id)) return; const after = { ...before, busLines: before.busLines.filter((line) => line.id !== selection.id), busStops: before.busStops.filter((stop) => stop.lineId !== selection.id) };
      this.commands.execute(new BusSnapshotCommand("Delete bus line", city, before, after, () => this.emit("buses"))); this.select(null); this.emit("history"); return;
    }
    if (selection.kind === "bus-stop") {
      const city = this.state.city; const before = this.busSnapshot(); const stop = before.busStops.find((candidate) => candidate.id === selection.id); const line = stop ? before.busLines.find((candidate) => candidate.id === stop.lineId) : undefined; if (!stop || line?.loop && line.stopIds.length <= 2) return; const after = { ...before, busLines: before.busLines.map((candidate) => ({ ...candidate, stopIds: candidate.stopIds.filter((stopId) => stopId !== selection.id) })), busStops: before.busStops.filter((candidate) => candidate.id !== selection.id) };
      this.commands.execute(new BusSnapshotCommand("Delete bus stop", city, before, after, () => this.emit("buses"))); this.select(null); this.emit("history"); return;
    }
    if (selection.kind === "zone") { const city = this.state.city; const selected = city.zones.find((zone) => zone.id === selection.id); if (!selected) return; if (selected.universityId || selected.purpose === "university") { const before = this.campusSnapshot(); const after = { universities: before.universities, zones: before.zones.filter((zone) => zone.id !== selection.id), facilities: before.facilities.filter((facility) => facility.universityZoneId !== selection.id) }; this.commands.execute(new CampusStateSnapshotCommand("Delete campus", city, before, after, () => { this.emit("zones"); this.emit("facilities"); })); } else { const before = structuredClone(city.zones); const after = before.filter((zone) => zone.id !== selection.id); this.commands.execute(new ZoneSnapshotCommand("Delete zone", city, before, after, () => this.emit("zones"))); } this.select(null); this.emit("history"); return; }
    if (selection.kind === "water") { const city = this.state.city; const before = structuredClone(city.waters); const after = before.filter((water) => water.id !== selection.id); if (after.length === before.length) return; this.commands.execute(new WaterSnapshotCommand("Delete water", city, before, after, () => this.emit("waters"))); this.select(null); this.emit("history"); return; }
    if (selection.kind === "building") { const city = this.state.city; const before = structuredClone(city.buildings); const after = before.filter((building) => building.id !== selection.id); if (after.length === before.length) return; this.commands.execute(new BuildingSnapshotCommand("Delete building", city, before, after, () => this.emit("buildings"))); this.select(null); this.emit("history"); return; }
    if (selection.kind === "facility") { const city = this.state.city; const before = structuredClone(city.facilities); const after = before.filter((facility) => facility.id !== selection.id); if (after.length === before.length) return; this.commands.execute(new FacilitySnapshotCommand("Delete facility", city, before, after, () => this.emit("facilities"))); this.select(null); this.emit("history"); return; }
    const city = this.state.city; const before = this.snapshot(); let roads = structuredClone(city.roads); let roadEdges = structuredClone(city.roadEdges);
    if (selection.kind === "road") {
      const selected = selectedRoadEdges(city, selection); const removedIds = new Set(selected.length ? selected.map((edge) => edge.id) : roadEdges.filter((edge) => edge.roadId === selection.id).map((edge) => edge.id));
      roadEdges = roadEdges.filter((edge) => !removedIds.has(edge.id)); roads = roads.map((road) => ({ ...road, segmentIds: road.segmentIds.filter((edgeId) => !removedIds.has(edgeId)) })).filter((road) => road.segmentIds.length > 0);
    }
    else if (selection.kind === "node") {
      this.dissolveRoadNode(selection.id); return;
    }
    const used = new Set(roadEdges.flatMap((edge) => [edge.startNodeId, edge.endNodeId])); const roadNodes = structuredClone(city.roadNodes).filter((node) => used.has(node.id));
    this.commands.execute(new RoadSnapshotCommand("Delete road", city, before, this.withReconciledBuses({ roadNodes, roads, roadEdges }), () => this.emit("roads")));
    this.select(null); this.emit("history");
  }

  public createZone(input: Omit<Zone, "id">): string | undefined {
    if (input.polygon.length < 3) return undefined; const city = this.state.city; const id = `zone-${crypto.randomUUID()}`; const before = structuredClone(city.zones); const after = [...before, { ...structuredClone(input), id, opacity: Math.max(0.05, Math.min(1, input.opacity)) }];
    this.commands.execute(new ZoneSnapshotCommand("Create zone", city, before, after, () => this.emit("zones"))); this.select({ kind: "zone", id }); this.emit("history"); return id;
  }

  public createUniversity(): string {
    const city = this.state.city; const id = `university-${crypto.randomUUID()}`; const before = structuredClone(city.universities); const after = [...before, { ...createEmptyUniversity(id), name: `University ${before.length + 1}` }];
    this.commands.execute(new UniversitySnapshotCommand("Create university", city, before, after, () => this.emit("universities"))); this.emit("history"); return id;
  }

  public createPendingCampusZone(input: Omit<Zone, "id" | "universityId" | "purpose" | "university" | "campusRole">): string | undefined {
    if (input.polygon.length < 3) return undefined; const city = this.state.city; const zoneId = `zone-${crypto.randomUUID()}`; const before = this.campusSnapshot(); const after: CampusStateSnapshot = { universities: before.universities, zones: [...before.zones, { ...structuredClone(input), id: zoneId, name: input.name?.trim() || "New Campus", opacity: Math.max(0.05, Math.min(1, input.opacity)), purpose: "university" }], facilities: before.facilities };
    this.commands.execute(new CampusStateSnapshotCommand("Create campus", city, before, after, () => this.emit("zones"))); this.select({ kind: "zone", id: zoneId }); this.emit("history"); return zoneId;
  }

  public assignCampus(zoneId: string, universityId?: string): string | undefined {
    const city = this.state.city; const zone = city.zones.find((item) => item.id === zoneId); const existing = universityId ? city.universities.find((item) => item.id === universityId) : undefined; if (!zone || zone.universityId || universityId && !existing) return undefined;
    const resolvedUniversityId = existing?.id ?? `university-${crypto.randomUUID()}`; const before = this.campusSnapshot(); const campusCount = before.zones.filter((item) => item.universityId === resolvedUniversityId).length; const after: CampusStateSnapshot = { universities: existing ? before.universities : [...before.universities, { ...createEmptyUniversity(resolvedUniversityId), name: `University ${before.universities.length + 1}` }], zones: before.zones.map((item) => { if (item.id !== zoneId) return item; const { purpose: _purpose, ...campus } = item; return { ...campus, universityId: resolvedUniversityId, campusRole: existing ? "branch" as const : "main" as const, name: item.name?.trim() && item.name !== "New Campus" ? item.name : existing ? `Campus ${campusCount + 1}` : "Main Campus" }; }), facilities: before.facilities };
    this.commands.execute(new CampusStateSnapshotCommand("Assign campus", city, before, after, () => { this.emit("universities"); this.emit("zones"); })); this.emit("history"); this.emit("selection"); return resolvedUniversityId;
  }

  public createCampusZone(input: Omit<Zone, "id" | "universityId" | "purpose" | "university">, universityId?: string): { zoneId: string; universityId: string } | undefined {
    if (input.polygon.length < 3) return undefined;
    const city = this.state.city; const existing = universityId ? city.universities.find((university) => university.id === universityId) : undefined; if (universityId && !existing) return undefined;
    const resolvedUniversityId = existing?.id ?? `university-${crypto.randomUUID()}`; const zoneId = `zone-${crypto.randomUUID()}`; const campusCount = city.zones.filter((zone) => zone.universityId === resolvedUniversityId).length;
    const before = this.campusSnapshot(); const after: CampusStateSnapshot = { universities: existing ? before.universities : [...before.universities, { ...createEmptyUniversity(resolvedUniversityId), name: `University ${before.universities.length + 1}` }], zones: [...before.zones, { ...structuredClone(input), id: zoneId, name: input.name?.trim() || `Campus ${campusCount + 1}`, opacity: Math.max(0.05, Math.min(1, input.opacity)), universityId: resolvedUniversityId, campusRole: existing ? "branch" : "main" }], facilities: before.facilities };
    this.commands.execute(new CampusStateSnapshotCommand("Create campus", city, before, after, () => { this.emit("universities"); this.emit("zones"); })); this.select({ kind: "zone", id: zoneId }); this.emit("history"); return { zoneId, universityId: resolvedUniversityId };
  }

  public updateUniversity(id: string, changes: Partial<Omit<University, "id">>): void {
    const city = this.state.city; const current = city.universities.find((university) => university.id === id); if (!current) return; const updated = { ...current, ...structuredClone(changes) }; if (JSON.stringify(updated) === JSON.stringify(current)) return; const before = structuredClone(city.universities); const after = before.map((university) => university.id === id ? updated : university);
    this.commands.execute(new UniversitySnapshotCommand("Update university", city, before, after, () => this.emit("universities"))); this.emit("history"); this.emit("selection");
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

  public createWater(input: Omit<WaterArea, "id">): string | undefined {
    if (!isValidWaterPolygon(input.points)) return undefined; const city = this.state.city; const id = `water-${crypto.randomUUID()}`; const before = structuredClone(city.waters); const after = [...before, { ...structuredClone(input), id }];
    this.commands.execute(new WaterSnapshotCommand("Create water", city, before, after, () => this.emit("waters"))); this.select({ kind: "water", id }); this.emit("history"); return id;
  }
  public updateWater(id: string, changes: Partial<Pick<WaterArea, "name">>): void {
    const city = this.state.city; const current = city.waters.find((water) => water.id === id); if (!current || (changes.name ?? "") === (current.name ?? "")) return; const before = structuredClone(city.waters); const after = before.map((water) => water.id === id ? { ...water, ...changes } : water);
    this.commands.execute(new WaterSnapshotCommand("Rename water", city, before, after, () => this.emit("waters"))); this.emit("history"); this.emit("selection");
  }
  public moveWater(id: string, beforePoints: Point[]): void { this.commitWaterPoints(id, beforePoints, "Move water"); }
  public moveWaterVertex(id: string, beforePoints: Point[]): void { this.commitWaterPoints(id, beforePoints, "Move water vertex"); }

  public createBuilding(input: Omit<Building, "id">): string | undefined {
    if (!isValidBuildingFootprint(input.footprint)) return undefined; const city = this.state.city; const id = `building-${crypto.randomUUID()}`; const before = structuredClone(city.buildings); const after = [...before, { ...structuredClone(input), id, floors: Math.max(1, Math.round(input.floors)), height: Math.max(1, input.height) }]; this.commands.execute(new BuildingSnapshotCommand("Create building", city, before, after, () => this.emit("buildings"))); this.select({ kind: "building", id }); this.emit("history"); return id;
  }

  public createBlockGrid(input: { first: Point; opposite: Point; rows: number; columns: number; roadSubtype: RoadSubtype }): string[] | undefined {
    const city = this.state.city; const roadWidth = blockRoadWidths[input.roadSubtype]; const plan = createBlockGrid(input.first, input.opposite, input.rows, input.columns, roadWidth);
    if (!plan || plan.roads.some((road) => city.waters.some((water) => pathIntersectsPolygon([road.start, road.end], water.points)))) return undefined;
    const beforeBlocks = structuredClone(city.blocks); const beforeRoads = this.snapshot(); let working: City = { ...city, roadNodes: structuredClone(city.roadNodes), roads: structuredClone(city.roads), roadEdges: structuredClone(city.roadEdges) };
    const category: RoadCategory = input.roadSubtype === "pedestrian" ? "pedestrian" : input.roadSubtype === "highway" || input.roadSubtype === "ramp" ? "highway" : "normal";
    let firstRoadId: string | undefined;
    for (const [index, road] of plan.roads.entries()) {
      const result = buildRoadCreation(working, { start: road.start, end: road.end, category, subtype: input.roadSubtype, width: roadWidth, name: `Block Road ${index + 1}`, structure: "ground", geometry: { type: "line" } });
      firstRoadId ??= result.roadId; working = { ...working, roadNodes: result.roadNodes, roads: result.roads, roadEdges: result.roadEdges };
    }
    if (!firstRoadId) return undefined;
    const afterBlocks = [...beforeBlocks, ...structuredClone(plan.blocks)]; const afterRoads = this.withReconciledBuses({ roadNodes: working.roadNodes, roads: working.roads, roadEdges: working.roadEdges });
    this.commands.execute(new BlockGridSnapshotCommand("Create block grid", city, beforeBlocks, afterBlocks, beforeRoads, afterRoads, () => { this.emit("blocks"); this.emit("roads"); }));
    this.select({ kind: "road", id: firstRoadId }); this.emit("history"); return plan.blocks.map((block) => block.id);
  }

  public createFacility(input: Omit<FacilityPOI, "id">): string {
    const city = this.state.city; const id = `facility-${crypto.randomUUID()}`; const before = structuredClone(city.facilities); const after = [...before, { ...structuredClone(input), id }];
    this.commands.execute(new FacilitySnapshotCommand("Create facility", city, before, after, () => this.emit("facilities"))); this.select({ kind: "facility", id }); this.emit("history"); return id;
  }

  public updateFacility(id: string, changes: Partial<Pick<FacilityPOI, "name" | "color" | "affiliatedUniversityId" | "universityAffiliationKind">>): void {
    const city = this.state.city; const current = city.facilities.find((facility) => facility.id === id); if (!current) return; const updated = { ...current, ...changes }; if (JSON.stringify(updated) === JSON.stringify(current)) return; const before = structuredClone(city.facilities); const after = before.map((facility) => facility.id === id ? { ...facility, ...changes } : facility);
    this.commands.execute(new FacilitySnapshotCommand("affiliatedUniversityId" in changes || "universityAffiliationKind" in changes ? "Update facility affiliation" : changes.color !== undefined ? "Change facility color" : "Rename facility", city, before, after, () => this.emit("facilities"))); this.emit("history"); this.emit("selection");
  }

  public moveFacility(id: string, beforePosition: Point, beforeUniversityZoneId?: string): void {
    const city = this.state.city; const current = city.facilities.find((facility) => facility.id === id); if (!current || distance(current.position, beforePosition) < 1e-5 && current.universityZoneId === beforeUniversityZoneId) return; const after = structuredClone(city.facilities); const before = structuredClone(after); const previous = before.find((facility) => facility.id === id); if (!previous) return; previous.position = { ...beforePosition };
    previous.universityZoneId = beforeUniversityZoneId;
    this.commands.execute(new FacilitySnapshotCommand("Move facility", city, before, after, () => this.emit("facilities"))); this.select({ kind: "facility", id }); this.emit("history");
  }

  public createBusTerminal(input: Omit<BusTerminal, "id">): string {
    const city = this.state.city; const id = `bus-terminal-${crypto.randomUUID()}`; const before = this.busSnapshot(); const after = { ...before, busTerminals: [...before.busTerminals, { ...structuredClone(input), id }] };
    this.commands.execute(new BusSnapshotCommand("Create bus terminal", city, before, after, () => this.emit("buses"))); this.select({ kind: "bus-terminal", id }); this.emit("history"); return id;
  }

  public updateBusTerminal(id: string, changes: Partial<Pick<BusTerminal, "name">>): void {
    const city = this.state.city; const current = city.busTerminals?.find((terminal) => terminal.id === id); if (!current) return; const updated = { ...current, ...changes }; if (updated.name === current.name) return; const before = this.busSnapshot(); const after = { ...before, busTerminals: before.busTerminals.map((terminal) => terminal.id === id ? { ...terminal, ...changes } : terminal) };
    this.commands.execute(new BusSnapshotCommand("Rename bus terminal", city, before, after, () => this.emit("buses"))); this.emit("history"); this.emit("selection");
  }

  public moveBusTerminal(id: string, beforePosition: Point): void {
    const city = this.state.city; const current = city.busTerminals?.find((terminal) => terminal.id === id); if (!current || distance(current.position, beforePosition) < 1e-5) return; if (!this.isTerminalPositionValid(id, current.position)) { current.position = { ...beforePosition }; this.emit("buses"); return; } const after = this.busSnapshot(); const before = structuredClone(after); const previous = before.busTerminals.find((terminal) => terminal.id === id); if (!previous) return; previous.position = { ...beforePosition };
    this.commands.execute(new BusSnapshotCommand("Move bus terminal", city, before, after, () => this.emit("buses"))); this.select({ kind: "bus-terminal", id }); this.emit("history");
  }

  public createBusLine(input: Omit<BusLine, "id" | "stopIds" | "loop" | "startTerminalId" | "endTerminalId"> & Required<Pick<BusLine, "startTerminalId" | "endTerminalId">> & { stopIds?: string[] }): string | undefined {
    const city = this.state.city; if (input.stopIds?.length || !this.isValidBusTerminal(input.startTerminalId) || !this.isValidBusTerminal(input.endTerminalId) || !this.isValidBusPath(input.path, input.startTerminalId, input.endTerminalId)) return undefined; const id = `bus-line-${crypto.randomUUID()}`; const before = this.busSnapshot(); const line: BusLine = { id, name: input.name, color: input.color, loop: false, startTerminalId: input.startTerminalId, endTerminalId: input.endTerminalId, path: structuredClone(input.path), direction: input.direction, stopIds: [] }; const after = { ...before, busLines: [...before.busLines, line] };
    this.commands.execute(new BusSnapshotCommand("Create bus line", city, before, after, () => this.emit("buses"))); this.select({ kind: "bus-line", id }); this.emit("history"); return id;
  }

  public createBusLoop(input: CreateBusLoopInput): string | undefined {
    const city = this.state.city; const path = structuredClone(input.path); const stops = structuredClone(input.stops);
    if (stops.length < 2 || !this.isValidBusPathSteps(path, true) || !stops.every((stop) => this.isValidBusLoopStop(stop, path)) || !this.areBusStopsOrdered(path, stops)) return undefined;
    const id = `bus-line-${crypto.randomUUID()}`; const createdStops: BusStop[] = stops.map((stop) => ({ ...stop, id: `bus-stop-${crypto.randomUUID()}`, lineId: id })); const line: BusLine = { id, name: input.name, color: input.color, loop: true, path, direction: "start-to-end", stopIds: createdStops.map((stop) => stop.id) }; const before = this.busSnapshot(); const after = { ...before, busLines: [...before.busLines, line], busStops: [...before.busStops, ...createdStops] };
    this.commands.execute(new BusSnapshotCommand("Create bus loop", city, before, after, () => this.emit("buses"))); this.select({ kind: "bus-line", id }); this.emit("history"); return id;
  }

  public updateBusLine(id: string, changes: Partial<Pick<BusLine, "name" | "color" | "direction">>): void {
    const city = this.state.city; const current = city.busLines?.find((line) => line.id === id); if (!current) return; const updated = { ...current, ...changes }; if (updated.name === current.name && updated.color === current.color && updated.direction === current.direction) return; const before = this.busSnapshot(); const after = { ...before, busLines: before.busLines.map((line) => line.id === id ? { ...line, ...changes } : line) };
    this.commands.execute(new BusSnapshotCommand(changes.color !== undefined ? "Change bus line color" : "Update bus line", city, before, after, () => this.emit("buses"))); this.emit("history"); this.emit("selection");
  }

  public updateBusLinePath(id: string, path: BusPathStep[], endTerminalId: string): void;
  public updateBusLinePath(id: string, changes: Pick<BusLine, "path" | "endTerminalId"> & Partial<Pick<BusLine, "color">>): void;
  public updateBusLinePath(id: string, pathOrChanges: BusPathStep[] | (Pick<BusLine, "path" | "endTerminalId"> & Partial<Pick<BusLine, "color">>), endTerminalId?: string): void {
    const city = this.state.city; const current = city.busLines?.find((line) => line.id === id); const path = Array.isArray(pathOrChanges) ? pathOrChanges : pathOrChanges.path; const nextEndTerminalId = Array.isArray(pathOrChanges) ? endTerminalId : pathOrChanges.endTerminalId; const color = Array.isArray(pathOrChanges) ? undefined : pathOrChanges.color; if (!current || current.loop || !current.startTerminalId || !nextEndTerminalId || !this.isValidBusTerminal(nextEndTerminalId) || !this.isValidBusPath(path, current.startTerminalId, nextEndTerminalId)) return; const pathEdgeIds = new Set(path.map((step) => step.roadEdgeId)); const staleStopIds = new Set((city.busStops ?? []).filter((stop) => stop.lineId === id && !pathEdgeIds.has(stop.roadEdgeId)).map((stop) => stop.id)); const unchanged = current.endTerminalId === nextEndTerminalId && (color === undefined || color === current.color) && JSON.stringify(current.path) === JSON.stringify(path); if (unchanged && staleStopIds.size === 0) return; const before = this.busSnapshot(); const after = this.sortBusStopIds({ ...before, busLines: before.busLines.map((line) => { const stopIds = line.stopIds.filter((stopId) => !staleStopIds.has(stopId)); return line.id === id ? { ...line, path: structuredClone(path), endTerminalId: nextEndTerminalId, color: color ?? line.color, stopIds } : { ...line, stopIds }; }), busStops: before.busStops.filter((stop) => !staleStopIds.has(stop.id)) });
    this.commands.execute(new BusSnapshotCommand("Update bus line path", city, before, after, () => this.emit("buses"))); this.normalizeSelection(); this.emit("history"); this.emit("selection");
  }

  public createBusStop(input: Omit<BusStop, "id">): string | undefined {
    const city = this.state.city; if (!this.isValidBusStop(input)) return undefined; const id = `bus-stop-${crypto.randomUUID()}`; const before = this.busSnapshot(); const stop: BusStop = { ...structuredClone(input), id }; const after = this.sortBusStopIds({ ...before, busLines: before.busLines.map((line) => line.id === input.lineId ? { ...line, stopIds: [...line.stopIds, id] } : line), busStops: [...before.busStops, stop] });
    this.commands.execute(new BusSnapshotCommand("Create bus stop", city, before, after, () => this.emit("buses"))); this.select({ kind: "bus-stop", id }); this.emit("history"); return id;
  }

  public updateBusStop(id: string, changes: Partial<Omit<BusStop, "id" | "position">>): void {
    const city = this.state.city; const current = city.busStops?.find((stop) => stop.id === id); if (!current) return; const updated = { ...current, ...changes }; const sourceLine = city.busLines.find((line) => line.id === current.lineId); if (updated.lineId !== current.lineId && sourceLine?.loop && sourceLine.stopIds.length <= 2) return; if (!this.isValidBusStop(updated) || JSON.stringify(updated) === JSON.stringify(current)) return; const before = this.busSnapshot(); const after = this.sortBusStopIds({ ...before, busLines: before.busLines.map((line) => { if (current.lineId === updated.lineId) return line; const stopIds = line.stopIds.filter((stopId) => stopId !== id); return line.id === updated.lineId ? { ...line, stopIds: [...stopIds, id] } : { ...line, stopIds }; }), busStops: before.busStops.map((stop) => stop.id === id ? updated : stop) });
    this.commands.execute(new BusSnapshotCommand("Update bus stop", city, before, after, () => this.emit("buses"))); this.emit("history"); this.emit("selection");
  }

  public moveBusStop(id: string, beforeValue: Point | Pick<BusStop, "roadEdgeId" | "fraction" | "position" | "side">): void {
    const city = this.state.city; const current = city.busStops?.find((stop) => stop.id === id); if (!current) return; const beforePlacement = "position" in beforeValue ? structuredClone(beforeValue) : { roadEdgeId: current.roadEdgeId, fraction: current.fraction, position: { ...beforeValue }, side: current.side }; if (!this.isValidBusStop(current)) { Object.assign(current, beforePlacement); this.emit("buses"); return; } const afterPlacement = { roadEdgeId: current.roadEdgeId, fraction: current.fraction, position: current.position, side: current.side }; if (JSON.stringify(afterPlacement) === JSON.stringify(beforePlacement)) return; const after = this.sortBusStopIds(this.busSnapshot()); const before = structuredClone(after); const previous = before.busStops.find((stop) => stop.id === id); if (!previous) return; Object.assign(previous, beforePlacement); this.sortBusStopIds(before);
    this.commands.execute(new BusSnapshotCommand("Move bus stop", city, before, after, () => this.emit("buses"))); this.select({ kind: "bus-stop", id }); this.emit("history");
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
    if (mergeTargetId && !this.canMergeRoadNodes(id, mergeTargetId)) mergeTargetId = undefined;
    if (!mergeTargetId || mergeTargetId === id) {
      if (distance(before, after) < 1e-5) return; const city = this.state.city; const afterSnapshot = this.syncBusStopPositions(this.snapshot()); const beforeSnapshot = structuredClone(afterSnapshot); const previous = beforeSnapshot.roadNodes.find((node) => node.id === id); if (!previous) return; previous.x = before.x; previous.y = before.y;
      afterSnapshot.busTerminals = afterSnapshot.busTerminals?.map((terminal) => distance(terminal.position, before) < 1e-4 ? { ...terminal, position: { ...after } } : terminal); beforeSnapshot.busTerminals = beforeSnapshot.busTerminals?.map((terminal) => distance(terminal.position, after) < 1e-4 ? { ...terminal, position: { ...before } } : terminal); this.syncBusStopPositions(beforeSnapshot);
      this.commands.execute(new RoadSnapshotCommand("Move road node", city, beforeSnapshot, afterSnapshot, () => this.emit("roads"))); this.emit("history"); return;
    }
    const city = this.state.city; const target = city.roadNodes.find((node) => node.id === mergeTargetId); const moving = city.roadNodes.find((node) => node.id === id);
    if (!target || !moving) return;
    const beforeSnapshot = this.snapshot(); const original = beforeSnapshot.roadNodes.find((node) => node.id === id); if (original) Object.assign(original, before);
    let roadEdges = structuredClone(city.roadEdges).map((edge) => ({ ...edge, startNodeId: edge.startNodeId === id ? mergeTargetId : edge.startNodeId, endNodeId: edge.endNodeId === id ? mergeTargetId : edge.endNodeId }));
    const collapsed = new Set(roadEdges.filter((edge) => edge.startNodeId === edge.endNodeId).map((edge) => edge.id)); roadEdges = roadEdges.filter((edge) => !collapsed.has(edge.id));
    const roads = structuredClone(city.roads).map((road) => ({ ...road, segmentIds: road.segmentIds.filter((edgeId) => !collapsed.has(edgeId)) })).filter((road) => road.segmentIds.length > 0);
    const used = new Set(roadEdges.flatMap((edge) => [edge.startNodeId, edge.endNodeId])); const roadNodes = structuredClone(city.roadNodes).filter((node) => node.id !== id && used.has(node.id));
    for (const terminal of city.busTerminals) if (distance(terminal.position, before) < 1e-4) terminal.position = { x: target.x, y: target.y };
    this.commands.execute(new RoadSnapshotCommand("Merge road endpoints", city, beforeSnapshot, this.withReconciledBuses({ roadNodes, roads, roadEdges }), () => this.emit("roads")));
    this.select({ kind: "node", id: mergeTargetId }); this.emit("history");
  }

  public moveRoad(roadId: string, beforePositions: Array<{ id: string; x: number; y: number }>, beforeGeometries: Array<{ id: string; geometry: RoadGeometry }> = []): void {
    const city = this.state.city; const moved = beforePositions.some((before) => { const node = city.roadNodes.find((candidate) => candidate.id === before.id); return node && distance(node, before) >= 1e-5; }); if (!moved) return;
    const after = this.syncBusStopPositions(this.snapshot());
    for (const position of beforePositions) { const node = city.roadNodes.find((candidate) => candidate.id === position.id); if (!node) continue; after.busTerminals = after.busTerminals?.map((terminal) => distance(terminal.position, position) < 1e-4 ? { ...terminal, position: { x: node.x, y: node.y } } : terminal); }
    const before = structuredClone(after);
    for (const position of beforePositions) { const node = before.roadNodes.find((candidate) => candidate.id === position.id); if (node) { node.x = position.x; node.y = position.y; } }
    for (const value of beforeGeometries) { const edge = before.roadEdges.find((candidate) => candidate.id === value.id); if (edge) edge.geometry = structuredClone(value.geometry); }
    for (const position of beforePositions) before.busTerminals = before.busTerminals?.map((terminal) => { const current = city.roadNodes.find((candidate) => candidate.id === position.id); return current && distance(terminal.position, current) < 1e-4 ? { ...terminal, position: { x: position.x, y: position.y } } : terminal; });
    this.syncBusStopPositions(before); this.commands.execute(new RoadSnapshotCommand("Move road segment", city, before, after, () => this.emit("roads"))); this.select({ kind: "road", id: roadId, edgeId: this.selection?.kind === "road" ? this.selection.edgeId : undefined, scope: this.selection?.kind === "road" ? this.selection.scope : "segment" }); this.emit("history");
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
  public updateRoadSelectionStyle(edgeId: string, scope: RoadSelectionScope, changes: Partial<Pick<Road, "category" | "subtype" | "width" | "description">>): void {
    const city = this.state.city; const anchor = city.roadEdges.find((edge) => edge.id === edgeId); if (!anchor) return; this.updateRoadEdgesStyle((scope === "segment" ? [anchor] : roadIdentityGroupEdges(city, anchor)).map((edge) => edge.id), changes);
  }
  public updateRoadEdgesStyle(edgeIds: string[], changes: Partial<Pick<Road, "category" | "subtype" | "width" | "description">>): void {
    const city = this.state.city; const selectedIds = new Set(edgeIds.filter((id) => city.roadEdges.some((edge) => edge.id === id))); if (selectedIds.size === 0) return; const before = this.snapshot(); const roads = structuredClone(city.roads); const roadEdges = structuredClone(city.roadEdges); let changed = false;
    for (const road of [...roads]) {
      const segmentIds = road.segmentIds.filter((id) => selectedIds.has(id)); if (segmentIds.length === 0) continue;
      const updated = { ...road, ...changes }; if (JSON.stringify(updated) === JSON.stringify(road)) continue; changed = true;
      if (segmentIds.length === road.segmentIds.length) Object.assign(road, changes);
      else {
        road.segmentIds = road.segmentIds.filter((id) => !selectedIds.has(id)); const detachedId = `road-${crypto.randomUUID()}`; roads.push({ ...updated, id: detachedId, segmentIds });
        for (const edge of roadEdges) if (segmentIds.includes(edge.id)) edge.roadId = detachedId;
      }
    }
    if (!changed) return; const partitioned = partitionRoadComponents(roads, roadEdges); this.commands.execute(new RoadSnapshotCommand("Update road selection", city, before, { ...before, roads: partitioned, roadEdges }, () => this.emit("roads"))); this.emit("history"); this.emit("selection");
  }
  public renameRoadEdge(edgeId: string, name: string, scope: "group" | "segment" = "group"): void {
    const city = this.state.city; const anchor = city.roadEdges.find((edge) => edge.id === edgeId); if (!anchor) return; this.renameRoadEdges((scope === "group" ? roadIdentityGroupEdges(city, anchor) : [anchor]).map((edge) => edge.id), name, scope === "group" ? "Rename road group" : "Rename road segment");
  }
  public renameRoadEdges(edgeIds: string[], name: string, label = "Rename road segments"): void {
    const city = this.state.city; const affectedIds = new Set(edgeIds.filter((id) => city.roadEdges.some((edge) => edge.id === id))); if (affectedIds.size === 0 || [...affectedIds].every((id) => city.roadEdges.find((edge) => edge.id === id)?.name === name)) return; const before = this.snapshot();
    const roadEdges = structuredClone(city.roadEdges).map((edge) => affectedIds.has(edge.id) ? { ...edge, name } : edge);
    const roads = structuredClone(city.roads).map((road) => { const names = roadEdges.filter((edge) => edge.roadId === road.id).map((edge) => edge.name); return names.length > 0 && names.every((value) => value === names[0]) ? { ...road, name: names[0]! } : road; });
    this.commands.execute(new RoadSnapshotCommand(label, city, before, { ...before, roads, roadEdges }, () => this.emit("roads"))); this.emit("history"); this.emit("selection");
  }
  public updateRoadEdgeStructure(edgeId: string, scope: RoadSelectionScope, structure: RoadStructure): void {
    const city = this.state.city; const anchor = city.roadEdges.find((edge) => edge.id === edgeId); if (!anchor) return; this.updateRoadEdgesStructure((scope === "segment" ? [anchor] : roadIdentityGroupEdges(city, anchor)).map((edge) => edge.id), structure);
  }
  public updateRoadEdgesStructure(edgeIds: string[], structure: RoadStructure): void {
    const city = this.state.city; const requestedIds = new Set(edgeIds.filter((id) => city.roadEdges.some((edge) => edge.id === id))); const requestedEdges = structuredClone(city.roadEdges.filter((edge) => requestedIds.has(edge.id))); const selectedIds = new Set(requestedEdges.filter((edge) => edge.structure !== structure).map((edge) => edge.id)); const anchor = city.roadEdges.find((edge) => selectedIds.has(edge.id)); if (!anchor) return;
    if (structure === "ground") {
      const originals = requestedEdges.filter((edge) => selectedIds.has(edge.id)); const before = this.snapshot(); let working: City = { ...city, roadNodes: structuredClone(city.roadNodes), roads: structuredClone(city.roads).map((road) => ({ ...road, segmentIds: road.segmentIds.filter((id) => !selectedIds.has(id)) })), roadEdges: structuredClone(city.roadEdges).filter((edge) => !selectedIds.has(edge.id)) };
      const originalNodes = new Map(city.roadNodes.map((node) => [node.id, node]));
      for (const original of originals) { const road = city.roads.find((candidate) => candidate.id === original.roadId); const start = originalNodes.get(original.startNodeId); const end = originalNodes.get(original.endNodeId); if (!road || !start || !end) continue; const built = buildRoadCreation(working, { start, end, roadId: road.id, category: road.category, subtype: road.subtype, width: road.width, name: original.name, structure, geometry: structuredClone(original.geometry) }); working = { ...working, roadNodes: built.roadNodes, roads: built.roads, roadEdges: built.roadEdges }; }
      const workingNodes = new Map(working.roadNodes.map((node) => [node.id, node])); const replacementEdgeIds = requestedEdges.flatMap((original) => working.roadEdges.filter((edge) => edge.roadId === original.roadId && edge.name === original.name && sampleRoad(edge, workingNodes, 12).every((point) => roadDistance(point, original, originalNodes) <= 1)).map((edge) => edge.id)).filter((id, index, all) => all.indexOf(id) === index);
      const used = new Set(working.roadEdges.flatMap((edge) => [edge.startNodeId, edge.endNodeId])); const roads = partitionRoadComponents(working.roads.filter((road) => road.segmentIds.length > 0), working.roadEdges); const after = this.withReconciledBuses({ roadNodes: working.roadNodes.filter((node) => used.has(node.id)), roads, roadEdges: working.roadEdges }); const selectedEdgeId = replacementEdgeIds[0]; const previousSelection = structuredClone(this.selection); const nextSelection: EditorSelection = previousSelection?.kind === "road-multi" ? { kind: "road-multi", edgeIds: replacementEdgeIds, nodeIds: previousSelection.nodeIds.filter((id) => after.roadNodes.some((node) => node.id === id)) } : selectedEdgeId ? { kind: "road", id: after.roadEdges.find((edge) => edge.id === selectedEdgeId)?.roadId ?? anchor.roadId, edgeId: selectedEdgeId, scope: previousSelection?.kind === "road" ? previousSelection.scope : "segment" } : null;
      const afterOnlyEdgeIds = replacementEdgeIds.filter((id) => !before.roadEdges.some((edge) => edge.id === id)); this.commands.execute(new RoadSnapshotCommand("Update road segment structure", city, before, after, () => { this.selection = afterOnlyEdgeIds.some((id) => city.roadEdges.some((edge) => edge.id === id)) ? structuredClone(nextSelection) : structuredClone(previousSelection); this.emit("roads"); })); this.emit("history"); this.emit("selection"); return;
    }
    const before = this.snapshot(); const roadNodes = structuredClone(city.roadNodes); const roadEdges = structuredClone(city.roadEdges); const level = structure === "elevated" ? 1 : structure === "tunnel" ? -1 : 0;
    for (const edge of roadEdges) if (selectedIds.has(edge.id)) { edge.structure = structure; edge.level = level; }
    const endpoints = [...new Set(roadEdges.filter((edge) => selectedIds.has(edge.id)).flatMap((edge) => [edge.startNodeId, edge.endNodeId]))];
    endpoints.forEach((nodeId, index) => { const node = roadNodes.find((candidate) => candidate.id === nodeId); const canonicalId = node && endpoints.slice(0, index).find((candidateId) => { const candidate = roadNodes.find((entry) => entry.id === candidateId); return candidate && distance(candidate, node) < 1e-4; }); if (!canonicalId) return; for (const edge of roadEdges) if (selectedIds.has(edge.id)) { if (edge.startNodeId === nodeId) edge.startNodeId = canonicalId; if (edge.endNodeId === nodeId) edge.endNodeId = canonicalId; } });
    for (const edge of roadEdges.filter((candidate) => selectedIds.has(candidate.id))) {
      for (const endpoint of ["startNodeId", "endNodeId"] as const) { const node = roadNodes.find((candidate) => candidate.id === edge[endpoint]); if (!node) continue; const colocated = roadNodes.find((candidate) => candidate.id !== node.id && distance(candidate, node) < 1e-4 && roadEdges.some((other) => !selectedIds.has(other.id) && other.structure === structure && (other.startNodeId === candidate.id || other.endNodeId === candidate.id))); if (colocated) edge[endpoint] = colocated.id; }
    }
    const selectedNodeIds = new Set(roadEdges.filter((edge) => selectedIds.has(edge.id)).flatMap((edge) => [edge.startNodeId, edge.endNodeId]));
    for (const nodeId of selectedNodeIds) {
      const incident = roadEdges.filter((edge) => edge.startNodeId === nodeId || edge.endNodeId === nodeId); const selectedIncident = incident.filter((edge) => selectedIds.has(edge.id)); const unselectedIncident = incident.filter((edge) => !selectedIds.has(edge.id));
      if (selectedIncident.length === 0 || unselectedIncident.length === 0 || unselectedIncident.every((edge) => edge.structure === structure)) continue;
      const node = roadNodes.find((candidate) => candidate.id === nodeId); if (!node) continue; const detachedId = `node-${crypto.randomUUID()}`; roadNodes.push({ ...node, id: detachedId });
      for (const edge of selectedIncident) { if (edge.startNodeId === nodeId) edge.startNodeId = detachedId; if (edge.endNodeId === nodeId) edge.endNodeId = detachedId; }
    }
    const used = new Set(roadEdges.flatMap((edge) => [edge.startNodeId, edge.endNodeId])); const roads = partitionRoadComponents(structuredClone(city.roads), roadEdges); this.commands.execute(new RoadSnapshotCommand("Update road segment structure", city, before, this.withReconciledBuses({ roadNodes: roadNodes.filter((node) => used.has(node.id)), roads, roadEdges }), () => this.emit("roads"))); this.normalizeSelection(); this.emit("history"); this.emit("selection");
  }
  public updateRoadEdgeGeometry(edgeId: string, type: "line" | "curve"): void {
    const city = this.state.city; const edge = city.roadEdges.find((candidate) => candidate.id === edgeId); if (!edge || (type === "line" && edge.geometry.type === "line") || (type === "curve" && edge.geometry.type === "bezier")) return;
    const before = this.snapshot(); const nodes = new Map(city.roadNodes.map((node) => [node.id, node])); const path = sampleRoad(edge, nodes); const start = nodes.get(edge.startNodeId); const end = nodes.get(edge.endNodeId); if (!start || !end) return;
    const geometry: RoadGeometry = type === "line" ? { type: "line" } : { type: "bezier", controlPoints: [{ ...(path[Math.floor(path.length / 2)] ?? { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }) }] };
    const roadEdges = structuredClone(city.roadEdges).map((candidate) => candidate.id === edgeId ? { ...candidate, geometry } : candidate); const after = this.syncBusStopPositions({ ...before, roadEdges });
    this.commands.execute(new RoadSnapshotCommand(type === "line" ? "Straighten road segment" : "Curve road segment", city, before, after, () => this.emit("roads"))); this.select({ kind: "road", id: edge.roadId, edgeId, scope: "segment" }); this.emit("history");
  }
  public moveRoadControlPoint(edgeId: string, beforeGeometry: RoadGeometry): void {
    const city = this.state.city; const edge = city.roadEdges.find((candidate) => candidate.id === edgeId); if (!edge || JSON.stringify(edge.geometry) === JSON.stringify(beforeGeometry)) return; const after = this.syncBusStopPositions(this.snapshot()); const before = structuredClone(after); const previous = before.roadEdges.find((candidate) => candidate.id === edgeId); if (!previous) return; previous.geometry = structuredClone(beforeGeometry); this.syncBusStopPositions(before);
    this.commands.execute(new RoadSnapshotCommand("Move road control point", city, before, after, () => this.emit("roads"))); this.emit("history");
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
    this.commands.execute(new RoadSnapshotCommand("Update road structure", city, before, this.withReconciledBuses({ roadNodes: working.roadNodes, roads: working.roads, roadEdges: working.roadEdges }), () => this.emit("roads"))); this.emit("history"); this.emit("selection");
  }
  public straightenRoad(id: string): void {
    const city = this.state.city; const before = this.snapshot(); const roadEdges = structuredClone(city.roadEdges).map((edge) => edge.roadId === id ? { ...edge, geometry: { type: "line" } as const } : edge);
    this.commands.execute(new RoadSnapshotCommand("Straighten road", city, before, { ...before, roadEdges }, () => this.emit("roads"))); this.emit("history");
  }
  public undo(): void { this.commands.undo(); this.normalizeSelection(); this.emit("history"); this.emit("selection"); }
  public redo(): void { this.commands.redo(); this.normalizeSelection(); this.emit("history"); this.emit("selection"); }
  private snapshot(): RoadSnapshot { return { roadNodes: structuredClone(this.state.city.roadNodes), roads: structuredClone(this.state.city.roads), roadEdges: structuredClone(this.state.city.roadEdges), ...this.busSnapshot() }; }
  private normalizeSelection(): void {
    const selection = this.selection;
    if (selection?.kind === "road" && !(selection.edgeId ? this.state.city.roadEdges.some((edge) => edge.id === selection.edgeId) : this.state.city.roads.some((road) => road.id === selection.id))) this.selection = null;
    if (this.selection?.kind === "road-multi") { const edgeIds = this.selection.edgeIds.filter((id) => this.state.city.roadEdges.some((edge) => edge.id === id)); const nodeIds = this.selection.nodeIds.filter((id) => this.state.city.roadNodes.some((node) => node.id === id)); this.selection = edgeIds.length || nodeIds.length ? { kind: "road-multi", edgeIds, nodeIds } : null; }
    const current = this.selection;
    if (current?.kind === "road-control") { const edge = this.state.city.roadEdges.find((candidate) => candidate.id === current.id); const points = edge?.geometry.type === "bezier" ? edge.geometry.controlPoints : edge?.geometry.type === "polyline" ? edge.geometry.points : []; if (!points[current.pointIndex]) this.selection = edge ? { kind: "road", id: edge.roadId, edgeId: edge.id, scope: "segment" } : null; }
    else if (current?.kind === "node" && !this.state.city.roadNodes.some((node) => node.id === current.id)) this.selection = null;
    else if (current?.kind === "zone" && !this.state.city.zones.some((zone) => zone.id === current.id)) this.selection = null;
    else if (current?.kind === "water" && !this.state.city.waters.some((water) => water.id === current.id)) this.selection = null;
    else if (current?.kind === "building" && !this.state.city.buildings.some((building) => building.id === current.id)) this.selection = null;
    else if (current?.kind === "facility" && !this.state.city.facilities.some((facility) => facility.id === current.id)) this.selection = null;
    else if (current?.kind === "bus-terminal" && !this.state.city.busTerminals?.some((terminal) => terminal.id === current.id)) this.selection = null;
    else if (current?.kind === "bus-line" && !this.state.city.busLines?.some((line) => line.id === current.id)) this.selection = null;
    else if (current?.kind === "bus-stop" && !this.state.city.busStops?.some((stop) => stop.id === current.id)) this.selection = null;
  }
  private commitZonePolygon(id: string, beforePolygon: Point[], label: string): void {
    const city = this.state.city; const current = city.zones.find((zone) => zone.id === id); if (!current || current.polygon.length !== beforePolygon.length || current.polygon.every((point, index) => distance(point, beforePolygon[index]!) < 1e-5)) return;
    const after = structuredClone(city.zones); const before = structuredClone(after); const zone = before.find((candidate) => candidate.id === id); if (zone) zone.polygon = structuredClone(beforePolygon); this.commands.execute(new ZoneSnapshotCommand(label, city, before, after, () => this.emit("zones"))); this.emit("history");
  }
  private commitWaterPoints(id: string, beforePoints: Point[], label: string): void {
    const city = this.state.city; const current = city.waters.find((water) => water.id === id); if (!current || !isValidWaterPolygon(current.points)) { if (current) current.points = structuredClone(beforePoints); this.emit("waters"); return; } if (current.points.length !== beforePoints.length || current.points.every((point, index) => distance(point, beforePoints[index]!) < 1e-5)) return;
    const after = structuredClone(city.waters); const before = structuredClone(after); const water = before.find((candidate) => candidate.id === id); if (water) water.points = structuredClone(beforePoints); this.commands.execute(new WaterSnapshotCommand(label, city, before, after, () => this.emit("waters"))); this.emit("history");
  }
  private withReconciledBuses(afterRoads: RoadSnapshot): RoadSnapshot {
    const city = this.state.city; const oldNodes = new Map(city.roadNodes.map((node) => [node.id, node])); const nextNodes = new Map(afterRoads.roadNodes.map((node) => [node.id, node])); const nextEdges = new Map(afterRoads.roadEdges.map((edge) => [edge.id, edge])); const replacements = new Map<string, BusPathStep[]>();
    const replacementSteps = (edgeId: string): BusPathStep[] => {
      const cached = replacements.get(edgeId); if (cached) return cached;
      const oldEdge = city.roadEdges.find((edge) => edge.id === edgeId); if (!oldEdge) return [];
      const same = nextEdges.get(edgeId); if (same && same.startNodeId === oldEdge.startNodeId && same.endNodeId === oldEdge.endNodeId && JSON.stringify(same.geometry) === JSON.stringify(oldEdge.geometry)) { const result = [{ roadEdgeId: edgeId, forward: true }]; replacements.set(edgeId, result); return result; }
      const oldPath = sampleRoad(oldEdge, oldNodes, 128); const distanceToOld = (point: Point) => oldPath.slice(1).reduce((nearest, end, index) => Math.min(nearest, pointToSegmentDistance(point, oldPath[index]!, end)), Number.POSITIVE_INFINITY);
      const candidates = afterRoads.roadEdges.filter((edge) => edge.roadId === oldEdge.roadId).map((edge) => {
        const path = sampleRoad(edge, nextNodes, 48); const overlap = path.filter((point) => distanceToOld(point) <= 0.75).length; const start = nextNodes.get(edge.startNodeId); const end = nextNodes.get(edge.endNodeId); const startLocation = start ? locatePointOnRoad(start, oldEdge, oldNodes) : undefined; const endLocation = end ? locatePointOnRoad(end, oldEdge, oldNodes) : undefined; return { edge, overlap, startFraction: startLocation?.fraction ?? 0, endFraction: endLocation?.fraction ?? 0 };
      }).filter((candidate) => candidate.overlap >= 2).sort((a, b) => (a.startFraction + a.endFraction) - (b.startFraction + b.endFraction));
      const result = candidates.map((candidate) => ({ roadEdgeId: candidate.edge.id, forward: candidate.endFraction >= candidate.startFraction })); replacements.set(edgeId, result); return result;
    };
    let busLines = structuredClone(city.busLines).map((line) => {
      const path = line.path.flatMap((step) => {
        const mapped = replacementSteps(step.roadEdgeId); if (mapped.length === 1 && mapped[0]?.roadEdgeId === step.roadEdgeId) return [{ ...step }];
        const oldEdge = city.roadEdges.find((edge) => edge.id === step.roadEdgeId); if (!oldEdge) return [];
        const directed = step.forward ? mapped : [...mapped].reverse().map((entry) => ({ ...entry, forward: !entry.forward }));
        const fractions = this.busStepFractions(step); const startPoint = pointAtRoadFraction(oldEdge, oldNodes, fractions.start)?.point; const endPoint = pointAtRoadFraction(oldEdge, oldNodes, fractions.end)?.point; if (!startPoint || !endPoint) return [];
        const locations = (point: Point) => directed.map((entry, index) => { const edge = nextEdges.get(entry.roadEdgeId); const location = edge ? locatePointOnRoad(point, edge, nextNodes) : undefined; return { entry, index, location }; }).filter((candidate) => candidate.location && candidate.location.distance <= 2);
        const start = locations(startPoint).find((candidate) => candidate.entry.forward ? candidate.location!.fraction < 1 - 1e-9 : candidate.location!.fraction > 1e-9);
        const end = locations(endPoint).reverse().find((candidate) => candidate.entry.forward ? candidate.location!.fraction > 1e-9 : candidate.location!.fraction < 1 - 1e-9);
        if (!start?.location || !end?.location || start.index > end.index) return [];
        const result = directed.slice(start.index, end.index + 1); result[0] = { ...result[0]!, startFraction: start.location.fraction }; result[result.length - 1] = { ...result[result.length - 1]!, endFraction: end.location.fraction }; return result;
      }).filter((step, index, all) => index === 0 || step.roadEdgeId !== all[index - 1]!.roadEdgeId || step.forward !== all[index - 1]!.forward || step.startFraction !== all[index - 1]!.startFraction || step.endFraction !== all[index - 1]!.endFraction);
      return { ...line, path };
    });
    const terminals = new Map(city.busTerminals.map((terminal) => [terminal.id, terminal])); busLines = busLines.filter((line) => { if (!this.isValidBusPathSteps(line.path, line.loop, nextEdges)) return false; if (line.loop) return true; const firstStep = line.path[0]; const lastStep = line.path.at(-1); const firstEdge = firstStep ? nextEdges.get(firstStep.roadEdgeId) : undefined; const lastEdge = lastStep ? nextEdges.get(lastStep.roadEdgeId) : undefined; const firstNodeId = firstStep && firstEdge ? this.busStepBoundaryNode(firstStep, firstEdge, true) : undefined; const lastNodeId = lastStep && lastEdge ? this.busStepBoundaryNode(lastStep, lastEdge, false) : undefined; const first = nextNodes.get(firstNodeId ?? ""); const last = nextNodes.get(lastNodeId ?? ""); const start = line.startTerminalId ? terminals.get(line.startTerminalId) : undefined; const end = line.endTerminalId ? terminals.get(line.endTerminalId) : undefined; return Boolean(first && last && start && end && distance(first, start.position) < 1e-4 && distance(last, end.position) < 1e-4); });
    const lineLookup = new Map(busLines.map((line) => [line.id, line])); const busStops = structuredClone(city.busStops).flatMap((stop): BusStop[] => {
      const line = lineLookup.get(stop.lineId); const oldEdge = city.roadEdges.find((edge) => edge.id === stop.roadEdgeId); if (!line || !oldEdge) return [];
      const oldPoint = pointAtRoadFraction(oldEdge, oldNodes, stop.fraction)?.point ?? stop.position; const mappedIds = new Set(replacementSteps(stop.roadEdgeId).map((step) => step.roadEdgeId)); let best: { edgeId: string; fraction: number; point: Point; distance: number } | undefined;
      for (const edgeId of mappedIds) { if (!line.path.some((step) => step.roadEdgeId === edgeId)) continue; const edge = nextEdges.get(edgeId); const location = edge ? locatePointOnRoad(oldPoint, edge, nextNodes) : undefined; if (location && (!best || location.distance < best.distance)) best = { edgeId, fraction: location.fraction, point: location.point, distance: location.distance }; }
      return best && best.distance <= 2 ? [{ ...stop, roadEdgeId: best.edgeId, fraction: best.fraction, position: best.point }] : [];
    });
    const stopIds = new Set(busStops.map((stop) => stop.id)); for (const line of busLines) line.stopIds = line.stopIds.filter((id) => stopIds.has(id)); busLines = busLines.filter((line) => !line.loop || line.stopIds.length >= 2); const retainedLineIds = new Set(busLines.map((line) => line.id)); const buses = this.sortBusStopIds({ busTerminals: structuredClone(city.busTerminals), busLines, busStops: busStops.filter((stop) => retainedLineIds.has(stop.lineId)) });
    return { ...afterRoads, ...buses };
  }
  private busSnapshot(): BusSnapshot { return { busTerminals: structuredClone(this.state.city.busTerminals ?? []), busLines: structuredClone(this.state.city.busLines ?? []), busStops: structuredClone(this.state.city.busStops ?? []) }; }
  private campusSnapshot(): CampusStateSnapshot { return { universities: structuredClone(this.state.city.universities ?? []), zones: structuredClone(this.state.city.zones), facilities: structuredClone(this.state.city.facilities) }; }
  private initializeCollections(city: City): void { city.busTerminals ??= []; city.busLines ??= []; city.busStops ??= []; city.universities ??= []; }
  private syncBusStopPositions(snapshot: RoadSnapshot): RoadSnapshot {
    if (!snapshot.busStops?.length) return snapshot; const nodes = new Map(snapshot.roadNodes.map((node) => [node.id, node])); const edges = new Map(snapshot.roadEdges.map((edge) => [edge.id, edge]));
    snapshot.busStops = snapshot.busStops.map((stop) => { const edge = edges.get(stop.roadEdgeId); const position = edge ? pointAtRoadFraction(edge, nodes, stop.fraction)?.point : undefined; return position ? { ...stop, position } : stop; }); return snapshot;
  }
  private isValidBusTerminal(id: string): boolean { return this.state.city.busTerminals?.some((terminal) => terminal.id === id) ?? false; }
  private isValidBusPath(path: BusPathStep[], startTerminalId: string, endTerminalId: string): boolean {
    const city = this.state.city; const edges = new Map(city.roadEdges.map((edge) => [edge.id, edge])); const startTerminal = city.busTerminals.find((terminal) => terminal.id === startTerminalId); const endTerminal = city.busTerminals.find((terminal) => terminal.id === endTerminalId); if (!startTerminal || !endTerminal || !this.isValidBusPathSteps(path, false, edges)) return false;
    const firstStep = path[0]; const lastStep = path.at(-1); const firstEdge = firstStep ? edges.get(firstStep.roadEdgeId) : undefined; const lastEdge = lastStep ? edges.get(lastStep.roadEdgeId) : undefined; const firstNodeId = firstStep && firstEdge ? this.busStepBoundaryNode(firstStep, firstEdge, true) : undefined; const lastNodeId = lastStep && lastEdge ? this.busStepBoundaryNode(lastStep, lastEdge, false) : undefined; const first = city.roadNodes.find((node) => node.id === firstNodeId); const last = city.roadNodes.find((node) => node.id === lastNodeId); return Boolean(first && last && distance(first, startTerminal.position) < 1e-4 && distance(last, endTerminal.position) < 1e-4);
  }
  private isTerminalPositionValid(id: string, position: Point): boolean {
    const city = this.state.city; const edges = new Map(city.roadEdges.map((edge) => [edge.id, edge])); return city.busLines.filter((line) => line.startTerminalId === id || line.endTerminalId === id).every((line) => { const firstStep = line.path[0]; const lastStep = line.path.at(-1); const firstEdge = firstStep ? edges.get(firstStep.roadEdgeId) : undefined; const lastEdge = lastStep ? edges.get(lastStep.roadEdgeId) : undefined; const nodeId = line.startTerminalId === id ? firstStep && firstEdge ? (firstStep.forward ? firstEdge.startNodeId : firstEdge.endNodeId) : undefined : lastStep && lastEdge ? (lastStep.forward ? lastEdge.endNodeId : lastEdge.startNodeId) : undefined; const node = city.roadNodes.find((candidate) => candidate.id === nodeId); return Boolean(node && distance(node, position) < 1e-4); });
  }
  private sortBusStopIds(snapshot: BusSnapshot): BusSnapshot {
    for (const line of snapshot.busLines) { const stops = new Map(snapshot.busStops.filter((stop) => stop.lineId === line.id).map((stop) => [stop.id, stop])); line.stopIds = line.stopIds.filter((id) => stops.has(id)).sort((leftId, rightId) => (this.busStopPathPosition(line.path, stops.get(leftId)!) ?? Number.POSITIVE_INFINITY) - (this.busStopPathPosition(line.path, stops.get(rightId)!) ?? Number.POSITIVE_INFINITY)); }
    return snapshot;
  }
  private busStepFractions(step: BusPathStep): { start: number; end: number } { return { start: step.startFraction ?? (step.forward ? 0 : 1), end: step.endFraction ?? (step.forward ? 1 : 0) }; }
  private busStepBoundaryNode(step: BusPathStep, edge: City["roadEdges"][number], start: boolean): string | undefined { const fraction = start ? this.busStepFractions(step).start : this.busStepFractions(step).end; if (Math.abs(fraction) < 1e-9) return edge.startNodeId; if (Math.abs(fraction - 1) < 1e-9) return edge.endNodeId; return undefined; }
  private busPathLocationsConnect(left: BusPathStep, right: BusPathStep, edges: Map<string, City["roadEdges"][number]>): boolean { const leftEdge = edges.get(left.roadEdgeId); const rightEdge = edges.get(right.roadEdgeId); if (!leftEdge || !rightEdge) return false; const leftFraction = this.busStepFractions(left).end; const rightFraction = this.busStepFractions(right).start; if (left.roadEdgeId === right.roadEdgeId && Math.abs(leftFraction - rightFraction) < 1e-9) return true; const leftNode = this.busStepBoundaryNode(left, leftEdge, false); const rightNode = this.busStepBoundaryNode(right, rightEdge, true); return leftNode !== undefined && leftNode === rightNode; }
  private isValidBusPathSteps(path: BusPathStep[], closed: boolean, edges = new Map(this.state.city.roadEdges.map((edge) => [edge.id, edge]))): boolean { if (path.length === 0) return false; for (const [index, step] of path.entries()) { const fractions = this.busStepFractions(step); if (!edges.has(step.roadEdgeId) || ![fractions.start, fractions.end].every((fraction) => Number.isFinite(fraction) && fraction >= 0 && fraction <= 1) || (step.forward ? fractions.start >= fractions.end : fractions.start <= fractions.end)) return false; const previous = path[index - 1]; if (previous && !this.busPathLocationsConnect(previous, step, edges)) return false; } return !closed || this.busPathLocationsConnect(path[path.length - 1]!, path[0]!, edges); }
  private busStopPathPosition(path: BusPathStep[], stop: Pick<BusStop, "roadEdgeId" | "fraction">, minimum = Number.NEGATIVE_INFINITY): number | undefined { for (const [index, step] of path.entries()) { if (step.roadEdgeId !== stop.roadEdgeId) continue; const { start, end } = this.busStepFractions(step); const progress = (stop.fraction - start) / (end - start); const position = index + progress; if (progress >= -1e-9 && progress <= 1 + 1e-9 && position >= minimum - 1e-9) return position; } return undefined; }
  private isValidBusLoopStop(stop: Omit<BusStop, "id" | "lineId">, path: BusPathStep[]): boolean { return typeof stop.name === "string" && Number.isFinite(stop.fraction) && stop.fraction >= 0 && stop.fraction <= 1 && Number.isFinite(stop.position.x) && Number.isFinite(stop.position.y) && (stop.side === "left" || stop.side === "right") && this.state.city.roadEdges.some((edge) => edge.id === stop.roadEdgeId) && this.busStopPathPosition(path, stop) !== undefined; }
  private areBusStopsOrdered(path: BusPathStep[], stops: Array<Pick<BusStop, "roadEdgeId" | "fraction">>): boolean { let position = Number.NEGATIVE_INFINITY; for (const stop of stops) { const next = this.busStopPathPosition(path, stop, position); if (next === undefined) return false; position = next; } return true; }
  private isValidBusStop(stop: Omit<BusStop, "id"> | BusStop): boolean { const line = this.state.city.busLines?.find((candidate) => candidate.id === stop.lineId); return !!line && Number.isFinite(stop.fraction) && stop.fraction >= 0 && stop.fraction <= 1 && this.state.city.roadEdges.some((edge) => edge.id === stop.roadEdgeId) && this.busStopPathPosition(line.path, stop) !== undefined; }
  private transformBuilding(id: string, label: string, operation: (footprint: Building["footprint"]) => Building["footprint"]): void { const city = this.state.city; const before = structuredClone(city.buildings); const after = structuredClone(before); const building = after.find((candidate) => candidate.id === id); if (!building) return; building.footprint = operation(building.footprint); if (!isValidBuildingFootprint(building.footprint)) return; this.commands.execute(new BuildingSnapshotCommand(label, city, before, after, () => this.emit("buildings"))); this.select({ kind: "building", id }); this.emit("history"); }
  private emit(change: EditorChange): void { for (const listener of this.listeners) listener(change); }
}
