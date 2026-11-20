/** Prototype domain for issue 471. Not a widget trait. */

export const PSEUDOSPACE_METHOD = "knn-graph" as const;
export type PseudospaceMethod = typeof PSEUDOSPACE_METHOD;

export const KNN_K = 8;

export type Band = "low" | "mid" | "high";

export type LandmarkKind = "point" | "line" | "spline" | "shape";

export type LandmarkId = string & { readonly __brand: "LandmarkId" };

export function landmarkId(value: string): LandmarkId {
  return value as LandmarkId;
}

/** One landmark geometry. Distance is to the edge, line, spline, or point. */
export type Landmark = {
  id: LandmarkId;
  label: string;
  kind: LandmarkKind;
  vertices: { x: number; y: number }[];
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
  landmarks: Landmark[];
  geneName: string;
  categoryName: string;
  /** Why `band` is not the obs category. */
  compositionNote: string;
  bounds: { x0: number; x1: number; y0: number; y1: number };
};

/** One cell on an ordered landmark list. */
export type CellField = {
  /** Pair index plus d_k / (d_k + d_k+1). 0 at the first landmark. */
  value: number;
  /** 0-based index of the consecutive pair this cell belongs to. */
  pair: number;
  /** Geodesic distance in µm to each ordered landmark, same order. */
  distances: number[];
};

export type IsoSegment = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type Field = {
  method: PseudospaceMethod;
  byIndex: CellField[];
  /** Last landmark sits at this value. Equals landmark count minus one. */
  valueMax: number;
  isolines: IsoSegment[];
};

export type ProfileBin = {
  v0: number;
  v1: number;
  n: number;
  geneMean: number;
  bands: Record<Band, number>;
};

export type PseudospaceOptionId = "a" | "b" | "c";
