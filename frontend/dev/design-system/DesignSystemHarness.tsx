import { useEffect, useState } from "react";
import { LayersIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { PanelSectionHeader } from "@/widgets/landmarks/chrome/panel-section-header";
import {
  PANEL_INSET,
  PILL_TABS_TRIGGER,
  STACK_GAP_SM,
} from "@/widgets/landmarks/chrome/sections";
import { ChannelColorPicker } from "@/widgets/landmarks/chrome/channel-color-picker";
import { SoftFloatSlidingTabsList } from "@/widgets/landmarks/chrome/sliding-tabs";
import {
  SoftFloatCapsuleSlider,
  SoftFloatSignedSlider,
  SoftFloatSliderRow,
} from "@/widgets/landmarks/chrome/soft-float-slider";

type HarnessTheme = "light" | "dark";
const STORAGE_KEY = "milume-harness-theme";

function readTheme(): HarnessTheme {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
}

function WidgetStage({
  theme,
  children,
  className,
}: {
  theme: HarnessTheme;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("ds-widget-stage", className)}>
      <div
        className={cn(
          "milume-widget landmarks w-[14rem] rounded-[var(--radius)] p-2.5",
          theme === "dark" && "dark",
        )}
        style={{ background: "var(--background)" }}
      >
        {children}
      </div>
    </div>
  );
}

export function DesignSystemHarness() {
  const [widgetTheme, setWidgetTheme] = useState<HarnessTheme>(() => readTheme());
  const [opacity, setOpacity] = useState(0.42);
  const [range, setRange] = useState<number[]>([0.2, 0.75]);
  const [signed, setSigned] = useState(-0.15);
  const [pillTab, setPillTab] = useState("categories");
  const [layersOpen, setLayersOpen] = useState(true);
  const [channelColor, setChannelColor] = useState("#ff3df0");

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, widgetTheme);
    document.documentElement.dataset.dsTheme = widgetTheme;
  }, [widgetTheme]);

  return (
    <div className="ds-shell">
      <header className="ds-header">
        <h1 className="m-0 text-base font-semibold">milume UI kitchen sink</h1>
        <p className="m-0 text-xs opacity-70">
          DialKit sliders, panels, spacing — widget tokens on{" "}
          <code>.milume-widget</code>
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            setWidgetTheme((t) => (t === "dark" ? "light" : "dark"))
          }
        >
          Widget {widgetTheme === "dark" ? "light" : "dark"}
        </Button>
      </header>

      <div className="ds-cols-3">
        <section className="ds-section" id="sliders">
          <h2 className="ds-section-title">Sliders</h2>
          <WidgetStage theme={widgetTheme} className={STACK_GAP_SM}>
            <SoftFloatCapsuleSlider
              caption="Opacity"
              value={opacity}
              min={0}
              max={1}
              step={0.01}
              onValueChange={setOpacity}
              displayValue={opacity.toFixed(2)}
            />
            <SoftFloatSliderRow
              caption="Contrast"
              value={range}
              min={0}
              max={255}
              step={1}
              readout={`${Math.round(range[0]!)}–${Math.round(range[1]!)}`}
              onValueChange={setRange}
            />
            <SoftFloatSignedSlider
              value={signed}
              min={-1}
              max={1}
              onChange={setSigned}
            />
          </WidgetStage>
        </section>

        <section className="ds-section" id="panels">
          <h2 className="ds-section-title">Panel header</h2>
          <WidgetStage theme={widgetTheme} className="p-0">
            <PanelSectionHeader
              icon={LayersIcon}
              label="Layers"
              count={3}
              open={layersOpen}
              onToggle={() => setLayersOpen((v) => !v)}
              testId="harness-layers"
            />
            {layersOpen ? (
              <div className={cn(PANEL_INSET, "pb-2 text-xs opacity-80")}>
                Panel body uses <code>PANEL_INSET</code>
              </div>
            ) : null}
          </WidgetStage>
        </section>

        <section className="ds-section" id="channel-color">
          <h2 className="ds-section-title">Channel color</h2>
          <div className="flex flex-wrap gap-6">
            <WidgetStage theme={widgetTheme}>
              <p className="m-0 mb-2 text-xs opacity-70">Closed</p>
              <ChannelColorPicker
                name="PanCK"
                color={channelColor}
                onColorChange={(next) => setChannelColor(next ?? "#ff3df0")}
              />
            </WidgetStage>
            <WidgetStage theme={widgetTheme}>
              <p className="m-0 mb-2 text-xs opacity-70">Open</p>
              <ChannelColorPicker
                name="DAPI"
                color="#3d7dff"
                defaultOpen
                onColorChange={() => {}}
              />
            </WidgetStage>
          </div>
        </section>

        <section className="ds-section" id="tabs">
          <h2 className="ds-section-title">Pill tabs</h2>
          <WidgetStage theme={widgetTheme}>
            <Tabs value={pillTab} onValueChange={setPillTab}>
              <SoftFloatSlidingTabsList value={pillTab} aria-label="Mode">
                <TabsTrigger value="categories" className={PILL_TABS_TRIGGER}>
                  Cat
                </TabsTrigger>
                <TabsTrigger value="genes" className={PILL_TABS_TRIGGER}>
                  Genes
                </TabsTrigger>
              </SoftFloatSlidingTabsList>
            </Tabs>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <Switch checked aria-label="Layer visible" />
              <span>Switch pattern</span>
            </div>
          </WidgetStage>
        </section>
      </div>
    </div>
  );
}