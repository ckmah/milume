/** @typedef {{ title: string, line: number, weight?: number }} ShardTest */

/**
 * @param {string} title
 * @param {{ defaultWeight?: number, default?: number, durations?: Record<string, number>, patterns?: { match: string, weight: number }[] }} weightConfig
 */
export function weightFor(title, weightConfig) {
  const durations = weightConfig.durations;
  if (durations && title in durations) return durations[title];
  for (const { match, weight } of weightConfig.patterns ?? []) {
    if (title.includes(match)) return weight;
  }
  return weightConfig.defaultWeight ?? weightConfig.default ?? 1;
}

/**
 * Longest-processing-time-first: assign each test to the shard with the lowest load so far.
 * @param {ShardTest[]} tests
 * @param {number} total
 * @param {Record<string, unknown>} weightConfig
 */
export function assignShards(tests, total, weightConfig) {
  const defaultWeight = weightConfig.defaultWeight ?? weightConfig.default ?? 1;
  const withWeight = tests.map((t) => ({
    ...t,
    weight: t.weight ?? weightFor(t.title, weightConfig),
  }));
  const ordered = [...withWeight].sort((a, b) => b.weight - a.weight || (a.title < b.title ? -1 : 1));
  const buckets = Array.from({ length: total }, () => /** @type {ShardTest[]} */ ([]));
  const loads = Array(total).fill(0);
  for (const t of ordered) {
    let idx = 0;
    for (let i = 1; i < total; i++) {
      if (loads[i] < loads[idx]) idx = i;
    }
    buckets[idx].push(t);
    loads[idx] += t.weight;
  }
  return buckets;
}
