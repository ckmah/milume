import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { BANNED_WIDGET_COLOR_LITERALS } from "../../../scripts/check-widget-design-tokens.mjs";
import { contrastRatio } from "../../../scripts/lib/wcag-contrast.mjs";

function composite(surface, page, alpha) {
  return Math.round(surface * alpha + page * (1 - alpha));
}

function hex(channel) {
  return `#${channel.toString(16).padStart(2, "0").repeat(3)}`;
}

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

test("tactical surface keeps light glass and dark black glass with a 5px blur", () => {
  const css = readFileSync(new URL("../../styles/tactical.css", import.meta.url), "utf8");
  assert.match(css, /--tact-surface: rgb\(214 214 214 \/ 97%\)/);
  assert.match(css, /--tact-surface: rgb\(0 0 0 \/ 65%\)/);
  assert.match(css, /--tact-blur: blur\(5px\)/);
  assert.doesNotMatch(css, /--tact-surface:[^;]*linear-gradient/);

  const lightOnWhite = hex(composite(214, 255, 0.97));
  const darkOnWhite = hex(composite(0, 255, 0.65));
  assert.ok(contrastRatio("#1a1a1a", lightOnWhite) >= 4.5, lightOnWhite);
  assert.ok(contrastRatio("#3a3a3a", lightOnWhite) >= 4.5, "light muted");
  assert.ok(contrastRatio("#f2f2f2", darkOnWhite) >= 4.5, darkOnWhite);
  assert.ok(contrastRatio("#d0d0d0", darkOnWhite) >= 4.5, "dark muted");
  assert.ok(contrastRatio(lightOnWhite, "#ffffff") >= 1.3, "light edge");
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
