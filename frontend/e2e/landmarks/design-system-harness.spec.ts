import { expect, test, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DESIGN_SYSTEM_SECTIONS } from "../../dev/design-system/sections";
import { stabilizeUi } from "../helpers";
import { dockCardOverflows, expectSharedPanelInset } from "./panel-edges";

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
  await expect(page.locator("section[data-ds-section='buttons']")).toBeVisible();
  await page.getByTestId("ds-theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-ds-theme", "dark");

  expect(errors, errors.join("\n")).toEqual([]);
});

test("closing a layers section cannot take focus", async ({ page }) => {
  const errors = listen(page);
  await page.goto(url, { waitUntil: "networkidle" });
  const header = page.getByTestId("layers-cells-header");
  await header.scrollIntoViewIfNeeded();
  const controls = await header.getAttribute("aria-controls");
  expect(controls).toBeTruthy();
  await expect(header).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(`[id="${controls}"]`)).toBeAttached();

  await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "false");

  const duringExit = await page.evaluate((id) => {
    const root = document.getElementById(id);
    const slider = root?.querySelector('[data-testid="layer-cells-point-size"]');
    if (!root || !slider) return "unmounted";
    let node: Element | null = slider;
    while (node && node !== root) {
      if (node.hasAttribute("inert")) return "inert";
      node = node.parentElement;
    }
    return "focusable";
  }, controls!);
  expect(duringExit).toBe("inert");

  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate((id) => {
      const root = document.getElementById(id);
      const active = document.activeElement;
      return !!(root && active && root.contains(active));
    }, controls!);
    expect(inside).toBe(false);
  }

  expect(errors, errors.join("\n")).toEqual([]);
});

async function setTheme(page: Page, theme: "light" | "dark") {
  const current = await page.locator("html").getAttribute("data-ds-theme");
  if (current !== theme) await page.getByTestId("ds-theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-ds-theme", theme);
}

test("dock specimens fit their cards in light and dark", async ({ page }) => {
  await stabilizeUi(page);
  await page.goto(url, { waitUntil: "networkidle" });
  for (const theme of ["dark", "light"] as const) {
    await setTheme(page, theme);
    const overflows = await dockCardOverflows(page);
    expect(overflows, `${theme}\n${JSON.stringify(overflows, null, 2)}`).toEqual([]);
  }
});

test("assembled layers panel shares one content inset", async ({ page }) => {
  await stabilizeUi(page);
  await page.goto(url, { waitUntil: "networkidle" });
  const panel = page.locator(".landmarks__layers-panel");
  await expect(panel).toBeVisible();
  await expectSharedPanelInset(panel);
});
