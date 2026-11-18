import type { ReactNode } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { ScrollArea } from "@base-ui/react/scroll-area";

import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CHANNEL_COLOR_SWATCHES } from "@/widgets/landmarks/chrome/channel-color-picker";
import { PALETTES, paletteLut, type PaletteName } from "@/widgets/volume-cube/palettes";
import "@/styles/tactical.css";

import { StateCell } from "./stage";

const GENES = [
  "ACTB",
  "CD3D",
  "CD4",
  "EPCAM",
  "GAPDH",
  "KRT8",
  "MS4A1",
  "PTPRC",
  "SOX2",
  "VIM",
  "AGR2",
  "ALDH1A1",
  "APOA1",
  "AR",
  "ASCL1",
  "BANK1",
  "CD19",
  "CD79A",
  "MKI67",
  "PAX5",
];

const QUERY = "A";

function ramp(name: PaletteName, angle = "90deg"): string {
  const { data } = paletteLut(name);
  const stops = Array.from({ length: 9 }, (_, index) => {
    const offset = Math.round((index / 8) * 255) * 4;
    return `rgb(${data[offset]} ${data[offset + 1]} ${data[offset + 2]})`;
  });
  return `linear-gradient(${angle}, ${stops.join(", ")})`;
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="tact-popup tact-v7-frame">
      <p className="tact-v7-label">{title}</p>
      {children}
    </section>
  );
}

function geneRows(query: string) {
  const q = query.toLocaleLowerCase();
  return GENES.filter((name) => name.toLocaleLowerCase().includes(q));
}

function GeneList({ query }: { query: string }) {
  const rows = query ? geneRows(query) : GENES;
  return (
    <ScrollArea.Root className="tact-v7-scroll">
      <ScrollArea.Viewport className="tact-v7-scroll-view">
        <ScrollArea.Content>
          {rows.map((name) => {
            const index = query ? name.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) : -1;
            if (index < 0) {
              return (
                <div key={name} className="tact-v7-gene">
                  {name}
                </div>
              );
            }
            return (
              <div key={name} className="tact-v7-gene">
                {name.slice(0, index)}
                <span className="tact-v7-hit">{name.slice(index, index + query.length)}</span>
                {name.slice(index + query.length)}
              </div>
            );
          })}
        </ScrollArea.Content>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar className="tact-v7-scrollbar" orientation="vertical">
        <ScrollArea.Thumb className="tact-v7-scroll-thumb" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
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
    <label className="tact-v7-field">
      <span className="tact-v7-label">{label}</span>
      <Input
        className="tact-v7-input"
        defaultValue={value}
        disabled={state === "disabled"}
        aria-invalid={state === "invalid" || undefined}
        data-focus={state === "focus" ? "true" : undefined}
        spellCheck={false}
      />
    </label>
  );
}

export function V7States() {
  const current = "#3d7dff";
  const matches = geneRows(QUERY);
  return (
    <div className="tact-v7">
      <StateCell state="color" stageClassName="min-h-0">
        <Frame title="DAPI color">
          <div className="tact-v7-color">
            <span className="tact-v7-swatch" style={{ background: current }} aria-hidden="true" />
            <span>DAPI</span>
          </div>
          <div className="tact-v7-swatches" role="listbox" aria-label="Channel colors">
            {CHANNEL_COLOR_SWATCHES.map((swatch) => {
              const on = swatch.value === current;
              return (
                <button
                  key={swatch.value}
                  type="button"
                  className={on ? "tact-v7-row tact-v7-on" : "tact-v7-row"}
                  aria-pressed={on}
                  aria-label={swatch.label}
                >
                  <span className="tact-v7-swatch" style={{ background: swatch.value }} aria-hidden="true" />
                  {swatch.label}
                </button>
              );
            })}
          </div>
          <label className="tact-v7-field">
            <span className="tact-v7-label">Hex</span>
            <Input className="tact-v7-input" defaultValue={current} spellCheck={false} aria-label="Custom color" />
          </label>
        </Frame>
      </StateCell>

      <StateCell state="genes" stageClassName="min-h-0">
        <div className="tact-v7-split">
          <Frame title={`${GENES.length} genes · ${QUERY}`}>
            <p className="tact-v7-note">{matches.length} matches</p>
            <GeneList query={QUERY} />
          </Frame>
          <Frame title="ZZZ">
            <p className="tact-v7-empty">No genes found.</p>
          </Frame>
        </div>
      </StateCell>

      <StateCell state="loading" stageClassName="min-h-0">
        <Frame title="Loading">
          <p className="tact-v7-note">Reading the catalogue</p>
          <div className="tact-v7-loading" aria-hidden="true" />
        </Frame>
      </StateCell>

      <StateCell state="colormap" stageClassName="min-h-0">
        <div className="tact-v7-split">
          <Frame title="Palette">
            <div className="tact-v7-menu" role="listbox" aria-label="Colormap">
              {PALETTES.map((name) => {
                const on = name === "gray";
                return (
                  <div key={name} className={on ? "tact-v7-palette tact-v7-on" : "tact-v7-palette"} aria-selected={on}>
                    <span className="tact-v7-ramp" style={{ backgroundImage: ramp(name) }} aria-hidden="true" />
                    {name}
                  </div>
                );
              })}
            </div>
          </Frame>
          <Frame title="Gray">
            <div className="tact-v7-legend">
              <div className="tact-v7-legend-scale">
                <span>1</span>
                <span>0</span>
              </div>
              <div className="tact-v7-legend-bar" style={{ backgroundImage: ramp("gray", "0deg") }} />
            </div>
          </Frame>
        </div>
      </StateCell>

      <StateCell state="inputs" stageClassName="min-h-0">
        <Frame title="crypt-1">
          <div className="tact-v7-fields">
            <Field label="Rename" value="crypt-1" />
            <Field label="Rename focus" value="crypt-1" state="focus" />
            <Field label="Rename invalid" value="" state="invalid" />
            <Field label="Rename disabled" value="crypt-1" state="disabled" />
          </div>
        </Frame>
      </StateCell>

      <StateCell state="layers" stageClassName="min-h-0">
        <Frame title="Layers">
          <Collapsible defaultOpen className="tact-v7-group">
            <CollapsibleTrigger className="tact-v7-group-trigger">
              <ChevronDownIcon aria-hidden="true" />
              Image
            </CollapsibleTrigger>
            <CollapsibleContent className="tact-v7-group-body">
              <div className="tact-v7-layer">
                <span className="tact-v7-swatch" style={{ background: "#3d7dff" }} aria-hidden="true" />
                DAPI
              </div>
              <div className="tact-v7-drop" aria-hidden="true" />
              <div className="tact-v7-layer tact-v7-ghost">
                <span className="tact-v7-swatch" style={{ background: "#ff3b3b" }} aria-hidden="true" />
                A channel name long enough to overflow the row
              </div>
            </CollapsibleContent>
          </Collapsible>
          <Collapsible className="tact-v7-group">
            <CollapsibleTrigger className="tact-v7-group-trigger">
              <ChevronRightIcon aria-hidden="true" />
              Cells
            </CollapsibleTrigger>
          </Collapsible>
        </Frame>
      </StateCell>

      <StateCell state="feedback" stageClassName="min-h-0">
        <div className="tact-v7-split">
          <Frame title="Empty">
            <p className="tact-v7-empty">No layers</p>
          </Frame>
          <Frame title="Error">
            <p className="tact-v7-error">Could not read the volume</p>
          </Frame>
          <section className="tact-popup tact-v7-frame" role="status">
            <p className="tact-v7-toast-title">Saved</p>
            <p className="tact-v7-note">Landmarks written.</p>
          </section>
        </div>
      </StateCell>

      <StateCell state="focus" stageClassName="min-h-0">
        <Frame title="Focus">
          <button type="button" className="tact-v7-key" data-focus="true">
            Select
          </button>
          <Input className="tact-v7-input" defaultValue="crypt-1" data-focus="true" aria-label="Focused rename" />
          <GeneList query="" />
        </Frame>
      </StateCell>
    </div>
  );
}
