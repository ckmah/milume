import type { CellColoring, HighlightGroup } from "@/widgets/volume-cube/cell-lut-extension";
import { srgbBytesToLinear } from "@/widgets/volume-cube/cell-lut-extension";

import type { GeneColumn, GeneScaleMode } from "./helpers";
import { blendGeneSrgb, type GeneExpressionPack } from "./gene-expression-colors";
import { typeFocusIndicesFromState } from "./type-focus";

const MARGIN_UM = 10;

/** Cells drawn in the shared neutral: no group covers any of them. */
const NO_GROUPS: CellColoring = { kind: "groups", groups: [] };
/** Every cell in its own hue: there is no category to group them by. */
const INSTANCES: CellColoring = { kind: "instances" };

export type CubeHighlightInput = {
  points: Float32Array; // points_data decoded: [nx, ny, valueA, _] per cell
  xBounds: number[];
  yBounds: number[];
  labelIds: Int32Array | null; // volume_label_ids decoded
  codes: Int32Array | null; // category_codes decoded (column-major)
  columns: { name: string; labels: string[]; palette: string[] }[];
  activeCategory: string;
  activeGenes: string[];
  geneColumns: GeneColumn[];
  geneValuesB64: string;
  geneFormat: string;
  geneCscIndptrB64: string;
  geneCscIndicesB64: string;
  geneCscDataB64: string;
  geneScaleMode: GeneScaleMode;
  geneLog1p: boolean;
  geneExpressionLogged: boolean;
  focus: { kind: string; index: number; typeIndices?: number[] };
  selections: {
    point_indices?: number[];
    polygon?: number[][];
    vertices?: number[][];
    hidden?: boolean;
  }[];
  window: { cx: number; cy: number; size: number } | null;
};

function inRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > y !== yj! > y && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
}

function memberFilter(
  input: CubeHighlightInput,
  n: number,
  col: number,
): ((i: number) => boolean) | null | "hidden-selection" {
  if (input.focus.kind === "type" && input.codes) {
    const typeIx = typeFocusIndicesFromState({
      selected_kind: input.focus.kind,
      selected_index: input.focus.index,
      selected_type_indices: input.focus.typeIndices,
    });
    if (!typeIx.length) return null;
    const want = new Set(typeIx);
    const codes = input.codes;
    return (i) => want.has(codes[col * n + i]!);
  }
  if (input.focus.kind === "selection") {
    const sel = input.selections[input.focus.index];
    if (!sel || sel.hidden) return "hidden-selection";
    if (sel.point_indices?.length) {
      const set = new Set(sel.point_indices);
      return (i) => set.has(i);
    }
    const ring = sel.polygon ?? sel.vertices ?? [];
    const { points, xBounds, yBounds } = input;
    const [x0, x1] = xBounds;
    const [y0, y1] = yBounds;
    return (i) =>
      inRing(
        x0! + ((points[i * 4]! + 1) / 2) * (x1! - x0!),
        y0! + ((points[i * 4 + 1]! + 1) / 2) * (y1! - y0!),
        ring,
      );
  }
  return null;
}

function categoryGroups(input: CubeHighlightInput): CellColoring {
  const { points, labelIds, codes, columns, window: win } = input;
  const n = Math.floor(points.length / 4);
  const col = columns.findIndex((c) => c.name === input.activeCategory);
  if (!win || col < 0) return NO_GROUPS;
  if (!labelIds || !codes || labelIds.length !== n) return INSTANCES;
  const member = memberFilter(input, n, col);
  if (member === "hidden-selection") return NO_GROUPS;
  const { labels, palette } = columns[col]!;
  const [x0, x1] = input.xBounds;
  const [y0, y1] = input.yBounds;
  const half = win.size / 2 + MARGIN_UM;
  const byCode = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const x = x0! + ((points[i * 4]! + 1) / 2) * (x1! - x0!);
    const y = y0! + ((points[i * 4 + 1]! + 1) / 2) * (y1! - y0!);
    if (Math.abs(x - win.cx) > half || Math.abs(y - win.cy) > half) continue;
    const id = labelIds[i]!;
    if (id <= 0 || (member && !member(i))) continue;
    const code = codes[col * n + i]!;
    let ids = byCode.get(code);
    if (!ids) byCode.set(code, (ids = []));
    ids.push(id);
  }
  const groups: HighlightGroup[] = [...byCode.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([code, ids]) => ({
      name: labels[code] ?? String(code),
      color: palette[code % palette.length] ?? "#22d3ee",
      labels: ids,
    }));
  return { kind: "groups", groups };
}

function geneExpressionColoring(input: CubeHighlightInput): CellColoring {
  const { points, labelIds, codes, columns, window: win, activeGenes } = input;
  const n = Math.floor(points.length / 4);
  const col = columns.findIndex((c) => c.name === input.activeCategory);
  if (!win || !activeGenes.length) return categoryGroups(input);
  if (!labelIds || labelIds.length !== n) return INSTANCES;
  const member = col >= 0 && codes ? memberFilter(input, n, col) : null;
  if (member === "hidden-selection") return NO_GROUPS;
  const pack: GeneExpressionPack = {
    n,
    geneColumns: input.geneColumns,
    activeGenes,
    geneFormat: input.geneFormat,
    geneValuesB64: input.geneValuesB64,
    geneCscIndptrB64: input.geneCscIndptrB64,
    geneCscIndicesB64: input.geneCscIndicesB64,
    geneCscDataB64: input.geneCscDataB64,
    geneScaleMode: input.geneScaleMode,
    geneLog1p: input.geneLog1p,
    geneExpressionLogged: input.geneExpressionLogged,
  };
  const [x0, x1] = input.xBounds;
  const [y0, y1] = input.yBounds;
  const half = win.size / 2 + MARGIN_UM;
  const byLabel = new Map<number, [number, number, number]>();
  for (let i = 0; i < n; i++) {
    const x = x0! + ((points[i * 4]! + 1) / 2) * (x1! - x0!);
    const y = y0! + ((points[i * 4 + 1]! + 1) / 2) * (y1! - y0!);
    if (Math.abs(x - win.cx) > half || Math.abs(y - win.cy) > half) continue;
    const id = labelIds[i]!;
    if (id <= 0 || (member && !member(i))) continue;
    byLabel.set(id, srgbBytesToLinear(blendGeneSrgb(pack, i)));
  }
  return { kind: "expression", byLabel };
}

/**
 * How the cube colours the cells near the window.
 *
 * With active genes selected, labels follow the same gene blend as the 2D map.
 * Until a gene is picked, category colouring is kept even on the genes tab.
 * Type focus uses `selected_type_indices` (multi-select union). Selection focus
 * filters cells the same way in category and gene modes.
 */
export function cubeCellColoring(input: CubeHighlightInput): CellColoring {
  const { columns, activeCategory, activeGenes } = input;
  const col = columns.findIndex((c) => c.name === activeCategory);
  if (activeGenes.length > 0) return geneExpressionColoring(input);
  if (!input.window) return NO_GROUPS;
  if (col < 0) return INSTANCES;
  return categoryGroups(input);
}
