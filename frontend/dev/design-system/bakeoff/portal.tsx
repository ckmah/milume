import { createContext, useContext } from "react";

/** Portal host inside the bakeoff shadow root. Catalog popups do not take `container`. */
export const BakeoffPortalContext = createContext<HTMLElement | null>(null);

export function useBakeoffPortal(): HTMLElement | null {
  return useContext(BakeoffPortalContext);
}
