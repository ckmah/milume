import type { Page } from "@playwright/test";

import { projectPreModelToViewPixel, umZToWorldHeight } from "./issue395-orbit-project.ts";

const CUBE_VIEW_SEL = '[role="dialog"][aria-label="Cube"] .volume-cube__view';

/** PanCK-only fixture sites in mosaic voxel indices (z, y, x). */
export const ISSUE395_PANCK_SITES_VOXEL = [
  { id: "panck-z24", z: 24, y: 100, x: 200 },
  { id: "panck-z40", z: 40, y: 200, x: 80 },
  { id: "panck-z52", z: 52, y: 120, x: 180 },
] as const;

export type ProjectedPanckRoi = {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
};

type CubeProjectionSnap = {
  vw: number;
  vh: number;
  winX: [number, number];
  winY: [number, number];
  frameSize: [number, number, number];
  ozUm: number;
  oxUm: number;
  oyUm: number;
  voxelStep: [number, number, number];
  zSlice: [number, number];
  target: [number, number, number];
  zoom: number;
  pitch: number;
  orbit: number;
  panBox: [number, number, number, number];
  ry: number;
};

export async function readCubeProjectionSnap(page: Page): Promise<CubeProjectionSnap | null> {
  const view = page.locator(CUBE_VIEW_SEL);
  const canvas = view.locator("canvas").first();
  if ((await view.count()) === 0 || (await canvas.count()) === 0) return null;

  const parsePair = (raw: string | null): [number, number] | null => {
    const p = raw?.split(",").map(Number);
    return p?.length === 2 && p.every(Number.isFinite) ? ([p[0]!, p[1]!] as [number, number]) : null;
  };
  const parseTriple = (raw: string | null): [number, number, number] | null => {
    const p = raw?.split(",").map(Number);
    return p?.length === 3 && p.every(Number.isFinite) ? ([p[0]!, p[1]!, p[2]!] as [number, number, number]) : null;
  };

  const parseQuad = (raw: string | null): [number, number, number, number] | null => {
    const p = raw?.split(",").map(Number);
    return p?.length === 4 && p.every(Number.isFinite) ? ([p[0]!, p[1]!, p[2]!, p[3]!] as [number, number, number, number]) : null;
  };

  const winX = parsePair(await view.getAttribute("data-win-x"));
  const winY = parsePair(await view.getAttribute("data-win-y"));
  const zSlice = parsePair(await view.getAttribute("data-z-slice"));
  const target = parseTriple(await view.getAttribute("data-aim-target"));
  const frameSize = parseTriple(await view.getAttribute("data-cube-frame"));
  const voxelStep = parseTriple(await view.getAttribute("data-voxel-step"));
  const panBox = parseQuad(await view.getAttribute("data-pan-box"));
  const ry = Number(await view.getAttribute("data-ry"));
  if (!winX || !winY || !zSlice || !target || !frameSize || !voxelStep || !panBox || !Number.isFinite(ry)) return null;

  const vw = Number(await view.getAttribute("data-viewport-w")) || (await canvas.evaluate((c) => c.width));
  const vh = Number(await view.getAttribute("data-viewport-h")) || (await canvas.evaluate((c) => c.height));

  const ozUm = Number(await view.getAttribute("data-oz-um"));
  const oxUm = Number(await view.getAttribute("data-ox-um"));
  const oyUm = Number(await view.getAttribute("data-oy-um"));
  if (!Number.isFinite(ozUm) || !Number.isFinite(oxUm) || !Number.isFinite(oyUm)) return null;

  return {
    vw,
    vh,
    winX,
    winY,
    stackZ: parsePair(await view.getAttribute("data-stack-z")) ?? winX,
    frameSize,
    ozUm,
    oxUm,
    oyUm,
    voxelStep,
    zSlice,
    target,
    zoom: Number(await view.getAttribute("data-zoom")),
    pitch: Number(await view.getAttribute("data-pitch")),
    orbit: Number(await view.getAttribute("data-orbit")),
    panBox,
    ry,
  };
}

/** Project fixture PanCK sphere centres through the live cube camera into normalized view coords. */
export async function projectIssue395PanckRoIs(page: Page, radiusPx = 28): Promise<ProjectedPanckRoi[]> {
  const fromDom = await page.locator(CUBE_VIEW_SEL).getAttribute("data-issue395-panck-rois");
  if (fromDom) {
    try {
      const parsed = JSON.parse(fromDom) as ProjectedPanckRoi[];
      if (parsed.length === ISSUE395_PANCK_SITES_VOXEL.length) return parsed;
    } catch {
      // fall through
    }
  }
  const snap = await readCubeProjectionSnap(page);
  if (!snap || !Number.isFinite(snap.ozUm) || !Number.isFinite(snap.oxUm) || !Number.isFinite(snap.oyUm)) return [];

  const [w, h, d] = snap.frameSize;
  const [stepZ, stepY, stepX] = snap.voxelStep;
  const camera = { zoom: snap.zoom, rotationX: snap.pitch, rotationOrbit: snap.orbit };
  const rect = { width: snap.vw, height: snap.vh };
  const [panX0, , , panY1] = snap.panBox;

  const rois: ProjectedPanckRoi[] = [];
  for (const site of ISSUE395_PANCK_SITES_VOXEL) {
    const xUm = snap.oxUm + site.x * stepX;
    const yUm = snap.oyUm + site.y * stepY;
    const zUm = snap.ozUm + site.z * stepZ;
    const px = (xUm - snap.oxUm) / stepX - panX0;
    const py = (panY1 - (yUm - snap.oyUm) / stepY) * snap.ry;
    const pz = umZToWorldHeight(zUm, snap.ozUm, stepZ, snap.zSlice, d);
    const { x: sxPx, y: syPx } = projectPreModelToViewPixel([px, py, pz], camera, snap.target, rect);
    const cx = sxPx / snap.vw;
    const cy = syPx / snap.vh;
    const rx = radiusPx / snap.vw;
    const ry = radiusPx / snap.vh;
    rois.push({
      id: site.id,
      cx,
      cy,
      x0: Math.max(0, cx - rx),
      y0: Math.max(0, cy - ry),
      x1: Math.min(1, cx + rx),
      y1: Math.min(1, cy + ry),
    });
  }
  return rois;
}
