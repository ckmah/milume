import {
  axisSize,
  fetchBox,
  pyramidLevels,
  MAX_TEXTURE_AXIS,
} from "@/widgets/volume-cube/window-source.ts";

/** Voxels loaded for one map backdrop refresh (2D multichannel). */
const MAP_BACKDROP_BUDGET = 8 * 1024 * 1024;

function frameFromVolume(volume) {
  const voxel = volume?.voxel_size_um ?? [1, 1, 1];
  const origin = volume?.origin_um ?? [0, 0, 0];
  return { voxelSize: voxel, origin };
}

function channelEntries(model) {
  const fromTrait = model.get("_image_channels");
  if (Array.isArray(fromTrait) && fromTrait.length) return fromTrait;
  const vol = model.get("volume") || {};
  return vol.channels || [];
}

function visibleChannels(model) {
  return channelEntries(model)
    .filter((c) => c && c.visible && !c.constant_zero)
    .slice(0, 6);
}

function viewportWorldBox(viewState, width, height, padUm = 0) {
  const zoomRaw = viewState?.zoom;
  const zoom = Array.isArray(zoomRaw) ? zoomRaw[0] : zoomRaw ?? 0;
  const scale = Math.pow(2, zoom);
  const cx = viewState?.target?.[0] ?? 0;
  const cy = viewState?.target?.[1] ?? 0;
  const halfW = width / (2 * scale) + padUm;
  const halfH = height / (2 * scale) + padUm;
  return { x0: cx - halfW, y0: cy - halfH, x1: cx + halfW, y1: cy + halfH };
}

function voxelBoxForWorld(level, frame, world, zSpan) {
  const [, fy, fx] = level.factor;
  const [, sy, sx] = frame.voxelSize;
  const [, oy, ox] = frame.origin;
  const height = axisSize(level.source, "y");
  const width = axisSize(level.source, "x");
  const depth = axisSize(level.source, "z");
  const clamp = (v, limit) => Math.max(0, Math.min(limit, v));
  const z0 = zSpan ? clamp(zSpan.z0, depth) : 0;
  const z1 = zSpan ? clamp(zSpan.z1, depth) : depth;
  return {
    z0: Math.min(z0, z1),
    z1: Math.max(z0, z1) || Math.min(z0 + 1, depth),
    y0: clamp(Math.floor((world.y0 - oy) / (sy * fy)), height),
    y1: clamp(Math.ceil((world.y1 - oy) / (sy * fy)), height),
    x0: clamp(Math.floor((world.x0 - ox) / (sx * fx)), width),
    x1: clamp(Math.ceil((world.x1 - ox) / (sx * fx)), width),
  };
}

function boxVoxels(box) {
  return Math.max(0, box.z1 - box.z0) * Math.max(0, box.y1 - box.y0) * Math.max(0, box.x1 - box.x0);
}

function pickLevel(levels, frame, world, channelCount, budget, preferCoarse, is3d, loUm, hiUm) {
  if (preferCoarse) return levels[levels.length - 1];
  for (const level of levels) {
    const zSpan = is3d ? zBandVoxelSpan(level, frame, loUm, hiUm) : null;
    const box = voxelBoxForWorld(level, frame, world, zSpan);
    const voxels = boxVoxels(box) * Math.max(1, channelCount);
    if (voxels <= budget && Math.max(box.z1 - box.z0, box.y1 - box.y0, box.x1 - box.x0) <= MAX_TEXTURE_AXIS) {
      return level;
    }
  }
  return levels[levels.length - 1];
}

function zBandVoxelSpan(level, frame, loUm, hiUm) {
  const [sz] = frame.voxelSize;
  const [oz] = frame.origin;
  const [fz] = level.factor;
  const depth = axisSize(level.source, "z");
  const z0 = Math.floor((loUm - oz) / (sz * fz));
  const z1 = Math.ceil((hiUm - oz) / (sz * fz));
  return {
    z0: Math.max(0, Math.min(depth, z0)),
    z1: Math.max(0, Math.min(depth, Math.max(z1, z0 + 1))),
  };
}

function channelAxisIndex(source) {
  const i = source.labels.indexOf("c");
  return i >= 0 ? i : -1;
}

function resolveChannelIndex(source, channelName, entries) {
  const names = entries.map((e) => e.name);
  const idx = names.indexOf(channelName);
  if (idx >= 0) return idx;
  const ci = channelAxisIndex(source);
  return ci >= 0 ? 0 : 0;
}

function normalizeSample(value, lo, hi) {
  const v = Number(value);
  if (v <= lo) return 0;
  const span = Math.max(hi - lo, 1e-9);
  return Math.min(1, (v - lo) / span);
}

function maxProjectSlice(data, box, lo, hi) {
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const depth = box.z1 - box.z0;
  const plane = width * height;
  const gray = new Uint8Array(plane);
  for (let z = 0; z < depth; z++) {
    const base = z * plane;
    for (let i = 0; i < plane; i++) {
      const byte = Math.round(normalizeSample(data[base + i], lo, hi) * 255);
      if (byte > gray[i]) gray[i] = byte;
    }
  }
  return gray;
}

function parseChannelTint(hex) {
  if (typeof hex !== "string") return [1, 1, 1];
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function additiveRgbFromPlane(gray, rgb, plane, tint) {
  const [tr, tg, tb] = tint;
  for (let i = 0; i < plane; i++) {
    const n = gray[i] / 255;
    rgb[i * 3] = Math.min(1, rgb[i * 3] + n * tr);
    rgb[i * 3 + 1] = Math.min(1, rgb[i * 3 + 1] + n * tg);
    rgb[i * 3 + 2] = Math.min(1, rgb[i * 3 + 2] + n * tb);
  }
}

function rgbaFromRgb(rgb, width, height, alphaMult = 1) {
  const plane = width * height;
  const out = new Uint8ClampedArray(plane * 4);
  const a = Number.isFinite(alphaMult) ? Math.max(0, Math.min(1, alphaMult)) : 1;
  for (let row = 0; row < height; row++) {
    const srcRow = height - 1 - row;
    for (let col = 0; col < width; col++) {
      const si = srcRow * width + col;
      const di = (row * width + col) * 4;
      const r = Math.round(rgb[si * 3] * 255 * a);
      const g = Math.round(rgb[si * 3 + 1] * 255 * a);
      const b = Math.round(rgb[si * 3 + 2] * 255 * a);
      const empty = r === 0 && g === 0 && b === 0;
      out[di] = empty ? 0 : r;
      out[di + 1] = empty ? 0 : g;
      out[di + 2] = empty ? 0 : b;
      out[di + 3] = empty ? 0 : 255;
    }
  }
  return out;
}

function worldBoundsFromBox(box, level, frame) {
  const [fz, fy, fx] = level.factor;
  const [sz, sy, sx] = frame.voxelSize;
  const [oz, oy, ox] = frame.origin;
  return {
    left: ox + box.x0 * sx * fx,
    right: ox + box.x1 * sx * fx,
    bottom: oy + box.y0 * sy * fy,
    top: oy + box.y1 * sy * fy,
  };
}

/**
 * Map tissue backdrop under scatter: tiled as one viewport BitmapLayer, fetched
 * from the volume comm + Zarr pyramid (see volume-cube window-source).
 */
export function createMapImageBackdrop({
  model,
  volumeComm,
  getDeckModules,
  onLayersDirty,
  getCanvasSize,
}) {
  let disposed = false;
  let pyramid = null;
  let levels = null;
  let frame = null;
  let imageUrl = "";
  let fetchGen = 0;
  let cache = { key: "", image: null, bounds: null };
  let lastViewState = null;
  let zBandTouchedAt = 0;
  let zBandRefineTimer = null;
  let viewMovingAt = 0;
  let viewSettleTimer = null;
  let lastPick = null;

  function noteViewChange() {
    viewMovingAt = performance.now();
    if (viewSettleTimer) clearTimeout(viewSettleTimer);
    viewSettleTimer = setTimeout(() => {
      viewMovingAt = 0;
      viewSettleTimer = null;
      scheduleFetch(lastViewState, { force: true });
    }, 280);
  }

  function noteViewInteractionEnd() {
    viewMovingAt = 0;
    if (viewSettleTimer) {
      clearTimeout(viewSettleTimer);
      viewSettleTimer = null;
    }
    scheduleFetch(lastViewState, { force: true });
  }

  function scheduleFetch(viewState, { force = false } = {}) {
    if (disposed) return;
    lastViewState = viewState ?? lastViewState;
    if (!force && viewMovingAt > 0 && cache.image) return;
    const key = fetchKey(lastViewState);
    if (key === cache.key && cache.image) return;
    fetchGen++;
    const gen = fetchGen;
    void rasterize(lastViewState, gen)
      .catch((err) => {
        if (!disposed) console.warn("map image backdrop:", err);
      })
      .finally(() => {
        if (!disposed && gen === fetchGen) onLayersDirty?.();
      });
  }

  function imageVisible() {
    if (model.get("_image_visible") === false) return false;
    const vol = model.get("volume") || {};
    return Boolean(vol.image_url);
  }

  function preferCoarseLevel() {
    return performance.now() - zBandTouchedAt < 280 || performance.now() - viewMovingAt < 280;
  }

  function noteZBandChange() {
    zBandTouchedAt = performance.now();
    if (zBandRefineTimer) clearTimeout(zBandRefineTimer);
    zBandRefineTimer = setTimeout(() => {
      zBandTouchedAt = 0;
      zBandRefineTimer = null;
      scheduleFetch(lastViewState);
    }, 300);
  }

  function noteZBandInteractionEnd() {
    zBandTouchedAt = 0;
    if (zBandRefineTimer) {
      clearTimeout(zBandRefineTimer);
      zBandRefineTimer = null;
    }
    scheduleFetch(lastViewState);
  }

  function fetchKey(viewState) {
    const vol = model.get("volume") || {};
    const vis = visibleChannels(model)
      .map((c) => `${c.name}:${c.contrast_limits?.[0] ?? 0},${c.contrast_limits?.[1] ?? 1}`)
      .join("|");
    const vs = viewState || lastViewState || {};
    const { width, height } = getCanvasSize();
    const world = viewportWorldBox(vs, width, height);
    return [
      vol.image_url || "",
      model.get("_image_visible"),
      model.get("_image_alpha"),
      model.get("z_band_lo_um"),
      model.get("z_band_hi_um"),
      vol.is_3d ? 1 : 0,
      preferCoarseLevel() ? 1 : 0,
      vis,
      Math.round(world.x0 * 10) / 10,
      Math.round(world.y0 * 10) / 10,
      Math.round(world.x1 * 10) / 10,
      Math.round(world.y1 * 10) / 10,
      width,
      height,
      vs.zoom ?? 0,
      vs.target?.[0] ?? 0,
      vs.target?.[1] ?? 0,
    ].join(";");
  }

  async function ensurePyramid(url) {
    if (url === imageUrl && pyramid) return;
    imageUrl = url;
    pyramid = null;
    levels = null;
    if (!url) return;
    const { loadVolumePyramid } = await import("@/widgets/volume-cube/load-volume-pyramid.ts");
    const data = await loadVolumePyramid(url, volumeComm);
    pyramid = data;
    levels = pyramidLevels(data);
    frame = frameFromVolume(model.get("volume") || {});
  }

  async function rasterize(viewState, gen) {
    const vol = model.get("volume") || {};
    const url = vol.image_url;
    if (!url || !imageVisible()) {
      cache = { key: "", image: null, bounds: null };
      return;
    }
    const t0 = performance.now();
    await ensurePyramid(url);
    if (gen !== fetchGen || disposed || !levels?.length) return;

    const entries = channelEntries(model);
    const channels = visibleChannels(model);
    if (!channels.length) {
      cache = { key: fetchKey(viewState), image: null, bounds: null };
      return;
    }

    const { width, height } = getCanvasSize();
    const world = viewportWorldBox(viewState || lastViewState || {}, width, height);
    const is3d = Boolean(vol.is_3d);
    const loUm = Number(model.get("z_band_lo_um"));
    const hiUm = Number(model.get("z_band_hi_um"));
    const channelCount = channels.length;
    const coarse = preferCoarseLevel();
    const level = pickLevel(
      levels,
      frame,
      world,
      channelCount,
      MAP_BACKDROP_BUDGET,
      coarse,
      is3d,
      loUm,
      hiUm,
    );
    lastPick = { level: levels.indexOf(level), factor: [...level.factor] };
    const zSpan = is3d ? zBandVoxelSpan(level, frame, loUm, hiUm) : null;
    const box = voxelBoxForWorld(level, frame, world, zSpan);
    if (box.x1 <= box.x0 || box.y1 <= box.y0 || box.z1 <= box.z0) {
      cache = { key: fetchKey(viewState), image: null, bounds: null };
      return;
    }

    const plane = (box.x1 - box.x0) * (box.y1 - box.y0);
    const rgb = new Float32Array(plane * 3);
    const toDraw = channels;

    for (const ch of toDraw) {
      const ci = resolveChannelIndex(level.source, ch.name, entries);
      const selection = {};
      if (channelAxisIndex(level.source) >= 0) selection.c = ci;
      const chunk = await fetchBox(level.source, box, selection);
      if (gen !== fetchGen || disposed) return;
      const lo = ch.contrast_limits?.[0] ?? vol.contrast_limits?.[0] ?? 0;
      const hi = ch.contrast_limits?.[1] ?? vol.contrast_limits?.[1] ?? 255;
      const gray = maxProjectSlice(chunk.data, box, lo, hi);
      const tint = parseChannelTint(ch.color);
      additiveRgbFromPlane(gray, rgb, plane, tint);
    }

    const wPx = box.x1 - box.x0;
    const hPx = box.y1 - box.y0;
    const alphaMult = Number(model.get("_image_alpha"));
    const pixels = rgbaFromRgb(
      rgb,
      wPx,
      hPx,
      Number.isFinite(alphaMult) ? alphaMult : 0.55,
    );
    const imageData = new ImageData(pixels, wPx, hPx);
    const bitmap = await createImageBitmap(imageData, { premultiplyAlpha: "none" });
    if (gen !== fetchGen || disposed) {
      bitmap.close();
      return;
    }
    const wb = worldBoundsFromBox(box, level, frame);
    cache = {
      key: fetchKey(viewState),
      image: bitmap,
      bounds: [wb.left, wb.bottom, wb.right, wb.top],
    };
    const t1 = performance.now();
    performance.measure?.("backdrop-raster", { start: t0, end: t1 });
  }

  function syncFromModel(viewState) {
    if (disposed) return;
    const vol = model.get("volume") || {};
    if (!vol.image_url) {
      if (cache.image) cache.image.close?.();
      cache = { key: "", image: null, bounds: null };
      pyramid = null;
      imageUrl = "";
      return;
    }
    scheduleFetch(viewState ?? lastViewState);
  }

  function buildLayers(viewState) {
    if (!getDeckModules?.() || !imageVisible()) return [];
    lastViewState = viewState ?? lastViewState;
    if (!cache.image || !cache.bounds) return [];
    const { BitmapLayer } = getDeckModules();
    return [
      new BitmapLayer({
        id: "map-image-backdrop",
        image: cache.image,
        bounds: cache.bounds,
        pickable: false,
        opacity: 1,
        textureParameters: {
          minFilter: "linear",
          magFilter: "linear",
        },
        parameters: { depthCompare: "always", depthWriteEnabled: false },
        updateTriggers: {
          image: cache.key,
          opacity: model.get("_image_alpha"),
        },
      }),
    ];
  }

  function getBounds() {
    return cache.bounds ? [...cache.bounds] : null;
  }

  function dispose() {
    disposed = true;
    fetchGen++;
    if (zBandRefineTimer) clearTimeout(zBandRefineTimer);
    if (cache.image?.close) cache.image.close();
    cache = { key: "", image: null, bounds: null };
    pyramid = null;
  }

  return {
    syncFromModel,
    buildLayers,
    dispose,
    noteZBandChange,
    noteZBandInteractionEnd,
    noteViewChange,
    noteViewInteractionEnd,
    getLastPick: () => lastPick,
    getBounds,
  };
}
