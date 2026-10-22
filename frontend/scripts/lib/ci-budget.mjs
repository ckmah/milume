// Caps on how long bots wait on CI (#263). Pure helpers shared by gh-ci-watch.mjs (session
// budget per head SHA) and stale-prs.mjs (hourly "stalled" comment on bot PRs).

/** Branches agents open PRs from. Human branches (feat/, fix/, short slugs) aren't watched. */
export const BOT_BRANCH_RE = /^(?:cursor|claude|codex|agent|bot)\//;
export const STALL_HOURS = 6;
export const MAX_WATCH_SESSIONS = 3;

const WATCH_RE = /<!-- gh-ci-watch (\{.*?\}) -->/;
export const stalledMarker = (sha) => `<!-- stalled:${sha} -->`;

/**
 * Checks as `gh pr checks --json name,bucket,link` reports them
 * (bucket: pass | fail | pending | skipping | cancel).
 * @param {{ name: string, bucket: string }[]} checks
 * @returns {"pass" | "fail" | "pending"}
 */
export function ciState(checks) {
  if (checks.some((c) => c.bucket === "fail" || c.bucket === "cancel")) return "fail";
  if (!checks.length || checks.some((c) => c.bucket === "pending")) return "pending";
  return "pass";
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The e2e-tiers legs whose jobs match the failing checks ("e2e-landmarks (default)" matches
 * frontend-e2e.yml:e2e-landmarks-default). A check no leg lists keeps its own name.
 * @param {{ name: string, bucket: string }[]} checks
 * @param {{ legs: Record<string, { jobs: string[] }> }} config
 */
export function failingTiers(checks, config) {
  const out = new Set();
  for (const c of checks.filter((x) => x.bucket === "fail" || x.bucket === "cancel")) {
    const legs = Object.entries(config.legs)
      .filter(([, leg]) => leg.jobs.some((j) => norm(j.split(":")[1] ?? j) === norm(c.name)))
      .map(([name]) => name);
    if (legs.length) legs.forEach((l) => out.add(l));
    else out.add(c.name);
  }
  return [...out];
}

/**
 * The hand-off snapshot: head SHA, conflict status, failing tiers, and every non-green check.
 * @param {{ sha: string, checks: { name: string, bucket: string, link?: string }[], conflicting: boolean | null, config: object }} p
 */
export function handoffSnapshot({ sha, checks, conflicting, config }) {
  const state = ciState(checks);
  const tiers = failingTiers(checks, config);
  const rows = checks
    .filter((c) => c.bucket !== "pass" && c.bucket !== "skipping")
    .map((c) => `| ${c.name} | ${c.bucket} | ${c.link ? `[log](${c.link})` : ""} |`);
  return [
    `Head \`${sha.slice(0, 7)}\`: CI **${state}**; conflicts: ${conflicting === null ? "unknown" : conflicting ? "**yes** (rebase first)" : "none"}; failing tier: ${tiers.length ? tiers.map((t) => `\`${t}\``).join(", ") : "none"}`,
    ...(rows.length ? ["", "| Check | State | |", "| --- | --- | --- |", ...rows] : []),
  ].join("\n");
}

/**
 * Watch sessions already spent on `sha`, from the gh-ci-watch marker comment.
 * @param {{ body: string }[]} comments
 * @param {string} sha
 */
export function watchSessions(comments, sha) {
  for (const c of comments) {
    const m = c.body?.match(WATCH_RE);
    if (!m) continue;
    try {
      const rec = JSON.parse(m[1]);
      return { comment: c, sessions: rec.sha === sha ? Number(rec.sessions) || 0 : 0 };
    } catch {
      return { comment: c, sessions: 0 };
    }
  }
  return { comment: null, sessions: 0 };
}

/** Body of the single gh-ci-watch marker comment (edited in place; a new head SHA resets it). */
export function watchBody(sha, sessions, max = MAX_WATCH_SESSIONS) {
  return (
    `<!-- gh-ci-watch ${JSON.stringify({ sha, sessions })} -->\n` +
    `gh-ci-watch: session ${sessions}/${max} on \`${sha.slice(0, 7)}\`. ` +
    `After ${max} sessions on one head SHA it refuses and prints the hand-off snapshot; push a fix to reset.`
  );
}

/**
 * Should the hourly job flag this PR? Ready bot PR, CI red or pending, no push for `hours`,
 * and no stalled comment for this head SHA yet.
 * @param {{ head: string, draft: boolean, sha: string, lastPushAt: string, checks: { bucket: string }[], comments: { body: string }[] }} pr
 * @param {{ now?: number, hours?: number }} [opts]
 * @returns {{ stalled: boolean, reason: string }}
 */
export function stallVerdict(pr, { now = Date.now(), hours = STALL_HOURS } = {}) {
  if (!BOT_BRANCH_RE.test(pr.head)) return { stalled: false, reason: "human branch" };
  if (pr.draft) return { stalled: false, reason: "draft" };
  const state = ciState(pr.checks);
  if (state === "pass") return { stalled: false, reason: "CI green" };
  const idle = (now - Date.parse(pr.lastPushAt)) / 3.6e6;
  if (!(idle > hours)) return { stalled: false, reason: `pushed ${idle.toFixed(1)} h ago` };
  if (pr.comments.some((c) => c.body?.includes(stalledMarker(pr.sha)))) {
    return { stalled: false, reason: "already flagged for this head" };
  }
  return { stalled: true, reason: `CI ${state}, no push for ${idle.toFixed(1)} h` };
}
