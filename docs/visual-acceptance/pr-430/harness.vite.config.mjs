/**
 * Production build of the landmarks-volume harness for PR 430 evidence.
 *
 * This is not the dev server in frontend/vite.config.ts (`command === "serve"`).
 * `vite build` bundles the harness, and `vite preview` serves that dist.
 * The anywidget library build (`npm run build` → milume/static/bundled/landmarks.mjs)
 * is a different entry (`render()` for a notebook). These shots are the harness.
 *
 *   CAPTURE_FRONTEND=frontend CAPTURE_SHA=$(git rev-parse HEAD) CAPTURE_LABEL=pr-head \
 *     node docs/visual-acceptance/pr-430/run.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const frontend = path.resolve(process.env.CAPTURE_FRONTEND ?? path.resolve(import.meta.dirname, "../../../frontend"));
const label = process.env.CAPTURE_LABEL ?? "pr-head";
const sha = process.env.CAPTURE_SHA ?? "unknown";
const outDir = path.resolve(process.env.CAPTURE_DIST ?? path.join("/tmp/milume-pr430", label));
const fixtureFile = path.join(frontend, "dev", "landmarks-volume-fixture.json");
const harnessRoot = path.join(frontend, "dev", "landmarks-volume");

async function loadDefault(specifier) {
  const mod = await import(pathToFileURL(path.join(frontend, "node_modules", specifier)).href);
  return mod.default;
}

const [{ defineConfig }, react, tailwindcss] = await Promise.all([
  import(pathToFileURL(path.join(frontend, "node_modules/vite/dist/node/index.js")).href),
  loadDefault("@vitejs/plugin-react/dist/index.js"),
  loadDefault("@tailwindcss/vite/dist/index.mjs"),
]);

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

function serveFixture() {
  return {
    name: "pr430-serve-fixture",
    configurePreviewServer(server) {
      server.middlewares.use("/fixture.json", (_req, res, next) => {
        if (!fs.existsSync(fixtureFile)) {
          next();
          return;
        }
        res.setHeader("Content-Type", "application/json");
        fs.createReadStream(fixtureFile).pipe(res);
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "build-stamp.json",
        source: JSON.stringify({
          gitSha: sha,
          label,
          mode: "production",
          command: "vite build",
          serve: "vite preview",
          harness: "frontend/dev/landmarks-volume",
          builtAt: new Date().toISOString(),
        }),
      });
    },
  };
}

export default defineConfig({
  root: harnessRoot,
  publicDir: path.join(harnessRoot, "public"),
  cacheDir: path.join(outDir, ".vite-cache"),
  appType: "mpa",
  plugins: [react(), tailwindcss(), serveFixture()],
  resolve: {
    alias: {
      "@": path.join(frontend, "src"),
      ...Object.fromEntries(
        [...deckPackages, ...lumaPackages].map((name) => [name, path.join(frontend, "node_modules", name)]),
      ),
      "@thi.ng/geom-accel": path.join(frontend, "node_modules/@thi.ng/geom-accel"),
      "polygon-clipping": path.join(frontend, "node_modules/polygon-clipping/dist/polygon-clipping.esm.js"),
    },
  },
  define: {
    __MILUME_VOLUME_FIXTURE_FILE__: JSON.stringify("landmarks-volume-fixture.json"),
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env.POLYGON_CLIPPING_MAX_QUEUE_SIZE": "undefined",
    "process.env.POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS": "undefined",
  },
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
  },
  preview: {
    host: "127.0.0.1",
    strictPort: true,
  },
});
