import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Fixed portal host in the widget shadow root so popups keep widget theme tokens. */
export function useWidgetPortalContainer() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const widget = wrapRef.current?.closest(
      ".milume-widget",
    ) as HTMLElement | null;
    if (!widget) return;

    const root = widget.getRootNode();
    const parent =
      root instanceof ShadowRoot
        ? root
        : widget.ownerDocument?.body || document.body;
    let host = parent.querySelector(
      "[data-milume-portal]",
    ) as HTMLElement | null;
    if (!host) {
      host = widget.ownerDocument.createElement("div");
      host.setAttribute("data-milume-portal", "");
      parent.appendChild(host);
    }
    host.className = cn(
      "milume-widget pointer-events-none fixed inset-0 z-50",
      widget.classList.contains("dark") && "dark",
    );
    setPortalEl(host);
  }, []);

  return [wrapRef, portalEl] as const;
}
