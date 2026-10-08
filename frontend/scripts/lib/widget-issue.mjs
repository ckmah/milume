// Shared rules for Landmarks / widget UI GitHub issues (see .github/ISSUE_TEMPLATE/landmarks-ui.yml).

const OUTCOME = /(^|\n)#+\s*outcome\b/i;
const ACCEPTANCE = /(^|\n)#+\s*acceptance\b/i;
const VISUAL = /(^|\n)#+\s*visual\b/i;

/** @param {string} body */
export function validateWidgetIssueBody(body) {
  const errors = [];
  const text = (body ?? "").trim();
  if (!text) {
    errors.push("issue body is empty (need Outcome, Acceptance, and Visual acceptance)");
    return errors;
  }
  if (!OUTCOME.test(text)) errors.push('missing a heading like "## Outcome"');
  if (!ACCEPTANCE.test(text)) {
    errors.push('missing a heading like "## Acceptance"');
  } else if (!/^(\s*[-*]|\s*\d+\.|\s*- \[[ xX]\])/m.test(text.split(/#+\s*acceptance\b/i)[1] ?? "")) {
    errors.push("Acceptance section needs at least one checklist or bullet item");
  }
  if (!VISUAL.test(text)) {
    errors.push('missing a heading like "## Visual acceptance" (what reviewers should see in screenshots/video)');
  }
  return errors;
}
