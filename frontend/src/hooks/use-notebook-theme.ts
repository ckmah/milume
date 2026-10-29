import { useLayoutEffect, useState } from "react";

import { resolveNotebookDark } from "./notebook-theme";

/** Match marimo / Jupyter / Zensical palette on ancestor nodes. */
export function useNotebookTheme(el: HTMLElement | null) {
  const [dark, setDark] = useState(() => resolveNotebookDark(el));

  useLayoutEffect(() => {
    if (!el) return;
    const sync = () => setDark(resolveNotebookDark(el));
    sync();

    const observer = new MutationObserver(sync);
    const observed = new Set<Node>();
    const watch = (node: Node | null | undefined) => {
      if (!node || observed.has(node)) return;
      observed.add(node);
      observer.observe(node, {
        attributes: true,
        attributeFilter: ["class", "data-theme", "data-mode", "data-md-color-scheme", "style"],
      });
    };

    let node: HTMLElement | null = el;
    while (node) {
      watch(node);
      node = node.parentElement;
    }
    watch(document.documentElement);
    watch(document.body);

    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      media?.removeEventListener("change", sync);
    };
  }, [el]);

  return dark;
}

export { mdSchemeIsDark, resolveNotebookDark } from "./notebook-theme";
