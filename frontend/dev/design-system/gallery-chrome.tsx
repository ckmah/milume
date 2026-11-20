import { useState } from "react";
import { EyeIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ColorSelector,
  ColorSelectorItem,
  ColorSelectorList,
} from "@/components/ui/color-selector";
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
  ChromeTooltip,
  ColorSwatch,
  LayerRow,
  ModeToggle,
  ToolbarDivider,
} from "@/widgets/landmarks/chrome/primitives";
import { RasterSection } from "@/widgets/landmarks/chrome/raster-section";
import { RgbCubeLegend } from "@/widgets/landmarks/chrome/rgb-cube-legend";
import { RightChromeStack } from "@/widgets/landmarks/chrome/right-stack";
import { IconBtn, SelectionToolbar, ToolStack } from "@/widgets/landmarks/chrome/selection-toolbar";
import { formatSliderReadout } from "@/widgets/landmarks/chrome/slider-readout";
import {
  TactCapsuleSlider,
  TactSignedSlider,
  TactSliderReset,
  TactSliderRow,
} from "@/widgets/landmarks/chrome/slider-row";
import { FullscreenButton, Topbar, ZoomControls } from "@/widgets/landmarks/chrome/topbar";
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

export function ChromeSections() {
  const [opacity, setOpacity] = useState(0.42);
  const [range, setRange] = useState<number[]>([20, 180]);
  const [signed, setSigned] = useState(-0.15);
  const [mode, setMode] = useState("select");
  const [layersOpen, setLayersOpen] = useState(true);
  const base = harnessModel();
  const geneLm = harnessModel({
    color_mode: "continuous",
    active_genes: ["Epcam", "Col1a1", "Lgr5", "Muc2"],
    gene_names: [
      { name: "Epcam" },
      { name: "Col1a1" },
      { name: "Lgr5" },
      { name: "Muc2" },
      { name: LONG },
    ],
  });
  const loadingGenes = harnessModel({
    active_genes: ["CD3D", "BADGENE"],
    genes: {
      ...geneLm.genes,
      pending: () => ["CD3D"],
      error: (name: string) => (name === "BADGENE" ? "missing slice" : null),
    },
  });
  const emptyGenes = harnessModel({ active_genes: [], gene_names: [], color_mode: "continuous" });
  const numeric = harnessModel({
    color_mode: "obs",
    legend_title: "nCount_RNA",
    color: "nCount_RNA",
    color_vmin: 0,
    color_vmax: 8,
    point_palette: ["#1a1a1a", "#3d7dff", "#ffd60a", "#ff3b3b"],
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
      <DsSection id="icon-buttons" title="Icon buttons">
        <StateCell state="default">
          <div className="ds-row">
            <IconBtn title="Hide" onClick={noop}>
              <EyeIcon />
            </IconBtn>
            <ZoomControls onZoomIn={noop} onZoomOut={noop} onReset={noop} />
            <FullscreenButton fullscreen={false} onToggle={noop} />
          </div>
        </StateCell>
        <StateCell state="active">
          <div className="ds-row">
            <IconBtn title="Hide" active onClick={noop}>
              <EyeIcon />
            </IconBtn>
            <FullscreenButton fullscreen onToggle={noop} />
          </div>
        </StateCell>
        <StateCell state="hover">
          <IconBtn title="Hide" onClick={noop}>
            <EyeIcon />
          </IconBtn>
        </StateCell>
        <StateCell state="focus-visible">
          <IconBtn title="Hide" onClick={noop}>
            <EyeIcon />
          </IconBtn>
        </StateCell>
        <StateCell state="disabled">
          <div className="ds-row">
            <IconBtn title="Hide" disabled onClick={noop}>
              <EyeIcon />
            </IconBtn>
            <TactSliderReset title="Reset opacity" disabled onClick={noop} />
          </div>
        </StateCell>
        <StateCell state="open">
          <ToolStack open panel={<span className="px-2 text-xs">Buffer 12 µm</span>}>
            <IconBtn title="Buffer" active ariaExpanded onClick={noop}>
              <EyeIcon />
            </IconBtn>
          </ToolStack>
        </StateCell>
        <StateCell state="closed">
          <ToolStack open={false} panel={null}>
            <IconBtn title="Buffer" onClick={noop}>
              <EyeIcon />
            </IconBtn>
          </ToolStack>
        </StateCell>
      </DsSection>

      <DsSection id="dock" title="Dock">
        <StateCell state="default" stageClassName="overflow-x-auto">
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
        <StateCell state="active">
          <ModeToggle modes={["select", "lasso"]} value="lasso" onChange={setMode} />
        </StateCell>
        <StateCell state="closed">
          <ModeDropdown
            modes={["lasso", "polygon", "rectangle"]}
            mode="lasso"
            onMode={setMode}
            fallbackLabel="Shape"
            menuNoun="shape"
          />
        </StateCell>
        <StateCell state="default">
          <ViewCta lm={base} minimise={false} onToggleMinimise={noop} />
        </StateCell>
        <StateCell state="active">
          <ViewCta
            lm={harnessModel({ render_mode: "raster", show_rulers: true })}
            minimise
            onToggleMinimise={noop}
          />
        </StateCell>
        <StateCell state="default" stageClassName="h-16">
          <PanelCollapseButton side="left" onCollapse={noop} />
          <PanelPeekTab side="right" onExpand={noop} />
        </StateCell>
        <StateCell state="default" stageClassName="h-40">
          <CanvasRulers lm={harnessModel({ show_rulers: true })} engine={null} />
        </StateCell>
        <StateCell state="empty" stageClassName="h-24">
          <CanvasRulers lm={harnessModel({ show_rulers: false })} engine={null} />
        </StateCell>
        <StateCell state="default" stageClassName="h-36">
          <MinimapPanel lm={harnessModel({ points_data: ONE_POINT_B64 })} engine={null} />
        </StateCell>
        <StateCell state="default" stageClassName="h-48 overflow-hidden">
          <DepthRail lm={depth} />
        </StateCell>
        <StateCell state="empty" stageClassName="h-24 overflow-hidden">
          <DepthRail lm={base} />
        </StateCell>
        <StateCell state="default">
          <TactCapsuleSlider
            caption="Opacity"
            value={opacity}
            min={0}
            max={1}
            step={0.01}
            onValueChange={setOpacity}
            displayValue={formatSliderReadout(opacity, 0.01)}
          />
          <div className="mt-2">
            <TactSliderRow
              caption="Contrast"
              value={range}
              min={0}
              max={255}
              step={1}
              readout={`${formatSliderReadout(range[0]!, 1)}–${formatSliderReadout(range[1]!, 1)}`}
              onValueChange={setRange}
            />
          </div>
          <div className="mt-2">
            <TactSignedSlider value={signed} min={-1} max={1} onChange={setSigned} />
          </div>
        </StateCell>
        <StateCell state="disabled">
          <TactSliderReset title="Reset opacity" disabled onClick={noop} />
        </StateCell>
        <StateCell state="default" stageClassName="overflow-x-auto">
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
        <StateCell state="disabled" stageClassName="overflow-x-auto">
          <InspectToolbar
            settings={{ ...cubeSettings, showLabels: false }}
            patch={noop}
            labelsAvailable={false}
            cut={cubeCut}
            cutRanges={null}
            onCutLive={noop}
            onCutCommit={noop}
            onContrastCommit={noop}
            onReset={noop}
          />
        </StateCell>
        <StateCell state="default">
          <SelectionToolbar lm={selected} />
        </StateCell>
        <StateCell state="empty">
          <SelectionToolbar lm={base} />
        </StateCell>
        <StateCell state="default">
          <ToolbarDivider />
        </StateCell>
      </DsSection>

      <DsSection id="layers" title="Layers">
        <StateCell state="open">
          <PanelSectionHeader
            label="Layers"
            count={3}
            open={layersOpen}
            onToggle={() => setLayersOpen((v) => !v)}
            testId="harness-layers"
          />
        </StateCell>
        <StateCell state="closed">
          <PanelSectionHeader
            label="Layers"
            count={0}
            open={false}
            onToggle={noop}
          />
        </StateCell>
        <StateCell state="active">
          <PanelSectionHeader
            label="Selections"
            count={1}
            open
            onToggle={noop}
            pin={{
              label: LONG,
              color: "#3d7dff",
              onClear: noop,
              clearLabel: "Clear selection",
            }}
          />
        </StateCell>
        <StateCell state="default">
          <LayerRow active={false} color="#3d7dff" label="Epithelium" onSelect={noop} onRename={noop} onDelete={noop} />
        </StateCell>
        <StateCell state="active">
          <LayerRow active color="#ff8a00" label="Stroma" onSelect={noop} />
        </StateCell>
        <StateCell state="hover">
          <LayerRow active={false} color="#3d7dff" label="Epithelium" onSelect={noop} />
        </StateCell>
        <StateCell state="disabled">
          <LayerRow active={false} color="#999" label="Hidden" hidden disabled onSelect={noop} />
        </StateCell>
        <StateCell state="overflow">
          <LayerRow active={false} color="#3d7dff" label={LONG} onSelect={noop} />
        </StateCell>
        <StateCell state="default" stageClassName="max-h-80 overflow-auto">
          <LayersStackSection lm={base} />
        </StateCell>
        <StateCell state="empty">
          <LayersStackSection
            lm={harnessModel({
              category_columns: [],
              volume: undefined,
              _image_channels: [],
            })}
          />
        </StateCell>
        <StateCell state="default" stageClassName="h-72 overflow-auto">
          <LayersPanel lm={base} />
        </StateCell>
      </DsSection>

      <DsSection id="legends" title="Legends and ramps">
        <StateCell state="default">
          <div className="ds-row">
            <ColorSwatch color="#3d7dff" />
            <ColorSwatch variant="landmark" color="#ff8a00" />
            <ColorSwatch variant="selection" color="#3ddc3d" />
            <ColorSwatch />
          </div>
        </StateCell>
        <StateCell state="default">
          <ObsRampLegend lm={numeric} />
        </StateCell>
        <StateCell state="empty">
          <ObsRampLegend lm={base} />
        </StateCell>
        <StateCell state="overflow">
          <ObsRampLegend lm={harnessModel({ ...numeric, legend_title: LONG })} />
        </StateCell>
        <StateCell state="default">
          <GeneHeatStrips
            rows={[
              { name: "Epcam", color: "#ff0099", bins: [0.1, 0.4, 0.8, 0.2], pct: 32 },
              { name: LONG, color: "#5cbf00", bins: [0.2, 0.2, 0.2, 0.2], pct: 4 },
            ]}
          />
        </StateCell>
        <StateCell state="empty">
          <GeneHeatStrips rows={[]} />
        </StateCell>
        <StateCell state="default">
          <NumHeatStrip data={heat} palette={numeric.point_palette} title="nCount_RNA" />
        </StateCell>
        <StateCell state="default">
          <InfoDonut slices={slices} scopeCount={60} activeTypeIndex={0} />
        </StateCell>
        <StateCell state="empty">
          <InfoDonut slices={[]} scopeCount={0} activeTypeIndex={null} />
        </StateCell>
        <StateCell state="default">
          <InfoStackedBar slices={slices} activeTypeIndex={0} />
        </StateCell>
        <StateCell state="empty">
          <InfoStackedBar slices={[]} />
        </StateCell>
        <StateCell state="default">
          <RgbCubeLegend labels={["Epcam", "Col1a1", "Lgr5"]} />
        </StateCell>
        <StateCell state="hover">
          <RgbCubeLegend labels={["Epcam", "Col1a1", "Lgr5"]} />
        </StateCell>
        <StateCell state="focus-visible">
          <RgbCubeLegend labels={["0", "1", "2"]} labelMode="index" />
        </StateCell>
        <StateCell state="default" stageClassName="h-16">
          <PlotChannelLegend lm={geneLm} />
        </StateCell>
        <StateCell state="empty" stageClassName="h-12">
          <PlotChannelLegend lm={base} />
        </StateCell>
      </DsSection>

      <DsSection id="gene-picker" title="Gene picker">
        <StateCell state="default">
          <GenesCombobox lm={geneLm} />
        </StateCell>
        <StateCell state="empty">
          <GenesCombobox lm={emptyGenes} />
        </StateCell>
        <StateCell state="active">
          <GenesAggregateControl lm={geneLm} />
          <GenesScaleToggles lm={geneLm} />
        </StateCell>
        <StateCell state="loading">
          <GenesLoadStatus lm={loadingGenes} />
        </StateCell>
        <StateCell state="error">
          <GenesLoadStatus
            lm={harnessModel({
              active_genes: ["BADGENE"],
              genes: {
                ...base.genes,
                pending: () => [],
                error: () => "missing slice",
              },
            })}
          />
        </StateCell>
        <StateCell state="disabled">
          <GenesScaleToggles
            lm={harnessModel({
              color_mode: "continuous",
              active_genes: ["Epcam"],
              gene_expression_logged: true,
              gene_log1p: true,
            })}
          />
        </StateCell>
      </DsSection>

      <DsSection id="color-picker" title="Color picker">
        <StateCell state="closed">
          <ChannelColorPicker name="DAPI" color="#3d7dff" onColorChange={noop} open={false} />
        </StateCell>
        <StateCell state="open" stageClassName="min-h-52">
          <ChannelColorPicker name="DAPI" color="#3d7dff" onColorChange={noop} open />
        </StateCell>
        <StateCell state="error" stageClassName="min-h-52">
          <ChannelColorPicker name="DAPI" color="zz" onColorChange={noop} open />
        </StateCell>
        <StateCell state="active">
          <ColorSelector value="#ff3b3b" aria-label="Channel color">
            <ColorSelectorList>
              <ColorSelectorItem value="#3d7dff" color="#3d7dff" label="Blue" />
              <ColorSelectorItem value="#ff3b3b" color="#ff3b3b" label="Red" />
            </ColorSelectorList>
          </ColorSelector>
        </StateCell>
        <StateCell state="disabled">
          <ColorSelector value="#3d7dff" disabled aria-label="Channel color">
            <ColorSelectorList>
              <ColorSelectorItem value="#3d7dff" color="#3d7dff" label="Blue" />
            </ColorSelectorList>
          </ColorSelector>
        </StateCell>
        <StateCell state="default">
          <MinimiseColorChip lm={base} onExpand={noop} />
        </StateCell>
        <StateCell state="overflow">
          <MinimiseColorChip
            lm={harnessModel({
              category_columns: [{ name: LONG, labels: ["A", "B"], palette: ["#3d7dff", "#ff8a00"] }],
              active_category: LONG,
            })}
            onExpand={noop}
          />
        </StateCell>
      </DsSection>

      <DsSection id="panels" title="Panels">
        <StateCell state="default" stageClassName="max-h-96 overflow-auto">
          <ExplorePanel lm={base} />
        </StateCell>
        <StateCell state="empty" stageClassName="max-h-64 overflow-auto">
          <ExplorePanel
            lm={harnessModel({
              category_columns: [],
              gene_names: [],
              active_genes: [],
              _numeric_obs_columns: [],
              raster_embedding_keys: [],
            })}
          />
        </StateCell>
        <StateCell state="default" stageClassName="max-h-80 overflow-auto">
          <InfoPanel lm={base} />
        </StateCell>
        <StateCell state="default" stageClassName="max-h-[28rem] overflow-auto">
          <RightChromeStack lm={base} />
        </StateCell>
        <StateCell state="closed">
          <RightChromeStack lm={base} minimise rightCardExpanded={false} />
        </StateCell>
        <StateCell state="default">
          <RasterSection lm={harnessModel({ render_mode: "raster" })} />
        </StateCell>
        <StateCell state="empty">
          <RasterSection lm={base} />
        </StateCell>
      </DsSection>

      <DsSection id="empty-loading" title="Empty and loading">
        <StateCell state="loading" stageClassName="relative h-28">
          <ChromeLoadIndicator phase="loading" message="Loading map…" testId="harness-load" />
        </StateCell>
        <StateCell state="error" stageClassName="relative h-28">
          <ChromeLoadIndicator phase="error" message="Could not read the image" testId="harness-load-error" />
        </StateCell>
        <StateCell state="overflow">
          <ChromeLoadIndicator phase="error" message={LONG} testId="harness-load-long" />
        </StateCell>
        <StateCell state="loading" stageClassName="relative h-28">
          <PlotLoadIndicator bootstrap={{ state: "loading" }} />
        </StateCell>
        <StateCell state="error" stageClassName="relative h-28">
          <PlotLoadIndicator bootstrap={{ state: "error", message: "Deck failed" }} />
        </StateCell>
        <StateCell state="empty" stageClassName="relative h-16">
          <PlotLoadIndicator bootstrap={{ state: "ready" }} />
        </StateCell>
        <StateCell state="loading" stageClassName="overflow-x-auto">
          <InspectPill
            open
            sizeUm={40}
            load={{ state: "refining" }}
            saved={false}
            canSave={false}
            fullscreen={false}
            onExit={noop}
            onSave={noop}
            onToggleFullscreen={noop}
            onZoomIn={noop}
            onZoomOut={noop}
            onResetZoom={noop}
          />
        </StateCell>
        <StateCell state="error" stageClassName="overflow-x-auto">
          <InspectPill
            open
            sizeUm={40}
            load={{ state: "error", message: "Volume missing" }}
            saved={false}
            canSave={false}
            fullscreen={false}
            onExit={noop}
            onSave={noop}
            onToggleFullscreen={noop}
            onZoomIn={noop}
            onZoomOut={noop}
            onResetZoom={noop}
          />
        </StateCell>
        <StateCell state="default" stageClassName="overflow-x-auto">
          <InspectPill
            open
            sizeUm={40}
            load={{ state: "ready" }}
            saved
            canSave
            fullscreen
            onExit={noop}
            onSave={noop}
            onToggleFullscreen={noop}
            onZoomIn={noop}
            onZoomOut={noop}
            onResetZoom={noop}
          />
        </StateCell>
        <StateCell state="disabled" stageClassName="overflow-x-auto">
          <InspectPill
            open
            sizeUm={40}
            load={{ state: "ready" }}
            saved={false}
            canSave={false}
            fullscreen={false}
            onExit={noop}
            onSave={noop}
            onToggleFullscreen={noop}
            onZoomIn={noop}
            onZoomOut={noop}
            onResetZoom={noop}
          />
        </StateCell>
        <StateCell state="empty">
          <InspectNoVolumePill />
        </StateCell>
        <StateCell state="open" stageClassName="min-h-16">
          <ChromeTooltip label="Zoom in" shortcut="=">
            <Button type="button" size="sm" variant="outline">
              Chrome tip
            </Button>
          </ChromeTooltip>
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
