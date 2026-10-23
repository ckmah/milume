/** Max gene options mounted in the picker popup at once (issue #254). */
export const GENE_PICKER_MAX_VISIBLE = 250;

/** Search-first list: empty query shows nothing; substring match with a hard DOM cap. */
export function filterGeneNamesForPicker(
  names: readonly string[],
  query: string,
  maxVisible = GENE_PICKER_MAX_VISIBLE,
): string[] {
  const q = query.trim();
  if (!q) return [];
  const qLower = q.toLocaleLowerCase();
  const out: string[] = [];
  for (let i = 0; i < names.length; i++) {
    if (out.length >= maxVisible) break;
    const name = names[i]!;
    if (name.toLocaleLowerCase().includes(qLower)) out.push(name);
  }
  return out;
}
