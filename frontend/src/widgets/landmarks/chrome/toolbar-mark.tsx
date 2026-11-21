import { useEffect } from "react";

const ACTIVE = "[aria-pressed='true'], [data-state='on'], [aria-checked='true'], .landmarks-hit--on";

type MarkState = { x: number; node: HTMLSpanElement };

/**
 * One ink line per active toolbar item, as wide as that button. A new active item springs
 * from the item it replaced. Top and side toolbars draw the line under the
 * item. A toolbar in the lower part of the widget draws it over the item,
 * on the edge that faces the canvas.
 */
export function ToolbarMarks({ root }: { root: HTMLElement | null }) {
  useEffect(() => {
    if (!root) return;
    const attached = new Map<HTMLElement, () => void>();

    const attach = (bar: HTMLElement) => {
      if (attached.has(bar)) return;
      const host = document.createElement("div");
      host.className = "tact-toolbar-marks";
      host.setAttribute("aria-hidden", "true");
      bar.appendChild(host);
      attached.set(bar, runMarks(bar, host));
    };

    const scan = () => {
      root.querySelectorAll<HTMLElement>(".landmarks-toolbar").forEach(attach);
      for (const [bar, stop] of attached) {
        if (!bar.isConnected) {
          stop();
          attached.delete(bar);
        }
      }
    };
    const mo = new MutationObserver(scan);
    mo.observe(root, { childList: true, subtree: true });
    scan();
    return () => {
      mo.disconnect();
      attached.forEach((stop) => stop());
    };
  }, [root]);
  return null;
}

function edgeOf(bar: HTMLElement): "over" | "under" {
  const widget = bar.closest(".landmarks");
  if (!(widget instanceof HTMLElement)) return "under";
  const widgetBox = widget.getBoundingClientRect();
  const barBox = bar.getBoundingClientRect();
  const mid = barBox.top + barBox.height / 2;
  return mid > widgetBox.top + widgetBox.height * 0.62 ? "over" : "under";
}

function actives(bar: HTMLElement, host: HTMLElement): HTMLElement[] {
  return [...bar.querySelectorAll<HTMLElement>(ACTIVE)].filter((el) => {
    if (host.contains(el)) return false;
    if (el.closest(".landmarks-toolbar") !== bar) return false;
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  });
}

function markBox(bar: HTMLElement, el: HTMLElement): { x: number; w: number } {
  const barBox = bar.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  return { x: box.left - barBox.left, w: box.width };
}

function edgeY(bar: HTMLElement, el: HTMLElement, edge: "over" | "under"): number {
  const barBox = bar.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  return edge === "over" ? box.top - barBox.top - 2 : box.bottom - barBox.top;
}

function transformMoves(node: HTMLElement): boolean {
  return getComputedStyle(node)
    .transitionProperty.split(",")
    .some((part) => {
      const name = part.trim();
      return name === "transform" || name === "all";
    });
}

function runMarks(bar: HTMLElement, host: HTMLElement): () => void {
  const states = new Map<HTMLElement, MarkState>();
  const born = new Set<HTMLElement>();
  let raf = 0;

  const place = (node: HTMLSpanElement, x: number, w: number, top: number) => {
    node.style.width = `${w}px`;
    node.style.top = `${top}px`;
    node.style.transform = `translateX(${x}px)`;
  };

  const frame = () => {
    raf = 0;
    if (!bar.isConnected) return;
    const edge = edgeOf(bar);
    host.dataset.edge = edge;
    const next = actives(bar, host);
    const nextSet = new Set(next);
    const leaving = [...states.keys()].filter((el) => !nextSet.has(el));

    for (const el of next) {
      if (states.has(el)) continue;
      const target = markBox(bar, el);
      let from = target.x;
      if (leaving.length) {
        let best = 0;
        let bestDist = Infinity;
        leaving.forEach((old, index) => {
          const dist = Math.abs(states.get(old)!.x - target.x);
          if (dist < bestDist) {
            bestDist = dist;
            best = index;
          }
        });
        const old = leaving.splice(best, 1)[0]!;
        from = states.get(old)!.x;
        states.get(old)!.node.remove();
        states.delete(old);
      }
      const node = document.createElement("span");
      node.className = "tact-toolbar-mark";
      place(node, from, target.w, edgeY(bar, el, edge));
      host.appendChild(node);
      states.set(el, { x: from, node });
      born.add(el);
      if (from !== target.x && transformMoves(node)) {
        requestAnimationFrame(() => {
          if (!node.isConnected) return;
          const nextBox = markBox(bar, el);
          const state = states.get(el);
          if (!state) return;
          state.x = nextBox.x;
          place(node, nextBox.x, nextBox.w, edgeY(bar, el, edgeOf(bar)));
        });
      } else {
        states.get(el)!.x = target.x;
        place(node, target.x, target.w, edgeY(bar, el, edge));
      }
    }

    for (const old of leaving) {
      states.get(old)!.node.remove();
      states.delete(old);
      born.delete(old);
    }

    for (const el of next) {
      if (born.has(el)) {
        born.delete(el);
        continue;
      }
      const state = states.get(el);
      if (!state) continue;
      const target = markBox(bar, el);
      state.x = target.x;
      place(state.node, target.x, target.w, edgeY(bar, el, edge));
    }
  };

  const kick = () => {
    if (raf) return;
    raf = requestAnimationFrame(frame);
  };

  const watch = new MutationObserver(kick);
  watch.observe(bar, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["aria-pressed", "data-state", "aria-checked", "class"],
  });
  const resize = new ResizeObserver(kick);
  resize.observe(bar);
  kick();

  return () => {
    cancelAnimationFrame(raf);
    watch.disconnect();
    resize.disconnect();
    host.remove();
    states.clear();
  };
}
