import { expect, test, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = join(dirname(fileURLToPath(import.meta.url)), "../..");
const worker = Number(process.env.TEST_PARALLEL_INDEX ?? 0);
const port = 5477 + worker;
const url = `http://127.0.0.1:${port}/`;

let child: ChildProcess | undefined;

async function serverUp(target: string): Promise<boolean> {
  try {
    const res = await fetch(target);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor(target: string) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await serverUp(target)) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`design-system vite did not start on ${target}`);
}

function listen(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.beforeAll(async () => {
  if (await serverUp(url)) return;
  child = spawn(
    "npx",
    ["vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: frontend,
      detached: true,
      stdio: "ignore",
      env: { ...process.env, DEV_WIDGET: "design-system" },
    },
  );
  await waitFor(url);
});

test.afterAll(() => {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      process.kill(child.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
});

test("default slider readouts follow the step", async ({ page }) => {
  const errors = listen(page);
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const readout = (testId: string) =>
    page.getByTestId(testId).locator(".tact-readout");

  await expect(readout("slider-readout-hundredths")).toHaveText("0.50");
  await expect(readout("slider-readout-integer")).toHaveText("12");
  await expect(readout("slider-readout-thousandths")).toHaveText("0.500");
  await expect(readout("slider-readout-binary-step")).toHaveText("0.6");
  await expect(page.getByTestId("slider-readout-capsule").locator(".tact-readout")).toHaveText("42");
  await expect(page.getByTestId("slider-readout-range").locator(".tact-readout")).toHaveText("20–80");
  await expect(page.getByTestId("layer-cells-point-size").locator(".tact-readout")).toHaveText(
    "4.00 px",
  );

  await expect(page.getByRole("slider", { name: "Opacity hundredths" })).toHaveAttribute(
    "aria-valuetext",
    "0.50",
  );
  await expect(page.getByRole("slider", { name: "Count" })).toHaveAttribute("aria-valuetext", "12");
  await expect(page.getByRole("slider", { name: "Fine" })).toHaveAttribute("aria-valuetext", "0.500");
  await expect(page.getByRole("slider", { name: "Stride" })).toHaveAttribute("aria-valuetext", "0.6");

  expect(errors, errors.join("\n")).toEqual([]);
});
