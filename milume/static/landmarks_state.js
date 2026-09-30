/** Shared write recipes for the landmarks widget (engine + React chrome). */

export const DEFAULT_HOOD = {
  neighborhood: "off",
  neighborhood_radius: 0,
  neighborhood_k: 12,
};

/** Keep in sync with frontend helpers MAX_ACTIVE_GENES. */
export const MAX_ACTIVE_GENES = 3;

export function withHood(item) {
  return { ...DEFAULT_HOOD, ...item };
}

/** Replace landmarks on the model (notebook sync). */
export function setLandmarks(model, landmarks) {
  model.set("landmarks", landmarks);
}

function flushNotebook(model) {
  model.save_changes();
}

export function applyActiveCategory(model, col) {
  model.set("active_category", col.name);
  model.set("active_genes", []);
  model.set("point_palette", col.palette || []);
  model.set("legend_labels", col.labels || []);
  model.set("legend_title", col.name || "");
  model.set("color_by", "categorical");
  model.set("raster_basis", "composition");
}

export function setActiveGenes(model, names) {
  const geneCols = model.get("gene_columns") || [];
  const known = new Set(geneCols.map((g) => g.name));
  const next = [];
  for (const name of names || []) {
    if (!known.has(name) || next.includes(name)) continue;
    next.push(name);
    if (next.length >= MAX_ACTIVE_GENES) break;
  }
  model.set("active_genes", next);
  if (!next.length) {
    model.set("color_by", "continuous");
    model.set("raster_basis", "genes");
    model.set("legend_title", "");
    return;
  }
  model.set("color_by", "continuous");
  if (next.length === 1) {
    const g = geneCols.find((x) => x.name === next[0]);
    model.set("legend_title", next[0]);
    model.set("color_vmin", g?.vmin ?? 0);
    model.set("color_vmax", g?.vmax ?? 1);
  } else {
    model.set("legend_title", next.join(", "));
  }
  model.set("raster_basis", "genes");
}

export function setGeneScaleMode(model, mode) {
  model.set("gene_scale_mode", mode === "shared" ? "shared" : "independent");
}

export function setGeneLog1p(model, enabled) {
  if (model.get("gene_expression_logged")) {
    model.set("gene_log1p", false);
    return;
  }
  model.set("gene_log1p", !!enabled);
}

export function setRenderMode(model, mode) {
  const next = mode === "raster" ? "raster" : "points";
  const genes = model.get("active_genes") || [];
  const basis = model.get("raster_basis");
  const colorBy = model.get("color_by");
  const embKey = model.get("raster_embedding_key");
  const geneIntent =
    genes.length > 0 || basis === "genes" || colorBy === "continuous";
  const embedIntent =
    (basis === "embedding" || colorBy === "embedding") && !!embKey;
  if (next === "raster") {
    if (geneIntent) {
      model.set("raster_basis", "genes");
      model.set("color_by", "continuous");
    } else if (embedIntent) {
      model.set("raster_basis", "embedding");
      model.set("color_by", "embedding");
    } else {
      model.set("raster_basis", "composition");
      model.set("color_by", "categorical");
    }
  } else if (geneIntent) {
    model.set("color_by", "continuous");
  } else if (basis === "embedding" || colorBy === "embedding") {
    model.set("color_by", "embedding");
  } else {
    model.set("color_by", "categorical");
  }
  model.set("render_mode", next);
  if (next === "raster" && model.get("selected_kind") === "type") {
    model.set("selected_kind", "");
    model.set("selected_index", -1);
    flushNotebook(model);
  }
}

export function setRasterBinSize(model, size) {
  const v = Number(size);
  if (!Number.isFinite(v) || v <= 0) return;
  model.set("raster_bin_size", v);
}

export function setRasterBasis(model, basis) {
  const allowed = new Set(["genes", "embedding", "composition"]);
  if (!allowed.has(basis)) return;
  model.set("raster_basis", basis);
  if (basis === "genes") {
    model.set("color_by", "continuous");
  } else if (basis === "embedding") {
    model.set("active_genes", []);
    model.set("color_by", "embedding");
  } else if (basis === "composition") {
    model.set("color_by", "categorical");
  }
}

export function setRasterEmbeddingKey(model, key) {
  model.set("raster_embedding_key", String(key || ""));
  model.set("active_genes", []);
  model.set("color_by", "embedding");
  model.set("raster_basis", "embedding");
}

/** Empty array = all embedding dims. */
export function setRasterEmbeddingDims(model, dims) {
  const arr = Array.isArray(dims)
    ? dims.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0)
    : [];
  const seen = new Set();
  const ordered = [];
  for (const d of arr) {
    if (!seen.has(d)) {
      seen.add(d);
      ordered.push(d);
    }
  }
  model.set("raster_embedding_dims", ordered);
}

export function setRasterThreshold(model, value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return;
  model.set("raster_threshold", Math.max(0, Math.min(1, v)));
}

export function clearRasterQuery(model) {
  model.set("raster_query_bin", -1);
}

export function neighborhoodFor(
  kind,
  index,
  selections,
  typeNeighborhoods,
  legendLabels,
  activeCategory,
) {
  if (kind === "selection") {
    const sel = selections[index];
    return sel ? { ...DEFAULT_HOOD, ...sel } : null;
  }
  if (kind === "type") {
    const label = legendLabels[index];
    if (!label) return null;
    const row = typeNeighborhoods.find(
      (r) => r.id === label && (!r.column || r.column === activeCategory),
    );
    return { ...DEFAULT_HOOD, id: label, column: activeCategory, ...(row || {}) };
  }
  return null;
}

export function patchNeighborhood(
  model,
  kind,
  index,
  patch,
  selections,
  typeNeighborhoods,
  legendLabels,
  activeCategory,
) {
  if (kind === "selection") {
    model.set(
      "selections",
      selections.map((sel, i) =>
        i === index ? { ...DEFAULT_HOOD, ...sel, ...patch } : sel,
      ),
    );
    flushNotebook(model);
    return;
  }
  if (kind !== "type") return;
  const label = legendLabels[index];
  if (!label) return;
  const rows = [...typeNeighborhoods];
  const i = rows.findIndex(
    (r) => r.id === label && (!r.column || r.column === activeCategory),
  );
  const nextRow = {
    ...DEFAULT_HOOD,
    id: label,
    column: activeCategory,
    ...(i >= 0 ? rows[i] : {}),
    ...patch,
  };
  if (i >= 0) rows[i] = nextRow;
  else rows.push(nextRow);
  model.set("type_neighborhoods", rows);
}

export function patchLandmark(model, index, patch, landmarks) {
  setLandmarks(model, landmarks.map((lm, i) => (i === index ? { ...lm, ...patch } : lm)));
  flushNotebook(model);
}

export function setSelected(model, kind, index) {
  model.set("selected_kind", kind || "");
  model.set("selected_index", index);
  flushNotebook(model);
}

export function setMode(model, mode) {
  model.set("mode", mode);
  const probe = mode === "probe";
  model.set("raster_similarity_enabled", probe);
  if (!probe && model.get("raster_query_bin") >= 0) {
    model.set("raster_query_bin", -1);
  }
}

export function removeAt(items, index) {
  return items.filter((_, i) => i !== index);
}

export function nextSelectedIndex(kind, selectedKind, selectedIndex, removed) {
  if (selectedKind !== kind) return { kind: selectedKind, index: selectedIndex };
  if (selectedIndex === removed) return { kind: "", index: -1 };
  if (selectedIndex > removed) return { kind: selectedKind, index: selectedIndex - 1 };
  return { kind: selectedKind, index: selectedIndex };
}

export function deleteSelection(
  model,
  index,
  selections,
  selectedKind,
  selectedIndex,
) {
  const next = nextSelectedIndex("selection", selectedKind, selectedIndex, index);
  model.set("selections", removeAt(selections, index));
  model.set("selected_kind", next.kind);
  model.set("selected_index", next.index);
  flushNotebook(model);
}

export function deleteLandmark(
  model,
  index,
  landmarks,
  selectedKind,
  selectedIndex,
) {
  const next = nextSelectedIndex("landmark", selectedKind, selectedIndex, index);
  setLandmarks(model, removeAt(landmarks, index));
  model.set("selected_kind", next.kind);
  model.set("selected_index", next.index);
  flushNotebook(model);
}

function cloneJson(value) {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function nextLandmarkDuplicateId(landmarks) {
  const used = new Set((landmarks || []).map((x) => String(x.id)));
  for (let i = 1; ; i++) {
    const id = `landmark ${i}`;
    if (!used.has(id)) return id;
  }
}

/** Clone a landmark with a new id and a slight world-space offset. */
export function duplicateLandmark(model, index, landmarks) {
  const src = landmarks[index];
  if (!src) return;
  const item = cloneJson(src);
  item.id = nextLandmarkDuplicateId(landmarks);
  const [xMin, xMax] = model.get("x_bounds") || [0, 1];
  const [yMin, yMax] = model.get("y_bounds") || [0, 1];
  const span = Math.max(
    Math.abs(xMax - xMin),
    Math.abs(yMax - yMin),
    1,
  );
  const dx = 0.02 * span;
  const dy = 0.02 * span;
  if (Array.isArray(item.vertices)) {
    item.vertices = item.vertices.map((v) => {
      if (!Array.isArray(v) || v.length < 2) return v;
      return [Number(v[0]) + dx, Number(v[1]) + dy, ...v.slice(2)];
    });
  }
  const next = [...landmarks, item];
  setLandmarks(model, next);
  model.set("selected_kind", "landmark");
  model.set("selected_index", next.length - 1);
  flushNotebook(model);
}

export function renameSelection(model, index, name, selections) {
  const next = String(name || "").trim();
  if (!next) return;
  model.set(
    "selections",
    selections.map((sel, i) => (i === index ? { ...sel, id: next } : sel)),
  );
  flushNotebook(model);
}

export function renameLandmark(model, index, name, landmarks) {
  const next = String(name || "").trim();
  if (!next) return;
  setLandmarks(
    model,
    landmarks.map((lm, i) => (i === index ? { ...lm, id: next } : lm)),
  );
  flushNotebook(model);
}

export function toggleLandmarkHidden(model, index, landmarks) {
  setLandmarks(
    model,
    landmarks.map((lm, i) =>
      i === index ? { ...lm, hidden: !lm.hidden } : lm,
    ),
  );
  flushNotebook(model);
}

export function toggleSelectionHidden(model, index, selections) {
  model.set(
    "selections",
    selections.map((sel, i) =>
      i === index ? { ...sel, hidden: !sel.hidden } : sel,
    ),
  );
  flushNotebook(model);
}

/** Client-side promote signal (engine listens; no kernel round-trip). */
export function promoteNeighborhoodToSelection(model) {
  const tick = Number(model.get("promote_tick") || 0) + 1;
  model.set("promote_tick", tick);
}

/** Promote landmark buffer hits → selection (engine listens). */
export function promoteBufferToSelection(model) {
  const tick = Number(model.get("promote_buffer_tick") || 0) + 1;
  model.set("promote_buffer_tick", tick);
}

export function reverseLandmark(model, index, landmarks) {
  const lm = landmarks[index];
  if (!lm || !Array.isArray(lm.vertices) || lm.vertices.length < 2) return;
  const side = lm.buffer_side || "both";
  let buffer_side = side;
  if (side === "left") buffer_side = "right";
  else if (side === "right") buffer_side = "left";
  patchLandmark(
    model,
    index,
    {
      vertices: lm.vertices.slice().reverse(),
      buffer_side,
    },
    landmarks,
  );
}

export function convertLandmarkType(model, index, landmarks, nextType) {
  const lm = landmarks[index];
  if (!lm) return;
  const allowed = ["point", "line", "spline", "shape"];
  if (!allowed.includes(nextType) || lm.type === nextType) return;
  const verts = (lm.vertices || []).slice();
  const patch = { type: nextType };
  if (nextType === "point") {
    if (!verts.length) return;
    patch.vertices = [verts[0]];
    delete patch.tension;
    patch.tension = undefined;
  } else if (nextType === "line" || nextType === "spline") {
    if (verts.length < 2) return;
    if (nextType === "spline" && lm.tension == null) patch.tension = 0;
    if (nextType === "line") patch.tension = 0;
  } else if (nextType === "shape") {
    if (verts.length < 3) return;
    if (lm.tension == null) patch.tension = 0;
  }
  if (nextType === "point") {
    patch.buffer_side = "both";
  } else if (nextType === "shape") {
    const side = lm.buffer_side;
    if (side === "left" || side === "right") patch.buffer_side = "both";
    else if (!side) patch.buffer_side = "both";
  } else if (
    (nextType === "line" || nextType === "spline") &&
    (lm.buffer_side === "in" || lm.buffer_side === "out")
  ) {
    patch.buffer_side = "both";
  }
  const cleaned = { ...lm, ...patch };
  if (nextType === "line" || nextType === "point") {
    delete cleaned.tension;
  }
  if (nextType === "point" && cleaned.vertices.length > 1) {
    cleaned.vertices = [cleaned.vertices[0]];
  }
  setLandmarks(
    model,
    landmarks.map((row, i) => (i === index ? cleaned : row)),
  );
  flushNotebook(model);
}

export function insertLandmarkVertex(model, index, landmarks, atIndex, xy) {
  const lm = landmarks[index];
  if (!lm) return;
  const verts = (lm.vertices || []).slice();
  const i = Math.max(0, Math.min(verts.length, atIndex));
  verts.splice(i, 0, [xy[0], xy[1]]);
  patchLandmark(model, index, { vertices: verts }, landmarks);
}

export function deleteLandmarkVertex(model, index, landmarks, vertexIndex) {
  const lm = landmarks[index];
  if (!lm) return false;
  const verts = (lm.vertices || []).slice();
  if (vertexIndex < 0 || vertexIndex >= verts.length) return false;
  const minV =
    lm.type === "shape" ? 3 : lm.type === "line" || lm.type === "spline" ? 2 : 1;
  if (verts.length <= minV) return false;
  verts.splice(vertexIndex, 1);
  patchLandmark(model, index, { vertices: verts }, landmarks);
  return true;
}

/** Apply the same patch to multiple landmark indices. */
export function patchLandmarks(model, indices, patch, landmarks) {
  const set = new Set(indices);
  setLandmarks(
    model,
    landmarks.map((lm, i) => {
      if (!set.has(i)) return lm;
      return { ...lm, ...patch };
    }),
  );
  flushNotebook(model);
}

export function deleteLandmarks(
  model,
  indices,
  landmarks,
  selectedKind,
  selectedIndex,
) {
  const remove = new Set(indices);
  const next = landmarks.filter((_, i) => !remove.has(i));
  setLandmarks(model, next);
  if (selectedKind === "landmark" && remove.has(selectedIndex)) {
    model.set("selected_kind", "");
    model.set("selected_index", -1);
  } else if (selectedKind === "landmark" && selectedIndex >= 0) {
    const shift = [...remove].filter((i) => i < selectedIndex).length;
    model.set("selected_index", selectedIndex - shift);
  }
  flushNotebook(model);
}
