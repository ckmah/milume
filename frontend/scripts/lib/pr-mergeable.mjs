/**
 * GitHub mergeability for open PRs. CONFLICTING blocks CI until resolved; agents
 * should rebase before polling `gh pr checks` (see AGENTS.md).
 */

export function mergeabilityError({ mergeable, mergeableState }) {
  if (mergeable === false || mergeableState === "dirty") {
    return (
      "PR has unresolved merge conflicts with the base branch (mergeable=false). " +
      "GitHub skips most CI checks while CONFLICTING. Rebase onto origin/main, resolve markers, " +
      "push, then re-run verification — do not sleep-poll an empty check list."
    );
  }
  if (mergeableState === "conflicting") {
    return (
      "PR mergeable_state=conflicting — GitHub will not run frontend-e2e until the branch merges cleanly. " +
      "Run: git fetch origin main && git rebase origin/main (or merge), fix conflicts, git push --force-with-lease."
    );
  }
  return null;
}

export function parsePullRequestPayload(payload) {
  return {
    mergeable: payload.mergeable,
    mergeableState: payload.mergeable_state ?? payload.mergeableState,
  };
}
