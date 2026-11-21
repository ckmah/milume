/** Section anchors. The nav, the page, and the Vite harness spec share this list. */
export const DESIGN_SYSTEM_SECTIONS = [
  ["icon-buttons", "Icon buttons"],
  ["toggles", "Toggles"],
  ["sliders", "Sliders"],
  ["dock", "Dock"],
  ["layers", "Layers"],
  ["legends", "Legends and ramps"],
  ["gene-picker", "Gene picker"],
  ["color-picker", "Color picker"],
  ["tooltips", "Tooltips"],
  ["inputs", "Inputs"],
  ["volume-cube", "Volume cube"],
  ["panels", "Panels"],
  ["empty-loading", "Empty and loading"],
  ["gaps", "Gaps"],
] as const;

export type DesignSystemSectionId = (typeof DESIGN_SYSTEM_SECTIONS)[number][0];

/**
 * Chrome that cannot mount without a live deck canvas, a volume, or an engine
 * subscription. The harness lists these instead of forking them.
 */
export const DESIGN_SYSTEM_GAPS: { component: string; reason: string }[] = [
  {
    component: "CubeImmersive",
    reason: "WebGL cube. Needs a volume texture and a frame loop.",
  },
  {
    component: "InspectPreview",
    reason: "Needs a rendered cube bitmap.",
  },
  {
    component: "InspectMinimapPanel",
    reason: "Needs the cube camera and a volume extent.",
  },
  {
    component: "LandmarkCanvasMenu",
    reason: "Opens only from an engine hit-test subscription.",
  },
  {
    component: "ModeDropdown open menu",
    reason: "Opens from the Dock ModeDropdown trigger (right-click or chevron). Not force-mounted.",
  },
  {
    component: "Combobox open list",
    reason: "GenesCombobox in Gene picker opens on click. A forced-open list marks the rest of the page aria-hidden.",
  },
  {
    component: "ChannelColorPicker disabled",
    reason: "No disabled prop.",
  },
  {
    component: "Button loading",
    reason: "No loading prop. Loading is ChromeLoadIndicator, PlotLoadIndicator, and InspectPill.",
  },
];
