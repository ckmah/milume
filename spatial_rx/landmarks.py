"""LandmarksWidget: draw selections and landmarks on a deck.gl point scatter."""

from __future__ import annotations

import base64
import math
import warnings
from typing import TYPE_CHECKING, Any

import numpy as np
import traitlets
from anndata import AnnData
from anywidget import AnyWidget

from spatial_rx._assets import widget_css, widget_esm
from .categories import (
    as_polars,
    default_categorical_palette,
    detect_category_columns,
    encode_category_bundle,
)
from .genes import (
    _normalize_column,
    expression_is_log_scaled,
    gene_names_from_adata,
    pack_eager_gene_matrix,
)
from .neighbors import DEFAULT_K_MAX
from .raster import (
    DEFAULT_WINDOW_RADIUS,
    default_bin_size,
)
from .selection import (
    selection_mask,
)

if TYPE_CHECKING:
    import numpy as np

_FALLBACK_POINT = "#00e5ff"
_SEQUENTIAL_LOW = "#f3e6d4"
_SEQUENTIAL_HIGH = "#ff0099"


def _sequential_palette(
    n: int = 256,
    low: str = _SEQUENTIAL_LOW,
    high: str = _SEQUENTIAL_HIGH,
) -> list[str]:
    """Sample a two-stop sequential colormap to hex colors (low → high)."""
    import matplotlib.colors as mcolors

    cmap = mcolors.LinearSegmentedColormap.from_list("seq", [low, high], N=max(n, 2))
    if n <= 1:
        return [mcolors.to_hex(cmap(0.5))]
    return [mcolors.to_hex(cmap(i / (n - 1))) for i in range(n)]


def _encode_f32(arr: "np.ndarray") -> str:
    import numpy as np

    return base64.b64encode(np.asarray(arr, dtype=np.float32).tobytes()).decode("ascii")


def _encode_colors(
    color: Any,
    color_map: dict[str, str] | None,
    n: int,
    *,
    continuous_range: tuple[str, str] | None = None,
) -> tuple[list[str], "np.ndarray", list[str], float | None, float | None]:
    """Return (palette_hex, valueA, legend_labels, vmin, vmax).

    Categorical: valueA is category index. When ``color_map`` is given, legend
    order follows ``color_map`` key order (then any unmapped labels).
    Continuous: valueA in [0, 1] with a sequential palette (default cream→magenta).
    """
    import numpy as np

    if color is None:
        return [_FALLBACK_POINT], np.zeros(n, dtype=np.float32), [], None, None

    if isinstance(color, str):
        return [color], np.zeros(n, dtype=np.float32), [], None, None

    color_arr = np.asarray(color)
    if color_arr.shape[0] != n:
        raise ValueError(f"color length {color_arr.shape[0]} != n_points {n}")

    if color_arr.dtype.kind in "UOS":
        seen = [str(c) for c in dict.fromkeys(color_arr.tolist())]
        if color_map:
            present = set(seen)
            cats = [str(c) for c in color_map.keys() if str(c) in present]
            cats.extend(c for c in seen if c not in cats)
            fallback = default_categorical_palette(len(cats))
            palette = [
                color_map.get(c, fallback[i]) for i, c in enumerate(cats)
            ]
        else:
            cats = seen
            palette = default_categorical_palette(len(cats))
        cat_to_i = {c: float(i) for i, c in enumerate(cats)}
        idx = np.asarray(
            [cat_to_i[str(c)] for c in color_arr.tolist()], dtype=np.float32
        )
        return palette, idx, cats, None, None

    low, high = continuous_range or (_SEQUENTIAL_LOW, _SEQUENTIAL_HIGH)
    seq = _sequential_palette(256, low=low, high=high)
    vals = color_arr.astype(np.float64)
    finite = vals[np.isfinite(vals)]
    if finite.size == 0:
        return seq, np.zeros(n, dtype=np.float32), [], 0.0, 1.0
    vmin = float(np.nanmin(finite))
    vmax = float(np.nanpercentile(finite, 99))
    if not math.isfinite(vmax) or vmax <= vmin:
        vmax = float(np.nanmax(finite))
    if not math.isfinite(vmax) or vmax <= vmin:
        vmax = vmin + 1.0
    norm = ((vals - vmin) / (vmax - vmin)).astype(np.float32)
    norm = np.clip(np.nan_to_num(norm, nan=0.0), 0.0, 1.0)
    return seq, norm, [], vmin, vmax


def _color_maps_from_uns(adata: Any) -> dict[str, dict[str, str]]:
    """scanpy ``uns['<key>_colors']`` lists aligned to ``obs[key].cat.categories``."""
    maps: dict[str, dict[str, str]] = {}
    uns = getattr(adata, "uns", None) or {}
    obs = getattr(adata, "obs", None)
    if obs is None:
        return maps
    for col in obs.columns:
        colors = uns.get(f"{col}_colors")
        if colors is None:
            continue
        series = obs[col]
        cats = getattr(getattr(series, "cat", None), "categories", None)
        if cats is None:
            continue
        maps[str(col)] = {
            str(cat): str(colors[i])
            for i, cat in enumerate(cats)
            if i < len(colors)
        }
    return maps


def _expr_from_adata(adata: Any, genes: str | list[str] | None) -> Any:
    """Build a dense expression DataFrame (explicit ``set_expression`` path only)."""
    import numpy as np
    import pandas as pd

    wanted = gene_names_from_adata(adata, genes)
    if not wanted:
        return None
    X = adata[:, wanted].X
    if hasattr(X, "toarray"):
        X = X.toarray()
    return pd.DataFrame(np.asarray(X), columns=wanted)


_NN_RADIUS_FRAC = 0.4
# Default neighborhood radius cap as a fraction of spatial diagonal.
_DEFAULT_RADIUS_MAX_FRAC = 0.05


def _median_nn_distance(x_arr: "np.ndarray", y_arr: "np.ndarray") -> float | None:
    """Median nearest-neighbor distance via ``cKDTree`` (construct-time only)."""
    import numpy as np

    n = int(x_arr.shape[0])
    if n < 2:
        return None
    pts = np.column_stack(
        [np.asarray(x_arr, dtype=np.float64), np.asarray(y_arr, dtype=np.float64)]
    )
    try:
        from scipy.spatial import cKDTree

        dist, _ = cKDTree(pts).query(pts, k=2)
        first = np.asarray(dist[:, 1], dtype=np.float64)
        first = first[np.isfinite(first) & (first > 0)]
        if first.size == 0:
            return None
        return float(np.median(first))
    except Exception:
        return None


_SPATIAL_OBSM_SKIP = frozenset(
    {
        "spatial",
        "X_spatial",
        "spatial_compartments",
        "spatial_connectivities",
    }
)
_EMBEDDING_KEY_PREF = (
    "X_pca",
    "X_pca_harmony",
    "X_scVI",
    "X_scvi",
    "X_svd",
    "X_umap",
    "X_tsne",
)


def _discover_embedding_keys(adata: AnnData, *, spatial_key: str = "spatial") -> list[str]:
    """List 2d+ ``obsm`` keys suitable as raster embedding bases."""
    import numpy as np

    skip = set(_SPATIAL_OBSM_SKIP) | {spatial_key}
    keys: list[str] = []
    obsm = getattr(adata, "obsm", None)
    if obsm is None:
        return keys
    for key in obsm.keys():
        name = str(key)
        if name in skip:
            continue
        try:
            mat = np.asarray(obsm[key])
        except Exception:  # noqa: BLE001
            continue
        if mat.ndim == 1:
            mat = mat.reshape(-1, 1)
        if mat.ndim != 2 or mat.shape[0] != adata.n_obs or mat.shape[1] < 1:
            continue
        keys.append(name)
    # Prefer PCA/scVI-like keys first, then the rest alphabetically.
    rank = {k: i for i, k in enumerate(_EMBEDDING_KEY_PREF)}
    keys.sort(key=lambda k: (rank.get(k, len(rank)), k.lower()))
    return keys


def _pick_default_embedding_key(keys: list[str]) -> str:
    if not keys:
        return ""
    for pref in _EMBEDDING_KEY_PREF:
        if pref in keys:
            return pref
    return keys[0]


def _spatial_metrics(
    x_arr: "np.ndarray",
    y_arr: "np.ndarray",
):
    """Padded bounds, marker radius, and default landmark buffer from xy extent.

    Marker radius is ``0.4 * median`` nearest-neighbor distance so disks do not
    cover neighbors at fit zoom. Falls back to ``0.01 * diagonal``.
    """
    xmin, xmax = float(x_arr.min()), float(x_arr.max())
    ymin, ymax = float(y_arr.min()), float(y_arr.max())
    if xmax <= xmin:
        xmax = xmin + 1.0
    if ymax <= ymin:
        ymax = ymin + 1.0
    diag = math.hypot(xmax - xmin, ymax - ymin)
    pad_x = 0.02 * (xmax - xmin)
    pad_y = 0.02 * (ymax - ymin)
    nn = _median_nn_distance(x_arr, y_arr)
    point_size = _NN_RADIUS_FRAC * nn if nn is not None else 0.01 * diag
    return (
        xmin - pad_x,
        xmax + pad_x,
        ymin - pad_y,
        ymax + pad_y,
        float(point_size),
        0.0,
    )


class LandmarksWidget(AnyWidget):
    """Draw selections and landmarks on AnnData spatial coordinates.

    ``LandmarksWidget(adata, color=..., genes=...)`` is the only constructor.
    Put coordinates in ``obsm["spatial"]``. Neighbor expand runs in the browser
    (spatial index); no ``obsp`` graphs are required or synced. The widget keeps
    a reference to ``adata`` (no ``obs.copy()``, no full-``X`` densify at
    construct beyond the eager gene pack). ``genes=None`` (default) packs every
    ``var_name`` for view-only coloring; pass a name or list to restrict.
    Chrome follows the notebook cell width; height starts at 550px and is
    resizable. Marker radius comes from median nearest-neighbor distance.

    Notebook API (synced on every edit): ``landmarks``, ``selections``,
    ``selected_kind``, ``selected_index``, plus ``inspect_cx`` / ``inspect_cy`` /
    ``inspect_size_um`` for the volume-cube window. UI chrome state (mode, genes, color,
    neighborhoods) stays in the browser; raster bin features and probe scores
    are built client-side from the eager gene / embedding / category packs.
    Persist hits with ``get_obs_names`` / ``assign_obs_mask`` (via
    ``selection_mask`` / ``point_indices``), not positional indices.
    """

    _esm = widget_esm("landmarks")
    _css = widget_css()

    # --- Public notebook API ---
    selections = traitlets.List(traitlets.Dict(), default_value=[]).tag(sync=True)
    landmarks = traitlets.List(traitlets.Dict(), default_value=[]).tag(sync=True)
    selected_kind = traitlets.Unicode("").tag(sync=True)
    selected_index = traitlets.Int(-1).tag(sync=True)
    # Inspect mode: frozen 100 µm window for VolumeCubeWidget. None until the cursor moves.
    inspect_cx = traitlets.Float(allow_none=True, default_value=None).tag(sync=True)
    inspect_cy = traitlets.Float(allow_none=True, default_value=None).tag(sync=True)
    inspect_size_um = traitlets.Float(100.0).tag(sync=True)
    active_category = traitlets.Unicode("").tag(sync=True)
    # View-only gene selection (chrome ↔ engine); not a notebook analysis API.
    active_genes = traitlets.List(traitlets.Unicode(), default_value=[]).tag(sync=True)

    # --- Internal plumbing (synced, not notebook API) ---
    mode = traitlets.Unicode("select").tag(sync=True)
    x_bounds = traitlets.Tuple(
        traitlets.Float(), traitlets.Float(), default_value=(0.0, 1.0)
    ).tag(sync=True)
    y_bounds = traitlets.Tuple(
        traitlets.Float(), traitlets.Float(), default_value=(0.0, 1.0)
    ).tag(sync=True)
    points_data = traitlets.Unicode("").tag(sync=True)  # base64 float32 Nx4
    point_palette = traitlets.List(traitlets.Unicode(), default_value=[]).tag(sync=True)
    color_by = traitlets.Unicode("categorical").tag(sync=True)  # categorical | continuous
    legend_labels = traitlets.List(traitlets.Unicode(), default_value=[]).tag(sync=True)
    legend_title = traitlets.Unicode("").tag(sync=True)
    color_vmin = traitlets.Float(0.0).tag(sync=True)
    color_vmax = traitlets.Float(1.0).tag(sync=True)
    point_size = traitlets.Float(2.0).tag(sync=True)
    default_buffer_width = traitlets.Float(0.0).tag(sync=True)
    type_neighborhoods = traitlets.List(traitlets.Dict(), default_value=[]).tag(sync=True)
    category_columns = traitlets.List(traitlets.Dict(), default_value=[]).tag(sync=True)
    category_codes = traitlets.Unicode("").tag(sync=True)  # base64 int32, col-major
    gene_columns = traitlets.List(traitlets.Dict(), default_value=[]).tag(sync=True)
    # Eager expression pack (all catalog genes). Format: dense | csc.
    gene_format = traitlets.Unicode("dense").tag(sync=True)
    gene_values = traitlets.Unicode("").tag(sync=True)  # dense: base64 float32 col-major
    gene_csc_indptr = traitlets.Unicode("").tag(sync=True)
    gene_csc_indices = traitlets.Unicode("").tag(sync=True)
    gene_csc_data = traitlets.Unicode("").tag(sync=True)
    # independent: each gene uses its own vmax; shared: all use max vmax among selected.
    gene_scale_mode = traitlets.Enum(
        ["independent", "shared"], default_value="independent"
    ).tag(sync=True)
    gene_log1p = traitlets.Bool(False).tag(sync=True)
    # True when input expression is already log-scaled (disables log1p toggle).
    gene_expression_logged = traitlets.Bool(False).tag(sync=True)
    # Packed RGB embedding channels for point coloring (col-major float32 [0, 1]).
    embedding_values = traitlets.Unicode("").tag(sync=True)
    embedding_channel_labels = traitlets.List(traitlets.Unicode(), default_value=[]).tag(
        sync=True
    )
    # Full raw embedding for client raster (row-major float32 ``n × d``).
    embedding_matrix = traitlets.Unicode("").tag(sync=True)
    embedding_matrix_dim = traitlets.Int(0).tag(sync=True)

    # Slider caps for client-side neighborhood queries (no CSR sync).
    neighbor_radius_max = traitlets.Float(0.0).tag(sync=True)
    neighbor_k_max = traitlets.Int(DEFAULT_K_MAX).tag(sync=True)

    # Chrome bumps this; engine promotes neighborhood → selection client-side.
    promote_tick = traitlets.Int(0).tag(sync=True)
    promote_buffer_tick = traitlets.Int(0).tag(sync=True)
    show_rulers = traitlets.Bool(False).tag(sync=True)

    # --- Raster bins + similarity query ---
    render_mode = traitlets.Unicode("points").tag(sync=True)  # points | raster
    raster_bin_size = traitlets.Float(0.0).tag(sync=True)
    # Aggregation window radius in world units (µm when spatial is µm).
    raster_window_radius = traitlets.Float(0.0).tag(sync=True)
    raster_basis = traitlets.Unicode("composition").tag(sync=True)  # genes | embedding | composition
    raster_embedding_key = traitlets.Unicode("").tag(sync=True)
    # Keys discovered from adata.obsm (excludes spatial); UI picks from this list.
    raster_embedding_keys = traitlets.List(traitlets.Unicode(), default_value=[]).tag(
        sync=True
    )
    # Empty = all dims. Client masks for cosine / RGB (empty = all).
    raster_embedding_dims = traitlets.List(traitlets.Int(), default_value=[]).tag(sync=True)
    # Reserved for pathway / score columns (slice A); unused in MVP.
    raster_obs_key = traitlets.Unicode("").tag(sync=True)
    raster_gene_mode = traitlets.Unicode("active").tag(sync=True)
    raster_origin_x = traitlets.Float(0.0).tag(sync=True)
    raster_origin_y = traitlets.Float(0.0).tag(sync=True)
    raster_n_cols = traitlets.Int(0).tag(sync=True)
    raster_n_rows = traitlets.Int(0).tag(sync=True)
    raster_n_bins = traitlets.Int(0).tag(sync=True)
    raster_bin_rows = traitlets.Unicode("").tag(sync=True)  # base64 int32
    raster_bin_cols = traitlets.Unicode("").tag(sync=True)
    raster_bin_counts = traitlets.Unicode("").tag(sync=True)
    raster_features = traitlets.Unicode("").tag(sync=True)  # base64 float32 row-major
    raster_feature_dim = traitlets.Int(0).tag(sync=True)
    raster_feature_labels = traitlets.List(traitlets.Unicode(), default_value=[]).tag(
        sync=True
    )
    raster_query_bin = traitlets.Int(-1).tag(sync=True)  # -1 = none (pin)
    raster_similarity_enabled = traitlets.Bool(False).tag(sync=True)
    raster_threshold = traitlets.Float(0.0).tag(sync=True)
    raster_status = traitlets.Unicode("").tag(sync=True)

    # 3D cube (LandmarksWidget(sdata)): Python-set config, per-cell label ids, and
    # the cut box the widget writes on slider release. Rendering controls are
    # client-local (ADR 0005 / 0006).
    volume = traitlets.Dict(default_value={}).tag(sync=True)
    volume_label_ids = traitlets.Unicode("").tag(sync=True)  # base64 int32, table order
    volume_cut = traitlets.List(traitlets.Float(), default_value=[]).tag(sync=True)

    def __init__(
        self,
        adata: AnnData | Any,
        *,
        spatial_key: str = "spatial",
        color: str | None = None,
        genes: str | list[str] | None = None,
        table: str | None = None,
        image: str | bool | None = None,
        labels: str | bool | None = None,
        contrast_limits: tuple[float, float] | None = None,
    ) -> None:
        """Build from AnnData, or from a SpatialData (cube inferred).

            w = LandmarksWidget(adata, color="cell_type")
            w = LandmarksWidget(sdata)  # table, labels, 3D image and frame inferred
        """
        import numpy as np

        volume_source = None
        if not isinstance(adata, AnnData) and hasattr(adata, "tables"):
            from .volume_source import resolve_volume

            adata, volume_source = resolve_volume(adata, table=table, image=image, labels=labels)
        if not isinstance(adata, AnnData):
            raise TypeError("LandmarksWidget(data) requires an AnnData or a SpatialData")

        if spatial_key not in adata.obsm:
            raise ValueError(f"adata.obsm[{spatial_key!r}] is required")
        xy = np.asarray(adata.obsm[spatial_key], dtype=np.float64, copy=False)
        if xy.ndim != 2 or xy.shape[1] < 2:
            raise ValueError(f"adata.obsm[{spatial_key!r}] must be (n, ≥2)")
        if xy.shape[0] != adata.n_obs:
            raise ValueError("spatial coords length must match adata.n_obs")
        n = int(xy.shape[0])
        if n == 0:
            raise ValueError("adata must contain at least one observation")

        x_arr = np.asarray(xy[:, 0], dtype=np.float64, copy=False)
        y_arr = np.asarray(xy[:, 1], dtype=np.float64, copy=False)
        xmin, xmax, ymin, ymax, point_size, buffer_width = _spatial_metrics(
            x_arr, y_arr
        )
        diag = math.hypot(xmax - xmin, ymax - ymin)
        radius_max = float(_DEFAULT_RADIUS_MAX_FRAC * diag)
        nx = (2.0 * (x_arr - xmin) / (xmax - xmin) - 1.0).astype(np.float32)
        ny = (2.0 * (y_arr - ymin) / (ymax - ymin) - 1.0).astype(np.float32)

        maps = _color_maps_from_uns(adata)
        # Reference obs — do not obs.copy() / attach synthetic x,y columns.
        df = as_polars(adata.obs)
        cat_names = detect_category_columns(df)
        # Explicit ``color=`` obs column is always included (and preferred).
        if (
            color
            and color in df.columns
            and color not in cat_names
            and color not in {str(v) for v in adata.var_names}
        ):
            cat_names = [str(color), *cat_names]
        elif color and color in cat_names:
            cat_names = [str(color), *[c for c in cat_names if c != color]]
        cat_meta, cat_codes, cat_labels = encode_category_bundle(
            df, cat_names, color_maps=maps
        )

        gene_color = None
        var_names = {str(v) for v in adata.var_names}
        color_arg: Any = None
        cmap_arg: dict[str, str] | None = None
        legend = ""
        active = color or (cat_names[0] if cat_names else "")
        obs_cols = set(map(str, adata.obs.columns))
        if color and color not in obs_cols and color in var_names:
            active = ""
            X = adata[:, [color]].X
            if hasattr(X, "toarray"):
                X = X.toarray()
            gene_color = np.asarray(X, dtype=np.float64).ravel()
            color_arg = gene_color
            legend = str(color)
        elif active and active in cat_labels:
            color_arg = cat_labels[active]
            cmap_arg = maps.get(active)
            legend = active
        elif color and color in df.columns:
            color_arg = df[color].to_numpy()
            legend = color

        palette, value_a, labels, vmin, vmax = _encode_colors(
            color_arg, cmap_arg, n
        )
        color_mode = (
            "categorical"
            if color_arg is None
            or (
                gene_color is None
                and (
                    isinstance(color_arg, str)
                    or np.asarray(color_arg).dtype.kind in "UOS"
                )
            )
            else "continuous"
        )
        if gene_color is not None:
            color_mode = "continuous"
        points = np.column_stack([nx, ny, value_a, np.zeros(n, dtype=np.float32)])

        self._adata = adata
        self._expr_frame = None
        self._x_scale = "linear"
        self._y_scale = "linear"
        self._data_x = x_arr
        self._data_y = y_arr
        self._obs_names = adata.obs_names
        self._data_label_arrays = cat_labels
        self._median_nn = _median_nn_distance(x_arr, y_arr)
        active_cat = ""
        if cat_meta and gene_color is None:
            active_cat = active if active in cat_labels else cat_meta[0]["name"]
            active_meta = next(
                (c for c in cat_meta if c["name"] == active_cat), cat_meta[0]
            )
            palette = list(active_meta["palette"])
            labels = list(active_meta["labels"])
            legend = active_cat
            color_mode = "categorical"
        self._data_labels = cat_labels.get(active_cat)

        gene_names = gene_names_from_adata(adata, genes)
        gene_meta, gene_payload = pack_eager_gene_matrix(adata, gene_names, n)
        gene_logged = bool(expression_is_log_scaled(adata)) if gene_names else False
        init_bin_size = default_bin_size(self._median_nn, point_size)
        embedding_keys = _discover_embedding_keys(adata, spatial_key=spatial_key)
        embedding_key = _pick_default_embedding_key(embedding_keys)

        AnyWidget.__init__(
            self,
            mode="select",
            x_bounds=(xmin, xmax),
            y_bounds=(ymin, ymax),
            points_data=_encode_f32(points),
            point_palette=list(palette),
            color_by=color_mode,
            legend_labels=list(labels),
            legend_title=legend,
            color_vmin=float(vmin if vmin is not None else 0.0),
            color_vmax=float(vmax if vmax is not None else 1.0),
            point_size=float(point_size),
            default_buffer_width=float(buffer_width),
            category_columns=cat_meta,
            category_codes=cat_codes,
            active_category=active_cat,
            gene_columns=gene_meta,
            gene_format=str(gene_payload.get("gene_format") or "dense"),
            gene_values=str(gene_payload.get("gene_values") or ""),
            gene_csc_indptr=str(gene_payload.get("gene_csc_indptr") or ""),
            gene_csc_indices=str(gene_payload.get("gene_csc_indices") or ""),
            gene_csc_data=str(gene_payload.get("gene_csc_data") or ""),
            active_genes=[],
            gene_log1p=False,
            gene_expression_logged=gene_logged,
            embedding_values="",
            embedding_channel_labels=[],
            embedding_matrix="",
            embedding_matrix_dim=0,
            render_mode="points",
            raster_bin_size=float(init_bin_size),
            raster_window_radius=float(DEFAULT_WINDOW_RADIUS),
            raster_basis="composition",
            raster_embedding_key=embedding_key,
            raster_embedding_keys=embedding_keys,
            raster_embedding_dims=[],
            raster_status="",
            neighbor_k_max=int(DEFAULT_K_MAX),
            neighbor_radius_max=radius_max,
        )
        if gene_color is not None:
            self.set_color(gene_color, legend_title=str(color))
        self._pack_embedding_values()
        self._pack_embedding_matrix()

        self._volume_server = None
        if volume_source is not None:
            self._attach_volume(volume_source, contrast_limits)

    def _attach_volume(self, src: Any, contrast_limits: tuple[float, float] | None) -> None:
        from .volume_cube import DEFAULT_CONTRAST_LIMITS, serve_directory

        # Only the cube's image and labels: the rest of the store (tables,
        # expression) stays off the loopback server.
        allow = (f"images/{src.image}/",) + ((f"labels/{src.labels}/",) if src.labels else ())
        server, base = serve_directory(src.root, allow_prefixes=allow)
        self._volume_server = server
        (sz, sy, sx), (oz, oy, ox), (d, h, w) = src.voxel_size_um, src.origin_um, src.shape_zyx
        self.volume = {
            "image_url": f"{base}/images/{src.image}/",
            "labels_url": f"{base}/labels/{src.labels}/" if src.labels else "",
            "voxel_size_um": [sz, sy, sx],
            "origin_um": [oz, oy, ox],
            "contrast_limits": [float(v) for v in (contrast_limits or DEFAULT_CONTRAST_LIMITS)],
        }
        if src.label_ids is not None:
            ids = np.asarray(src.label_ids, dtype=np.int32)
            if ids.size and int(ids.max()) >= 2**22:  # 2048 x 2048 lookup texels
                warnings.warn("label ids above 4,194,303 are not coloured in the cube", UserWarning, stacklevel=3)
            self.volume_label_ids = base64.b64encode(ids.tobytes()).decode("ascii")
        self.volume_cut = [ox, ox + w * sx, oy, oy + h * sy, oz, oz + d * sz]

    def set_neighbor_graphs(self, *args: Any, **kwargs: Any) -> None:
        """Removed: neighborhood expand is client-side.

        Kept as a no-op raising so old notebooks fail clearly.
        """
        raise RuntimeError(
            "set_neighbor_graphs was removed; LandmarksWidget builds neighborhoods "
            "in the browser from coordinates (no obsp graphs)"
        )

    def set_points(
        self,
        x: Any,
        y: Any,
        *,
        color: Any = None,
        color_map: dict[str, str] | None = None,
        legend_title: str | None = None,
        continuous_range: tuple[str, str] | None = None,
    ) -> None:
        """Replace scatter points/colors."""
        import numpy as np

        x_arr = np.asarray(x, dtype=np.float64).ravel()
        y_arr = np.asarray(y, dtype=np.float64).ravel()
        if x_arr.shape != y_arr.shape:
            raise ValueError("x and y must have the same shape")
        n = int(x_arr.shape[0])
        xmin, xmax = self.x_bounds
        ymin, ymax = self.y_bounds
        nx = (2.0 * (x_arr - xmin) / (xmax - xmin) - 1.0).astype(np.float32)
        ny = (2.0 * (y_arr - ymin) / (ymax - ymin) - 1.0).astype(np.float32)
        palette, value_a, labels, vmin, vmax = _encode_colors(
            color, color_map, n, continuous_range=continuous_range
        )
        color_mode = (
            "categorical"
            if color is None
            or isinstance(color, str)
            or np.asarray(color).dtype.kind in "UOS"
            else "continuous"
        )
        points = np.column_stack([nx, ny, value_a, np.zeros(n, dtype=np.float32)])
        self._data_x = x_arr
        self._data_y = y_arr
        self._data_labels = (
            np.asarray(color).astype(str).ravel()
            if color is not None
            and not isinstance(color, str)
            and np.asarray(color).dtype.kind in "UOS"
            else None
        )
        self.point_palette = list(palette)
        self.color_by = color_mode
        self.active_genes = []
        self.legend_labels = list(labels)
        if legend_title is not None:
            self.legend_title = legend_title
        self.color_vmin = float(vmin if vmin is not None else 0.0)
        self.color_vmax = float(vmax if vmax is not None else 1.0)
        self.points_data = _encode_f32(points)

    def set_expression(self, expr: Any) -> None:
        """Replace the eager gene catalog/matrix from a table (view-only).

        Packs all columns immediately for the browser gene picker.
        """
        x = getattr(self, "_data_x", None)
        if x is None:
            raise RuntimeError("internal point cache missing")
        from .categories import as_polars

        import numpy as np

        frame = as_polars(expr)
        self._expr_frame = frame
        names = [str(c) for c in frame.columns]
        n = int(x.shape[0])
        # Build a tiny AnnData-like pack via dense columns.
        meta: list[dict[str, Any]] = []
        cols: list[Any] = []
        from .genes import _normalize_column

        for name in names:
            vals = np.asarray(frame[name].to_numpy(), dtype=np.float64).ravel()
            if vals.shape[0] != n:
                raise ValueError(f"expr rows {vals.shape[0]} != n_points {n}")
            norm, vmin, vmax = _normalize_column(vals)
            meta.append({"name": name, "vmin": vmin, "vmax": vmax})
            cols.append(norm)
        if not cols:
            self.gene_columns = []
            self.gene_format = "dense"
            self.gene_values = ""
            self.gene_csc_indptr = ""
            self.gene_csc_indices = ""
            self.gene_csc_data = ""
            self.active_genes = []
            return
        mat = np.column_stack(cols).astype(np.float32, copy=False)
        self.gene_columns = meta
        self.gene_format = "dense"
        self.gene_values = base64.b64encode(mat.ravel(order="F").tobytes()).decode(
            "ascii"
        )
        self.gene_csc_indptr = ""
        self.gene_csc_indices = ""
        self.gene_csc_data = ""
        known = {m["name"] for m in meta}
        self.active_genes = [g for g in (self.active_genes or []) if g in known]
        logged = expression_is_log_scaled(getattr(self, "_adata", None))
        if not logged and meta:
            col0 = frame[meta[0]["name"]].to_numpy()
            logged = expression_is_log_scaled(sample=np.asarray(col0, dtype=np.float64))
        self.gene_expression_logged = bool(logged)
        if logged:
            self.gene_log1p = False

    @traitlets.observe("active_genes")
    def _on_active_genes(self, change: dict) -> None:
        if change.get("new") == change.get("old"):
            return
        genes = list(self.active_genes or [])
        # Genes are an exclusive observation signal — keep point color_by aligned.
        if genes and self.color_by != "continuous":
            self.color_by = "continuous"
        # Selected genes own the observation signal in bins mode (client rebuilds).
        if genes and self.raster_basis != "genes":
            self.raster_basis = "genes"

    def set_render_mode(self, mode: str) -> None:
        """Switch canvas between point scatter and spatial raster bins."""
        m = str(mode or "points").lower()
        if m not in ("points", "raster"):
            raise ValueError("render_mode must be 'points' or 'raster'")
        genes = list(self.active_genes or [])
        basis = str(self.raster_basis or "composition")
        color_by = str(self.color_by or "")
        gene_intent = bool(genes) or basis == "genes" or color_by == "continuous"
        embed_intent = (
            basis == "embedding" or color_by == "embedding"
        ) and bool(self.raster_embedding_key)
        if m == "raster":
            # Keep the active observation when flipping geometry (incl. empty genes).
            if gene_intent:
                self.raster_basis = "genes"
                self.color_by = "continuous"
            elif embed_intent:
                self.raster_basis = "embedding"
                self.color_by = "embedding"
            else:
                self.raster_basis = "composition"
                self.color_by = "categorical"
        else:
            # Points: keep the same observation family that raster was showing.
            if gene_intent:
                self.color_by = "continuous"
            elif basis == "embedding" or color_by == "embedding":
                self.color_by = "embedding"
            else:
                self.color_by = "categorical"
        if m == "raster" and str(self.selected_kind or "") == "type":
            self.selected_kind = ""
            self.selected_index = -1
        self.render_mode = m

    def set_raster_basis(
        self,
        *,
        genes: str | None = None,
        embedding: str | None = None,
        composition: str | None = None,
    ) -> None:
        """Select bin aggregation basis (genes / embedding / composition).

        Pathway / ``obs`` score columns are deferred (plan slice A); use
        ``raster_obs_key`` later via the same mean-into-bin path.

        Bin feature matrices are built in the browser; this only updates traits.
        """
        chosen = sum(x is not None for x in (genes, embedding, composition))
        if chosen != 1:
            raise ValueError("pass exactly one of genes=, embedding=, composition=")
        if genes is not None:
            self.raster_basis = "genes"
            self.raster_gene_mode = str(genes or "active")
        elif embedding is not None:
            self.raster_basis = "embedding"
            key = str(embedding)
            known = list(self.raster_embedding_keys or [])
            if key and known and key not in known:
                raise ValueError(
                    f"unknown embedding key {key!r}; choose from {known}"
                )
            self.raster_embedding_key = key or str(self.raster_embedding_key or "")
        else:
            self.raster_basis = "composition"
            if composition:
                self.active_category = str(composition)

    def clear_raster_query(self) -> None:
        """Clear the pinned similarity query bin."""
        self.raster_query_bin = -1

    def _embedding_rgb_dims(self, n_dims: int) -> list[int]:
        """Dims mapped to RGB for point coloring (≤3). Empty trait → first three."""
        n_dims = int(n_dims)
        if n_dims <= 0:
            return []
        raw = [int(d) for d in (self.raster_embedding_dims or [])]
        picked: list[int] = []
        seen: set[int] = set()
        for d in raw:
            if d < 0 or d >= n_dims or d in seen:
                continue
            seen.add(d)
            picked.append(d)
            if len(picked) >= 3:
                break
        if not picked:
            picked = list(range(min(3, n_dims)))
        return picked[:3]

    def _pack_embedding_values(self) -> None:
        """Pack ≤3 embedding dims as display-normalized [0, 1] for point RGB."""
        import base64
        import numpy as np

        adata = getattr(self, "_adata", None)
        key = str(self.raster_embedding_key or "")
        n = int(getattr(self, "_data_x").shape[0])
        if adata is None or not key or key not in getattr(adata, "obsm", {}):
            self.embedding_values = ""
            self.embedding_channel_labels = []
            return
        mat = np.asarray(adata.obsm[key], dtype=np.float64)
        if mat.ndim == 1:
            mat = mat.reshape(-1, 1)
        if mat.shape[0] != n:
            self.embedding_values = ""
            self.embedding_channel_labels = []
            return
        dims = self._embedding_rgb_dims(mat.shape[1])
        if not dims:
            self.embedding_values = ""
            self.embedding_channel_labels = []
            return
        cols: list[Any] = []
        labels: list[str] = []
        for d in dims:
            norm, _vmin, _vmax = _normalize_column(mat[:, d])
            cols.append(norm.astype(np.float32, copy=False))
            labels.append(str(int(d)))
        packed = np.column_stack(cols).ravel(order="F")
        self.embedding_values = base64.b64encode(packed.tobytes()).decode("ascii")
        self.embedding_channel_labels = labels

    def _pack_embedding_matrix(self) -> None:
        """Pack full raw ``obsm[key]`` for client-side raster aggregation."""
        import base64
        import numpy as np

        adata = getattr(self, "_adata", None)
        key = str(self.raster_embedding_key or "")
        n = int(getattr(self, "_data_x").shape[0])
        if adata is None or not key or key not in getattr(adata, "obsm", {}):
            self.embedding_matrix = ""
            self.embedding_matrix_dim = 0
            return
        mat = np.asarray(adata.obsm[key], dtype=np.float32)
        if mat.ndim == 1:
            mat = mat.reshape(-1, 1)
        if mat.shape[0] != n:
            self.embedding_matrix = ""
            self.embedding_matrix_dim = 0
            return
        packed = np.ascontiguousarray(mat, dtype=np.float32)
        self.embedding_matrix = base64.b64encode(packed.ravel(order="C").tobytes()).decode(
            "ascii"
        )
        self.embedding_matrix_dim = int(packed.shape[1])

    @traitlets.observe("raster_embedding_key", "raster_embedding_dims")
    def _on_embedding_pack_params(self, change: dict) -> None:
        if change.get("new") == change.get("old"):
            return
        self._pack_embedding_values()
        if change.get("name") == "raster_embedding_key":
            self._pack_embedding_matrix()

    def set_color(
        self,
        color: Any,
        *,
        color_map: dict[str, str] | None = None,
        legend_title: str | None = None,
        continuous_range: tuple[str, str] | None = None,
    ) -> None:
        """Update point colors without changing x/y."""
        x = getattr(self, "_data_x", None)
        y = getattr(self, "_data_y", None)
        if x is None or y is None:
            raise RuntimeError("internal point cache missing; call set_points first")
        self.set_points(
            x,
            y,
            color=color,
            color_map=color_map,
            legend_title=legend_title,
            continuous_range=continuous_range,
        )

    def category_colors(self, column: str | None = None) -> dict[str, str]:
        """Label -> hex colour of a categorical column, as the map draws it.

        Defaults to the active category. Use it to colour other views (plots,
        ``VolumeCubeWidget.highlight_cells``) the same way as the points.
        """
        name = column or self.active_category
        for meta in self.category_columns:
            if meta.get("name") == name:
                return {
                    str(label): str(color)
                    for label, color in zip(meta["labels"], meta["palette"])
                }
        raise KeyError(f"{name!r} is not a categorical column of this widget")

    def clear_selections(self) -> None:
        self.selections = []
        if self.selected_kind == "selection":
            self.selected_kind = ""
            self.selected_index = -1

    def clear_landmarks(self) -> None:
        self.landmarks = []
        if self.selected_kind == "landmark":
            self.selected_kind = ""
            self.selected_index = -1

    def clear(self) -> None:
        self.clear_selections()
        self.clear_landmarks()

    def get_obs_names(
        self,
        adata: Any,
        selection_id: str | None = "all",
        *,
        spatial_key: str = "spatial",
    ) -> "np.ndarray":
        """``obs_names`` of cells inside ``selection_id`` (durable join key).

        Uses :func:`selection_mask` (geometry or stored ``point_indices``).
        Neighborhood expand is client-side; promote freezes membership into
        ``point_indices`` before syncing.
        """
        import numpy as np

        xy = np.asarray(adata.obsm[spatial_key], dtype=np.float64)
        cached = getattr(self, "_data_x", None)
        if cached is None or xy.shape[0] != int(cached.shape[0]):
            raise ValueError(
                "adata row count != widget points; rebuild the widget after filtering"
            )
        mask = selection_mask(
            list(self.selections),
            xy[:, 0],
            xy[:, 1],
            selection_id,
            x_scale=self._x_scale,
            y_scale=self._y_scale,
        )
        return np.asarray(adata.obs_names.astype(str))[np.asarray(mask, dtype=bool)]

    def assign_obs_mask(
        self,
        adata: Any,
        key: str,
        selection_id: str | None = "all",
        *,
        spatial_key: str = "spatial",
    ) -> None:
        """Write a boolean column on ``adata.obs`` for the current selection."""
        names = set(
            self.get_obs_names(
                adata, selection_id, spatial_key=spatial_key
            ).tolist()
        )
        adata.obs[key] = [str(n) in names for n in adata.obs_names.astype(str)]
