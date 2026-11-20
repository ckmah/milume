import { useSyncExternalStore, type ReactNode } from "react";

/** Prototype hook. The harness publishes a Landmarks-panel slot. Production leaves it empty. */
export type PseudospaceSlot = {
  action: ReactNode;
  body: ReactNode;
  count: number;
};

let slot: PseudospaceSlot | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setPseudospaceSlot(next: PseudospaceSlot | null) {
  slot = next;
  emit();
}

export function usePseudospaceSlot(): PseudospaceSlot | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => slot,
    () => null,
  );
}
