import { expect, test, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DESIGN_SYSTEM_SECTIONS } from "../../dev/design-system/sections";

const frontend = join(dirname(fileURLToPath(import.meta.url)), "../..");
const worker = Number(process.env.TEST_PARALLEL_INDEX ?? 0);
const port = 5177 + worker;
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

test("design system sections render in both themes", async ({ page }) => {
  const errors = listen(page);
  await page.goto(url, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "milume UI" })).toBeVisible();

  for (const [id, title] of DESIGN_SYSTEM_SECTIONS) {
    const section = page.locator(`section[data-ds-section="${id}"]`);
    await expect(section).toBeVisible();
    await expect(section.getByRole("heading", { level: 2, name: title })).toBeVisible();
    if (id === "gaps") {
      await expect(section.locator("[data-ds-gap]").first()).toBeVisible();
    } else {
      await expect(section.locator("[data-ds-state]").first()).toBeVisible();
    }
  }

  await expect(page.locator("html")).toHaveAttribute("data-ds-theme", "dark");
  await page.getByTestId("ds-theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-ds-theme", "light");
  await expect(page.locator("section[data-ds-section='icon-buttons']")).toBeVisible();
  await expect(page.locator("section[data-ds-section='buttons']")).toHaveCount(0);

  const layerSwitch = page.getByTestId("ds-layer-switch");
  await expect(layerSwitch).toHaveAttribute("aria-checked", "false");
  await layerSwitch.click();
  await expect(layerSwitch).toHaveAttribute("aria-checked", "true");

  await page.getByTestId("channel-color-DAPI").click();
  await expect(page.getByTestId("channel-color-hex-DAPI")).toBeVisible();

  const hex = page.getByTestId("ds-hex-input");
  await hex.fill("#ff3b3b");
  await expect(hex).toHaveValue("#ff3b3b");
  await hex.fill("zz");
  await expect(page.getByText("Not a hex color")).toBeVisible();

  await page.getByTestId("ds-theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-ds-theme", "dark");

  expect(errors, errors.join("\n")).toEqual([]);
});
