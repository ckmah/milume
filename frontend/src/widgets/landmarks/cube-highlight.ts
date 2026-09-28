import type { HighlightGroup } from "@/widgets/volume-cube/cell-lut-extension";

const MARGIN_UM = 10;

export type CubeHighlightInput = {
  points: Float32Array; // points_data decoded: [nx, ny, valueA, _] per cell
  xBounds: number[];
  yBounds: number[];
  labelIds: Int32Array | null; // volume_label_ids decoded
  codes: Int32Array | null; // category_codes decoded (column-major)
  columns: { name: string; labels: string[]; palette: string[] }[];
  activeCategory: string;
  colorBy: string; // "categorical" | "continuous"
  focus: { kind: string; index: number };
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
 * Cells the cube fills, grouped by category, for the cells near the window:
 * nothing focused -> every cell; a category -> its cells; a Selection -> its
 * cells, by category. Continuous colour-by -> none (outlines only).
 */
export function cubeHighlightGroups(input: CubeHighlightInput): HighlightGroup[] {
  const { points, labelIds, codes, columns, window: win } = input;
  const n = Math.floor(points.length / 4);
  const col = columns.findIndex((c) => c.name === input.activeCategory);
  if (!labelIds || !codes || col < 0 || input.colorBy !== "categorical" || !win || labelIds.length !== n) return [];
  const { labels, palette } = columns[col]!;
  const [x0, x1] = input.xBounds;
  const [y0, y1] = input.yBounds;
  const half = win.size / 2 + MARGIN_UM;
  let member: ((i: number) => boolean) | null = null;
  if (input.focus.kind === "type" && input.focus.index >= 0) {
    member = (i) => codes[col * n + i] === input.focus.index;
  } else if (input.focus.kind === "selection") {
    const sel = input.selections[input.focus.index];
    if (!sel || sel.hidden) return [];
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
  return [...byCode.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([code, ids]) => ({ name: labels[code] ?? String(code), color: palette[code % palette.length] ?? "#22d3ee", labels: ids }));
}
