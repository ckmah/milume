import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import { useWidgetPortalContainer } from "@/widgets/landmarks/chrome/use-widget-portal";

import { BakeoffPortalContext } from "./portal";

function adoptedCss(): string {
  return [...document.querySelectorAll("style")]
    .map((node) => node.textContent ?? "")
    .filter(Boolean)
    .join("\n");
}

function useShadowMount() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    let style = shadow.querySelector("style[data-bakeoff-css]");
    if (!style) {
      style = document.createElement("style");
      style.setAttribute("data-bakeoff-css", "");
      shadow.appendChild(style);
    }
    const apply = () => {
      style.textContent = adoptedCss();
    };
    apply();
    let slot = shadow.querySelector<HTMLElement>("[data-bakeoff-mount]");
    if (!slot) {
      slot = document.createElement("div");
      slot.setAttribute("data-bakeoff-mount", "");
      shadow.appendChild(slot);
    }
    setMount(slot);
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return { hostRef, mount };
}

function WidgetTree({
  theme,
  styleId,
  frame,
  backdrop,
  veil,
  mark,
  children,
}: {
  theme: "light" | "dark";
  styleId?: string;
  frame?: "full" | "close" | "sliders";
  backdrop?: "solid" | "translucent" | "blur";
  veil?: "60" | "75" | "88";
  mark?: "a" | "b";
  children: ReactNode;
}) {
  const [wrapRef, portalEl] = useWidgetPortalContainer();
  const game = styleId?.startsWith("game-");
  useLayoutEffect(() => {
    if (!portalEl || !styleId) return;
    portalEl.setAttribute("data-style", styleId);
    if (backdrop) portalEl.setAttribute("data-backdrop", backdrop);
    if (veil) portalEl.setAttribute("data-veil", veil);
    if (mark) portalEl.setAttribute("data-mark", mark);
  }, [portalEl, styleId, backdrop, veil, mark]);
  return (
    <div
      ref={wrapRef}
      data-bakeoff-ready={portalEl ? "true" : "false"}
      data-style={styleId}
      data-backdrop={backdrop}
      data-veil={veil}
      data-mark={mark}
      className={cn("milume-widget landmarks relative", theme === "dark" && "dark")}
      style={{
        width: game ? (frame === "close" ? 780 : frame === "sliders" ? 560 : 1000) : "22rem",
        marginLeft: game ? 0 : 16,
        marginBottom: game ? 12 : 80,
        background: "var(--background)",
        color: "var(--foreground)",
      }}
    >
      <BakeoffPortalContext.Provider value={portalEl}>
        {portalEl ? children : null}
      </BakeoffPortalContext.Provider>
    </div>
  );
}

export function ShadowStage({
  theme,
  styleId,
  frame,
  backdrop,
  veil,
  mark,
  slider,
  children,
}: {
  theme: "light" | "dark";
  styleId?: string;
  frame?: "full" | "close" | "sliders";
  backdrop?: "solid" | "translucent" | "blur";
  veil?: "60" | "75" | "88";
  mark?: "a" | "b";
  slider?: "a" | "b" | "c";
  children: ReactNode;
}) {
  const { hostRef, mount } = useShadowMount();
  return (
    <div ref={hostRef} className="bakeoff-stage-host" data-bakeoff-host data-frame={frame}>
      {mount
        ? createPortal(
            <WidgetTree
              theme={theme}
              styleId={styleId}
              frame={frame}
              backdrop={backdrop}
              veil={veil}
              mark={mark}
            >
              {children}
            </WidgetTree>,
            mount,
          )
        : null}
    </div>
  );
}
