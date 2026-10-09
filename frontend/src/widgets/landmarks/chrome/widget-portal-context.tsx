import { createContext, useContext } from "react";

/** The `.milume-widget` / `.landmarks` root: portaled menus and tooltips render inside it. */
export const WidgetPortalContext = createContext<HTMLElement | null>(null);

export function useWidgetPortal(): HTMLElement | null {
  return useContext(WidgetPortalContext);
}
