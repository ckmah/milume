import { createRoot } from "react-dom/client";

import { LayersSlice } from "./bakeoff/panel";
import { ShadowStage } from "./bakeoff/shadow-stage";
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

type StyleId = keyof typeof KITS;

const params = new URLSearchParams(window.location.search);
const style = (params.get("style") ?? "base-nova") as StyleId;
const theme = params.get("theme") === "light" ? "light" : "dark";
const kit = KITS[style] ?? KITS["base-nova"];

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("bakeoff: missing #root");

function Page() {
  return (
    <div className="bakeoff-page" data-theme={theme} data-style={style in KITS ? style : "base-nova"}>
      <p className="bakeoff-caption">
        {style in KITS ? style : "base-nova"} · {theme}
      </p>
      <ShadowStage theme={theme}>
        <LayersSlice kit={kit as never} />
      </ShadowStage>
    </div>
  );
}

createRoot(rootEl).render(<Page />);
