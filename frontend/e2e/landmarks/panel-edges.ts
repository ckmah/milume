import { expect, type Locator, type Page } from "@playwright/test";

const TOL = 1;

type BoxOverflow = {
  state: string;
  index: number;
  scrollWidth: number;
  scrollHeight: number;
  specimen: string;
  offenders: string[];
};

type Edge = { name: string; delta: number };

const SECTION_LABEL: Record<string, string> = {
  selections: "Selections",
  landmarks: "Landmarks",
  layers: "Layers",
};

export async function dockCardOverflows(page: Page): Promise<BoxOverflow[]> {
  return page.evaluate((tol) => {
    const section = document.querySelector("section[data-ds-section='dock']");
    if (!section) return [];
    const cards = [...section.querySelectorAll("[data-ds-state]")];
    const out: BoxOverflow[] = [];
    cards.forEach((cell, index) => {
      const card = cell.querySelector(".milume-widget");
      if (!(card instanceof HTMLElement)) {
        out.push({
          state: cell.getAttribute("data-ds-state") || "",
          index,
          scrollWidth: 0,
          scrollHeight: 0,
          specimen: "missing card",
          offenders: ["no widget card"],
        });
        return;
      }
      const cr = card.getBoundingClientRect();
      const offenders: { text: string; worst: number }[] = [];
      const visit = (el: Element) => {
        for (const child of el.children) {
          if (!(child instanceof Element)) continue;
          const style = getComputedStyle(child);
          if (style.display === "none" || style.visibility === "hidden")
            continue;
          const r = child.getBoundingClientRect();
          const right = r.right - cr.right;
          const bottom = r.bottom - cr.bottom;
          const left = cr.left - r.left;
          const top = cr.top - r.top;
          const worst = Math.max(right, bottom, left, top);
          if ((r.width >= 1 || r.height >= 1) && worst > tol) {
            const testid = child.getAttribute("data-testid");
            const name =
              testid ||
              (typeof child.className === "string"
                ? child.className.split(" ").slice(0, 2).join(".")
                : "") ||
              child.tagName.toLowerCase();
            offenders.push({
              text: `${name} right ${right.toFixed(1)} bottom ${bottom.toFixed(1)} left ${left.toFixed(1)} top ${top.toFixed(1)}`,
              worst,
            });
          }
          visit(child);
        }
      };
      visit(card);
      const scrollWidth = card.scrollWidth - card.clientWidth;
      const scrollHeight = card.scrollHeight - card.clientHeight;
      if (scrollWidth > tol || scrollHeight > tol || offenders.length) {
        offenders.sort((a, b) => b.worst - a.worst);
        out.push({
          state: cell.getAttribute("data-ds-state") || "",
          index,
          scrollWidth: Math.round(scrollWidth * 10) / 10,
          scrollHeight: Math.round(scrollHeight * 10) / 10,
          specimen: (card.innerText || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 60),
          offenders: offenders.slice(0, 6).map((item) => item.text),
        });
      }
    });
    return out;
  }, TOL);
}

function panelEdges(root: HTMLElement): Edge[] {
  const anchor = root.querySelector("[data-testid='panel-section-layers']");
  const box = anchor?.closest("section")?.parentElement;
  if (!(box instanceof HTMLElement))
    return [{ name: "content-edge", delta: Number.NaN }];
  const style = getComputedStyle(box);
  const rect = box.getBoundingClientRect();
  const edge =
    rect.right -
    (parseFloat(style.borderRightWidth) || 0) -
    (parseFloat(style.paddingRight) || 0);
  const edges: Edge[] = [];
  const push = (name: string, el: Element | null | undefined) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    edges.push({ name, delta: Math.round((r.right - edge) * 100) / 100 });
  };

  root.querySelectorAll("[data-testid^='panel-section-']").forEach((header) => {
    const id = header.getAttribute("data-testid") || "header";
    push(`chevron:${id}`, header.querySelector("button[aria-expanded]"));
    push(`divider:${id}`, header.closest("section"));
  });

  root.querySelectorAll("[role='listitem']").forEach((row, index) => {
    const label =
      (row.textContent || "").replace(/\s+/g, " ").trim().slice(0, 24) ||
      String(index);
    push(`row:${label}`, row);
    push(
      `menu:${label}`,
      row.querySelector("button[aria-label='Layer actions']"),
    );
  });

  root.querySelectorAll("[role='switch']").forEach((control) => {
    push(`switch:${control.getAttribute("aria-label") || "switch"}`, control);
  });

  root
    .querySelectorAll(
      "[data-testid='layers-cells-row'], [data-testid='layers-image-header']",
    )
    .forEach((row) => {
      push(`highlight:${row.getAttribute("data-testid")}`, row);
    });

  const slider = root.querySelector("[data-testid='layer-cells-point-size']");
  push("slider:point-size", slider);
  push("slider:track", slider?.querySelector(".dialkit-slider"));
  const value = slider?.querySelector(".dialkit-slider-value");
  if (value && slider) {
    const valueRight = value.getBoundingClientRect().right;
    const track = slider.querySelector(".dialkit-slider");
    const trackRight = track
      ? track.getBoundingClientRect().right
      : slider.getBoundingClientRect().right;
    if (Math.abs(valueRight - trackRight) <= 8) push("slider:value", value);
  }

  return edges;
}

function formatEdges(edges: Edge[]): string {
  return edges
    .map(
      (edge) =>
        `${edge.name} ${Number.isFinite(edge.delta) ? edge.delta.toFixed(1) : "missing"}px`,
    )
    .join("\n");
}

async function openSection(panel: Locator, id: string) {
  const label = SECTION_LABEL[id];
  const toggle = panel.getByRole("button", {
    name: new RegExp(`^(Expand|Collapse) ${label}$`),
  });
  await toggle.click();
  await expect(
    panel.getByRole("button", { name: `Collapse ${label}` }),
  ).toBeVisible();
}

export async function expectSharedPanelInset(panel: Locator) {
  await panel.scrollIntoViewIfNeeded();

  await openSection(panel, "selections");
  let edges = await panel.evaluate(panelEdges);
  let bad = edges.filter(
    (edge) => !Number.isFinite(edge.delta) || Math.abs(edge.delta) > TOL,
  );
  if (!edges.some((edge) => edge.name.startsWith("menu:"))) {
    bad = [...bad, { name: "menu:missing", delta: Number.NaN }];
  }
  expect(bad, formatEdges(edges)).toEqual([]);

  await openSection(panel, "landmarks");
  edges = await panel.evaluate(panelEdges);
  bad = edges.filter(
    (edge) => !Number.isFinite(edge.delta) || Math.abs(edge.delta) > TOL,
  );
  if (!edges.some((edge) => edge.name.startsWith("menu:"))) {
    bad = [...bad, { name: "menu:missing", delta: Number.NaN }];
  }
  expect(bad, formatEdges(edges)).toEqual([]);

  await openSection(panel, "layers");
  const slider = panel.getByTestId("layer-cells-point-size");
  if (!(await slider.isVisible())) {
    await panel.getByTestId("layers-cells-header").click();
  }
  await expect(slider).toBeVisible();
  const track = slider.locator(".dialkit-slider");
  await expect(track).toBeVisible();
  const trackBox = await track.boundingBox();
  expect(trackBox?.height ?? 0).toBeGreaterThan(16);
  edges = await panel.evaluate(panelEdges);
  bad = edges.filter(
    (edge) => !Number.isFinite(edge.delta) || Math.abs(edge.delta) > TOL,
  );
  if (
    !edges.some(
      (edge) =>
        edge.name === "slider:point-size" || edge.name === "slider:track",
    )
  ) {
    bad = [...bad, { name: "slider:missing", delta: Number.NaN }];
  }
  if (!edges.some((edge) => edge.name.startsWith("switch:"))) {
    bad = [...bad, { name: "switch:missing", delta: Number.NaN }];
  }
  expect(bad, formatEdges(edges)).toEqual([]);
}
