import { useEffect, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import type { AnyModel } from "@/widgets/landmarks/helpers";

import { OptionA } from "./options/a";
import { OptionB } from "./options/b";
import { OptionC } from "./options/c";
import { sceneFromModel } from "./scene";
import type { Scene, TransectOptionId } from "./types";

const OPTIONS: Record<TransectOptionId, (props: { scene: Scene }) => ReactElement> = {
  a: OptionA,
  b: OptionB,
  c: OptionC,
};

function Cursor() {
  const [at, setAt] = useState({ x: -40, y: -40 });
  useEffect(() => {
    const move = (event: PointerEvent) => setAt({ x: event.clientX, y: event.clientY });
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);
  return (
    <svg
      data-testid="transect-cursor"
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

export function TransectMount({
  model,
  option,
}: {
  model: AnyModel;
  option: TransectOptionId;
}) {
  const [plot, setPlot] = useState<HTMLElement | null>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setScene(sceneFromModel(model));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    model.set("show_rulers", false);
    model.save_changes();
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
    const left = document.querySelector<HTMLElement>('[data-testid="panel-collapse-caret-left"]');
    const right = document.querySelector<HTMLElement>('[data-testid="panel-collapse-caret-right"]');
    left?.click();
    right?.click();
    return () => {
      stop = true;
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
        <div className="pointer-events-none absolute inset-0" data-transect-map-slot={option}>
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

export function TransectSwitcher({
  option,
  onChange,
}: {
  option: TransectOptionId;
  onChange: (next: TransectOptionId) => void;
}) {
  return (
    <div className="milume-widget inline-flex items-center gap-1" role="group" aria-label="Transect prototype">
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
