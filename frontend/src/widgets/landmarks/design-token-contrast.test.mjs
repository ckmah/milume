import assert from "node:assert/strict";
import test from "node:test";

import { BANNED_WIDGET_COLOR_LITERALS } from "../../scripts/check-widget-design-tokens.mjs";
import { contrastRatio } from "../../scripts/lib/wcag-contrast.mjs";

test("banned token list covers Tailwind slate and cyan fallback", () => {
  for (const hex of [
    "#e2e8f0",
    "#1e293b",
    "#64748b",
    "#94a3b8",
    "#0f172a",
    "#f1f5f9",
    "#f8fafc",
    "#22d3ee",
  ]) {
    assert.ok(
      BANNED_WIDGET_COLOR_LITERALS.some((b) => b.toLowerCase() === hex),
      hex,
    );
  }
});

test("lm-caption proxy meets 4.5:1 on glass panel fill", () => {
  /** Resolved `--lm-caption` on dark glass (canvas 1×1 fillStyle probe). */
  const glass = (card, plot) => {
    const mix = (a, b, t) => Math.round(a * t + b * (1 - t));
    const parse = (hex) => [
      Number.parseInt(hex.slice(1, 3), 16),
      Number.parseInt(hex.slice(3, 5), 16),
      Number.parseInt(hex.slice(5, 7), 16),
    ];
    const [cr, cg, cb] = parse(card);
    const [pr, pg, pb] = parse(plot);
    const t = 0.88;
    const rgb = [mix(cr, pr, t), mix(cg, pg, t), mix(cb, pb, t)];
    return `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  };
  const cases = [
    { theme: "light", fg: "#484848", card: "#ffffff", plot: "#e8e8e8" },
    { theme: "dark", fg: "#b8b8b8", card: "#111111", plot: "#141414" },
  ];
  for (const { theme, fg, card, plot } of cases) {
    const bg = glass(card, plot);
    const ratio = contrastRatio(fg, bg);
    assert.ok(ratio >= 4.5, `${theme} ${ratio.toFixed(2)}:1 on ${bg}`);
  }
});
