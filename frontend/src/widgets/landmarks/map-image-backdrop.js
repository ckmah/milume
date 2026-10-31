import { isCommVolumeUrl } from "@/widgets/volume-cube/volume-url";
import {
  axisSize,
  fetchBox,
  pyramidLevels,
  MAX_TEXTURE_AXIS,
} from "@/widgets/volume-cube/window-source.ts";

/** Voxels loaded for one map backdrop refresh (2D multichannel). */
const MAP_BACKDROP_BUDGET = 8 * 1024 * 1024;

let vivModule;
function loadViv() {
  vivModule ??= import("@hms-dbmi/viv");
  return vivModule;
}

function absoluteUrl(url) {
  if (!url) return url;
  return new URL(url, window.location.href).href;
}

async function loadVolumePyramid(url, volumeComm) {
  const { loadOmeZarr, loadOmeZarrFromStore } = await loadViv();
  if (isCommVolumeUrl(url)) {
    if (!volumeComm) throw new Error("Volume comm is not available");
    const loaded = await loadOmeZarrFromStore(volumeComm.createStore(url));
    return loaded.data;
  }
  const loaded = await loadOmeZarr(absoluteUrl(url), { type: "multiscales" });
  return loaded.data;
}

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
  const span = Math.max(hi - lo, 1e-9);
  return Math.max(0, Math.min(1, (Number(value) - lo) / span));
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

function additiveRgbFromPlane(gray, rgb, plane) {
  for (let i = 0; i < plane; i++) {
    const n = gray[i] / 255;
    rgb[i * 3] = Math.min(1, rgb[i * 3] + n);
    rgb[i * 3 + 1] = Math.min(1, rgb[i * 3 + 1] + n);
    rgb[i * 3 + 2] = Math.min(1, rgb[i * 3 + 2] + n);
  }
}

function rgbaFromRgb(rgb, plane) {
  const out = new Uint8ClampedArray(plane * 4);
  for (let i = 0; i < plane; i++) {
    const j = i * 4;
    out[j] = Math.round(rgb[i * 3] * 255);
    out[j + 1] = Math.round(rgb[i * 3 + 1] * 255);
    out[j + 2] = Math.round(rgb[i * 3 + 2] * 255);
    out[j + 3] = 255;
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
  let loadPromise = null;

  function imageVisible() {
    if (model.get("_image_visible") === false) return false;
    const vol = model.get("volume") || {};
    return Boolean(vol.image_url);
  }

  function preferCoarseLevel() {
    return performance.now() - zBandTouchedAt < 280;
  }

  function noteZBandChange() {
    zBandTouchedAt = performance.now();
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
    const channelCount = is3d ? 1 : channels.length;
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
    const zSpan = is3d ? zBandVoxelSpan(level, frame, loUm, hiUm) : null;
    const box = voxelBoxForWorld(level, frame, world, zSpan);
    if (box.x1 <= box.x0 || box.y1 <= box.y0 || box.z1 <= box.z0) {
      cache = { key: fetchKey(viewState), image: null, bounds: null };
      return;
    }

    const plane = (box.x1 - box.x0) * (box.y1 - box.y0);
    const rgb = new Float32Array(plane * 3);
    const toDraw = is3d ? channels.slice(0, 1) : channels;

    for (const ch of toDraw) {
      const ci = resolveChannelIndex(level.source, ch.name, entries);
      const selection = {};
      if (channelAxisIndex(level.source) >= 0) selection.c = ci;
      const chunk = await fetchBox(level.source, box, selection);
      if (gen !== fetchGen || disposed) return;
      const lo = ch.contrast_limits?.[0] ?? vol.contrast_limits?.[0] ?? 0;
      const hi = ch.contrast_limits?.[1] ?? vol.contrast_limits?.[1] ?? 255;
      const gray = maxProjectSlice(chunk.data, box, lo, hi);
      additiveRgbFromPlane(gray, rgb, plane);
    }

    const pixels = rgbaFromRgb(rgb, plane);
    const imageData = new ImageData(pixels, box.x1 - box.x0, box.y1 - box.y0);
    const bitmap = await createImageBitmap(imageData);
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
  }

  function scheduleFetch(viewState) {
    if (disposed) return;
    lastViewState = viewState ?? lastViewState;
    const key = fetchKey(lastViewState);
    if (key === cache.key && cache.image) return;
    fetchGen++;
    const gen = fetchGen;
    if (loadPromise) return;
    loadPromise = rasterize(lastViewState, gen)
      .catch((err) => {
        if (!disposed) console.warn("map image backdrop:", err);
      })
      .finally(() => {
        loadPromise = null;
        if (!disposed && gen === fetchGen) onLayersDirty?.();
      });
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
    scheduleFetch(viewState);
    if (!cache.image || !cache.bounds) return [];
    const { BitmapLayer } = getDeckModules();
    const alpha = Number(model.get("_image_alpha"));
    return [
      new BitmapLayer({
        id: "map-image-backdrop",
        image: cache.image,
        bounds: cache.bounds,
        pickable: false,
        opacity: Number.isFinite(alpha) ? alpha : 0.55,
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

  function dispose() {
    disposed = true;
    fetchGen++;
    if (cache.image?.close) cache.image.close();
    cache = { key: "", image: null, bounds: null };
    pyramid = null;
  }

  return {
    syncFromModel,
    buildLayers,
    dispose,
    noteZBandChange,
  };
}
