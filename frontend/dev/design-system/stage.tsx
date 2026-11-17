import { createContext, useContext, useState, type ReactNode } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { WidgetPortalContext } from "@/widgets/landmarks/chrome/widget-portal-context";

export type HarnessTheme = "light" | "dark";

const ThemeContext = createContext<HarnessTheme>("dark");

export function HarnessThemeProvider({
  theme,
  children,
}: {
  theme: HarnessTheme;
  children: ReactNode;
}) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useHarnessTheme(): HarnessTheme {
  return useContext(ThemeContext);
}

export function WidgetStage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const theme = useHarnessTheme();
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  return (
    <div className="ds-widget-stage">
      <WidgetPortalContext.Provider value={portal}>
        <div
          ref={setPortal}
          className={cn(
            "milume-widget landmarks relative w-full rounded-[var(--radius)] p-2.5",
            theme === "dark" && "dark",
            className,
          )}
          style={{ background: "var(--background)" }}
        >
          <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
        </div>
      </WidgetPortalContext.Provider>
    </div>
  );
}

/** Ancestor class forces raw `:hover` / `:focus-visible` rules from landmarks.css. */
export function ForceState({
  state,
  children,
}: {
  state: string;
  children: ReactNode;
}) {
  const cls =
    state === "hover"
      ? "ds-force-hover"
      : state === "focus-visible"
        ? "ds-force-focus"
        : state === "active"
          ? "ds-force-active"
          : undefined;
  return <div className={cls}>{children}</div>;
}

export function StateCell({
  state,
  children,
  stageClassName,
}: {
  state: string;
  children: ReactNode;
  stageClassName?: string;
}) {
  return (
    <div data-ds-state={state}>
      <div className="ds-state-label">{state}</div>
      <WidgetStage className={stageClassName}>
        <ForceState state={state}>{children}</ForceState>
      </WidgetStage>
    </div>
  );
}

export function DsSection({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="ds-section" id={id} data-ds-section={id}>
      <h2 className="ds-section-title">{title}</h2>
      {note ? <p className="ds-note">{note}</p> : null}
      <div className="ds-state-grid">{children}</div>
    </section>
  );
}
