import type { City, RoadEdge } from "../model/City";

export interface RoadSelectionRef { id: string; edgeId?: string }

export function selectedRoadEdge(city: Pick<City, "roadEdges">, selection: RoadSelectionRef): RoadEdge | undefined {
  return selection.edgeId ? city.roadEdges.find((edge) => edge.id === selection.edgeId) : city.roadEdges.find((edge) => edge.roadId === selection.id);
}

export function roadIdentityGroupEdges(city: Pick<City, "roadEdges">, anchor: RoadEdge): RoadEdge[] {
  return anchor.name.trim().length > 0 ? city.roadEdges.filter((edge) => edge.name === anchor.name) : city.roadEdges.filter((edge) => edge.roadId === anchor.roadId && edge.name.trim().length === 0);
}

export function roadIdentityTerminalNodeIds(edges: RoadEdge[]): string[] {
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.startNodeId, (degree.get(edge.startNodeId) ?? 0) + 1);
    degree.set(edge.endNodeId, (degree.get(edge.endNodeId) ?? 0) + 1);
  }
  return [...degree].filter(([, count]) => count === 1).map(([nodeId]) => nodeId);
}

export function roadNameAtNode(city: Pick<City, "roads" | "roadEdges">, roadId: string, nodeId: string | undefined): string {
  if (nodeId) {
    const edge = city.roadEdges.find((candidate) => candidate.roadId === roadId && (candidate.startNodeId === nodeId || candidate.endNodeId === nodeId));
    if (edge) return edge.name;
  }
  return city.roads.find((road) => road.id === roadId)?.name ?? "";
}

export function connectedRoadEdgeComponents(edges: RoadEdge[]): RoadEdge[][] {
  const unseen = new Set(edges.map((edge) => edge.id)); const components: RoadEdge[][] = [];
  while (unseen.size) {
    const firstId = unseen.values().next().value as string; unseen.delete(firstId); const componentIds = new Set([firstId]); const nodes = new Set<string>(); let changed = true;
    while (changed) {
      changed = false;
      for (const edge of edges) if (componentIds.has(edge.id)) { nodes.add(edge.startNodeId); nodes.add(edge.endNodeId); }
      for (const edge of edges) if (unseen.has(edge.id) && (nodes.has(edge.startNodeId) || nodes.has(edge.endNodeId))) { unseen.delete(edge.id); componentIds.add(edge.id); changed = true; }
    }
    components.push(edges.filter((edge) => componentIds.has(edge.id)));
  }
  return components;
}
