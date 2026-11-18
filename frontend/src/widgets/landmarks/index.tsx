import "@/styles/globals.css";
import "./landmarks.css";

import { createRoot, type Root } from "react-dom/client";

import { LandmarksView } from "./LandmarksView";
import type { AnyModel } from "./helpers";

type RenderContext = {
  model: AnyModel;
  el: HTMLElement;
};

const roots = new WeakMap<HTMLElement, Root>();

function render({ model, el }: RenderContext) {
  el.style.width = "100%";
  el.style.maxWidth = "100%";
  el.style.minWidth = "0";
  el.style.display = "block";
  const existing = roots.get(el);
  if (existing) {
    existing.unmount();
    roots.delete(el);
  }
  const root = createRoot(el);
  roots.set(el, root);
  root.render(<LandmarksView model={model} hostEl={el} />);
  return () => {
    root.unmount();
    if (roots.get(el) === root) roots.delete(el);
  };
}

export default { render };
