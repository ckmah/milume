export type BandSnapshot = { focus: number; lo: number; hi: number };

/** Restore a rail drag snapshot (Escape revert). */
export function applyBandSnapshot(
  snap: BandSnapshot,
  apply: (next: BandSnapshot) => void,
): void {
  apply(snap);
}
