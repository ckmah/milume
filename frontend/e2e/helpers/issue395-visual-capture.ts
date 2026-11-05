import { expect, type Page } from "@playwright/test";

const OVERLAY_ID = "issue395-pointer-overlay";
const CURSOR_GROUP_ID = "issue395-pointer-cursor";

export async function applyIssue395HarnessTheme(page: Page, theme: "light" | "dark") {
  const label = theme === "light" ? "Switch to light" : "Switch to dark";
  const btn = page.getByRole("button", { name: label });
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(250);
  }
  await page.evaluate((t) => {
    const root = document.documentElement;
    root.classList.remove("light", "dark", "dark-theme", "light-theme");
    if (t === "dark") {
      root.classList.add("dark", "dark-theme");
    } else {
      root.classList.add("light", "light-theme");
    }
    root.setAttribute("data-theme", t);
    window.localStorage.setItem("milume-harness-theme", t);
    for (const el of document.querySelectorAll(".milume-widget.landmarks, .landmarks.milume-widget")) {
      el.classList.toggle("dark", t === "dark");
      el.classList.toggle("landmarks--dark", t === "dark");
      el.classList.toggle("landmarks--light", t === "light");
    }
  }, theme);
  await page.waitForTimeout(300);
}

/** Dev-harness stills: force visible light vs dark chrome (reset defaults to dark). */
export async function applyIssue395CaptureChromeTheme(page: Page, theme: "light" | "dark") {
  await applyIssue395HarnessTheme(page, theme);
  const pageBg = theme === "light" ? "#fcfcfd" : "#111113";
  const chromeBg = theme === "light" ? "#f9f9fb" : "#18191b";
  const border = theme === "light" ? "#e5e5e5" : "#3a3a3a";
  const text = theme === "light" ? "#111111" : "#ffffff";
  await page.addStyleTag({
    content: `
      html, body { background: ${pageBg} !important; }
      .landmarks.landmarks--light, .landmarks.landmarks--dark {
        --lm-bg: ${chromeBg} !important;
        --lm-border: ${border} !important;
        --lm-text: ${text} !important;
      }
      .landmarks__chrome-dock, .landmarks__toolbar {
        background: ${chromeBg} !important;
        color: ${text} !important;
        border-color: ${border} !important;
      }
    `,
  });
  await page.waitForTimeout(200);
}

/** Harness theme via `data-theme`, root class, and `--harness-page-bg`. */
export async function assertIssue395HarnessTheme(page: Page, theme: "light" | "dark") {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const root = document.documentElement;
        return {
          attr: root.getAttribute("data-theme"),
          darkClass: root.classList.contains("dark"),
          lightClass: root.classList.contains("light"),
        };
      }),
    )
    .toMatchObject({
      attr: theme,
      darkClass: theme === "dark",
      lightClass: theme === "light",
    });
  const widgetClass = theme === "light" ? "landmarks--light" : "landmarks--dark";
  await expect(page.locator(".milume-widget.landmarks")).toHaveClass(new RegExp(widgetClass));
}

export async function installIssue395PointerOverlay(page: Page) {
  await page.evaluate(({ overlayId, groupId }) => {
    let svg = document.getElementById(overlayId);
    if (!svg) {
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.id = overlayId;
      svg.setAttribute("aria-hidden", "true");
      svg.style.cssText =
        "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483646;overflow:visible";
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.id = groupId;
      g.innerHTML = `<path d="M0 0 L0 22 L6 16 L10 26 L13 24 L8 15 L16 15 Z" fill="#ffffff" stroke="#111111" stroke-width="1.75" stroke-linejoin="round"/>`;
      svg.appendChild(g);
      document.body.appendChild(svg);
    }
  }, { overlayId: OVERLAY_ID, groupId: CURSOR_GROUP_ID });
}

export async function setIssue395PointerPosition(page: Page, x: number, y: number) {
  await installIssue395PointerOverlay(page);
  await page.evaluate(
    ({ groupId, px, py }) => {
      const g = document.getElementById(groupId);
      if (g) g.setAttribute("transform", `translate(${px}, ${py})`);
    },
    { groupId: CURSOR_GROUP_ID, px: x, py: y },
  );
}

export async function issue395PointerMove(page: Page, x: number, y: number, steps = 10) {
  await installIssue395PointerOverlay(page);
  const from = await page.evaluate(() => {
    const g = document.getElementById("issue395-pointer-cursor");
    const t = g?.getAttribute("transform") ?? "translate(0, 0)";
    const m = t.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
    return { x: m ? Number(m[1]) : 0, y: m ? Number(m[2]) : 0 };
  });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const cx = from.x + (x - from.x) * t;
    const cy = from.y + (y - from.y) * t;
    await setIssue395PointerPosition(page, cx, cy);
    await page.mouse.move(cx, cy);
    await page.waitForTimeout(16);
  }
  await setIssue395PointerPosition(page, x, y);
}

export async function issue395PointerClick(page: Page, x: number, y: number) {
  await issue395PointerMove(page, x, y, 12);
  await page.waitForTimeout(80);
  await page.mouse.click(x, y);
  await page.waitForTimeout(60);
}
