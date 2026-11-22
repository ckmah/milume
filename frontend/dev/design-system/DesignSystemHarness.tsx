import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import { ChromeSections } from "./gallery-chrome";
import { DESIGN_SYSTEM_SECTIONS } from "./sections";
import { HarnessThemeProvider, type HarnessTheme } from "./stage";

const STORAGE_KEY = "milume-harness-theme";

function readTheme(): HarnessTheme {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
}

export function DesignSystemHarness() {
  const [widgetTheme, setWidgetTheme] = useState<HarnessTheme>(() => readTheme());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, widgetTheme);
    document.documentElement.dataset.dsTheme = widgetTheme;
    document.documentElement.className =
      widgetTheme === "dark" ? "dark dark-theme" : "light light-theme";
  }, [widgetTheme]);

  return (
    <HarnessThemeProvider theme={widgetTheme}>
      <div className="ds-shell">
        <nav className="ds-nav" aria-label="Components">
          <p className="ds-nav-title">Components</p>
          {DESIGN_SYSTEM_SECTIONS.map(([id, title]) => (
            <a key={id} href={`#${id}`}>
              {title}
            </a>
          ))}
        </nav>
        <main className="ds-main">
          <header className="ds-header">
            <div>
              <h1>milume UI</h1>
              <p className="ds-lede">
                Shipped chrome, one interactive instance each. The toggle switches light and dark.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              data-testid="ds-theme-toggle"
              onClick={() => setWidgetTheme((t) => (t === "dark" ? "light" : "dark"))}
            >
              Widget {widgetTheme === "dark" ? "light" : "dark"}
            </Button>
          </header>
          <ChromeSections />
        </main>
      </div>
    </HarnessThemeProvider>
  );
}
