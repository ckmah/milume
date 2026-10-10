import type { AnyModel } from "@/widgets/landmarks/helpers";
import { isCommVolumeUrl } from "@/widgets/volume-cube/volume-url";

type Listener = () => void;

type CustomHandler = (msg: unknown, buffers?: ArrayBuffer[]) => void;

/** Minimal traitlets model for notebook-free dev and Impeccable live. */
export function createMockModel(
  initial: Record<string, unknown>,
  options: { volumeStaticRoot?: string; fixtureUrl?: string } = {},
): AnyModel {
  const state: Record<string, unknown> = { ...initial };
  const listeners = new Map<string, Set<Listener>>();
  const customHandlers = new Set<CustomHandler>();
  const dirty = new Set<string>();
  let commReads = 0;

  const volume = initial.volume as { image_url?: string } | undefined;

  function staticRootForFixture(fixtureUrl: string): string {
    const name = fixtureUrl.split("/").pop() ?? "";
    if (name.includes("xsmall")) return "/xsmall.sdata.zarr/";
    if (name.includes("small")) return "/small.sdata.zarr/";
    return "/toy.sdata.zarr/";
  }

  const volumeStaticRoot =
    options.volumeStaticRoot ??
    (isCommVolumeUrl(volume?.image_url ?? "") ? staticRootForFixture(options.fixtureUrl ?? "") : "");

  async function serveVolumeGet(msg: unknown): Promise<[object, ArrayBuffer[]]> {
    const hook =
      typeof window !== "undefined"
        ? (window as unknown as { __volumeCommHook?: { delayMs?: number; fail?: boolean } }).__volumeCommHook
        : undefined;
    if (hook?.fail) {
      return [{ ok: false, status: 500, error: "volume_get failed (injected)" }, []];
    }
    if (hook?.delayMs && hook.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, hook.delayMs));
    }
    const body = msg as { path?: string; range?: { offset?: number; length?: number; suffixLength?: number } };
    const rel = String(body.path ?? "");
    if (!volumeStaticRoot || !rel) return [{ ok: false, status: 404 }, []];
    const url = `${volumeStaticRoot}${rel}`.replace(/([^:]\/)\/+/g, "$1");
    const headers: Record<string, string> = {};
    const range = body.range;
    if (range) {
      if ("suffixLength" in range) {
        headers.Range = `bytes=-${range.suffixLength}`;
      } else if (range.offset != null && range.length != null) {
        const end = range.offset + range.length - 1;
        headers.Range = `bytes=${range.offset}-${end}`;
      }
    }
    commReads++;
    const res = await fetch(url, { headers });
    if (res.status === 404) return [{ ok: false, status: 404 }, []];
    if (!res.ok) throw new Error(`volume_get ${url}: ${res.status}`);
    const buf = await res.arrayBuffer();
    return [{ ok: true, status: res.status }, [buf]];
  }

  const model = {
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
    on(event: string, callback: Listener | CustomHandler) {
      if (event === "msg:custom") {
        customHandlers.add(callback as CustomHandler);
        return;
      }
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(callback as Listener);
    },
    off(event: string, callback: Listener | CustomHandler) {
      if (event === "msg:custom") {
        customHandlers.delete(callback as CustomHandler);
        return;
      }
      listeners.get(event)?.delete(callback as Listener);
    },
    send(content: unknown) {
      const cmd = content as { id?: string; kind?: string; name?: string; msg?: unknown };
      if (cmd.kind !== "anywidget-command" || cmd.name !== "volume_get") return;
      void serveVolumeGet(cmd.msg).then(([response, buffers]) => {
        const payload = { id: cmd.id, kind: "anywidget-command-response", response };
        for (const handler of customHandlers) handler(payload, buffers);
      });
    },
  };

  if (typeof window !== "undefined" && volumeStaticRoot) {
    (window as unknown as { __volumeCommReads?: () => number }).__volumeCommReads = () => commReads;
  }

  return model;
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
  const fixtureUrl = url ?? harnessFixtureUrl();
  return createMockModel(initial, { fixtureUrl });
}
