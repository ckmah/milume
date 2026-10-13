import type { CellColoring, CellLut } from "./cell-lut-extension";
import { buildCellLut } from "./cell-lut-extension";

/** Outline texels use the same hue as fill; alpha is full (shader scales vs fill). */
const OUTLINE_LUT_ALPHA = 255;

/** Per local cell index: linear RGBA outline bytes (same rgb as fill, stronger alpha). */
export function buildCellOutlineLut(coloring: CellColoring, cells: readonly number[]): CellLut {
  const fill = buildCellLut(coloring, cells);
  const data = new Uint8Array(fill.data);
  for (let i = 0; i < data.length; i += 4) {
    const rgb = data[i]! + data[i + 1]! + data[i + 2]!;
    if (rgb > 1 && data[i + 3]! > 0) data[i + 3] = OUTLINE_LUT_ALPHA;
  }
  return { data, width: fill.width, height: fill.height };
}
