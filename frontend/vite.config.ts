import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(rootDir, "..");
const devDir = path.resolve(rootDir, "dev");
const outDir = path.resolve(repoRoot, "milume/static/bundled");

/** One entry per anywidget that uses shadcn/React. */
const widgetEntries = {
  landmarks: path.resolve(rootDir, "src/widgets/landmarks/index.tsx"),
};

const buildWidget = process.env.MILUME_BUILD_WIDGET;
const entries =
  buildWidget && buildWidget in widgetEntries
    ? { [buildWidget]: widgetEntries[buildWidget as keyof typeof widgetEntries] }
    : widgetEntries;
const singleWidget = Object.keys(entries).length === 1;

const devWidget = process.env.DEV_WIDGET;
/** landmarks-volume harness data: toy (CI), xsmall/small (HF Pyxa), or colon A2 (local hero). */
const volumeProfile =
  process.env.MILUME_VOLUME_PROFILE === "small"
    ? "small"
    : process.env.MILUME_VOLUME_PROFILE === "xsmall"
      ? "xsmall"
      : process.env.MILUME_VOLUME_PROFILE === "colon"
        ? "colon"
        : "toy";
const volumeFixtureFile =
  volumeProfile === "small"
    ? "landmarks-volume-fixture.small.json"
    : volumeProfile === "xsmall"
      ? "landmarks-volume-fixture.xsmall.json"
      : volumeProfile === "colon"
        ? "landmarks-volume-fixture.colon.json"
        : "landmarks-volume-fixture.json";
const harnessRoots: Record<string, string> = {
  "landmarks-volume": path.resolve(devDir, "landmarks-volume"),
};
const harnessRoot = harnessRoots[devWidget ?? ""] ?? devDir;

// Single deck.gl / luma.gl stack for all widgets (9.2.x). npm overrides dedupe
// Viv's nested peers to these root copies; each widget bundle still ships its own
// ESM chunk — there is no shared runtime Deck across anywidgets in a notebook cell.
const deckPackages = [
  "@deck.gl/core",
  "@deck.gl/layers",
  "@deck.gl/extensions",
  "@deck.gl/widgets",
  "@deck.gl/mesh-layers",
  "@deck.gl/geo-layers",
  "@deck.gl/react",
];
const lumaPackages = [
  "@luma.gl/constants",
  "@luma.gl/core",
  "@luma.gl/engine",
  "@luma.gl/shadertools",
  "@luma.gl/webgl",
  "@luma.gl/gltf",
];

const sharedResolve = {
  alias: {
    "@": path.resolve(rootDir, "src"),
    ...Object.fromEntries(
      [...deckPackages, ...lumaPackages].map((name) => [
        name,
        path.resolve(rootDir, "node_modules", name),
      ]),
    ),
    "@thi.ng/geom-accel": path.resolve(rootDir, "node_modules/@thi.ng/geom-accel"),
    "polygon-clipping": path.resolve(
      rootDir,
      "node_modules/polygon-clipping/dist/polygon-clipping.esm.js",
    ),
  },
};

const sharedServer = {
  fs: { allow: [repoRoot] },
};

const rangeRe = /^bytes=(\d*)-(\d*)$/;

function sendZarrRange(filePath: string, rangeHeader: string, res: import("node:http").ServerResponse) {
  const size = fs.statSync(filePath).size;
  const match = rangeRe.exec(rangeHeader.trim());
  if (!match) {
    res.statusCode = 416;
    res.end();
    return;
  }
  const [, first, last] = match;
  let start = 0;
  let end = size - 1;
  if (first === "") {
    start = Math.max(0, size - Number(last));
  } else {
    start = Number(first);
    end = last ? Math.min(Number(last), size - 1) : size - 1;
  }
  if (start >= size || end < start) {
    res.statusCode = 416;
    res.setHeader("Content-Range", `bytes */${size}`);
    res.end();
    return;
  }
  const length = end - start + 1;
  res.statusCode = 206;
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
  res.setHeader("Content-Length", String(length));
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
  fs.createReadStream(filePath, { start, end }).pipe(res);
}

function serveLandmarksVolumeFixture() {
  const publicDir =
    devWidget === "landmarks-volume" ? path.resolve(devDir, "landmarks-volume/public") : "";
  return {
    name: "serve-landmarks-volume-fixture",
    configureServer(server: { middlewares: { use: Function } }) {
      if (devWidget !== "landmarks-volume") return;
      server.middlewares.use((req, res, next) => {
        if (req.method === "OPTIONS") {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Range");
          res.statusCode = 204;
          res.end();
          return;
        }
        const rangeHeader = req.headers.range;
        if (!rangeHeader || (req.method !== "GET" && req.method !== "HEAD")) {
          next();
          return;
        }
        const rel = decodeURIComponent((req.url ?? "").split("?")[0] ?? "").replace(/^\//, "");
        const filePath = path.join(publicDir, rel);
        if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          next();
          return;
        }
        sendZarrRange(filePath, String(rangeHeader), res);
      });
      server.middlewares.use("/fixture.json", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        fs.createReadStream(path.resolve(devDir, volumeFixtureFile)).pipe(res);
      });
    },
  };
}

const usesViv = devWidget === "landmarks-volume";

export default defineConfig(({ command }) => {
  if (command === "serve") {
    return {
      root: harnessRoot,
      // One dep cache per harness: they pre-bundle different deps (Viv or not), and a
      // shared cache reused by another harness re-optimizes mid-test and reloads the page.
      cacheDir: path.resolve(
        rootDir,
        "node_modules/.vite",
        devWidget === "landmarks-volume"
          ? `landmarks-volume-${volumeProfile}`
          : (devWidget ?? "landmarks"),
      ),
      // Missing OME-Zarr keys must 404. SPA fallback serves index.html (200),
      // and zarrita then fails to parse it instead of opening the v2 store.
      appType: usesViv ? "mpa" : "spa",
      publicDir:
        devWidget === "landmarks-volume"
          ? path.resolve(devDir, "landmarks-volume/public")
          : undefined,
      plugins: [react(), tailwindcss(), serveLandmarksVolumeFixture()],
      define: {
        __MILUME_VOLUME_FIXTURE_FILE__: JSON.stringify(volumeFixtureFile),
      },
      resolve: sharedResolve,
      // Viv harnesses need default dep optimization; landmarks excludes Viv.
      optimizeDeps: usesViv ? undefined : { exclude: ["@hms-dbmi/viv"] },
      server: sharedServer,
    };
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: sharedResolve,
    server: sharedServer,
    // Browser ESM has no Node `process`. polygon-clipping reads optional
    // POLYGON_CLIPPING_* limits via process.env — stub them so the bundled
    // landmarks.mjs never contains a bare `process.env` (pytest guard).
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "process.env.POLYGON_CLIPPING_MAX_QUEUE_SIZE": "undefined",
      "process.env.POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS": "undefined",
    },
    build: {
      outDir,
      emptyOutDir: true,
      lib: {
        entry: entries,
        formats: ["es"],
      },
      rollupOptions: {
        output: {
          entryFileNames: "[name].mjs",
          inlineDynamicImports: singleWidget,
          assetFileNames: (assetInfo) => {
            if (assetInfo.names?.some((name) => name.endsWith(".css"))) {
              return "widgets.css";
            }
            return "[name][extname]";
          },
        },
      },
    },
  };
});
