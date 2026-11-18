import { createRoot } from "react-dom/client";

import "@/styles/globals.css";
import "@/widgets/landmarks/landmarks.css";
import "./design-system.css";

import { DesignSystemHarness } from "./DesignSystemHarness";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Design system harness: missing #root");
}

createRoot(rootEl).render(<DesignSystemHarness />);