import { createRoot } from "react-dom/client";

import { LayersSlice } from "./bakeoff/panel";
import { ChromeScene, type GameSkin } from "./bakeoff/scene";
import { ShadowStage } from "./bakeoff/shadow-stage";
import { isGameSkin } from "./bakeoff/skins.mjs";
import "./bakeoff/bakeoff.css";

import * as luma from "./bakeoff/generated/base-luma/ui";
import * as maia from "./bakeoff/generated/base-maia/ui";
import * as nova from "./bakeoff/generated/base-nova/ui";
import * as rhea from "./bakeoff/generated/base-rhea/ui";

const KITS = {
  "base-nova": nova,
  "base-maia": maia,
  "base-luma": luma,
  "base-rhea": rhea,
} as const;

type PresetStyle = keyof typeof KITS;

type Backdrop = "solid" | "translucent" | "blur";
type Veil = "60" | "75" | "88";
type Mark = "a" | "b";

type BakeoffQuery = {
  style: PresetStyle | GameSkin;
  theme: "light" | "dark";
  shot: "full" | "close" | "sliders";
  slider: "a" | "b" | "c";
  backdrop: Backdrop | null;
  veil: Veil | null;
  mark: Mark | null;
  page: "notebook" | null;
};

function parseBakeoffQuery(search: string): BakeoffQuery {
  const params = new URLSearchParams(search);
  const rawStyle = params.get("style") ?? "base-nova";
  const style: PresetStyle | GameSkin =
    rawStyle in KITS || isGameSkin(rawStyle) ? rawStyle : "base-nova";
  const theme = params.get("theme") === "light" ? "light" : "dark";
  const rawShot = params.get("shot");
  const shot = rawShot === "close" || rawShot === "sliders" ? rawShot : "full";
  const rawSlider = params.get("slider");
  const slider = rawSlider === "b" || rawSlider === "c" ? rawSlider : "a";
  const rawBackdrop = params.get("backdrop");
  const backdrop: Backdrop | null =
    rawBackdrop === "solid" || rawBackdrop === "translucent" || rawBackdrop === "blur" ? rawBackdrop : null;
  const rawVeil = params.get("veil");
  const veil: Veil | null = rawVeil === "60" || rawVeil === "75" || rawVeil === "88" ? rawVeil : null;
  const rawMark = params.get("mark");
  const mark: Mark | null = rawMark === "a" || rawMark === "b" ? rawMark : null;
  const page = params.get("page") === "notebook" ? "notebook" : null;
  return { style, theme, shot, slider, backdrop, veil, mark, page };
}

const query = parseBakeoffQuery(window.location.search);
const preset = query.style in KITS ? (query.style as PresetStyle) : "base-nova";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("bakeoff: missing #root");

function Page() {
  const game = isGameSkin(query.style);
  return (
    <div
      className={game ? "bakeoff-page bakeoff-page--hug" : "bakeoff-page"}
      data-theme={query.theme}
      data-style={query.style}
      data-page={query.page ?? undefined}
    >
      <p className="bakeoff-caption">
        {query.page === "notebook" ? "light notebook" : `${query.style} · ${query.theme}`}
        {query.backdrop ? ` · ${query.backdrop}` : ""}
        {query.veil ? ` · ${query.veil}%` : ""}
        {query.mark ? ` · ${query.mark.toUpperCase()}` : ""}
        {game && query.shot === "close" ? " · toolbar" : ""}
      </p>
      <ShadowStage
        theme={query.theme}
        styleId={query.style}
        frame={game ? query.shot : undefined}
        slider={query.slider}
        backdrop={query.backdrop ?? undefined}
        veil={query.veil ?? undefined}
        mark={query.mark ?? undefined}
      >
        {game ? (
          <ChromeScene
            kit={nova as never}
            skin={query.style}
            frame={query.shot}
            slider={query.slider}
            backdrop={query.backdrop ?? undefined}
          />
        ) : (
          <LayersSlice kit={KITS[preset] as never} />
        )}
      </ShadowStage>
    </div>
  );
}

createRoot(rootEl).render(<Page />);
