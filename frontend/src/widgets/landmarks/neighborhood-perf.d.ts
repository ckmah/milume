export const KNN_EDGE_MAX_EDGE_COUNT: number | null;

export function effectiveKnnEdgeMaxEdgeCount(): number | null;

export function formatKnnEdgeCapLabel(maxEdges: number): string;

export function knnEdgesHiddenByCap(
  neighborhood: string,
  seedCount: number,
  k?: number,
): boolean;

export function knnEdgeCapHiddenNote(
  neighborhood: string,
  seedCount: number,
  k?: number,
): string | null;

export function shouldDrawKnnEdgeLines(
  pointCount: number,
  seedCount: number,
  edgeCount?: number,
): boolean;

export function hashSeedIndices(seeds: number[]): number;

export function neighborGeomCacheKey(args: {
  pointsKey: string;
  focusKind: string;
  focusIndex: number;
  hoodMode: string;
  hoodK: number;
  hoodRadius: number;
  seedCount: number;
  seedHash: number;
}): string;
