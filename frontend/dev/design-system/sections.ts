/** Section anchors. The nav, the page, and the Vite harness spec share this list. */
export const DESIGN_SYSTEM_SECTIONS = [
  ["buttons", "Buttons"],
  ["icon-buttons", "Icon buttons"],
  ["toggles", "Toggles"],
  ["sliders", "Sliders"],
  ["popovers", "Popovers"],
  ["menus", "Menus"],
  ["tabs", "Tabs"],
  ["dock", "Dock"],
  ["layers", "Layers"],
  ["legends", "Legends and ramps"],
  ["gene-picker", "Gene picker"],
  ["color-picker", "Color picker"],
  ["tooltips", "Tooltips"],
  ["inputs", "Inputs"],
  ["badges", "Badges"],
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
    reason: "The menu open state is internal. The closed trigger is shown. The open menu is the DropdownMenu specimen.",
  },
  {
    component: "Combobox open list",
    reason: "A forced-open combobox whose input sits outside the popup marks the rest of the page aria-hidden. The field is shown closed, with an empty query. The open menu is the DropdownMenu specimen.",
  },
  {
    component: "ChannelColorPicker disabled",
    reason: "No disabled prop. ColorSelector shows disabled.",
  },
  {
    component: "Button loading",
    reason: "No loading prop. Loading is ChromeLoadIndicator, PlotLoadIndicator, and InspectPill.",
  },
];
