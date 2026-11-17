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

type BakeoffQuery = {
  style: PresetStyle | GameSkin;
  theme: "light" | "dark";
  shot: "full" | "close";
};

function parseBakeoffQuery(search: string): BakeoffQuery {
  const params = new URLSearchParams(search);
  const rawStyle = params.get("style") ?? "base-nova";
  const style: PresetStyle | GameSkin =
    rawStyle in KITS || isGameSkin(rawStyle) ? rawStyle : "base-nova";
  const theme = params.get("theme") === "light" ? "light" : "dark";
  const shot = params.get("shot") === "close" ? "close" : "full";
  return { style, theme, shot };
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
    >
      <p className="bakeoff-caption">
        {query.style} · {query.theme}
        {game && query.shot === "close" ? " · toolbar" : ""}
      </p>
      <ShadowStage theme={query.theme} styleId={query.style} frame={game ? query.shot : undefined}>
        {game ? (
          <ChromeScene kit={nova as never} skin={query.style} frame={query.shot} />
        ) : (
          <LayersSlice kit={KITS[preset] as never} />
        )}
      </ShadowStage>
    </div>
  );
}

createRoot(rootEl).render(<Page />);
