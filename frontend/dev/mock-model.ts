import type { AnyModel } from "@/widgets/landmarks/helpers";

type Listener = () => void;

/** Minimal traitlets model for notebook-free dev and Impeccable live. */
export function createMockModel(
  initial: Record<string, unknown>,
): AnyModel {
  const state: Record<string, unknown> = { ...initial };
  const listeners = new Map<string, Set<Listener>>();
  const dirty = new Set<string>();

  return {
    get(key: string) {
      return state[key];
    },
    set(key: string, value: unknown) {
      state[key] = value;
      dirty.add(key);
    },
    save_changes() {
      for (const key of dirty) {
        listeners.get(`change:${key}`)?.forEach((cb) => cb());
      }
      dirty.clear();
    },
    on(event: string, callback: Listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(callback);
    },
    off(event: string, callback: Listener) {
      listeners.get(event)?.delete(callback);
    },
  };
}

/**
 * Load ``/fixture.json`` at runtime so Vite does not transform the multi‑MB
 * base64 payload into the module graph (slow cold start / HMR after regen).
 */
function harnessFixtureUrl() {
  if (typeof window === "undefined") return "/fixture.json";
  const fromQuery = new URLSearchParams(window.location.search).get("fixture");
  return fromQuery ? fromQuery : "/fixture.json";
}

export async function loadFixtureModel(url?: string): Promise<AnyModel> {
  const res = await fetch(url ?? harnessFixtureUrl());
  if (!res.ok) {
    throw new Error(`Failed to load harness fixture ${url}: ${res.status}`);
  }
  const initial = (await res.json()) as Record<string, unknown>;
  return createMockModel(initial);
}
