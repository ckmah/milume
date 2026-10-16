import { networkInterfaces } from "node:os";

/** Pick a non-loopback IPv4 for marimo e2e (molab-style remote origin). */
export function marimoE2eHost() {
  if (process.env.E2E_MARIMO_HOST) return process.env.E2E_MARIMO_HOST;
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "127.0.0.1";
}

export function marimoE2ePort() {
  return Number(process.env.E2E_MARIMO_PORT ?? 28_765);
}

export function marimoE2eBaseUrl() {
  const host = marimoE2eHost();
  const port = marimoE2ePort();
  return `http://${host}:${port}`;
}
