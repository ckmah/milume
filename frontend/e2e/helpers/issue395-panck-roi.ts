import type { Page } from "@playwright/test";

import { postModel, projectPreModelToViewPixel, umZToWorldHeight } from "../../src/widgets/volume-cube/cut-faces.ts";
import { CUBE_VIEW_SEL } from "./shader-and-pixels.ts";

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

function preY(dataFraction: number, span: number): number {
  return (1 - dataFraction) * span;
}

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
};

async function readCubeProjectionSnap(page: Page): Promise<CubeProjectionSnap | null> {
  return page.evaluate(function (sel) {
    const view = document.querySelector(sel);
    const canvas = view?.querySelector("canvas") as HTMLCanvasElement | null;
    if (!view || !canvas) return null;
    function numPair(name: string): [number, number] | null {
      const p = view!.getAttribute(name)?.split(",").map(Number);
      return p?.length === 2 && p.every(Number.isFinite) ? ([p[0]!, p[1]!] as [number, number]) : null;
    }
    const frame = view.getAttribute("data-cube-frame")?.split(",").map(Number);
    const voxel = view.getAttribute("data-voxel-step")?.split(",").map(Number);
    const zSlice = numPair("data-z-slice");
    const target = view.getAttribute("data-aim-target")?.split(",").map(Number);
    const winX = numPair("data-win-x");
    const winY = numPair("data-win-y");
    if (
      !winX ||
      !winY ||
      !zSlice ||
      !target ||
      frame?.length !== 3 ||
      voxel?.length !== 3 ||
      !target.every(Number.isFinite)
    ) {
      return null;
    }
    return {
      vw: canvas.clientWidth || canvas.width,
      vh: canvas.clientHeight || canvas.height,
      winX,
      winY,
      stackZ: numPair("data-stack-z") ?? winX,
      frameSize: [frame[0]!, frame[1]!, frame[2]!] as [number, number, number],
      ozUm: Number(view.getAttribute("data-oz-um")),
      oxUm: Number(view.getAttribute("data-ox-um")),
      oyUm: Number(view.getAttribute("data-oy-um")),
      voxelStep: [voxel[0]!, voxel[1]!, voxel[2]!] as [number, number, number],
      zSlice,
      target: [target[0]!, target[1]!, target[2]!] as [number, number, number],
      zoom: Number(view.getAttribute("data-zoom")),
      pitch: Number(view.getAttribute("data-pitch")),
      orbit: Number(view.getAttribute("data-orbit")),
    };
  }, CUBE_VIEW_SEL);
}

/** Project fixture PanCK sphere centres through the live cube camera into normalized view coords. */
export async function projectIssue395PanckRoIs(page: Page, radiusPx = 28): Promise<ProjectedPanckRoi[]> {
  const snap = await readCubeProjectionSnap(page);
  if (!snap || !Number.isFinite(snap.ozUm) || !Number.isFinite(snap.oxUm) || !Number.isFinite(snap.oyUm)) return [];

  const [w, h, d] = snap.frameSize;
  const [stepZ, stepY, stepX] = snap.voxelStep;
  const sx = snap.winX[1] - snap.winX[0] || 1;
  const sy = snap.winY[1] - snap.winY[0] || 1;
  const camera = { zoom: snap.zoom, rotationX: snap.pitch, rotationOrbit: snap.orbit };
  const rect = { width: snap.vw, height: snap.vh };

  const rois: ProjectedPanckRoi[] = [];
  for (const site of ISSUE395_PANCK_SITES_VOXEL) {
    const xUm = snap.oxUm + site.x * stepX;
    const yUm = snap.oyUm + site.y * stepY;
    const zUm = snap.ozUm + site.z * stepZ;
    const px = ((xUm - snap.winX[0]) / sx) * w;
    const py = preY((yUm - snap.winY[0]) / sy, h);
    const pz = umZToWorldHeight(zUm, snap.ozUm, stepZ, snap.zSlice, d);
    const world = postModel([px, py, pz]);
    const { x: sxPx, y: syPx } = projectPreModelToViewPixel(world, camera, snap.target, rect);
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
