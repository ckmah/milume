import { formatSliderReadout } from "@/widgets/landmarks/chrome/slider-readout";

/**
 * Still content from the design-system harness and the Inspect defaults.
 * harnessModel() in fixture.ts, DEFAULT_RENDER in palettes.ts,
 * MODE_LABELS / MODE_SHORTCUTS in helpers.ts.
 */
export const CHROME_FIXTURE = {
  selectionId: "lasso-1",
  landmarkId: "crypt-1",
  landmarkColor: "#3d7dff",
  selectionColor: "#a3a3a3",
  cellsHeader: "Cells · cell_type",
  categories: [
    { name: "Epithelium", color: "#3d7dff" },
    { name: "Stroma", color: "#ff8a00" },
  ],
  channels: [
    { name: "DAPI", color: "#3d7dff", visible: true },
    {
      name: "A channel name long enough to overflow the row",
      color: "#ff3b3b",
      visible: false,
    },
  ],
  pointSize: 4,
  pointSizeMin: 0.5,
  pointSizeMax: 16,
  pointSizeStep: 0.25,
  imageAlpha: 0.55,
  imageAlphaStep: 0.05,
  contrast: [0, 255] as [number, number],
  cubeAlpha: 1,
  cubeGamma: 1,
  cellAlpha: 0.6,
  zBand: [2, 10] as [number, number],
  palette: "gray",
  imageMode: "additive" as const,
  preset: "top" as const,
};

export const SHAPE_MENU = [
  { id: "lasso", label: "Lasso", shortcut: "L" },
  { id: "rectangle", label: "Square", shortcut: "R" },
  { id: "ellipse", label: "Circle", shortcut: "O" },
  { id: "polygon", label: "Shape", shortcut: "G" },
] as const;

export const TOOLBAR = [
  { id: "select", label: "Select", shortcut: "V" },
  { id: "move", label: "Move", shortcut: "H" },
  { id: "lasso", label: "Lasso", shortcut: "L" },
  { id: "spline", label: "Spline", shortcut: "3" },
  { id: "zoom-out", label: "Zoom out", shortcut: "-" },
  { id: "zoom-in", label: "Zoom in", shortcut: "=" },
  { id: "reset", label: "Reset", shortcut: "0" },
  { id: "inspect", label: "Inspect", shortcut: "I" },
] as const;

export function readout(value: number, step: number): string {
  return formatSliderReadout(value, step);
}
