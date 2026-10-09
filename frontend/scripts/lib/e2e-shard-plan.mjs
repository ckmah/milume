/** @typedef {{ title: string, line: number, weight?: number }} ShardTest */

/**
 * Pin weighted tests to distinct shards, then deal the rest round-robin by title.
 * @param {ShardTest[]} tests
 * @param {number} total
 * @param {{ default?: number, patterns?: { match: string, weight: number }[] }} weightConfig
 */
export function assignShards(tests, total, weightConfig) {
  const defaultWeight = weightConfig.default ?? 1;
  const withWeight = tests.map((t) => ({
    ...t,
    weight: t.weight ?? weightFor(t.title, weightConfig),
  }));
  const heavy = withWeight.filter((t) => t.weight > defaultWeight).sort((a, b) => (a.title < b.title ? -1 : 1));
  const light = withWeight.filter((t) => t.weight === defaultWeight).sort((a, b) => (a.title < b.title ? -1 : 1));

  const buckets = Array.from({ length: total }, () => /** @type {ShardTest[]} */ ([]));
  for (let i = 0; i < heavy.length; i++) {
    buckets[i % total].push(heavy[i]);
  }
  for (let i = 0; i < light.length; i++) {
    buckets[i % total].push(light[i]);
  }
  return buckets;
}

export function weightFor(title, weightConfig) {
  for (const { match, weight } of weightConfig.patterns ?? []) {
    if (title.includes(match)) return weight;
  }
  return weightConfig.default ?? 1;
}
