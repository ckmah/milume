// Runs `npm run verify` steps under one wall-clock cap (#263; #150 "stalled and never finished").
import { spawn } from "node:child_process";

export const VERIFY_TIMEOUT_MIN = 15;

/** Minutes from MILUME_VERIFY_TIMEOUT_MIN (or the default); 0 turns the cap off. */
export function verifyTimeoutMs(env = process.env) {
  const raw = env.MILUME_VERIFY_TIMEOUT_MIN;
  const min = raw === undefined || raw === "" ? VERIFY_TIMEOUT_MIN : Number(raw);
  return Number.isFinite(min) && min > 0 ? min * 60_000 : Infinity;
}

const fmt = (ms) => `${Math.floor(ms / 60000)}m${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}s`;

/** Run one shell command in its own process group so a timeout kills Playwright/Vite children too. */
function runStep(cmd, cwd, budgetMs, stdio) {
  return new Promise((resolve) => {
    const child = spawn(cmd, { cwd, shell: true, stdio, detached: true });
    let timedOut = false;
    const kill = (sig) => {
      try {
        process.kill(-child.pid, sig);
      } catch {}
    };
    const timer =
      budgetMs === Infinity
        ? null
        : setTimeout(() => {
            timedOut = true;
            kill("SIGTERM");
            setTimeout(() => kill("SIGKILL"), 5000).unref();
          }, Math.max(0, budgetMs));
    child.on("exit", (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ status: code ?? (signal ? 1 : 0), timedOut });
    });
  });
}

/**
 * @param {[string, string, string?][]} plan [cwd, command, leg] from verifyPlan
 * @param {{ budgetMs?: number, stdio?: any, log?: (s: string) => void, now?: () => number }} [opts]
 * @returns {Promise<{ status: number, timedOut?: boolean, message?: string }>}
 */
export async function runPlan(plan, { budgetMs = Infinity, stdio = "inherit", log = console.log, now = Date.now } = {}) {
  const started = now();
  for (const [cwd, cmd, leg] of plan) {
    log(`\n$ ${cmd}`);
    const left = budgetMs - (now() - started);
    const r = await runStep(cmd, cwd, left, stdio);
    if (r.timedOut) {
      const message =
        `verify: wall-clock cap of ${fmt(budgetMs)} hit while running \`${cmd}\`` +
        `${leg ? ` (leg \`${leg}\`)` : ""} after ${fmt(now() - started)}; stopped it. ` +
        `That step is hanging: fix it or hand off with this line. ` +
        `MILUME_VERIFY_TIMEOUT_MIN=<min> changes the cap.`;
      return { status: 124, timedOut: true, message };
    }
    if (r.status !== 0) return { status: r.status };
  }
  return { status: 0 };
}
