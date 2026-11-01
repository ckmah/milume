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
  const arr = (await zarr.open(store, { kind: "array" })) as zarr.Array<zarr.DataType, zarr.Readable>;
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
  it("returns different channel sums (no ChunkCache attach, same as map backdrop)", async () => {
    if (!fs.existsSync(path.join(zarrRoot, ISSUE395_ZARR))) {
      return;
    }
    const { baseUrl, close } = await startStaticServer();
    try {
      const source = await loadIssue395FinestLevel(baseUrl);
      assert(axisSize(source, "c") > 1);
      const box = inspectWindowBox(source);
      const sum0 = sumData((await fetchBox(source, box, { c: 0 })).data as ArrayLike<number>);
      const sum1 = sumData((await fetchBox(source, box, { c: 1 })).data as ArrayLike<number>);
      assert.notEqual(sum0, sum1);
      assert.equal(sum0, 14839940);
      assert.equal(sum1, 3582260);

      const { WindowPixelSource } = await import("./window-source.ts");
      const wps = new WindowPixelSource(source, box, [1, 1, 1], null);
      const w0 = sumData((await wps.fetchBlock({ c: 0 })).data as ArrayLike<number>);
      const w1 = sumData((await wps.fetchBlock({ c: 1 })).data as ArrayLike<number>);
      assert.equal(w0, sum0);
      assert.equal(w1, sum1);
    } finally {
      await close();
    }
  });

  it("attaching ChunkCache aliases channel 1 to channel 0 (do not attach multichannel pyramids)", async () => {
    if (!fs.existsSync(path.join(zarrRoot, ISSUE395_ZARR))) {
      return;
    }
    const { baseUrl, close } = await startStaticServer();
    try {
      const source = await loadIssue395FinestLevel(baseUrl);
      const box = inspectWindowBox(source);
      const cache = new ChunkCache();
      cache.attach(source._data, "test-multichannel");
      const sum0 = sumData((await fetchBox(source, box, { c: 0 })).data as ArrayLike<number>);
      const sum1 = sumData((await fetchBox(source, box, { c: 1 })).data as ArrayLike<number>);
      assert.equal(sum0, sum1);
      assert.notEqual(sum1, 3582260);
    } finally {
      await close();
    }
  });
});
