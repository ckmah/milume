import type { CellColoring, HighlightGroup } from "@/widgets/volume-cube/cell-lut-extension";
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
  colorBy: string; // "categorical" | "continuous"
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

/**
 * How the cube colours the cells near the window.
 *
 * With a category to group by: nothing focused -> every cell in its category
 * colour; a category -> its cells; a Selection -> its cells, by category.
 * Without one, every cell takes its own hue instead, so the segmentation still
 * reads. That covers a store with no categorical column, colouring by genes or
 * by an embedding, and a table that does not link cells to label ids. A hidden
 * focused Selection colours nothing.
 */
export function cubeCellColoring(input: CubeHighlightInput): CellColoring {
  const { points, labelIds, codes, columns, window: win } = input;
  const n = Math.floor(points.length / 4);
  const col = columns.findIndex((c) => c.name === input.activeCategory);
  if (!win) return NO_GROUPS;
  if (col < 0 || input.colorBy !== "categorical") return INSTANCES;
  // The cube has the labels; without the table's ids it cannot tell which cell is which row.
  if (!labelIds || !codes || labelIds.length !== n) return INSTANCES;
  const { labels, palette } = columns[col]!;
  const [x0, x1] = input.xBounds;
  const [y0, y1] = input.yBounds;
  const half = win.size / 2 + MARGIN_UM;
  let member: ((i: number) => boolean) | null = null;
  if (input.focus.kind === "type") {
    const typeIx = typeFocusIndicesFromState({
      selected_kind: input.focus.kind,
      selected_index: input.focus.index,
      selected_type_indices: input.focus.typeIndices,
    });
    if (typeIx.length) {
      const want = new Set(typeIx);
      member = (i) => want.has(codes[col * n + i]!);
    }
  } else if (input.focus.kind === "selection") {
    const sel = input.selections[input.focus.index];
    if (!sel || sel.hidden) return NO_GROUPS;
    if (sel.point_indices?.length) {
      const set = new Set(sel.point_indices);
      member = (i) => set.has(i);
    } else {
      const ring = sel.polygon ?? sel.vertices ?? [];
      member = (i) =>
        inRing(
          x0! + ((points[i * 4]! + 1) / 2) * (x1! - x0!),
          y0! + ((points[i * 4 + 1]! + 1) / 2) * (y1! - y0!),
          ring,
        );
    }
  }
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
    .map(([code, ids]) => ({ name: labels[code] ?? String(code), color: palette[code % palette.length] ?? "#22d3ee", labels: ids }));
  return { kind: "groups", groups };
}
