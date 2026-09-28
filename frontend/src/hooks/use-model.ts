import { useCallback, useEffect, useReducer, useRef, useSyncExternalStore } from "react";

type AnyModel = {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  save_changes(): void;
  on(event: string, callback: () => void): void;
  off?(event: string, callback: () => void): void;
};

/**
 * Subscribe to one or more traitlets-backed model keys.
 *
 * The snapshot is rebuilt only after a change event on one of the keys, and is
 * otherwise the same object. Some widget keys carry hundreds of MB of base64
 * (point, gene and embedding packs), so the snapshot must never serialize or
 * copy values: it hands back the model's own references, read-only.
 */
export function useModel<T extends Record<string, unknown>>(
  model: AnyModel,
  keys: (keyof T)[],
): T {
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const keyId = keys.map(String).join(",");
  const versionRef = useRef(0);
  const cacheRef = useRef<{ version: number; keyId: string; snapshot: T } | null>(null);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const handler = () => {
        versionRef.current += 1;
        onStoreChange();
      };
      const events = keyId.split(",").map((key) => `change:${key}`);
      for (const event of events) model.on(event, handler);
      return () => {
        for (const event of events) model.off?.(event, handler);
      };
    },
    [model, keyId],
  );

  const getSnapshot = useCallback(() => {
    const cached = cacheRef.current;
    if (cached && cached.version === versionRef.current && cached.keyId === keyId) {
      return cached.snapshot;
    }
    const snapshot = {} as Record<string, unknown>;
    for (const key of keysRef.current) {
      snapshot[String(key)] = model.get(String(key));
    }
    cacheRef.current = { version: versionRef.current, keyId, snapshot: snapshot as T };
    return snapshot as T;
  }, [model, keyId]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Force re-render when any listed model key changes (for imperative model handles). */
export function useModelVersion(model: AnyModel, keys: string[]) {
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const handlers = keys.map((key) => {
      const event = `change:${key}`;
      const handler = () => bump();
      model.on(event, handler);
      return { event, handler };
    });
    return () => {
      for (const { event, handler } of handlers) {
        model.off?.(event, handler);
      }
    };
  }, [model, keys.join(",")]);
}
