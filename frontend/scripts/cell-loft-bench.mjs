// Headless Chromium bench of the cell-mesh worker (dev/landmarks-volume/loft-bench.html). BASE_URL, OUT.
import { chromium } from "@playwright/test";
import fs from "node:fs";
const browser = await chromium.launch({ args: ["--enable-precise-memory-info"] });
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() !== "debug") console.error("[page]", m.text().slice(0, 300)); });
let bytesIn = 0; page.on("response", async (r) => { bytesIn += Number(r.headers()["content-length"] ?? 0); });
await page.goto(`${process.env.BASE_URL}/loft-bench.html`);
await page.waitForFunction(() => window.benchReady, null, { timeout: 120000 });
const res = await page.evaluate(() => window.runBench());
const ws = page.workers();
res.worker_heap_mb_after_all = ws.length ? await ws[ws.length - 1].evaluate(() => (performance.memory?.usedJSHeapSize ?? null) && performance.memory.usedJSHeapSize / 1e6).catch((e) => String(e)) : null;
res.http_bytes_total = bytesIn;
res.chromium = browser.version();
console.log(JSON.stringify(res, null, 1));
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(res, null, 1));
await browser.close();
