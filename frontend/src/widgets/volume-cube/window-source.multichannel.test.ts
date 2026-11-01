import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import * as zarr from "zarrita";
import FetchStore from "@zarrita/storage/fetch";

import { ChunkCache } from "./chunk-cache.ts";
import {
  type Box,
  type Frame,
  type ZarrSource,
  axisSize,
  fetchBox,
  pickLevel,
  pyramidLevels,
  windowBox,
} from "./window-source.ts";

const frontendRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const zarrRoot = path.join(frontendRoot, "dev/landmarks-volume/public");
const ISSUE395_ZARR = "issue395-3d.sdata.zarr";

/** Issue #395 inspect centre (µm); matches e2e issue395-cube-flow. */
const INSPECT_CX = 130.5;
const INSPECT_CY = 170.5;
const INSPECT_WINDOW_UM = 300;

function sumData(data: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < data.length; i++) s += data[i]!;
  return s;
}

function startStaticServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url!.split("?")[0]!);
      const filePath = path.join(zarrRoot, rel);
      if (!filePath.startsWith(zarrRoot)) {
        res.statusCode = 403;
        res.end();
        return;
      }
      try {
        const st = fs.statSync(filePath);
        if (st.isDirectory()) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("access-control-allow-origin", "*");
        fs.createReadStream(filePath).pipe(res);
      } catch {
        res.statusCode = 404;
        res.end();
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      assert(addr && typeof addr === "object");
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

async function loadIssue395FinestLevel(baseUrl: string): Promise<ZarrSource> {
  const url = `${baseUrl}/${ISSUE395_ZARR}/images/mosaic/s0`;
  const store = new FetchStore(url);
  const arr = (await zarr.open(store, { kind: "array" })) as unknown as zarr.Array<
    zarr.DataType,
    zarr.Readable
  > & { chunkShape: number[] };
  return {
    shape: [...arr.shape],
    labels: ["c", "z", "y", "x"],
    dtype: "uint8",
    tileSize: arr.chunkShape[arr.chunkShape.length - 1]!,
    _data: arr,
  };
}

function inspectWindowBox(source: ZarrSource): Box {
  const frame: Frame = {
    voxelSize: [1, 1, 1],
    origin: [0, 0, 0],
  };
  const levels = pyramidLevels([source]);
  const level = pickLevel(levels, frame, INSPECT_WINDOW_UM);
  return windowBox(level, frame, INSPECT_CX, INSPECT_CY, INSPECT_WINDOW_UM);
}

describe("fetchBox multichannel (#395)", () => {
  it("returns different channel sums with ChunkCache attached (full tile, per-c slice)", async () => {
    if (!fs.existsSync(path.join(zarrRoot, ISSUE395_ZARR))) {
      return;
    }
    const { baseUrl, close } = await startStaticServer();
    try {
      const source = await loadIssue395FinestLevel(baseUrl);
      assert(axisSize(source, "c") > 1);
      const cache = new ChunkCache();
      cache.attach(source._data, "test-multichannel");
      const box = inspectWindowBox(source);
      const sum0 = sumData((await fetchBox(source, box, { c: 0 })).data as ArrayLike<number>);
      const sum1 = sumData((await fetchBox(source, box, { c: 1 })).data as ArrayLike<number>);
      assert.notEqual(sum0, sum1);
      assert.equal(sum0, 14839940);
      assert.equal(sum1, 3582260);

      const { WindowPixelSource } = await import("./window-source.ts");
      const wps = new WindowPixelSource(source, box, [1, 1, 1], cache);
      const w0 = sumData((await wps.fetchBlock({ c: 0 })).data as ArrayLike<number>);
      const w1 = sumData((await wps.fetchBlock({ c: 1 })).data as ArrayLike<number>);
      assert.equal(w0, sum0);
      assert.equal(w1, sum1);

      const [par0, par1] = await Promise.all([
        fetchBox(source, box, { c: 0 }),
        fetchBox(source, box, { c: 1 }),
      ]);
      assert.notEqual(
        sumData(par0.data as ArrayLike<number>),
        sumData(par1.data as ArrayLike<number>),
        "parallel fetchBox must not race on shared chunk bytes",
      );

      const wps2 = new WindowPixelSource(source, box, [1, 1, 1], cache);
      const [b0, b1] = await Promise.all([wps2.fetchBlock({ c: 0 }), wps2.fetchBlock({ c: 1 })]);
      assert.notEqual(sumData(b0.data as ArrayLike<number>), sumData(b1.data as ArrayLike<number>));

      const pz = 24;
      const py = 100;
      const px = 200;
      if (
        pz >= box.z0 &&
        pz < box.z1 &&
        py >= box.y0 &&
        py < box.y1 &&
        px >= box.x0 &&
        px < box.x1
      ) {
        const dy = box.y1 - box.y0;
        const dx = box.x1 - box.x0;
        const strideZ = dy * dx;
        const idx = (pz - box.z0) * strideZ + (py - box.y0) * dx + (px - box.x0);
        const d0 = (b0.data as ArrayLike<number>)[idx]!;
        const d1 = (b1.data as ArrayLike<number>)[idx]!;
        assert.ok(d0 < 100, `DAPI at PanCK site should be low, got ${d0}`);
        assert.ok(d1 > 150, `PanCK at PanCK site should be high, got ${d1}`);
      }
    } finally {
      await close();
    }
  });

  it("ChunkCache attach does not alias channel 0 onto channel 1 (regression #395)", async () => {
    if (!fs.existsSync(path.join(zarrRoot, ISSUE395_ZARR))) {
      return;
    }
    const { baseUrl, close } = await startStaticServer();
    try {
      const source = await loadIssue395FinestLevel(baseUrl);
      const box = inspectWindowBox(source);
      const cache = new ChunkCache();
      cache.attach(source._data, "test-multichannel-alias");
      const sum0 = sumData((await fetchBox(source, box, { c: 0 })).data as ArrayLike<number>);
      const sum1 = sumData((await fetchBox(source, box, { c: 1 })).data as ArrayLike<number>);
      assert.notEqual(sum0, sum1, "cached tiles must slice per channel, not reuse channel 0 bytes");
      assert.equal(sum1, 3582260);
    } finally {
      await close();
    }
  });
});
