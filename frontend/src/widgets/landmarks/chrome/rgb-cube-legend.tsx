import { useMemo } from "react";

import { cn } from "@/lib/utils";

import {
  buildIsoCubeFillUrl,
  cubeCorners,
  LEGEND_CUBE,
} from "./rgb-cube";

function shortLabel(s: string, mode: "name" | "index") {
  const t = String(s || "").trim();
  if (mode === "index") return t.slice(0, 3);
  if (t.length <= 8) return t;
  return `${t.slice(0, 7)}…`;
}

/**
 * Compact RGB cube at rest; hover/focus grows it and reveals channel labels
 * (gene names or embed dim indices). Motion: scale from top-right + label fade.
 */
export function RgbCubeLegend({
  labels,
  className,
  labelMode = "name",
}: {
  labels: string[];
  className?: string;
  /** Genes use names; embed uses short dim indices (0 / 1 / 2). */
  labelMode?: "name" | "index";
}) {
  const o = LEGEND_CUBE;
  const fillUrl = useMemo(() => buildIsoCubeFillUrl(o), []);
  const c = cubeCorners(o);
  const text = [
    shortLabel(labels[0] ?? "0", labelMode),
    shortLabel(labels[1] ?? "1", labelMode),
    shortLabel(labels[2] ?? "2", labelMode),
  ];

  return (
    <div
      className={cn("landmarks-rgb-cube group/cube", className)}
      tabIndex={0}
      role="img"
      aria-label={`RGB cube: ${text.join(", ")}. Hover or focus to enlarge.`}
      data-testid="rgb-cube-legend"
    >
      <svg
        viewBox={`0 0 ${o.vbW} ${o.vbH}`}
        className="landmarks-rgb-cube__svg"
        aria-hidden
      >
        {fillUrl ? (
          <image
            href={fillUrl}
            width={o.vbW}
            height={o.vbH}
            preserveAspectRatio="none"
          />
        ) : null}
        <g className="landmarks-rgb-cube__labels opacity-0 transition-opacity group-hover/cube:opacity-100 group-focus-visible/cube:opacity-100" aria-hidden>
          {/* Channel0 down-left, channel1 down-right, channel2 up. */}
          <text
            x={c.c0.x - 5}
            y={c.c0.y + 4}
            textAnchor="end"
            className="fill-foreground"
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            {text[0]}
          </text>
          <text
            x={c.c1.x + 5}
            y={c.c1.y + 4}
            className="fill-foreground"
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            {text[1]}
          </text>
          <text
            x={c.c2.x}
            y={c.c2.y - 5}
            textAnchor="middle"
            className="fill-foreground"
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            {text[2]}
          </text>
        </g>
      </svg>
    </div>
  );
}
