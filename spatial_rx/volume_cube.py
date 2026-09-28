"""VolumeCubeWidget: isometric OME-Zarr detail cube (Viv).

Competes with PolyrenderWidget (Fiber + GLB). A Landmarks inspect window
(fixed 100 µm square) is consumed one-way via ``window_cx`` / ``window_cy``.
The toy fixture is a small OME-Zarr (1 µm/voxel) served over loopback HTTP
so Viv can ``fetch`` it.

Landmarks ``obsm["spatial"]`` XY and cube ``window_cx`` / ``window_cy`` /
``slice_*`` traits share the same coordinate frame. ``voxel_size_um`` and
``origin_um`` (z, y, x) map it onto level-0 voxels:
``voxel = (coord - origin_um) / voxel_size_um``. The defaults (1, 0) make
**one unit = one voxel** (the Blin IDR demo uses voxel indices directly;
x=271, y=275, z=236). ``from_ome_zarr`` fills them from NGFF metadata, so a
store georeferenced in microns (Meteor's ``mosaic_3d``) lines up with cell
coordinates in the same microns.

The browser loads only the inspect window, at the finest pyramid level that
fits its voxel budget, so the cube works on stores far larger than the GPU.
"""

from __future__ import annotations

import json
import mimetypes
import os
import re
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np
import traitlets
from anywidget import AnyWidget

from spatial_rx._assets import widget_css, widget_esm

TOY_SHAPE_ZYX = (64, 256, 256)
TOY_CHUNK_ZYX = (32, 64, 64)
TOY_UM_PER_VOXEL = 1.0
DEFAULT_WINDOW_UM = 100.0

# IDR Blin nuclear segmentation (idr0062) — public OME-Zarr for demos.
# Level 0 shape (c, z, y, x): 2 × 236 × 275 × 271, uint16, LaminB1 + DAPI.
# No /labels group; browser CORS OK. Playwright / CI use ``toy()`` instead.
BLIN_IDR_IMAGE_URL = (
    "https://minio-dev.openmicroscopy.org/idr/v0.3/"
    "idr0062-blin-nuclearsegmentation/6001240.zarr"
)
BLIN_SHAPE_CZYX = (2, 236, 275, 271)
BLIN_SHAPE_ZYX = (236, 275, 271)
DEFAULT_Z_SLAB = 64
# Display range for the image channel (tuned for the Blin IDR / toy volumes).
DEFAULT_CONTRAST_LIMITS = (0.0, 48.0)
_NEUTRAL_HIGHLIGHT = "#22d3ee"


def mid_z_slab(depth: int, slab: int = DEFAULT_Z_SLAB) -> tuple[float, float]:
    """Return ``(z_min, z_max)`` for a centered Z slab (GPU-safe default)."""
    slab = min(slab, depth)
    z_min = (depth - slab) / 2.0
    return z_min, z_min + slab


def cells_in_inspect_window(
    spatial_xy: np.ndarray,
    cx: float,
    cy: float,
    size: float = DEFAULT_WINDOW_UM,
) -> np.ndarray:
    """Boolean mask of ``spatial_xy`` points inside the square inspect window."""
    half = size / 2.0
    return (
        (spatial_xy[:, 0] >= cx - half)
        & (spatial_xy[:, 0] <= cx + half)
        & (spatial_xy[:, 1] >= cy - half)
        & (spatial_xy[:, 1] <= cy + half)
    )


def _write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload), encoding="utf-8")


def _multiscales(name: str) -> dict:
    return {
        "multiscales": [
            {
                "version": "0.4",
                "name": name,
                "axes": [
                    {"name": "z", "type": "space", "unit": "micrometer"},
                    {"name": "y", "type": "space", "unit": "micrometer"},
                    {"name": "x", "type": "space", "unit": "micrometer"},
                ],
                "datasets": [
                    {
                        "path": "0",
                        "coordinateTransformations": [
                            {
                                "type": "scale",
                                "scale": [
                                    TOY_UM_PER_VOXEL,
                                    TOY_UM_PER_VOXEL,
                                    TOY_UM_PER_VOXEL,
                                ],
                            }
                        ],
                    }
                ],
            }
        ]
    }


def _zarray(shape: tuple[int, int, int]) -> dict:
    return {
        "zarr_format": 2,
        "shape": list(shape),
        "chunks": list(TOY_CHUNK_ZYX),
        "dtype": "<u1",
        "compressor": None,
        "fill_value": 0,
        "order": "C",
        "filters": None,
        "dimension_separator": "/",
    }


def toy_volumes() -> tuple[np.ndarray, np.ndarray]:
    """Grayscale image and integer labels. Coordinates are µm (1 µm/voxel)."""
    z, y, x = TOY_SHAPE_ZYX
    image = np.full((z, y, x), 12, dtype=np.uint8)
    labels = np.zeros((z, y, x), dtype=np.uint8)
    zz, yy, xx = np.ogrid[:z, :y, :x]
    blobs = (
        (16, 80, 70, 22, 200, 1),
        (32, 150, 160, 28, 240, 2),
        (48, 190, 100, 18, 160, 3),
    )
    for cz, cy, cx, radius, value, label_id in blobs:
        mask = (zz - cz) ** 2 + (yy - cy) ** 2 + (xx - cx) ** 2 <= radius**2
        image[mask] = value
        labels[mask] = label_id
    return image, labels


def _write_array(array_dir: Path, volume: np.ndarray) -> None:
    array_dir.mkdir(parents=True, exist_ok=True)
    _write_json(array_dir / ".zarray", _zarray(tuple(volume.shape)))
    cz, cy, cx = TOY_CHUNK_ZYX
    nz, ny, nx = volume.shape
    for iz in range(0, nz, cz):
        for iy in range(0, ny, cy):
            for ix in range(0, nx, cx):
                chunk = np.ascontiguousarray(
                    volume[iz : iz + cz, iy : iy + cy, ix : ix + cx]
                )
                rel = Path(str(iz // cz)) / str(iy // cy) / str(ix // cx)
                path = array_dir / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(chunk.tobytes())


def write_toy_ome_zarr(dest: Path) -> Path:
    """Write a tiny OME-Zarr image plus a ``labels/cells`` group."""
    dest = Path(dest)
    if dest.exists():
        raise FileExistsError(dest)
    image, labels = toy_volumes()
    dest.mkdir(parents=True)
    _write_json(dest / ".zgroup", {"zarr_format": 2})
    _write_json(dest / ".zattrs", _multiscales("toy-image"))
    _write_array(dest / "0", image)

    labels_root = dest / "labels"
    labels_root.mkdir()
    _write_json(labels_root / ".zgroup", {"zarr_format": 2})
    _write_json(labels_root / ".zattrs", {"labels": ["cells"]})
    cells = labels_root / "cells"
    cells.mkdir()
    _write_json(cells / ".zgroup", {"zarr_format": 2})
    _write_json(cells / ".zattrs", _multiscales("toy-labels"))
    _write_array(cells / "0", labels)
    return dest


_RANGE = re.compile(r"bytes=(\d*)-(\d*)")


class _QuietHandler(SimpleHTTPRequestHandler):
    """Loopback file server with CORS and single-range requests.

    Zarr v3 shards are read by range: the shard index from the end of the file
    (a suffix range, ``bytes=-N``), then each chunk's bytes. The standard
    library handler ignores ``Range`` and would send whole shards.
    """

    _range_remaining: int | None = None
    #: Served paths (relative, "/"-separated, each ending in "/") under which
    #: files may be read; ``None`` serves every file under the directory.
    allow_prefixes: tuple[str, ...] | None = None

    def _allowed(self, path: str) -> bool:
        if self.allow_prefixes is None:
            return True
        rel = os.path.relpath(path, self.directory).replace(os.sep, "/")
        return any(rel.startswith(prefix) for prefix in self.allow_prefixes)

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        # A suffix range is not a CORS-safelisted header value, so it preflights.
        self.send_header("Access-Control-Allow-Headers", "Range")
        self.send_header("Access-Control-Expose-Headers", "Content-Range, Content-Length")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_head(self):  # noqa: ANN201 - stdlib signature
        self._range_remaining = None
        path = self.translate_path(self.path)
        # Files only, inside the allowlist; no directory listings or redirects.
        if os.path.isdir(path) or not self._allowed(path):
            self.send_error(404, "File not found")
            return None
        match = _RANGE.fullmatch((self.headers.get("Range") or "").strip())
        if match is None or match.groups() == ("", "") or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        first, last = match.groups()
        if first == "":
            start, end = max(0, size - int(last)), size - 1
        else:
            start = int(first)
            end = min(int(last), size - 1) if last else size - 1
        if start >= size or end < start:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None
        f = open(path, "rb")  # noqa: SIM115 - the stdlib caller closes it
        f.seek(start)
        self.send_response(206)
        self.send_header(
            "Content-Type", mimetypes.guess_type(path)[0] or "application/octet-stream"
        )
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self._range_remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile) -> None:  # noqa: ANN001 - stdlib signature
        remaining = self._range_remaining
        if remaining is None:
            super().copyfile(source, outputfile)
            return
        while remaining > 0:
            block = source.read(min(64 * 1024, remaining))
            if not block:
                break
            outputfile.write(block)
            remaining -= len(block)

    def list_directory(self, path):  # noqa: ANN001, ANN201 - stdlib signature
        self.send_error(404, "File not found")
        return None

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def log_message(self, format: str, *args: Any) -> None:
        return


def _zarr_node(path: Path) -> dict:
    """Metadata of a Zarr v3 (``zarr.json``) or v2 (``.zattrs`` + ``.zarray``) node."""
    v3 = path / "zarr.json"
    if v3.exists():
        return json.loads(v3.read_text(encoding="utf-8"))
    node: dict = {}
    if (path / ".zattrs").exists():
        node["attributes"] = json.loads((path / ".zattrs").read_text(encoding="utf-8"))
    if (path / ".zarray").exists():
        node.update(json.loads((path / ".zarray").read_text(encoding="utf-8")))
    return node


def ome_zarr_level0(path: Path | str) -> dict:
    """Level-0 shape and physical frame of a local OME-Zarr image (NGFF 0.4 / 0.5).

    Returns ``shape_zyx``, ``voxel_size_um`` and ``origin_um`` (each z, y, x),
    composing the level-0 dataset transform with any multiscale-wide one.
    """
    root = Path(path)
    attrs = _zarr_node(root).get("attributes", {})
    multiscale = attrs.get("ome", attrs)["multiscales"][0]
    axes = [a["name"] if isinstance(a, dict) else a for a in multiscale["axes"]]
    dataset = multiscale["datasets"][0]
    scale = [1.0] * len(axes)
    translation = [0.0] * len(axes)
    def flatten(transforms: list[dict]) -> list[dict]:
        # SpatialData writes a scale + translation pair as one "sequence".
        out: list[dict] = []
        for t in transforms:
            out.extend(flatten(t["transformations"]) if t["type"] == "sequence" else [t])
        return out

    for transforms in (
        dataset.get("coordinateTransformations", []),
        multiscale.get("coordinateTransformations", []),
    ):
        for t in flatten(transforms):
            if t["type"] == "scale":
                translation = [o * f for o, f in zip(translation, t["scale"])]
                scale = [s * f for s, f in zip(scale, t["scale"])]
            elif t["type"] == "translation":
                translation = [o + d for o, d in zip(translation, t["translation"])]
    shape = _zarr_node(root / dataset["path"])["shape"]
    zyx = [axes.index(a) for a in ("z", "y", "x")]
    return {
        "shape_zyx": tuple(int(shape[i]) for i in zyx),
        "voxel_size_um": tuple(float(scale[i]) for i in zyx),
        "origin_um": tuple(float(translation[i]) for i in zyx),
    }


class _LoopbackServer(ThreadingHTTPServer):
    """Threaded server with a listen backlog for the cube's parallel chunk reads.

    The stdlib default backlog of 5 overflows when the browser opens dozens of
    chunk requests at once; Windows then refuses the extra connections.
    """

    request_queue_size = 256
    daemon_threads = True


def serve_directory(
    directory: Path, allow_prefixes: tuple[str, ...] | None = None
) -> tuple[ThreadingHTTPServer, str]:
    """Serve the files in ``directory`` on 127.0.0.1. Returns the server and base URL.

    ``allow_prefixes`` (relative paths ending in ``/``, e.g. ``"images/mosaic/"``)
    limits reads to those subtrees; other paths are 404. Directories are never
    listed.
    """
    handler_cls = _QuietHandler
    if allow_prefixes is not None:
        prefixes = tuple(p.strip("/") + "/" for p in allow_prefixes)
        handler_cls = type("_AllowlistHandler", (_QuietHandler,), {"allow_prefixes": prefixes})
    handler = partial(handler_cls, directory=str(directory))
    server = _LoopbackServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address[:2]
    return server, f"http://{host}:{port}"


class VolumeCubeWidget(AnyWidget):
    """Isometric Viv cube of an OME-Zarr image and optional labels."""

    _esm = widget_esm("volume-cube")
    _css = widget_css()

    image_url = traitlets.Unicode("").tag(sync=True)
    labels_url = traitlets.Unicode("").tag(sync=True)
    window_cx = traitlets.Float(128.0).tag(sync=True)
    window_cy = traitlets.Float(128.0).tag(sync=True)
    window_size_um = traitlets.Float(DEFAULT_WINDOW_UM).tag(sync=True)
    slice_x_min = traitlets.Float(0.0).tag(sync=True)
    slice_x_max = traitlets.Float(float(TOY_SHAPE_ZYX[2])).tag(sync=True)
    slice_y_min = traitlets.Float(0.0).tag(sync=True)
    slice_y_max = traitlets.Float(float(TOY_SHAPE_ZYX[1])).tag(sync=True)
    slice_z_min = traitlets.Float(0.0).tag(sync=True)
    slice_z_max = traitlets.Float(float(TOY_SHAPE_ZYX[0])).tag(sync=True)
    contrast_limits = traitlets.List(
        traitlets.Float(), default_value=list(DEFAULT_CONTRAST_LIMITS), minlen=2, maxlen=2
    ).tag(sync=True)
    voxel_size_um = traitlets.List(
        traitlets.Float(), default_value=[1.0, 1.0, 1.0], minlen=3, maxlen=3
    ).tag(sync=True)
    origin_um = traitlets.List(
        traitlets.Float(), default_value=[0.0, 0.0, 0.0], minlen=3, maxlen=3
    ).tag(sync=True)
    # Cells to fill, as ``{"name", "color", "labels"}`` groups (label ids in
    # ``labels_url``); set with ``highlight_cells``. Shown while Labels is on.
    highlight_groups = traitlets.List(traitlets.Dict(), default_value=[]).tag(sync=True)

    def __init__(
        self,
        image_url: str = "",
        labels_url: str = "",
        window_cx: float = 128.0,
        window_cy: float = 128.0,
        window_size_um: float = DEFAULT_WINDOW_UM,
        slice_x_min: float = 0.0,
        slice_x_max: float = float(TOY_SHAPE_ZYX[2]),
        slice_y_min: float = 0.0,
        slice_y_max: float = float(TOY_SHAPE_ZYX[1]),
        slice_z_min: float = 0.0,
        slice_z_max: float = float(TOY_SHAPE_ZYX[0]),
        contrast_limits: tuple[float, float] = DEFAULT_CONTRAST_LIMITS,
        voxel_size_um: tuple[float, float, float] = (1.0, 1.0, 1.0),
        origin_um: tuple[float, float, float] = (0.0, 0.0, 0.0),
        **kwargs: Any,
    ) -> None:
        self._server: ThreadingHTTPServer | None = None
        self._labels_server: ThreadingHTTPServer | None = None
        super().__init__(
            image_url=image_url,
            labels_url=labels_url,
            window_cx=window_cx,
            window_cy=window_cy,
            window_size_um=window_size_um,
            slice_x_min=slice_x_min,
            slice_x_max=slice_x_max,
            slice_y_min=slice_y_min,
            slice_y_max=slice_y_max,
            slice_z_min=slice_z_min,
            slice_z_max=slice_z_max,
            contrast_limits=[float(v) for v in contrast_limits],
            voxel_size_um=[float(v) for v in voxel_size_um],
            origin_um=[float(v) for v in origin_um],
            **kwargs,
        )

    def highlight_cells(
        self,
        labels: Mapping[str, Sequence[int]],
        colors: Mapping[str, str] | None = None,
    ) -> None:
        """Fill cells in the cube, one colour per group (e.g. per cell type).

        ``labels`` maps a group name to label ids in ``labels_url``; ``colors``
        maps names to hex colours, e.g. ``LandmarksWidget.category_colors`` so
        the cube matches the map. Groups without a colour get a neutral one.
        An empty mapping clears the highlight. Setting a highlight turns the
        cube's **Labels** switch on; turning it off hides the highlight too::

            cube.highlight_cells(
                {"T cell": [12, 40], "B cell": [7]},
                landmarks.category_colors("cell_type"),
            )
        """
        colors = colors or {}
        self.highlight_groups = [
            {
                "name": str(name),
                "color": str(colors.get(str(name), _NEUTRAL_HIGHLIGHT)),
                "labels": [int(i) for i in ids],
            }
            for name, ids in labels.items()
            if len(ids)
        ]

    @classmethod
    def from_url(
        cls,
        image_url: str,
        labels_url: str = "",
        *,
        shape_zyx: tuple[int, int, int] | None = None,
        z_slab: int | None = DEFAULT_Z_SLAB,
        window_cx: float | None = None,
        window_cy: float | None = None,
        **kwargs: Any,
    ) -> VolumeCubeWidget:
        """Point at a remote or local OME-Zarr URL with slice defaults from shape.

        When ``shape_zyx`` is known, ``slice_*`` maxima and window center default
        to the volume extents. ``z_slab`` limits the Z range to a centered slab
        (``DEFAULT_Z_SLAB`` planes) to reduce GPU memory next to Landmarks.
        Pass ``z_slab=None`` to use the full Z extent.
        """
        slice_kwargs: dict[str, float] = {}
        if shape_zyx is not None:
            depth, height, width = shape_zyx
            slice_kwargs = {
                "slice_x_min": 0.0,
                "slice_x_max": float(width),
                "slice_y_min": 0.0,
                "slice_y_max": float(height),
            }
            if z_slab is None:
                slice_kwargs["slice_z_min"] = 0.0
                slice_kwargs["slice_z_max"] = float(depth)
            else:
                z_min, z_max = mid_z_slab(depth, z_slab)
                slice_kwargs["slice_z_min"] = z_min
                slice_kwargs["slice_z_max"] = z_max
            if window_cx is None:
                window_cx = width / 2.0
            if window_cy is None:
                window_cy = height / 2.0
        return cls(
            image_url=image_url,
            labels_url=labels_url,
            window_cx=window_cx if window_cx is not None else 128.0,
            window_cy=window_cy if window_cy is not None else 128.0,
            **slice_kwargs,
            **kwargs,
        )

    @classmethod
    def from_ome_zarr(
        cls,
        path: Path | str,
        *,
        labels_path: Path | str | None = None,
        window_cx: float | None = None,
        window_cy: float | None = None,
        **kwargs: Any,
    ) -> VolumeCubeWidget:
        """Serve a local OME-Zarr image and put the cube in its physical frame.

        Level-0 ``scale`` / ``translation`` set ``voxel_size_um`` and
        ``origin_um``, so window and slice traits take the store's own
        coordinates (Meteor mosaics: stage microns). Slices default to the full
        extent and the window to the volume center. The directory is served on
        loopback with range requests, so a sharded store is read per chunk.

        ``labels_path`` is an OME-Zarr label image on the same voxel grid (e.g. a
        SpatialData ``Labels3DModel`` element rasterized onto the mosaic). The
        **Labels** switch then outlines each cell's surface inside the cube,
        and ``highlight_cells`` fills chosen cells.
        """
        meta = ome_zarr_level0(path)
        size_z, size_y, size_x = meta["voxel_size_um"]
        origin_z, origin_y, origin_x = meta["origin_um"]
        depth, height, width = meta["shape_zyx"]
        server, base = serve_directory(Path(path))
        labels_server, labels_url = None, ""
        if labels_path is not None:
            labels_meta = ome_zarr_level0(labels_path)
            if labels_meta["shape_zyx"] != meta["shape_zyx"] or not np.allclose(
                [*labels_meta["voxel_size_um"], *labels_meta["origin_um"]],
                [*meta["voxel_size_um"], *meta["origin_um"]],
            ):
                raise ValueError(
                    f"labels grid {labels_meta} differs from the image's "
                    f"{meta}; rasterize the labels onto the image's level-0 grid"
                )
            labels_server, labels_base = serve_directory(Path(labels_path))
            labels_url = f"{labels_base}/"
        widget = cls(
            image_url=f"{base}/",
            labels_url=labels_url,
            window_cx=window_cx if window_cx is not None else origin_x + width * size_x / 2,
            window_cy=window_cy if window_cy is not None else origin_y + height * size_y / 2,
            slice_x_min=origin_x,
            slice_x_max=origin_x + width * size_x,
            slice_y_min=origin_y,
            slice_y_max=origin_y + height * size_y,
            slice_z_min=origin_z,
            slice_z_max=origin_z + depth * size_z,
            voxel_size_um=meta["voxel_size_um"],
            origin_um=meta["origin_um"],
            **kwargs,
        )
        widget._server = server
        widget._labels_server = labels_server
        return widget

    @classmethod
    def toy(cls, dest: Path | None = None) -> VolumeCubeWidget:
        """Build the synthetic OME-Zarr, serve it, and return a widget pointed at it."""
        import tempfile

        root = Path(dest) if dest is not None else Path(tempfile.mkdtemp()) / "toy.ome.zarr"
        if not root.exists():
            write_toy_ome_zarr(root)
        server, base = serve_directory(root)
        widget = cls(
            image_url=f"{base}/",
            labels_url=f"{base}/labels/cells/",
            window_cx=TOY_SHAPE_ZYX[2] / 2,
            window_cy=TOY_SHAPE_ZYX[1] / 2,
        )
        widget._server = server
        return widget
