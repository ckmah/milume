import { useEffect } from "react";

const ACTIVE = "[aria-pressed='true'], [data-state='on'], [aria-checked='true'], .landmarks-hit--on";
const MARK_W = 14;

type MarkState = { x: number; v: number; node: HTMLSpanElement };

/**
 * One short ink line per active toolbar item. A new active item springs
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

function centerX(bar: HTMLElement, el: HTMLElement): number {
  const barBox = bar.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  return box.left - barBox.left + box.width / 2 - MARK_W / 2;
}

function edgeY(bar: HTMLElement, el: HTMLElement, edge: "over" | "under"): number {
  const barBox = bar.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  return edge === "over" ? box.top - barBox.top - 2 : box.bottom - barBox.top;
}

function runMarks(bar: HTMLElement, host: HTMLElement): () => void {
  const states = new Map<HTMLElement, MarkState>();
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let raf = 0;
  let running = false;
  let last = 0;

  const kick = () => {
    if (running) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  };

  const frame = (now: number) => {
    if (!bar.isConnected) {
      running = false;
      return;
    }
    const dt = last === 0 ? 0.016 : Math.min(0.032, (now - last) / 1000);
    last = now;
    const reduce = motion.matches;
    const edge = edgeOf(bar);
    host.dataset.edge = edge;
    const next = actives(bar, host);
    const nextSet = new Set(next);
    const leaving = [...states.keys()].filter((el) => !nextSet.has(el));

    for (const el of next) {
      if (states.has(el)) continue;
      const target = centerX(bar, el);
      let from = target;
      if (!reduce && leaving.length) {
        let best = 0;
        let bestDist = Infinity;
        leaving.forEach((old, index) => {
          const dist = Math.abs(states.get(old)!.x - target);
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
      host.appendChild(node);
      states.set(el, { x: from, v: 0, node });
    }

    for (const old of leaving) {
      states.get(old)!.node.remove();
      states.delete(old);
    }

    let moving = false;
    for (const el of next) {
      const state = states.get(el);
      if (!state) continue;
      const target = centerX(bar, el);
      if (reduce || dt === 0) {
        state.x = target;
        state.v = 0;
      } else {
        const stiffness = 380;
        const damping = 28;
        const accel = -stiffness * (state.x - target) - damping * state.v;
        state.v += accel * dt;
        state.x += state.v * dt;
        if (Math.abs(state.x - target) > 0.4 || Math.abs(state.v) > 8) moving = true;
        else {
          state.x = target;
          state.v = 0;
        }
      }
      state.node.style.transform = `translateX(${state.x}px)`;
      state.node.style.top = `${edgeY(bar, el, edge)}px`;
    }

    if (moving) raf = requestAnimationFrame(frame);
    else running = false;
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
  const onMotion = () => kick();
  motion.addEventListener("change", onMotion);
  kick();

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    watch.disconnect();
    resize.disconnect();
    motion.removeEventListener("change", onMotion);
    host.remove();
    states.clear();
  };
}
