import { useEffect, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import type { AnyModel } from "@/widgets/landmarks/helpers";

import { PseudospaceView } from "./options/view";
import { sceneFromModel, sceneFromState } from "./scene";
import type { PseudospaceOptionId, Scene } from "./types";

const OPTIONS: Record<PseudospaceOptionId, (props: { scene: Scene }) => ReactElement> = {
  a: PseudospaceView,
  b: PseudospaceView,
  c: PseudospaceView,
};

function Cursor() {
  const [at, setAt] = useState({ x: -40, y: -40 });
  useEffect(() => {
    const move = (event: PointerEvent | MouseEvent) => setAt({ x: event.clientX, y: event.clientY });
    window.addEventListener("pointermove", move);
    window.addEventListener("mousemove", move);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("mousemove", move);
    };
  }, []);
  return (
    <svg
      data-testid="pseudospace-cursor"
      aria-hidden
      width="18"
      height="18"
      viewBox="0 0 18 18"
      style={{
        position: "fixed",
        left: at.x,
        top: at.y,
        zIndex: 80,
        pointerEvents: "none",
      }}
    >
      <path d="M1 1 L1 15 L5.2 11.2 L8.2 17 L10.4 16 L7.4 10.2 L13 10.2 Z" fill="#1a1a1a" stroke="#f2f2f2" strokeWidth="1" />
    </svg>
  );
}

export function PseudospaceMount({
  model,
  option = "a",
}: {
  model: AnyModel;
  option?: PseudospaceOptionId;
}) {
  const [plot, setPlot] = useState<HTMLElement | null>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      try {
        const fromModel = sceneFromModel(model);
        if (fromModel.cells.some((cell) => cell.gene > 0)) {
          if (!cancel) setScene(fromModel);
          return;
        }
        // The harness drops the gene matrix unless ?eagerGenes=1. The fixture file still has it.
        const url = new URLSearchParams(window.location.search).get("fixture") || "/fixture.json";
        const res = await fetch(url);
        if (!res.ok) throw new Error(`pseudospace fixture ${url}: ${res.status}`);
        const raw = (await res.json()) as Record<string, unknown>;
        if (!cancel) setScene(sceneFromState(raw));
      } catch (err) {
        if (!cancel) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
    model.set("show_rulers", false);
    model.save_changes();
    return () => {
      cancel = true;
    };
  }, [model]);

  useEffect(() => {
    let stop = false;
    const look = () => {
      if (stop) return;
      const plotHost = document.querySelector<HTMLElement>(".landmarks__plot-host");
      const widget = document.querySelector<HTMLElement>(".milume-widget.landmarks");
      if (plotHost) setPlot(plotHost);
      if (widget) setRoot(widget);
      if (!plotHost || !widget) requestAnimationFrame(look);
    };
    look();
    const hideMinimap = () => {
      document.querySelectorAll<HTMLElement>(".landmarks__chrome-minimap").forEach((el) => {
        el.style.visibility = "hidden";
      });
    };
    hideMinimap();
    const right = document.querySelector<HTMLElement>('[data-testid="panel-collapse-caret-right"]');
    right?.click();
    const timer = window.setTimeout(hideMinimap, 400);
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [option]);

  if (error) {
    return <p className="p-4 text-sm text-destructive">{error}</p>;
  }
  if (!scene || !plot || !root) return null;
  const View = OPTIONS[option];
  return (
    <>
      {createPortal(
        <div className="pointer-events-none absolute inset-0 z-10" data-pseudospace-slot={option}>
          <div className="pointer-events-auto absolute inset-0">
            <View scene={scene} />
          </div>
        </div>,
        plot,
      )}
      {createPortal(<Cursor />, root)}
    </>
  );
}

export function PseudospaceSwitcher({
  option,
  onChange,
}: {
  option: PseudospaceOptionId;
  onChange: (next: PseudospaceOptionId) => void;
}) {
  return (
    <div className="milume-widget inline-flex items-center gap-1" role="group" aria-label="Pseudospace prototype">
      {(["a", "b", "c"] as const).map((id) => (
        <Button
          key={id}
          type="button"
          size="sm"
          variant={id === option ? "default" : "outline"}
          aria-pressed={id === option}
          onClick={() => onChange(id)}
        >
          {id.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}
