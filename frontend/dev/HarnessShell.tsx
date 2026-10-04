import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AnyModel } from "@/widgets/landmarks/helpers";
import { resetModeDropdownMemory } from "@/widgets/landmarks/chrome/mode-dropdown";
import { LandmarksView } from "@/widgets/landmarks/LandmarksView";

import { loadFixtureModel } from "./mock-model";

type HarnessTheme = "light" | "dark";

const STORAGE_KEY = "milume-harness-theme";

function readStoredTheme(): HarnessTheme {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
}

function applyHarnessTheme(theme: HarnessTheme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark", "dark-theme", "light-theme");
  if (theme === "dark") {
    root.classList.add("dark", "dark-theme");
  } else {
    root.classList.add("light", "light-theme");
  }
  window.localStorage.setItem(STORAGE_KEY, theme);
}

function devShellHeight() {
  return Math.round(Math.min(1400, Math.max(820, window.innerHeight * 0.86)));
}

export function HarnessShell() {
  const [theme, setTheme] = useState<HarnessTheme>(() => readStoredTheme());
  const [hostEl, setHostEl] = useState<HTMLElement | null>(null);
  const [model, setModel] = useState<AnyModel | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    applyHarnessTheme(theme);
  }, [theme]);

  // E2E only: remount the widget on a fresh model without reloading the page,
  // so a worker boots Vite + deck.gl once instead of once per test.
  useEffect(() => {
    (window as unknown as { __harnessReset?: () => Promise<void> }).__harnessReset = async () => {
      resetModeDropdownMemory();
      applyHarnessTheme("dark");
      setTheme("dark");
      setModel(null);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      setModel(await loadFixtureModel());
    };
    return () => {
      delete (window as unknown as { __harnessReset?: unknown }).__harnessReset;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadFixtureModel()
      .then((m) => {
        if (!cancelled) setModel(m);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="harness-shell">
      <div className="harness-toolbar">
        <p className="harness-banner">
          dev harness — not production · marimo notebook preview
        </p>
        <div
          className={cn(
            "milume-widget inline-flex items-center gap-2",
            theme === "dark" && "dark",
          )}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? "Switch to light" : "Switch to dark"}
          </Button>
        </div>
      </div>
      <div className="harness-cell-output">
        {loadError ? (
          <p className="p-4 text-sm text-destructive">{loadError}</p>
        ) : (
          <div ref={setHostEl} className="w-full min-w-0">
            {hostEl && model ? (
              <LandmarksView
                model={model}
                hostEl={hostEl}
                defaultHeight={devShellHeight()}
              />
            ) : (
              <p className="p-4 text-sm text-muted-foreground">Loading fixture…</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
