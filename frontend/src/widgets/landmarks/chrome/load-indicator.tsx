import { cn } from "@/lib/utils";

import { FLOAT_PANEL } from "./sections";

export type ChromeLoadPhase = "loading" | "error";

/**
 * Shared loading / error readout for plot and volume chrome. Uses the Inspect
 * pill's shimmer for in-progress text and a thin indeterminate bar.
 */
export function ChromeLoadIndicator({
  phase,
  message,
  testId,
  overlay = false,
  className,
}: {
  phase: ChromeLoadPhase;
  message: string;
  testId: string;
  /** Cover the plot or cube host (pointer-events none). */
  overlay?: boolean;
  className?: string;
}) {
  const loading = phase === "loading";
  return (
    <div
      data-testid={testId}
      data-state={phase}
      role="status"
      aria-live="polite"
      className={cn(
        overlay &&
          "pointer-events-none absolute inset-0 z-[4] flex items-center justify-center bg-[color-mix(in_srgb,var(--lm-bg)_82%,transparent)]",
        className,
      )}
    >
      <div
        className={cn(
          FLOAT_PANEL,
          "flex max-w-[min(18rem,90%)] flex-col gap-2 px-4 py-3 text-center shadow-md",
        )}
      >
        <p
          className={cn(
            "m-0 text-xs font-medium",
            loading ? "text-muted-foreground" : "text-destructive",
          )}
        >
          {loading ? <span className="landmarks__shimmer">{message}</span> : message}
        </p>
        {loading ? (
          <div
            className="landmarks__progress h-1 w-full overflow-hidden rounded-full bg-muted"
            aria-hidden
          >
            <div className="landmarks__progress-bar h-full w-2/5 rounded-full bg-foreground/35" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
