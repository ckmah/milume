/** Type (category group) focus helpers — keep in sync with landmarks_state.js. */

export function typeFocusIndicesFromState(opts: {
  selected_kind: string;
  selected_index: number;
  selected_type_indices?: number[];
}): number[] {
  if (opts.selected_kind !== "type") return [];
  const raw = opts.selected_type_indices;
  if (Array.isArray(raw) && raw.length) {
    const out: number[] = [];
    const seen = new Set<number>();
    for (const v of raw) {
      const i = v | 0;
      if (i < 0 || seen.has(i)) continue;
      seen.add(i);
      out.push(i);
    }
    return out.sort((a, b) => a - b);
  }
  const idx = opts.selected_index | 0;
  return idx >= 0 ? [idx] : [];
}

export function isTypeRowActive(
  labelIndex: number,
  opts: {
    selected_kind: string;
    selected_index: number;
    selected_type_indices?: number[];
    active_category: string;
    columnName: string;
  },
): boolean {
  if (opts.selected_kind !== "type" || opts.columnName !== opts.active_category) {
    return false;
  }
  const indices = typeFocusIndicesFromState(opts);
  return indices.includes(labelIndex);
}
