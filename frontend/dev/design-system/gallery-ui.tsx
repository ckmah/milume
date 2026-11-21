import { useState } from "react";
import { BookmarkPlusIcon, EyeIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { parseChannelHex } from "@/widgets/volume-cube/tint-palette";
import { CategoriesControls } from "@/widgets/landmarks/chrome/explore-panel";
import {
  ChromeTooltip,
  chromeHitClass,
  chromeHitTextClass,
} from "@/widgets/landmarks/chrome/primitives";
import { IconBtn, ToolStack } from "@/widgets/landmarks/chrome/selection-toolbar";
import { formatSliderReadout } from "@/widgets/landmarks/chrome/slider-readout";
import {
  TactCapsuleSlider,
  TactSignedSlider,
  TactSliderReset,
  TactSliderRow,
} from "@/widgets/landmarks/chrome/slider-row";
import { FullscreenButton, ZoomControls } from "@/widgets/landmarks/chrome/topbar";
import { cn } from "@/lib/utils";

import { harnessModel } from "./fixture";
import { DsSection, StateCell } from "./stage";

const noop = () => {};

function SliderReadoutSpecimens() {
  const [hundredths, setHundredths] = useState(0.5);
  const [whole, setWhole] = useState(12);
  const [thousandths, setThousandths] = useState(0.5);
  const [stride, setStride] = useState(0.6);
  const loose = 0.1 + 0.2 + 0.4;
  const looseInt = 0.14 * 100;
  const looseMilli = 0.7 + 0.1;
  return (
    <>
      <TactCapsuleSlider
        caption="Opacity"
        aria-label="Opacity hundredths"
        testId="slider-readout-hundredths"
        value={hundredths}
        min={0}
        max={loose}
        step={0.01}
        displayValue={formatSliderReadout(hundredths, 0.01)}
        onValueChange={setHundredths}
      />
      <TactCapsuleSlider
        caption="Count"
        aria-label="Count"
        testId="slider-readout-integer"
        value={whole}
        min={0}
        max={looseInt}
        step={1}
        displayValue={formatSliderReadout(whole, 1)}
        onValueChange={setWhole}
      />
      <TactCapsuleSlider
        caption="Fine"
        aria-label="Fine"
        testId="slider-readout-thousandths"
        value={thousandths}
        min={0}
        max={looseMilli}
        step={0.001}
        displayValue={formatSliderReadout(thousandths, 0.001)}
        onValueChange={setThousandths}
      />
      <TactCapsuleSlider
        caption="Stride"
        aria-label="Stride"
        testId="slider-readout-binary-step"
        value={stride}
        min={0}
        max={1}
        step={0.1 + 0.2}
        displayValue={formatSliderReadout(stride, 0.1 + 0.2)}
        onValueChange={setStride}
      />
    </>
  );
}

function ExploreCategoryRadios() {
  const [name, setName] = useState("cell_type");
  const lm = harnessModel({
    render_mode: "raster",
    raster_basis: "composition",
    active_category: name,
    active_genes: [],
    category_columns: [
      {
        name: "cell_type",
        labels: ["Epithelium", "Stroma"],
        palette: ["#3d7dff", "#ff8a00"],
      },
      {
        name: "region",
        labels: ["Crypt", "Villus"],
        palette: ["#3ddc3d", "#ffd60a"],
      },
    ],
    setActiveCategory: (col) => setName(col.name),
  });
  return <CategoriesControls lm={lm} signal="categories" />;
}

function HexField() {
  const [value, setValue] = useState("#3d7dff");
  const invalid = value.trim().length > 0 && parseChannelHex(value) == null;
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor="ds-hex">Hex</FieldLabel>
      <Input
        id="ds-hex"
        data-testid="ds-hex-input"
        value={value}
        spellCheck={false}
        aria-invalid={invalid || undefined}
        className="h-7 px-2 font-mono text-xs tabular-nums"
        onChange={(event) => setValue(event.target.value)}
      />
      {invalid ? <FieldError>Not a hex color</FieldError> : null}
    </Field>
  );
}

export function IconButtonsSection() {
  const [fullscreen, setFullscreen] = useState(false);
  const [stackOpen, setStackOpen] = useState(false);
  return (
    <DsSection
      id="icon-buttons"
      title="Icon buttons"
      note="Ghost icon hits, plus the ghost text hits Landmarks uses for Reset and Save window."
    >
      <StateCell state="IconBtn">
        <IconBtn title="Hide" onClick={noop}>
          <EyeIcon />
        </IconBtn>
      </StateCell>
      <StateCell state="ZoomControls">
        <div className="ds-row">
          <ZoomControls onZoomIn={noop} onZoomOut={noop} onReset={noop} />
        </div>
      </StateCell>
      <StateCell state="FullscreenButton">
        <FullscreenButton fullscreen={fullscreen} onToggle={() => setFullscreen((v) => !v)} />
      </StateCell>
      <StateCell state="ToolStack">
        <ToolStack open={stackOpen} panel={<span className="px-2 text-xs">Buffer 12 µm</span>}>
          <IconBtn
            title="Buffer"
            active={stackOpen}
            ariaExpanded={stackOpen}
            onClick={() => setStackOpen((v) => !v)}
          >
            <EyeIcon />
          </IconBtn>
        </ToolStack>
      </StateCell>
      <StateCell state="Ghost text">
        <div className="ds-row">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className={cn(chromeHitTextClass, "landmarks-adjust__reset")}
            onClick={noop}
          >
            Reset
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-label="Save window"
            className={cn(chromeHitTextClass, "gap-1 px-2")}
            onClick={noop}
          >
            <BookmarkPlusIcon aria-hidden />
            Save
          </Button>
        </div>
      </StateCell>
    </DsSection>
  );
}

export function TogglesSection() {
  const [visible, setVisible] = useState(false);
  return (
    <DsSection id="toggles" title="Toggles">
      <StateCell state="Switch">
        <Switch
          checked={visible}
          aria-label="Layer visible"
          data-testid="ds-layer-switch"
          onCheckedChange={setVisible}
        />
      </StateCell>
      <StateCell state="RadioGroup">
        <ExploreCategoryRadios />
      </StateCell>
    </DsSection>
  );
}

export function SlidersSection() {
  const [level, setLevel] = useState(42);
  const [range, setRange] = useState<number[]>([20, 80]);
  const [signed, setSigned] = useState(-0.15);
  return (
    <DsSection
      id="sliders"
      title="Sliders"
      note="Tact rows. The first four capsules are the step formats."
    >
      <StateCell state="Tact sliders">
        <div className="flex w-full flex-col gap-2">
          <SliderReadoutSpecimens />
          <TactCapsuleSlider
            caption="Level"
            aria-label="Level"
            testId="slider-readout-capsule"
            value={level}
            min={0}
            max={100}
            step={1}
            displayValue={formatSliderReadout(level, 1)}
            onValueChange={setLevel}
          />
          <TactSliderRow
            caption="Contrast"
            aria-label="Contrast"
            testId="slider-readout-range"
            value={range}
            min={0}
            max={255}
            step={1}
            readout={`${formatSliderReadout(range[0] ?? 0, 1)}–${formatSliderReadout(range[1] ?? 0, 1)}`}
            onValueChange={setRange}
          />
          <TactSignedSlider value={signed} min={-1} max={1} onChange={setSigned} />
          <TactSliderReset title="Reset opacity" onClick={() => setLevel(42)} />
        </div>
      </StateCell>
    </DsSection>
  );
}

export function TooltipsSection() {
  return (
    <DsSection id="tooltips" title="Tooltips">
      <StateCell state="ChromeTooltip">
        <ChromeTooltip label="Zoom in" shortcut="=">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={chromeHitClass}
            aria-label="Zoom in"
            onClick={noop}
          >
            <EyeIcon />
          </Button>
        </ChromeTooltip>
      </StateCell>
    </DsSection>
  );
}

export function InputsSection() {
  return (
    <DsSection id="inputs" title="Inputs">
      <StateCell state="Field">
        <HexField />
      </StateCell>
    </DsSection>
  );
}

export function VolumeCubeSection() {
  return (
    <DsSection
      id="volume-cube"
      title="Volume cube"
      note="Cube-only. The legend badge and the outline Reset are not Landmarks dock chrome."
    >
      <StateCell state="Badge">
        <Badge variant="outline" className="border-white/50 bg-neutral-900/90 text-white">
          <span className="size-2 rounded-full" style={{ backgroundColor: "#3d7dff" }} />
          Epithelium
        </Badge>
      </StateCell>
      <StateCell state="Reset">
        <Button type="button" size="sm" variant="outline" onClick={noop}>
          Reset
        </Button>
      </StateCell>
    </DsSection>
  );
}
