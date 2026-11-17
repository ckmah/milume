import { createRoot } from "react-dom/client";

import "@/styles/globals.css";
import "dialkit/styles.css";
import "@/widgets/landmarks/landmarks.css";

import { HarnessShell } from "./HarnessShell";

const rootEl = document.getElementById("harness-root");
if (!rootEl) {
  throw new Error("Landmarks dev harness: missing #harness-root");
}

createRoot(rootEl).render(<HarnessShell />);
