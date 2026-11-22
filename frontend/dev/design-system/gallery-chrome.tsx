import { useState } from "react";

import type { GeneAggregate } from "@/widgets/landmarks/gene-store";
import { OPEN_CUT } from "@/widgets/landmarks/cube-cut";
import type { CubeCut } from "@/widgets/volume-cube/VolumeCube";
import { DEFAULT_RENDER } from "@/widgets/volume-cube/palettes";
import { CanvasRulers } from "@/widgets/landmarks/chrome/canvas-rulers";
import { ChannelColorPicker } from "@/widgets/landmarks/chrome/channel-color-picker";
import { DepthRail } from "@/widgets/landmarks/chrome/depth-rail";
import { ExplorePanel } from "@/widgets/landmarks/chrome/explore-panel";
import { GeneHeatStrips } from "@/widgets/landmarks/chrome/gene-heat-strips";
import {
  GenesAggregateControl,
  GenesCombobox,
  GenesLoadStatus,
  GenesScaleToggles,
} from "@/widgets/landmarks/chrome/genes-legend";
import { InfoDonut } from "@/widgets/landmarks/chrome/info-donut";
import { InfoPanel } from "@/widgets/landmarks/chrome/info-panel";
import { InfoStackedBar } from "@/widgets/landmarks/chrome/info-stacked-bar";
import { InspectNoVolumePill, InspectToolbar } from "@/widgets/landmarks/chrome/inspect-toolbar";
import { InspectPill } from "@/widgets/landmarks/chrome/inspect-pill";
import { LayersPanel } from "@/widgets/landmarks/chrome/layers-panel";
import { LayersStackSection } from "@/widgets/landmarks/chrome/layers-stack-section";
import { ChromeLoadIndicator } from "@/widgets/landmarks/chrome/load-indicator";
import { MinimapPanel } from "@/widgets/landmarks/chrome/minimap-panel";
import { MinimiseColorChip } from "@/widgets/landmarks/chrome/minimise-color-chip";
import { ModeDropdown } from "@/widgets/landmarks/chrome/mode-dropdown";
import { NumHeatStrip } from "@/widgets/landmarks/chrome/num-heat-strip";
import { ObsRampLegend } from "@/widgets/landmarks/chrome/obs-ramp-legend";
import { PanelCollapseButton, PanelPeekTab } from "@/widgets/landmarks/chrome/panel-peek";
import { PanelSectionHeader } from "@/widgets/landmarks/chrome/panel-section-header";
import { PlotChannelLegend } from "@/widgets/landmarks/chrome/plot-channel-legend";
import { PlotLoadIndicator } from "@/widgets/landmarks/chrome/plot-load-indicator";
import {
  ColorSwatch,
  LayerRow,
  ModeToggle,
  ToolbarDivider,
} from "@/widgets/landmarks/chrome/primitives";
import { SelectionCard } from "@/widgets/landmarks/chrome/selection-card";
import { RasterSection } from "@/widgets/landmarks/chrome/raster-section";
import { RgbCubeLegend } from "@/widgets/landmarks/chrome/rgb-cube-legend";
import { RightChromeStack } from "@/widgets/landmarks/chrome/right-stack";
import { SelectionToolbar } from "@/widgets/landmarks/chrome/selection-toolbar";
import { Topbar } from "@/widgets/landmarks/chrome/topbar";
import {
  IconButtonsSection,
  InputsSection,
  SlidersSection,
  TogglesSection,
  TooltipsSection,
  VolumeCubeSection,
} from "./gallery-ui";
import { ViewCta } from "@/widgets/landmarks/chrome/view-cta";
import { INFO_HEAT_BINS } from "@/widgets/landmarks/chrome/info-stats";

import { DESIGN_SYSTEM_GAPS } from "./sections";
import { harnessModel, ONE_POINT_B64 } from "./fixture";
import { DsSection, StateCell } from "./stage";

const noop = () => {};
const LONG = "A channel name long enough to overflow the row";

const heat = {
  counts: Array.from({ length: INFO_HEAT_BINS }, (_, i) => (i % 5) * 3),
  hues: Array.from({ length: INFO_HEAT_BINS }, (_, i) => i / (INFO_HEAT_BINS - 1)),
  lo: 0,
  hi: 8,
  scaleMax: 8,
  obsMax: 9,
  capped: false,
  diverging: false,
};

const slices = [
  { key: "t0", label: "Epithelium", value: 40, fill: "#3d7dff" },
  { key: "t1", label: "Stroma", value: 20, fill: "#ff8a00" },
];

const cubeCut: CubeCut = [0, 40, 0, 40, 0, 12];

const cubeSettings = {
  open: true,
  imageMode: "additive" as const,
  preset: null,
  resetTick: 0,
  showImage: true,
  showLabels: true,
  render: DEFAULT_RENDER,
  contrast: [0, 255] as [number, number],
  cut: OPEN_CUT,
  bounds: null,
  move: false,
  load: "ready" as const,
  loadError: "",
};

function MapLoadCycle() {
  const [phase, setPhase] = useState<"loading" | "error">("loading");
  return (
    <>
      <ChromeLoadIndicator
        phase={phase}
        message={phase === "loading" ? "Loading map…" : "Could not read the image"}
        testId="harness-load"
      />
      <button
        type="button"
        className="ds-cycle"
        onClick={() => setPhase((next) => (next === "loading" ? "error" : "loading"))}
      >
        {phase === "loading" ? "Show error" : "Show loading"}
      </button>
    </>
  );
}

function PlotLoadCycle() {
  const [phase, setPhase] = useState<"loading" | "error">("loading");
  const bootstrap =
    phase === "loading"
      ? { state: "loading" as const }
      : { state: "error" as const, message: "Deck failed" };
  return (
    <>
      <PlotLoadIndicator bootstrap={bootstrap} />
      <button
        type="button"
        className="ds-cycle"
        onClick={() => setPhase((next) => (next === "loading" ? "error" : "loading"))}
      >
        {phase === "loading" ? "Show error" : "Show loading"}
      </button>
    </>
  );
}

export function ChromeSections() {
  const [mode, setMode] = useState("select");
  const [layersOpen, setLayersOpen] = useState(true);
  const [panelGrouping, setPanelGrouping] = useState(true);
  const [genes, setGenes] = useState(["Epcam", "Col1a1", "Lgr5", "Muc2"]);
  const [scale, setScale] = useState<"independent" | "shared">("independent");
  const [log1p, setLog1p] = useState(false);
  const [aggregate, setAggregate] = useState<GeneAggregate>("mean");
  const [channelColor, setChannelColor] = useState("#3d7dff");
  const [savedWindow, setSavedWindow] = useState(false);
  const base = harnessModel();
  const geneLm = harnessModel({
    color_mode: "continuous",
    active_genes: genes,
    gene_names: [
      { name: "Epcam" },
      { name: "Col1a1" },
      { name: "Lgr5" },
      { name: "Muc2" },
      { name: LONG },
    ],
    gene_scale_mode: scale,
    gene_log1p: log1p,
    setActiveGenes: setGenes,
    setGeneScaleMode: setScale,
    setGeneLog1p: setLog1p,
    setGeneAggregate: setAggregate,
    genes: {
      ...harnessModel().genes,
      aggregate,
      setAggregate,
    },
  });
  const loadingGenes = harnessModel({
    active_genes: ["CD3D", "BADGENE"],
    genes: {
      ...geneLm.genes,
      pending: () => ["CD3D"],
      error: (name: string) => (name === "BADGENE" ? "missing slice" : null),
    },
  });
  const numeric = harnessModel({
    color_mode: "obs",
    legend_title: "nCount_RNA",
    color: "nCount_RNA",
    color_vmin: 0,
    color_vmax: 8,
    point_palette: ["#1a1a1a", "#3d7dff", "#ffd60a", "#ff3b3b"],
    active_genes: [],
  });
  const depth = harnessModel({
    points_data: ONE_POINT_B64,
    z_band_lo_um: 2,
    z_band_hi_um: 10,
    z_focus_um: 6,
  });
  const selected = harnessModel({
    selected_kind: "landmark",
    selected_index: 0,
    mode: "select",
  });

  return (
    <>
      <DsSection
        id="type"
        title="Type"
        note="Tactical type from DESIGN.md. The shipped row mounts inside the widget so IBM Plex Mono and tact tokens apply."
      >
        <StateCell state="Hierarchy" bare>
          <div className="ds-type-list ds-type-list--flat">
            {(
              [
                ["Body", "400 · 0.875rem", "ds-type-body", "12,450 cells in view"],
                [
                  "Section header",
                  "400 · 12px uppercase · landmarks-panel-section-header__label",
                  "landmarks-panel-section-header__label",
                  "Selections",
                ],
                [
                  "Section header, closed",
                  "ink at 45%",
                  "landmarks-panel-section-header__label ds-type-section-label--closed",
                  "Landmarks",
                ],
                ["Tact label", "400 · 10px uppercase", "ds-type-tact-label", "Contrast"],
                ["Tab", "400 · 11px uppercase", "ds-type-tab", "Category"],
                ["Switch", "400 · 10px small-caps", "ds-type-switch", "Off · On"],
                ["Readout", "400 · 11px tabular", "ds-type-readout", "0.42"],
                ["Canvas legend", "400 · 10px", "ds-type-legend", "Region"],
                ["Ruler tick", "400 · 9px", "ds-type-tick", "120"],
              ] as const
            ).map(([role, spec, className, sample]) => (
              <div key={role} className="ds-type-row">
                <div className="ds-type-meta">
                  <div>{role}</div>
                  <div>{spec}</div>
                </div>
                <div className={className}>{sample}</div>
              </div>
            ))}
          </div>
        </StateCell>
      </DsSection>
      <IconButtonsSection />
      <TogglesSection />
      <SlidersSection />

      <DsSection id="dock" title="Dock">
        <StateCell state="Topbar" stageClassName="overflow-x-auto">
          <Topbar
            modes={["select", "lasso", "inspect"]}
            mode={mode}
            onMode={setMode}
            fullscreen={false}
            onToggleFullscreen={noop}
            onZoomIn={noop}
            onZoomOut={noop}
            onReset={noop}
          />
        </StateCell>
        <StateCell state="ModeToggle">
          <ModeToggle modes={["select", "lasso"]} value={mode} onChange={setMode} />
        </StateCell>
        <StateCell state="ModeDropdown">
          <ModeDropdown
            modes={["lasso", "polygon", "rectangle"]}
            mode="lasso"
            onMode={setMode}
            fallbackLabel="Shape"
            menuNoun="shape"
          />
        </StateCell>
        <StateCell state="ViewCta">
          <ViewCta lm={base} minimise={false} onToggleMinimise={noop} />
        </StateCell>
        <StateCell state="Panel edges" stageClassName="h-16">
          <PanelCollapseButton side="left" onCollapse={noop} />
          <PanelPeekTab side="right" onExpand={noop} />
        </StateCell>
        <StateCell state="CanvasRulers" stageClassName="h-40">
          <CanvasRulers lm={harnessModel({ show_rulers: true })} engine={null} />
        </StateCell>
        <StateCell state="MinimapPanel" stageClassName="h-36">
          <MinimapPanel lm={harnessModel({ points_data: ONE_POINT_B64 })} engine={null} />
        </StateCell>
        <StateCell state="DepthRail" stageClassName="h-48 overflow-hidden">
          <DepthRail lm={depth} />
        </StateCell>
        <StateCell state="InspectToolbar" stageClassName="overflow-x-auto">
          <InspectToolbar
            settings={cubeSettings}
            patch={noop}
            labelsAvailable
            cut={cubeCut}
            cutRanges={null}
            onCutLive={noop}
            onCutCommit={noop}
            onContrastCommit={noop}
            onReset={noop}
          />
        </StateCell>
        <StateCell state="SelectionToolbar">
          <SelectionToolbar lm={selected} />
        </StateCell>
        <StateCell state="ToolbarDivider">
          <ToolbarDivider />
        </StateCell>
      </DsSection>

      <DsSection
        id="layers"
        title="Layers"
        note="Dock previews use 22rem to match the multi-open shell width budget."
      >
        <StateCell state="PanelSectionHeader" stageClassName="ds-dock-preview">
          <PanelSectionHeader
            label="Layers"
            open={layersOpen}
            onToggle={() => setLayersOpen((v) => !v)}
            testId="harness-layers"
          />
        </StateCell>
        <StateCell state="LayerRow" stageClassName="ds-dock-preview min-h-24">
          <LayerRow
            active={false}
            color="#3d7dff"
            swatchVariant="selection"
            label="lasso-1"
            onSelect={noop}
            onRename={noop}
            onDelete={noop}
            hoverContent={<SelectionCard lm={base} index={0} snapshot={null} />}
          />
        </StateCell>
        <StateCell
          state="LayersStackSection"
          stageClassName="ds-dock-preview ds-dock-preview--scroll max-h-96"
        >
          <LayersStackSection lm={base} />
        </StateCell>
        <StateCell state="LayersPanel" stageClassName="ds-dock-preview ds-dock-preview--panel">
          <LayersPanel
            lm={base}
            grouping={panelGrouping}
            onGroupingChange={setPanelGrouping}
          />
        </StateCell>
      </DsSection>

      <DsSection id="legends" title="Legends and ramps">
        <StateCell state="ColorSwatch">
          <div className="ds-row">
            <ColorSwatch color="#3d7dff" />
            <ColorSwatch variant="landmark" color="#ff8a00" />
            <ColorSwatch variant="selection" color="#3ddc3d" />
          </div>
        </StateCell>
        <StateCell state="ObsRampLegend">
          <ObsRampLegend lm={numeric} />
        </StateCell>
        <StateCell state="GeneHeatStrips">
          <GeneHeatStrips
            rows={[
              { name: "Epcam", color: "#ff0099", bins: [0.1, 0.4, 0.8, 0.2], pct: 32 },
              { name: "Col1a1", color: "#5cbf00", bins: [0.2, 0.2, 0.2, 0.2], pct: 4 },
            ]}
          />
        </StateCell>
        <StateCell state="NumHeatStrip">
          <NumHeatStrip data={heat} palette={numeric.point_palette} title="nCount_RNA" />
        </StateCell>
        <StateCell state="InfoDonut">
          <InfoDonut slices={slices} scopeCount={60} activeTypeIndex={0} />
        </StateCell>
        <StateCell state="InfoStackedBar">
          <InfoStackedBar slices={slices} activeTypeIndex={0} />
        </StateCell>
        <StateCell state="RgbCubeLegend">
          <RgbCubeLegend labels={["Epcam", "Col1a1", "Lgr5"]} />
        </StateCell>
        <StateCell state="PlotChannelLegend" stageClassName="h-16">
          <PlotChannelLegend lm={geneLm} />
        </StateCell>
      </DsSection>

      <DsSection id="gene-picker" title="Gene picker">
        <StateCell state="GenesCombobox">
          <GenesCombobox lm={geneLm} />
        </StateCell>
        <StateCell state="GenesAggregateControl">
          <GenesAggregateControl lm={geneLm} />
        </StateCell>
        <StateCell state="GenesScaleToggles">
          <GenesScaleToggles lm={geneLm} />
        </StateCell>
        <StateCell state="GenesLoadStatus">
          <GenesLoadStatus lm={loadingGenes} />
        </StateCell>
      </DsSection>

      <DsSection id="color-picker" title="Color picker">
        <StateCell state="ChannelColorPicker" stageClassName="min-h-16">
          <ChannelColorPicker
            name="DAPI"
            color={channelColor}
            onColorChange={(next) => {
              if (next) setChannelColor(next);
            }}
          />
        </StateCell>
        <StateCell state="MinimiseColorChip">
          <MinimiseColorChip lm={base} onExpand={noop} />
        </StateCell>
      </DsSection>

      <TooltipsSection />
      <InputsSection />
      <VolumeCubeSection />

      <DsSection id="panels" title="Panels">
        <StateCell state="ExplorePanel" stageClassName="max-h-96 overflow-auto">
          <ExplorePanel lm={base} />
        </StateCell>
        <StateCell state="InfoPanel" stageClassName="max-h-80 overflow-auto">
          <InfoPanel lm={base} />
        </StateCell>
        <StateCell state="RightChromeStack" stageClassName="max-h-[28rem] overflow-auto">
          <RightChromeStack lm={base} />
        </StateCell>
        <StateCell state="RasterSection">
          <RasterSection
            lm={harnessModel({ render_mode: "raster", mode: "probe", active_genes: [] })}
          />
        </StateCell>
      </DsSection>

      <DsSection id="empty-loading" title="Empty and loading">
        <StateCell state="ChromeLoadIndicator" stageClassName="relative h-36">
          <MapLoadCycle />
        </StateCell>
        <StateCell state="PlotLoadIndicator" stageClassName="relative h-36">
          <PlotLoadCycle />
        </StateCell>
        <StateCell state="InspectPill" stageClassName="overflow-x-auto">
          <InspectPill
            open
            sizeUm={40}
            load={{ state: "ready" }}
            saved={savedWindow}
            canSave
            fullscreen={false}
            onExit={noop}
            onSave={() => setSavedWindow(true)}
            onToggleFullscreen={noop}
            onZoomIn={noop}
            onZoomOut={noop}
            onResetZoom={noop}
          />
        </StateCell>
        <StateCell state="InspectNoVolumePill">
          <InspectNoVolumePill />
        </StateCell>
      </DsSection>

      <DsSection
        id="gaps"
        title="Gaps"
        note="These pieces are not mounted. A later family PR can replace a row with the real component."
      >
        {DESIGN_SYSTEM_GAPS.map((gap) => (
          <div key={gap.component} data-ds-gap={gap.component} className="ds-gap">
            <strong>{gap.component}</strong>
            <span>{gap.reason}</span>
          </div>
        ))}
      </DsSection>
    </>
  );
}

