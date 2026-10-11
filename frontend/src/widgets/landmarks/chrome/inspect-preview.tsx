import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CellColoring } from "@/widgets/volume-cube/cell-lut-extension";
import { CHUNK_CACHE_BYTES, type ChunkCache } from "@/widgets/volume-cube/chunk-cache";
import type { VolumeCommClient } from "@/widgets/volume-cube/volume-comm";
import type { CubeOverlay } from "@/widgets/volume-cube/overlay-layers";
import type { CubeBounds, CubeCut, CubeLoadState } from "@/widgets/volume-cube/VolumeCube";
import {
  type Box,
  type Frame,
  type Level,
  type ZarrSource,
  PREVIEW_REGION_SCALE,
  axisSize,
  chunkRing,
  fitsBudget,
  levelBox,
  matchingLevel,
  pickLevel,
  pyramidLevels,
} from "@/widgets/volume-cube/window-source";

import type { CubeSettings } from "../use-cube-settings";
import type { EngineHandle, InspectEvent } from "../engine";
import type { LandmarksModel } from "../use-landmarks-model";

// Lazy only in the dev harness (see cube-immersive.tsx).
const VolumeCube = lazy(() =>
  import("@/widgets/volume-cube/VolumeCube").then((m) => ({ default: m.VolumeCube })),
);

/** The preview cube's side (CSS px). */
export const PREVIEW_PX = 480;
/** The float's side: the cube itself (no frame around it). */
const FLOAT_PX = PREVIEW_PX;
/** Gap between the hover square's edge and the float. */
const SQUARE_GAP_PX = 12;
/** Insets of a float pinned in a widget corner: clear of the top tools and the peek tabs. */
const PIN_INSET = { top: 56, side: 48, bottom: 16 };
/** A recentred region leads the cursor by its velocity over this long. */
const LEAD_MS = 150;
/** Hover samples this recent make the velocity. */
const VELOCITY_MS = 100;
/** Decoded bytes one ring prefetch may queue: a quarter of the cache. */
const RING_BYTES = CHUNK_CACHE_BYTES / 4;
const OPEN_CUT: CubeCut = [-Infinity, Infinity, -Infinity, Infinity, -Infinity, Infinity];
const ORIGIN_ZYX: [number, number, number] = [0, 0, 0];
const VOXEL_ZYX: [number, number, number] = [1, 1, 1];

type Hover = Extract<InspectEvent, { type: "hover" }>;
/** The loaded region's centre (µm) and the preview level it was placed for (-1 before the pyramid opens). */
type Region = { cx: number; cy: number; level: number };
type Extent = { x: [number, number]; y: [number, number] };

function voxels(b: Box): number {
  return (b.z1 - b.z0) * (b.y1 - b.y0) * (b.x1 - b.x0);
}

/** Bytes per voxel of a Viv dtype (`Uint8`, `Float32`, ...). */
function dtypeBytes(dtype: string): number {
  const bits = Number(/\d+/.exec(dtype)?.[0] ?? 8);
  return Math.max(1, bits / 8);
}

/** Decoded bytes of one chunk of `source`. */
function chunkBytes(source: ZarrSource): number {
  return source._data.chunks.reduce((n, c) => n * c, 1) * dtypeBytes(source.dtype);
}

/** Every chunk of a level (full Z; 0 on the non-spatial axes), in `source.labels` order. */
function allChunks(source: ZarrSource): number[][] {
  const chunks = source._data.chunks;
  const n = (axis: string) => {
    const i = source.labels.indexOf(axis);
    return i < 0 ? 1 : Math.ceil(axisSize(source, axis) / chunks[i]!);
  };
  const out: number[][] = [];
  for (let z = 0; z < n("z"); z++)
    for (let y = 0; y < n("y"); y++)
      for (let x = 0; x < n("x"); x++)
        out.push(source.labels.map((l) => (l === "z" ? z : l === "y" ? y : l === "x" ? x : 0)));
  return out;
}

/**
 * The preview level for a square of `sizeUm`, and the level centre when the
 * whole level fits the budget (VolumeCube's rule for loading the whole level).
 */
function previewLevel(levels: Level[], frame: Frame, sizeUm: number, budget: number) {
  const level = pickLevel(levels, frame, sizeUm * PREVIEW_REGION_SCALE, budget);
  const box = levelBox(level);
  if (!fitsBudget(box, budget)) return { level, centre: null };
  const [, sy, sx] = frame.voxelSize;
  const [, oy, ox] = frame.origin;
  const [, fy, fx] = level.factor;
  return { level, centre: { cx: ox + (box.x1 / 2) * sx * fx, cy: oy + (box.y1 / 2) * sy * fy } };
}

/**
 * Where the float goes (its top-left, in widget px) for a cursor at (ax, ay)
 * whose square is `sizePx` wide: beside the square, right or else left, when
 * that side has room; otherwise (a square wider than the view) pinned in the
 * widget corner farthest from the cursor, or the next corner that does not
 * cover it. Always inside the widget.
 */
function placeFloat(
  ax: number,
  ay: number,
  sizePx: number,
  widget: { width: number; height: number },
): { left: number; top: number } {
  const { width, height } = widget;
  const clamp = (v: number, max: number) => Math.max(0, Math.min(Math.max(0, max), v));
  const offset = sizePx / 2 + SQUARE_GAP_PX;
  const top = clamp(ay - FLOAT_PX / 2, height - FLOAT_PX);
  if (ax + offset + FLOAT_PX <= width) return { left: ax + offset, top };
  if (ax - offset - FLOAT_PX >= 0) return { left: ax - offset - FLOAT_PX, top };
  // Corner edges: [near, far] from the cursor, inset (clear of the chrome), then flush.
  const edges = (low: number, high: number, cursorLow: boolean) => (cursorLow ? [low, high] : [high, low]);
  const xs = [
    edges(PIN_INSET.side, width - PIN_INSET.side - FLOAT_PX, ax < width / 2),
    edges(0, width - FLOAT_PX, ax < width / 2),
  ];
  const ys = [
    edges(PIN_INSET.top, height - PIN_INSET.bottom - FLOAT_PX, ay < height / 2),
    edges(0, height - FLOAT_PX, ay < height / 2),
  ];
  // The far corner first, then the two beside it; inset, then flush for a
  // widget too small for an inset corner to clear the cursor.
  const corners = [0, 1].flatMap((k) =>
    [
      [1, 1],
      [1, 0],
      [0, 1],
    ].map(([i, j]) => ({ left: clamp(xs[k]![i]!, width - FLOAT_PX), top: clamp(ys[k]![j]!, height - FLOAT_PX) })),
  );
  const covers = (p: { left: number; top: number }) =>
    ax >= p.left && ax <= p.left + FLOAT_PX && ay >= p.top && ay <= p.top + FLOAT_PX;
  // None clears it (a widget about the float's size): the one centred farthest away.
  const dist = (p: { left: number; top: number }) => Math.hypot(p.left + FLOAT_PX / 2 - ax, p.top + FLOAT_PX / 2 - ay);
  return corners.find((p) => !covers(p)) ?? corners.reduce((a, b) => (dist(b) > dist(a) ? b : a));
}

/**
 * The live Inspect preview: while the pointer hovers the volume in Inspect, a
 * small fixed-camera MIP of the square floats beside the cursor. It draws from
 * a loaded region three squares wide, so the square slides over voxels already
 * in memory; near the region's edge the region recentres ahead of the cursor,
 * and each shown region prefetches the chunks around it (in the direction of
 * travel) into the widget's chunk cache. Mounted on the first hover and then
 * only hidden (outside Inspect too), so its WebGL context is reused. Never
 * takes pointer input.
 */
export function InspectPreview({
  active,
  lm,
  engine,
  rootEl,
  settings,
  coloring,
  dark,
  cache,
  volumeComm,
  budgets,
}: {
  /** In Inspect: outside it the float stays hidden and queues no prefetch. */
  active: boolean;
  lm: LandmarksModel;
  engine: EngineHandle | null;
  /** The widget root: the float's container, and where the map canvas is found. */
  rootEl: HTMLElement | null;
  settings: CubeSettings;
  coloring: CellColoring;
  dark: boolean;
  cache: ChunkCache;
  volumeComm: VolumeCommClient | null;
  budgets: { preview: number; dock: number };
  /** The user's landmarks (µm). The hover preview does not draw them. */
  overlays?: CubeOverlay[] | null;
}) {
  const volume = lm.volume ?? {};
  const voxelSizeUm = volume.voxel_size_um ?? VOXEL_ZYX;
  const originUm = volume.origin_um ?? ORIGIN_ZYX;
  const [sz, sy, sx] = voxelSizeUm;
  const [oz, oy, ox] = originUm;
  const frame: Frame = useMemo(() => ({ voxelSize: [sz, sy, sx], origin: [oz, oy, ox] }), [sz, sy, sx, oz, oy, ox]);

  /** The last hover (kept while hidden, so the cube keeps its window), and whether it is live. */
  const [last, setLast] = useState<{ hover: Hover; left: number; top: number } | null>(null);
  const [hovering, setHovering] = useState(false);
  const [region, setRegion] = useState<Region | null>(null);
  const [extent, setExtent] = useState<Extent | null>(null);
  const [failed, setFailed] = useState(false);

  const levelsRef = useRef<{ image: ZarrSource[]; labels: ZarrSource[] | null; levels: Level[] } | null>(null);
  const regionRef = useRef<Region | null>(null);
  const samplesRef = useRef<{ t: number; x: number; y: number }[]>([]);
  const extentRef = useRef<Extent | null>(null);
  extentRef.current = extent;
  const latest = useRef({ active, frame, budget: budgets.preview, rootEl, labels: settings.showLabels });
  latest.current = { active, frame, budget: budgets.preview, rootEl, labels: settings.showLabels };

  // Leaving Inspect (or unmounting) drops the preview's queued prefetches.
  useEffect(() => {
    if (!active) {
      samplesRef.current = [];
      setHovering(false);
      return;
    }
    return () => cache.clearQueue();
  }, [active, cache]);

  const velocity = useCallback((): [number, number] => {
    const s = samplesRef.current;
    const a = s[0];
    const b = s[s.length - 1];
    const dt = a && b ? b.t - a.t : 0;
    return a && b && dt > 0 ? [(b.x - a.x) / dt, (b.y - a.y) / dt] : [0, 0];
  }, []);

  const place = useCallback((next: Region) => {
    regionRef.current = next;
    setRegion(next);
  }, []);

  /** Keep, recentre or fix the region for a hover at (x, y) with a square of `sizeUm`. */
  const updateRegion = useCallback(
    (x: number, y: number, sizeUm: number) => {
      const { frame: f, budget } = latest.current;
      const prev = regionRef.current;
      const pyramid = levelsRef.current;
      const pick = pyramid ? previewLevel(pyramid.levels, f, sizeUm, budget) : null;
      const level = pick ? pick.level.index : -1;
      if (pick?.centre) {
        // The whole level fits: one region, at the level centre, for good.
        if (!prev || prev.level !== level || prev.cx !== pick.centre.cx || prev.cy !== pick.centre.cy) {
          place({ ...pick.centre, level });
          setFailed(false);
        }
        return;
      }
      const half = (sizeUm * PREVIEW_REGION_SCALE) / 2;
      const near = prev ? Math.abs(x - prev.cx) > half - sizeUm || Math.abs(y - prev.cy) > half - sizeUm : true;
      if (prev && prev.level === -1 && level >= 0 && !near) {
        // The pyramid just opened: the region stays, now for this level.
        place({ ...prev, level });
        return;
      }
      if (prev && prev.level === level && !near) return;
      const [vx, vy] = prev ? velocity() : [0, 0];
      let cx = x + vx * LEAD_MS;
      let cy = y + vy * LEAD_MS;
      const e = extentRef.current;
      if (e) {
        cx = Math.max(e.x[0], Math.min(e.x[1], cx));
        cy = Math.max(e.y[0], Math.min(e.y[1], cy));
      }
      place({ cx, cy, level });
      setFailed(false);
    },
    [place, velocity],
  );

  const lastHoverRef = useRef<Hover | null>(null);
  useEffect(() => {
    if (!engine) return;
    return engine.subscribeInspect((e) => {
      // A press places the dock's window: the preview steps aside until the next hover.
      if (e.type === "hover-end" || e.type === "place") {
        samplesRef.current = [];
        setHovering(false);
        return;
      }
      if (e.type !== "hover") return;
      const now = performance.now();
      const samples = samplesRef.current;
      samples.push({ t: now, x: e.x, y: e.y });
      while (samples.length > 1 && now - samples[0]!.t > VELOCITY_MS) samples.shift();
      lastHoverRef.current = e;

      // Beside the hover square (never over it), or pinned in a far corner of the widget.
      const root = latest.current.rootEl;
      const r = root?.getBoundingClientRect();
      const c = root?.querySelector("canvas.landmarks__webgl")?.getBoundingClientRect() ?? r;
      const ax = (c && r ? c.left - r.left : 0) + e.px;
      const ay = (c && r ? c.top - r.top : 0) + e.py;
      const { left, top } = placeFloat(ax, ay, e.sizePx, {
        width: r?.width ?? Infinity,
        height: r?.height ?? Infinity,
      });

      updateRegion(e.x, e.y, e.sizeUm);
      setLast({ hover: e, left, top });
      setHovering(true);
    });
  }, [engine, updateRegion]);

  const onLevels = useCallback(
    (image: ZarrSource[], labels: ZarrSource[] | null) => {
      levelsRef.current = { image, labels, levels: pyramidLevels(image) };
      const h = lastHoverRef.current;
      if (h) updateRegion(h.x, h.y, h.sizeUm);
    },
    [updateRegion],
  );

  const onBounds = useCallback((b: CubeBounds) => {
    const prev = extentRef.current;
    if (prev && prev.x[0] === b.volumeX[0] && prev.x[1] === b.volumeX[1] && prev.y[0] === b.volumeY[0] && prev.y[1] === b.volumeY[1])
      return;
    setExtent({ x: [...b.volumeX], y: [...b.volumeY] });
  }, []);

  const onLoadState = useCallback((s: CubeLoadState) => {
    // Hidden until the next recentre.
    if (s.imageError) setFailed(true);
  }, []);

  // After each new region is shown, prefetch around it: the ring of chunks just
  // outside it, most along the direction of travel first; or the whole level
  // when it is small enough to keep.
  const prefetchedRef = useRef("");
  const wholeRef = useRef(new Set<string>());
  const onShown = useCallback(
    (index: number, box: Box) => {
      const pyramid = levelsRef.current;
      // Labels opening later prefetch theirs at the same region.
      const key = `${index}:${box.z0},${box.z1},${box.y0},${box.y1},${box.x0},${box.x1}:${latest.current.labels && pyramid?.labels ? 1 : 0}`;
      const r = regionRef.current;
      // A load landing after Inspect ends queues nothing.
      if (!latest.current.active || key === prefetchedRef.current || !pyramid || !r) return;
      prefetchedRef.current = key;
      const level = pyramid.levels[index];
      if (!level) return;
      const { frame: f, labels: wantLabels } = latest.current;
      const cells = wantLabels && pyramid.labels ? matchingLevel(pyramid.labels, level) : null;
      const sources = [level.source, ...(cells ? [cells] : [])];
      const bytes = sources.reduce((n, s) => n + voxels(levelBox({ ...level, source: s })) * dtypeBytes(s.dtype), 0);
      const whole = bytes <= CHUNK_CACHE_BYTES / 2;
      const [vx, vy] = velocity();
      const [, fsy, fsx] = f.voxelSize;
      const [, foy, fox] = f.origin;
      const [, fy, fx] = level.factor;
      /** How far a chunk's centre lies along the direction of travel. */
      const aheadOf = (source: ZarrSource) => {
        const chunks = source._data.chunks;
        const iy = source.labels.indexOf("y");
        const ix = source.labels.indexOf("x");
        return (c: number[]) => {
          const x = fox + (c[ix]! + 0.5) * chunks[ix]! * fsx * fx - r.cx;
          const y = foy + (c[iy]! + 0.5) * chunks[iy]! * fsy * fy - r.cy;
          return x * vx + y * vy;
        };
      };
      if (whole) {
        for (const [role, source] of sources.entries()) {
          // Queued once per level and role (0 image, 1 labels): the cache keeps it.
          const wholeKey = `${index}:${role}`;
          if (wholeRef.current.has(wholeKey)) continue;
          wholeRef.current.add(wholeKey);
          const ahead = aheadOf(source);
          cache.prefetch(source._data, allChunks(source).sort((a, b) => ahead(b) - ahead(a)));
        }
        return;
      }
      // The ring, most ahead first, cut to RING_BYTES (image and labels together)
      // so it never evicts the shown region or the dock's window.
      const ring = sources.flatMap((source) => {
        const ahead = aheadOf(source);
        const bytes = chunkBytes(source);
        return chunkRing(source, box).map((coords) => ({ source, coords, bytes, ahead: ahead(coords) }));
      });
      ring.sort((a, b) => b.ahead - a.ahead);
      const queued = new Map<ZarrSource, number[][]>();
      let total = 0;
      for (const c of ring) {
        if (total + c.bytes > RING_BYTES) break;
        total += c.bytes;
        queued.set(c.source, [...(queued.get(c.source) ?? []), c.coords]);
      }
      cache.clearQueue();
      for (const [source, coords] of queued) cache.prefetch(source._data, coords);
    },
    [cache, velocity],
  );

  const inside = Boolean(
    last &&
      extent &&
      last.hover.x >= extent.x[0] &&
      last.hover.x <= extent.x[1] &&
      last.hover.y >= extent.y[0] &&
      last.hover.y <= extent.y[1],
  );
  const visible = active && hovering && inside && !failed;
  const hover = last?.hover;
  if (!last || !hover) return null;

  return (
    <div
      data-testid="inspect-preview"
      data-region={region ? `${region.cx},${region.cy}` : ""}
      aria-hidden
      hidden={!visible}
      // No panel around it: the cube floats on its own, as a passing glance.
      className="landmarks__inspect-preview pointer-events-none absolute"
      style={{ left: last.left, top: last.top, width: FLOAT_PX }}
    >
      <Suspense fallback={null}>
        <VolumeCube
          imageUrl={volume.image_url ?? ""}
          labelsUrl={volume.labels_url ?? ""}
          voxelSizeUm={voxelSizeUm}
          originUm={originUm}
          windowCx={hover.x}
          windowCy={hover.y}
          windowSizeUm={hover.sizeUm}
          cut={OPEN_CUT}
          contrast={settings.contrast}
          imageMode="mip"
          labelMode="additive"
          preset="top"
          home="top"
          reframeOnPreset
          resetTick={0}
          showImage
          showLabels={false}
          coloring={coloring}
          render={settings.render}
          dark={dark}
          height={PREVIEW_PX}
          zStackFraction={[0.25, 0.75]}
          tightenZToSignal={false}
          region={region ? { scale: PREVIEW_REGION_SCALE, budget: budgets.preview, cx: region.cx, cy: region.cy } : null}
          interactive={false}
          showLegend={false}
          background={false}
          overlays={null}
          showPoints={false}
          chunkCache={cache}
          volumeComm={volumeComm}
          onLevels={onLevels}
          onShown={onShown}
          onBounds={onBounds}
          onLoadState={onLoadState}
          loadStatusTestId="cube-load-preview"
        />
      </Suspense>
    </div>
  );
}
