import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { FetchStore } from "@zarrita/storage";

import { loadVolumePyramid } from "./load-volume-pyramid.ts";
import { VolumeCommClient } from "./volume-comm.ts";

function groupMeta(scalePath) {
  return {
    attributes: {
      ome: {
        version: "0.5",
        multiscales: [
          {
            datasets: [{ path: scalePath }],
            axes: [
              { name: "c", type: "channel" },
              { name: "z", type: "space" },
              { name: "y", type: "space" },
              { name: "x", type: "space" },
            ],
          },
        ],
      },
    },
    zarr_format: 3,
    node_type: "group",
  };
}

function arrayMeta() {
  return {
    shape: [1, 1, 2, 2],
    data_type: "uint8",
    chunk_grid: { name: "regular", configuration: { chunk_shape: [1, 1, 2, 2] } },
    chunk_key_encoding: { name: "default", configuration: { separator: "/" } },
    fill_value: 0,
    codecs: [{ name: "bytes" }],
    dimension_names: ["c", "z", "y", "x"],
    zarr_format: 3,
    node_type: "array",
  };
}

async function writeScaleTree(root, scalePath) {
  await mkdir(join(root, "images/mosaic"), { recursive: true });
  await writeFile(join(root, "images/mosaic/zarr.json"), JSON.stringify(groupMeta(scalePath)));
  const scaleDir = join(root, "images/mosaic", scalePath);
  await mkdir(scaleDir, { recursive: true });
  await writeFile(join(scaleDir, "zarr.json"), JSON.stringify(arrayMeta()));
  const chunk = join(scaleDir, "c", "0", "0", "0", "0");
  await mkdir(join(scaleDir, "c", "0", "0", "0"), { recursive: true });
  await writeFile(chunk, Buffer.from([5, 6, 7, 8]));
}

function serveDir(root) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const rel = decodeURIComponent(url.pathname.replace(/^\//, ""));
      const file = join(root, rel);
      const { readFile } = await import("node:fs/promises");
      const data = await readFile(file);
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
}

/** Minimal comm model stub for VolumeCommClient. */
function commModel() {
  return {
    send() {},
    on() {},
  };
}

for (const scalePath of ["0", "s0"]) {
  test(`loadVolumePyramid reads multiscales dataset path ${scalePath}`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "milume-zarr-"));
    const server = serveDir(dir);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const prev = globalThis.window;
    try {
      await writeScaleTree(dir, scalePath);
      globalThis.window = {
        location: { href: `http://127.0.0.1:${port}/` },
        __volumeCommStaticRoot: `http://127.0.0.1:${port}/`,
      };
      const client = new VolumeCommClient(commModel());
      const levels = await loadVolumePyramid("images/mosaic/", client);
      assert.equal(levels.length, 1);
      assert.deepEqual([...levels[0].shape], [1, 1, 2, 2]);
    } finally {
      globalThis.window = prev;
      server.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
}
