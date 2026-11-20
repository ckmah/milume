/** Prototype domain for issue 471. Not a widget trait. */

export const TRANSECT_METHOD = "mock-straight-line" as const;
export type TransectMethod = typeof TRANSECT_METHOD;

export type Band = "low" | "mid" | "high";

export type StopId = string & { readonly __brand: "StopId" };

export function stopId(value: string): StopId {
  return value as StopId;
}

/** One ordered anchor. Vertices of a line landmark are separate stops. */
export type Stop = {
  id: StopId;
  label: string;
  x: number;
  y: number;
  landmarkId: string;
  vertexIndex: number;
};

export type Cell = {
  index: number;
  x: number;
  y: number;
  category: string;
  band: Band;
  gene: number;
};

export type Scene = {
  cells: Cell[];
  stops: Stop[];
  geneName: string;
  categoryName: string;
  /** Why `band` is not the obs category. */
  compositionNote: string;
  bounds: { x0: number; x1: number; y0: number; y1: number };
};

/** Position of one cell on an ordered stop path. */
export type CellField = {
  /** Segment index plus fraction along that segment. */
  t: number;
  /** Signed perpendicular distance in µm. Positive is left of travel. */
  offset: number;
  segment: number;
};

export type Field = {
  method: TransectMethod;
  byIndex: CellField[];
  /** Last stop sits at this t. Equals stop count minus one. */
  tMax: number;
};

export type ProfileBin = {
  t0: number;
  t1: number;
  n: number;
  geneMean: number;
  bands: Record<Band, number>;
};

export type TransectOptionId = "a" | "b" | "c";
