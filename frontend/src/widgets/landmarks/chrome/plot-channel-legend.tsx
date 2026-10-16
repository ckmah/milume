import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { GENE_COLORS, blendHex } from "../helpers";
import type { LandmarksModel } from "../use-landmarks-model";
import { colorSignal } from "./coloring";
import { cubeCornerLabel } from "./rgb-cube";
import { RgbCubeLegend } from "./rgb-cube-legend";

/**
 * Compact gene / embed channel key, parked flush in the info chart well
 * top-right so the plot leads and the key supports without a chip chrome.
 */
export function PlotChannelLegend({ lm }: { lm: LandmarksModel }) {
  const signal = colorSignal(lm);
  if (signal === "genes") return <GenesPlotLegend lm={lm} />;
  if (signal === "embedding") return <EmbedPlotCube lm={lm} />;
  return null;
}

function LegendAnchor({
  children,
  className,
  testId,
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  testId: string;
  /** Cube hover needs pointer events. */
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "absolute top-1 right-2 z-10 flex max-w-[55%] flex-col items-end",
        interactive ? "pointer-events-auto" : "pointer-events-none",
        className,
      )}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

/** Vertical color strip — same footprint as the resting RGB cube. */
function VerticalChannelBar({ colors }: { colors: string[] }) {
  const gradient =
    colors.length === 1
      ? `linear-gradient(to top, var(--background), ${colors[0]})`
      : `linear-gradient(to top, ${colors[0]}, ${blendHex(colors[0], colors[1])}, ${colors[1]})`;

  return (
    <div
      className="h-10 w-2.5 rounded-full"
      style={{ background: gradient }}
      role="img"
      aria-label="Expression scale"
    />
  );
}

function GenesPlotLegend({ lm }: { lm: LandmarksModel }) {
  const selected = lm.active_genes || [];
  if (colorSignal(lm) !== "genes" || !selected.length) return null;

  if (selected.length >= 3) {
    return (
      <LegendAnchor testId="genes-channel-legend" interactive>
        <RgbCubeLegend labels={selected.slice(0, 3)} labelMode="name" />
      </LegendAnchor>
    );
  }

  const colors = selected.map((_, i) => GENE_COLORS[i % GENE_COLORS.length]);
  return (
    <LegendAnchor testId="genes-channel-legend">
      <VerticalChannelBar colors={colors} />
    </LegendAnchor>
  );
}

/** Embed cube in the chart corner — dim labels appear on hover. */
function EmbedPlotCube({ lm }: { lm: LandmarksModel }) {
  const labels = lm.embedding_channel_labels || [];
  if (lm.color_mode !== "embedding" && lm.raster_basis !== "embedding") {
    return null;
  }
  if (!labels.length) return null;

  if (labels.length >= 3) {
    return (
      <LegendAnchor testId="embed-channel-cube" interactive>
        <RgbCubeLegend
          labels={labels.slice(0, 3).map((label, i) => cubeCornerLabel(label, i))}
          labelMode="index"
        />
      </LegendAnchor>
    );
  }

  const colors = labels.map((_, i) => GENE_COLORS[i % GENE_COLORS.length]);
  return (
    <LegendAnchor testId="info-channel-legend">
      <VerticalChannelBar colors={colors} />
    </LegendAnchor>
  );
}
