import type { City, RoadEdge } from "../model/City";

export type RoadSelectionScope = "logical" | "segment";
export interface RoadSelectionRef { id: string; edgeId?: string; scope?: RoadSelectionScope }

export function selectedRoadEdge(city: Pick<City, "roadEdges">, selection: RoadSelectionRef): RoadEdge | undefined {
  return selection.edgeId ? city.roadEdges.find((edge) => edge.id === selection.edgeId) : city.roadEdges.find((edge) => edge.roadId === selection.id);
}

export function roadIdentityGroupEdges(city: Pick<City, "roadEdges">, anchor: RoadEdge): RoadEdge[] {
  return anchor.name.trim().length > 0 ? city.roadEdges.filter((edge) => edge.name === anchor.name) : city.roadEdges.filter((edge) => edge.roadId === anchor.roadId && edge.name.trim().length === 0);
}

export function selectedRoadEdges(city: Pick<City, "roadEdges">, selection: RoadSelectionRef): RoadEdge[] {
  const anchor = selectedRoadEdge(city, selection);
  if (!anchor) return [];
  return selection.scope === "segment" ? [anchor] : roadIdentityGroupEdges(city, anchor);
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
  const nodeEdges = new Map<string, string[]>(); const edgeNodes = new Map<string, string[]>();
  for (const edge of edges) {
    let nodes = edgeNodes.get(edge.id);
    if (!nodes) { nodes = []; edgeNodes.set(edge.id, nodes); }
    nodes.push(edge.startNodeId, edge.endNodeId);
    for (const nodeId of [edge.startNodeId, edge.endNodeId]) {
      let adjacent = nodeEdges.get(nodeId);
      if (!adjacent) { adjacent = []; nodeEdges.set(nodeId, adjacent); }
      adjacent.push(edge.id);
    }
  }
  const componentById = new Map<string, number>(); const components: RoadEdge[][] = [];
  for (const edge of edges) {
    if (componentById.has(edge.id)) continue;
    const component = components.length; components.push([]);
    const queue = [edge.id]; componentById.set(edge.id, component);
    for (let index = 0; index < queue.length; index += 1) {
      for (const nodeId of edgeNodes.get(queue[index]!)!) {
        const adjacent = nodeEdges.get(nodeId);
        if (!adjacent) continue;
        nodeEdges.delete(nodeId); // Expand each junction once, including high-degree junctions.
        for (const id of adjacent) if (!componentById.has(id)) { componentById.set(id, component); queue.push(id); }
      }
    }
  }
  // Traversal order must not change the input order within each component.
  for (const edge of edges) components[componentById.get(edge.id)!]!.push(edge);
  return components;
}
