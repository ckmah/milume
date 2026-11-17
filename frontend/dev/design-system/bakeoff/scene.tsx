import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  BoxIcon,
  CircleIcon,
  HandIcon,
  LassoIcon,
  MinusIcon,
  MousePointer2Icon,
  PlusIcon,
  RotateCcwIcon,
  SplineIcon,
  SquareIcon,
  PentagonIcon,
} from "lucide-react";
import { motion, useReducedMotion, type TargetAndTransition, type Transition } from "motion/react";

import { CHROME_FIXTURE, SHAPE_MENU, TOOLBAR, readout } from "./chrome-fixture";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export type GameSkin = "game-hud" | "game-loadout" | "game-tact";

type Kit = Record<string, React.ComponentType<Record<string, unknown>>>;

type SpringSpec = {
  initial: TargetAndTransition;
  animate: TargetAndTransition;
  transition: Transition;
};

const SPRING: Record<GameSkin, Record<"menu" | "popover" | "tooltip", SpringSpec>> = {
  "game-hud": {
    menu: {
      initial: { opacity: 0, scaleY: 0.92 },
      animate: { opacity: 1, scaleY: 1 },
      transition: { type: "spring", stiffness: 640, damping: 38, mass: 0.55 },
    },
    popover: {
      initial: { opacity: 0, scaleY: 0.94 },
      animate: { opacity: 1, scaleY: 1 },
      transition: { type: "spring", stiffness: 700, damping: 40, mass: 0.5 },
    },
    tooltip: {
      initial: { opacity: 0, y: 4 },
      animate: { opacity: 1, y: 0 },
      transition: { type: "spring", stiffness: 800, damping: 42, mass: 0.4 },
    },
  },
  "game-loadout": {
    menu: {
      initial: { opacity: 0, scale: 0.9, y: 8 },
      animate: { opacity: 1, scale: 1, y: 0 },
      transition: { type: "spring", stiffness: 460, damping: 18, mass: 0.7 },
    },
    popover: {
      initial: { opacity: 0, scaleX: 1.05, scaleY: 0.86, y: 10 },
      animate: { opacity: 1, scaleX: 1, scaleY: 1, y: 0 },
      transition: { type: "spring", stiffness: 420, damping: 16, mass: 0.72 },
    },
    tooltip: {
      initial: { opacity: 0, scale: 0.92, y: 6 },
      animate: { opacity: 1, scale: 1, y: 0 },
      transition: { type: "spring", stiffness: 500, damping: 20, mass: 0.55 },
    },
  },
  "game-tact": {
    menu: {
      initial: { opacity: 0, y: 8 },
      animate: { opacity: 1, y: 0 },
      transition: { type: "spring", stiffness: 260, damping: 32, mass: 0.85 },
    },
    popover: {
      initial: { opacity: 0, y: 10 },
      animate: { opacity: 1, y: 0 },
      transition: { type: "spring", stiffness: 240, damping: 30, mass: 0.9 },
    },
    tooltip: {
      initial: { opacity: 0, y: 6 },
      animate: { opacity: 1, y: 0 },
      transition: { type: "spring", stiffness: 280, damping: 34, mass: 0.7 },
    },
  },
};

const ICONS = {
  select: MousePointer2Icon,
  move: HandIcon,
  lasso: LassoIcon,
  spline: SplineIcon,
  "zoom-out": MinusIcon,
  "zoom-in": PlusIcon,
  reset: RotateCcwIcon,
  inspect: BoxIcon,
} as const;

const SHAPE_ICONS = {
  lasso: LassoIcon,
  rectangle: SquareIcon,
  ellipse: CircleIcon,
  polygon: PentagonIcon,
} as const;

function markSettled(name: string, names: readonly string[]) {
  const root = document.documentElement;
  const have = new Set((root.dataset.bakeoffMotions ?? "").split(",").filter(Boolean));
  have.add(name);
  root.dataset.bakeoffMotions = [...have].join(",");
  if (names.every((id) => have.has(id))) root.dataset.bakeoffSettled = "true";
}

function Springy({
  skin,
  part,
  parts,
  children,
  className,
}: {
  skin: GameSkin;
  part: "menu" | "popover" | "tooltip";
  parts: readonly string[];
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const spec = SPRING[skin][part];
  useEffect(() => {
    if (reduce) markSettled(part, parts);
  }, [reduce, part, parts]);
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={spec.initial}
      animate={spec.animate}
      transition={spec.transition}
      onAnimationComplete={() => markSettled(part, parts)}
      style={{ transformOrigin: part === "tooltip" ? "center bottom" : "center top" }}
    >
      {children}
    </motion.div>
  );
}

function Readout({ children }: { children: ReactNode }) {
  return <span className="g-readout">{children}</span>;
}

function SliderRow({
  kit,
  label,
  min,
  max,
  step,
  value,
  accent,
  text,
}: {
  kit: Kit;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number | [number, number];
  accent?: string;
  text?: string;
}) {
  const Slider = kit.Slider as React.ComponentType<Record<string, unknown>>;
  const shown =
    text ??
    (Array.isArray(value)
      ? `${readout(value[0], step)}-${readout(value[1], step)}`
      : readout(value, step));
  return (
    <div className="g-slider-row" style={{ "--g-accent": accent ?? "var(--foreground)" } as CSSProperties}>
      <div className="g-slider-meta">
        <span className="g-label">{label}</span>
        <Readout>{shown}</Readout>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={Array.isArray(value) ? value : [value]}
        aria-label={label}
      />
      <div className="g-ticks" aria-hidden="true" />
      {text ? null : (
        <div className="g-ends">
          <span>{readout(min, step)}</span>
          <span>{readout(max, step)}</span>
        </div>
      )}
    </div>
  );
}

function ChannelRow({
  kit,
  name,
  color,
  visible,
}: {
  kit: Kit;
  name: string;
  color: string;
  visible: boolean;
}) {
  const Switch = kit.Switch as React.ComponentType<Record<string, unknown>>;
  return (
    <div className="g-slot" style={{ "--g-accent": color } as CSSProperties}>
      <span className="g-edge" aria-hidden="true" />
      <span className="g-led" data-on={visible ? "true" : "false"} aria-hidden="true" />
      <span className="g-slot-name">{name}</span>
      <Switch checked={visible} aria-label={`Show ${name}`} />
    </div>
  );
}

function NotchFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={className ? `g-frame ${className}` : "g-frame"}>
      <span className="g-notch g-notch--nw" aria-hidden="true" />
      <span className="g-notch g-notch--ne" aria-hidden="true" />
      <span className="g-notch g-notch--sw" aria-hidden="true" />
      <span className="g-notch g-notch--se" aria-hidden="true" />
      {children}
    </section>
  );
}

export function ChromeScene({
  kit,
  skin,
  frame,
}: {
  kit: Kit;
  skin: GameSkin;
  frame: "full" | "close";
}) {
  const {
    Button,
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
  } = kit;
  const Btn = Button as React.ComponentType<Record<string, unknown>>;
  const Tip = Tooltip as React.ComponentType<Record<string, unknown>>;
  const TipTrigger = TooltipTrigger as React.ComponentType<Record<string, unknown>>;
  const TipContent = TooltipContent as React.ComponentType<Record<string, unknown>>;
  const TipProvider = TooltipProvider as React.ComponentType<Record<string, unknown>>;
  const Menu = DropdownMenu as React.ComponentType<Record<string, unknown>>;
  const MenuTrigger = DropdownMenuTrigger as React.ComponentType<Record<string, unknown>>;
  const MenuContent = DropdownMenuContent as React.ComponentType<Record<string, unknown>>;
  const MenuItem = DropdownMenuItem as React.ComponentType<Record<string, unknown>>;
  const Collapse = Collapsible as React.ComponentType<Record<string, unknown>>;
  const CollapseTrigger = CollapsibleTrigger as React.ComponentType<Record<string, unknown>>;
  const CollapseContent = CollapsibleContent as React.ComponentType<Record<string, unknown>>;

  const [preset, setPreset] = useState<(typeof CHROME_FIXTURE.preset) | "iso" | "side">(
    CHROME_FIXTURE.preset,
  );
  const [mode, setMode] = useState<(typeof CHROME_FIXTURE.imageMode) | "mip">(CHROME_FIXTURE.imageMode);
  const parts = frame === "close" ? (["popover", "tooltip"] as const) : (["menu", "popover", "tooltip"] as const);
  const fx = CHROME_FIXTURE;
  const imageHeader = "Image · DAPI";

  useEffect(() => {
    document.documentElement.dataset.bakeoffMotions = "";
    delete document.documentElement.dataset.bakeoffSettled;
    const id = window.setTimeout(() => {
      for (const part of parts) markSettled(part, parts);
    }, 900);
    return () => window.clearTimeout(id);
  }, [skin, frame]);

  return (
    <TipProvider delay={0}>
      <div className={frame === "close" ? "g-chrome g-chrome--close" : "g-chrome"} data-bakeoff-scene={frame}>
        <NotchFrame className="g-toolbar-frame">
          <div className="g-toolbar" role="toolbar" aria-label="Drawing tools" data-bakeoff-toolbar="">
            {TOOLBAR.map((tool) => {
              const Icon = ICONS[tool.id];
              const on = tool.id === "select";
              const button = (
                <Btn
                  key={tool.id}
                  variant="ghost"
                  className={on ? "g-tool g-tool--on" : "g-tool"}
                  aria-pressed={on}
                  aria-label={tool.label}
                >
                  <Icon aria-hidden="true" />
                  <span className="g-tool-label">{tool.label}</span>
                  <span className="g-hotkey">{tool.shortcut}</span>
                </Btn>
              );
              if (tool.id === "lasso") {
                return (
                  <Popover key={tool.id} open>
                    <PopoverTrigger render={button as never} />
                    <PopoverContent>
                      <Springy skin={skin} part="popover" parts={parts} className="g-pop">
                        <p className="g-pop-title">Shape</p>
                        {SHAPE_MENU.map((item) => {
                          const ShapeIcon = SHAPE_ICONS[item.id];
                          return (
                            <div key={item.id} className="g-pop-row" data-current={item.id === "lasso" ? "true" : "false"}>
                              <ShapeIcon aria-hidden="true" />
                              <span>{item.label}</span>
                              <span className="g-hotkey">{item.shortcut}</span>
                            </div>
                          );
                        })}
                      </Springy>
                    </PopoverContent>
                  </Popover>
                );
              }
              if (tool.id === "zoom-in") {
                return (
                  <Tip key={tool.id} open>
                    <TipTrigger render={button as never} />
                    <TipContent side="top" sideOffset={8}>
                      <Springy skin={skin} part="tooltip" parts={parts} className="g-tip">
                        Zoom in
                        <span data-slot="kbd" className="g-hotkey">
                          =
                        </span>
                      </Springy>
                    </TipContent>
                  </Tip>
                );
              }
              return button;
            })}
          </div>
        </NotchFrame>

        {frame === "full" ? (
          <div className="g-body">
            <NotchFrame className="g-dock">
              <header className="g-panel-head">
                <h2 className="g-panel-title">
                  Layers <span className="g-count">2</span>
                </h2>
              </header>
              <Collapse defaultOpen className="g-section">
                <CollapseTrigger className="g-section-trigger">
                <span>
                  Selections <span className="g-count">1</span>
                </span>
                </CollapseTrigger>
                <CollapseContent className="g-section-body">
                  <div className="g-slot" style={{ "--g-accent": fx.selectionColor } as CSSProperties}>
                    <span className="g-edge" aria-hidden="true" />
                    <span className="g-slot-name">{fx.selectionId}</span>
                  </div>
                </CollapseContent>
              </Collapse>
              <Collapse defaultOpen className="g-section">
                <CollapseTrigger className="g-section-trigger">
                <span>
                  Landmarks <span className="g-count">1</span>
                </span>
                </CollapseTrigger>
                <CollapseContent className="g-section-body">
                  <div className="g-slot" style={{ "--g-accent": fx.landmarkColor } as CSSProperties}>
                    <span className="g-edge" aria-hidden="true" />
                    <span className="g-led" data-on="true" aria-hidden="true" />
                    <span className="g-slot-name">{fx.landmarkId}</span>
                    <Menu open modal={false}>
                      <MenuTrigger
                        render={
                          <Btn variant="ghost" className="g-more" aria-label={`Landmark menu for ${fx.landmarkId}`} />
                        }
                      >
                        ...
                      </MenuTrigger>
                      <MenuContent
                        align="end"
                        side="bottom"
                        sideOffset={8}
                        collisionAvoidance={{ side: "none", align: "none", fallbackAxisSide: "none" }}
                        className="g-menu-popup"
                      >
                        <Springy skin={skin} part="menu" parts={parts} className="g-menu">
                          <MenuItem className="g-menu-item">Hide</MenuItem>
                          <MenuItem className="g-menu-item">Rename</MenuItem>
                          <MenuItem className="g-menu-item">Duplicate</MenuItem>
                          <MenuItem className="g-menu-item" variant="destructive">
                            Delete
                            <span className="g-hotkey">Del</span>
                          </MenuItem>
                        </Springy>
                      </MenuContent>
                    </Menu>
                  </div>
                </CollapseContent>
              </Collapse>
              <Collapse defaultOpen className="g-section">
                <CollapseTrigger className="g-section-trigger">
                <span>
                  Layers <span className="g-count">2</span>
                </span>
                </CollapseTrigger>
                <CollapseContent className="g-section-body">
                  <p className="g-subhead">{fx.cellsHeader}</p>
                  <div className="g-cats">
                    {fx.categories.map((cat) => (
                      <span key={cat.name} className="g-cat" style={{ "--g-accent": cat.color } as CSSProperties}>
                        <span className="g-swatch" aria-hidden="true" />
                        {cat.name}
                      </span>
                    ))}
                  </div>
                  <SliderRow
                    kit={kit}
                    label="Size"
                    min={fx.pointSizeMin}
                    max={fx.pointSizeMax}
                    step={fx.pointSizeStep}
                    value={fx.pointSize}
                  />
                  <p className="g-subhead">{imageHeader}</p>
                  {fx.channels.map((channel) => (
                    <ChannelRow
                      key={channel.name}
                      kit={kit}
                      name={channel.name}
                      color={channel.color}
                      visible={channel.visible}
                    />
                  ))}
                  <SliderRow
                    kit={kit}
                    label="Alpha"
                    min={0}
                    max={1}
                    step={fx.imageAlphaStep}
                    value={fx.imageAlpha}
                    accent={fx.channels[0]!.color}
                  />
                </CollapseContent>
              </Collapse>
            </NotchFrame>

            <NotchFrame className="g-inspect">
              <header className="g-panel-head">
                <h2 className="g-panel-title">Inspect</h2>
                <Readout>
                  Z {readout(fx.zBand[0], 0.01)}-{readout(fx.zBand[1], 0.01)} µm
                </Readout>
              </header>
              <div className="g-toggle-row" role="group" aria-label="Camera">
                {(["top", "iso", "side"] as const).map((id) => (
                  <Btn
                    key={id}
                    variant="ghost"
                    className={preset === id ? "g-choice g-choice--on" : "g-choice"}
                    aria-pressed={preset === id}
                    onClick={() => setPreset(id)}
                  >
                    {id === "iso" ? "Iso" : id[0]!.toUpperCase() + id.slice(1)}
                  </Btn>
                ))}
              </div>
              <div className="g-toggle-row" role="group" aria-label="Image projection">
                {(["additive", "mip"] as const).map((id) => (
                  <Btn
                    key={id}
                    variant="ghost"
                    className={mode === id ? "g-choice g-choice--on" : "g-choice"}
                    aria-pressed={mode === id}
                    onClick={() => setMode(id)}
                  >
                    {id === "mip" ? "MIP" : "Additive"}
                  </Btn>
                ))}
              </div>
              <p className="g-subhead">Image</p>
              <SliderRow
                kit={kit}
                label="Contrast"
                min={0}
                max={255}
                step={1}
                value={fx.contrast}
                accent={fx.channels[0]!.color}
                range
              />
              <SliderRow kit={kit} label="Alpha" min={0} max={1} step={0.05} value={fx.cubeAlpha} />
              <SliderRow
                kit={kit}
                label="Gamma"
                min={-2.32}
                max={2.32}
                step={0.05}
                value={0}
                text="1.00"
              />
              <p className="g-subhead">Labels</p>
              <SliderRow
                kit={kit}
                label="Opacity"
                min={0}
                max={1}
                step={0.05}
                value={fx.cellAlpha}
                accent={fx.categories[1]!.color}
              />
              <p className="g-subhead">
                Palette <span className="g-palette">{fx.palette}</span>
              </p>
            </NotchFrame>
          </div>
        ) : null}
      </div>
    </TipProvider>
  );
}
