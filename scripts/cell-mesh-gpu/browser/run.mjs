// Headless Chromium bench for sn.js. Usage: node run.mjs <names comma> <js,webgpu> [flagset]
// flagset "swiftshader": WebGPU on SwiftShader Vulkan (CPU emulation -- NOT a GPU number).
import { createRequire } from "node:module";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const require = createRequire(new URL("../../../frontend/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const root = path.dirname(new URL(import.meta.url).pathname);
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split("?")[0]));
  fs.stat(f, (e, st) => {
    if (e || !st.isFile()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "content-type": f.endsWith(".js") ? "text/javascript" : f.endsWith(".html") ? "text/html" : "application/octet-stream" });
    fs.createReadStream(f).pipe(r);
  });
}).listen(0, "127.0.0.1");
await new Promise((r) => srv.once("listening", r));
const port = srv.address().port;
const [names = "s1_100", which = "js,webgpu", flags = "swiftshader"] = process.argv.slice(2);
const args = flags === "swiftshader"
  ? ["--enable-unsafe-webgpu", "--enable-features=Vulkan,WebGPU", "--use-webgpu-adapter=swiftshader", "--use-vulkan=swiftshader", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
  : ["--enable-unsafe-webgpu"];
const browser = await chromium.launch({ args, headless: true });
const page = await browser.newPage();
page.on("console", (m) => console.error("[page]", m.text().slice(0, 300)));
page.on("pageerror", (e) => console.error("[pageerror]", e.message.slice(0, 500)));
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForFunction(() => window.ready);
const info = await page.evaluate(async () => {
  if (!navigator.gpu) return { gpu: false };
  const a = await navigator.gpu.requestAdapter();
  return a ? { gpu: true, info: { vendor: a.info?.vendor, architecture: a.info?.architecture, description: a.info?.description }, fallback: a.isFallbackAdapter, features: [...a.features] } : { gpu: true, adapter: null };
});
console.log(JSON.stringify({ chromium: browser.version(), flags, adapter: info }));
for (const n of names.split(",")) {
  const out = await page.evaluate(([n, w]) => window.runBench(n, w), [n, which]);
  console.log(JSON.stringify(out));
}
await browser.close(); srv.close();
