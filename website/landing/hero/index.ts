import { mountHero } from "./mount.ts";

declare global {
  interface Window {
    __milumeHeroMount?: typeof mountAll;
    __milumeHeroHandles?: Array<import("./mount.ts").HeroHandle & { getFrameId?: () => number }>;
  }
}

export async function mountAll(): Promise<void> {
  const roots = document.querySelectorAll<HTMLElement>("[data-milume-hero]");
  const handles = [];
  for (const root of roots) {
    handles.push(await mountHero(root));
  }
  window.__milumeHeroHandles = handles;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    mountAll().catch(() => {
      /* poster remains visible */
    });
  });
} else {
  mountAll().catch(() => {
    /* poster remains visible */
  });
}

window.__milumeHeroMount = mountAll;
