import { useEffect, type ReactNode } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { Input } from "@base-ui/react/input";
import { ScrollArea } from "@base-ui/react/scroll-area";

import { CHANNEL_COLOR_SWATCHES } from "@/widgets/landmarks/chrome/channel-color-picker";
import { PALETTES, paletteLut, type PaletteName } from "@/widgets/volume-cube/palettes";
import { DataField } from "./scene";
import xenium from "../../issue-103-xenium-fixture.json";

const GENES = (xenium.gene_names as { name: string }[]).map((gene) => gene.name);
const GENE_QUERY = "A";

function ramp(name: PaletteName): string {
  const { data } = paletteLut(name);
  const stops = Array.from({ length: 9 }, (_, index) => {
    const offset = Math.round((index / 8) * 255) * 4;
    return `rgb(${data[offset]} ${data[offset + 1]} ${data[offset + 2]})`;
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

function markSettled() {
  document.documentElement.dataset.bakeoffMotions = "v7";
  document.documentElement.dataset.bakeoffSettled = "true";
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="g-frame g-v7-frame">
      <span className="g-notch g-notch--nw" aria-hidden="true" />
      <span className="g-notch g-notch--ne" aria-hidden="true" />
      <span className="g-notch g-notch--sw" aria-hidden="true" />
      <span className="g-notch g-notch--se" aria-hidden="true" />
      <p className="g-subhead">{title}</p>
      {children}
    </section>
  );
}

function ColorPart() {
  const current = "#3d7dff";
  return (
    <Frame title="DAPI color">
      <div className="g-v7-color">
        <span className="g-swatch" style={{ background: current }} aria-hidden="true" />
        <span>DAPI</span>
      </div>
      <div className="g-v7-swatches" role="listbox" aria-label="Channel colors">
        {CHANNEL_COLOR_SWATCHES.map((swatch) => {
          const on = swatch.value === current;
          return (
            <button
              key={swatch.value}
              type="button"
              className={on ? "g-v7-swatch g-v7-on" : "g-v7-swatch"}
              aria-pressed={on}
              aria-label={swatch.label}
            >
              <span className="g-swatch" style={{ background: swatch.value }} aria-hidden="true" />
              {swatch.label}
            </button>
          );
        })}
      </div>
      <label className="g-v7-field">
        <span className="g-label">Hex</span>
        <Input className="g-v7-input" value={current} spellCheck={false} aria-label="Custom color" />
      </label>
    </Frame>
  );
}

function geneRows(query: string) {
  const q = query.toLocaleLowerCase();
  return GENES.filter((name) => name.toLocaleLowerCase().includes(q));
}

function GeneList({ query }: { query: string }) {
  const rows = geneRows(query);
  return (
    <ScrollArea.Root className="g-v7-scroll">
      <ScrollArea.Viewport className="g-v7-scroll-view">
        <ScrollArea.Content>
          {rows.slice(0, 80).map((name) => {
            const index = name.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
            const before = name.slice(0, index);
            const hit = name.slice(index, index + query.length);
            const after = name.slice(index + query.length);
            return (
              <div key={name} className="g-v7-gene">
                {before}
                <span className="g-v7-hit">{hit}</span>
                {after}
              </div>
            );
          })}
        </ScrollArea.Content>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar className="g-v7-scrollbar" orientation="vertical">
        <ScrollArea.Thumb className="g-v7-scroll-thumb" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}

function GenesPart() {
  const matches = geneRows(GENE_QUERY);
  return (
    <div className="g-v7-split">
      <Frame title={`${GENES.length} genes · ${GENE_QUERY}`}>
        <p className="g-v7-note">{matches.length} matches</p>
        <GeneList query={GENE_QUERY} />
      </Frame>
      <Frame title="ZZZ">
        <p className="g-v7-empty">No genes found.</p>
      </Frame>
      <Frame title="Loading">
        <p className="g-v7-note">Reading the catalogue</p>
        <div className="g-v7-loading" aria-hidden="true" />
      </Frame>
    </div>
  );
}

function ColormapPart() {
  return (
    <div className="g-v7-split">
      <Frame title="Palette">
        <div className="g-v7-menu" role="listbox" aria-label="Colormap">
          {PALETTES.map((name) => {
            const on = name === "gray";
            return (
              <div key={name} className={on ? "g-v7-palette g-v7-on" : "g-v7-palette"} aria-selected={on}>
                <span className="g-v7-ramp" style={{ backgroundImage: ramp(name) }} aria-hidden="true" />
                {name}
              </div>
            );
          })}
        </div>
      </Frame>
      <Frame title="Gray">
        <div className="g-v7-legend">
          <div className="g-v7-legend-scale">
            <span>1</span>
            <span>0</span>
          </div>
          <div className="g-v7-legend-bar" style={{ backgroundImage: ramp("gray").replace("90deg", "0deg") }} />
        </div>
      </Frame>
    </div>
  );
}

function Field({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state?: "focus" | "invalid" | "disabled";
}) {
  return (
    <label className="g-v7-field">
      <span className="g-label">{label}</span>
      <Input
        className="g-v7-input"
        defaultValue={value}
        disabled={state === "disabled"}
        aria-invalid={state === "invalid" || undefined}
        data-focus={state === "focus" ? "true" : undefined}
        spellCheck={false}
      />
    </label>
  );
}

function InputsPart() {
  return (
    <Frame title="crypt-1">
      <div className="g-v7-fields">
        <Field label="Rename" value="crypt-1" />
        <Field label="Rename focus" value="crypt-1" state="focus" />
        <Field label="Rename invalid" value="" state="invalid" />
        <Field label="Rename disabled" value="crypt-1" state="disabled" />
        <Field label="Size" value="4.00" />
        <Field label="Size focus" value="4.00" state="focus" />
        <Field label="Size invalid" value="x" state="invalid" />
        <Field label="Size disabled" value="4.00" state="disabled" />
      </div>
    </Frame>
  );
}

function LayersPart({ kit }: { kit: Record<string, React.ComponentType<Record<string, unknown>>> }) {
  const Collapse = kit.Collapsible as React.ComponentType<Record<string, unknown>>;
  const Trigger = kit.CollapsibleTrigger as React.ComponentType<Record<string, unknown>>;
  const Content = kit.CollapsibleContent as React.ComponentType<Record<string, unknown>>;
  return (
    <Frame title="Layers">
      <Collapse defaultOpen className="g-v7-group">
        <Trigger className="g-v7-group-trigger">
          <ChevronDownIcon aria-hidden="true" />
          Image
        </Trigger>
        <Content className="g-v7-group-body">
          <div className="g-v7-layer">
            <span className="g-swatch" style={{ background: "#3d7dff" }} aria-hidden="true" />
            DAPI
          </div>
          <div className="g-v7-drop" aria-hidden="true" />
          <div className="g-v7-layer g-v7-ghost">
            <span className="g-swatch" style={{ background: "#ff3b3b" }} aria-hidden="true" />
            A channel name long enough to overflow the row
          </div>
        </Content>
      </Collapse>
      <Collapse className="g-v7-group">
        <Trigger className="g-v7-group-trigger">
          <ChevronRightIcon aria-hidden="true" />
          Cells
        </Trigger>
      </Collapse>
    </Frame>
  );
}

function FeedbackPart() {
  return (
    <div className="g-v7-split">
      <Frame title="Loading">
        <p className="g-v7-note">Loading layers</p>
        <div className="g-v7-loading" aria-hidden="true" />
      </Frame>
      <Frame title="Empty">
        <p className="g-v7-empty">No layers</p>
      </Frame>
      <Frame title="Error">
        <p className="g-v7-error">Could not read the volume</p>
      </Frame>
      <section className="g-frame g-toast" role="status">
        <span className="g-notch g-notch--nw" aria-hidden="true" />
        <span className="g-notch g-notch--ne" aria-hidden="true" />
        <span className="g-notch g-notch--sw" aria-hidden="true" />
        <span className="g-notch g-notch--se" aria-hidden="true" />
        <p className="g-v7-toast-title">Saved</p>
        <p className="g-v7-note">Landmarks written.</p>
      </section>
    </div>
  );
}

function FocusPart() {
  return (
    <Frame title="Focus">
      <button type="button" className="g-v7-key" data-focus="true">
        Select
      </button>
      <Input className="g-v7-input" defaultValue="crypt-1" data-focus="true" aria-label="Focused rename" />
      <ScrollArea.Root className="g-v7-scroll">
        <ScrollArea.Viewport className="g-v7-scroll-view">
          <ScrollArea.Content>
            {GENES.slice(0, 24).map((name) => (
              <div key={name} className="g-v7-gene">
                {name}
              </div>
            ))}
          </ScrollArea.Content>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar className="g-v7-scrollbar" orientation="vertical">
          <ScrollArea.Thumb className="g-v7-scroll-thumb" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </Frame>
  );
}

const PARTS = {
  color: ColorPart,
  genes: GenesPart,
  colormap: ColormapPart,
  inputs: InputsPart,
  layers: LayersPart,
  feedback: FeedbackPart,
  focus: FocusPart,
} as const;

export type V7PartName = keyof typeof PARTS;

export function V7Part({
  part,
  kit,
}: {
  part: V7PartName;
  kit: Record<string, React.ComponentType<Record<string, unknown>>>;
}) {
  useEffect(() => {
    markSettled();
  }, [part]);
  const Part = PARTS[part];
  return (
    <div className="g-chrome g-v7" data-bakeoff-scene={part} data-slider="a">
      <DataField />
      <Part kit={kit} />
    </div>
  );
}
