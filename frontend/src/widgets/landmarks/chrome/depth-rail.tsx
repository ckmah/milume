import { cn } from "@/lib/utils";

import { FLOAT_PANEL } from "./sections";

/**
 * Reserved 58×220 chrome slot for the depth rail (#122). Layout-only placeholder in #393.
 */
export function DepthRail() {
  return (
    <div
      className={cn(FLOAT_PANEL, "landmarks-depth-rail landmarks-depth-rail--placeholder")}
      data-testid="depth-rail-placeholder"
      aria-hidden
    />
  );
}
