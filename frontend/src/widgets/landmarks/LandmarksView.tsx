import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { Rise } from "cube-motion/react";

import { useNotebookTheme } from "@/hooks/use-notebook-theme";
import { cn } from "@/lib/utils";

import type { CellColoring } from "@/widgets/volume-cube/cell-lut-extension";
import { ChunkCache } from "@/widgets/volume-cube/chunk-cache";
import type { CubeOverlay } from "@/widgets/volume-cube/overlay-layers";
import { PREVIEW_REGION_BUDGET } from "@/widgets/volume-cube/window-source";

import { decodeF32Base64, decodeI32Base64 } from "./binary";
import {
  LayersPanel,
  MinimapPanel,
  SelectionToolbar,
  Topbar,
  InspectPill,
  toInspectLoad,
  LandmarkCanvasMenu,
  ViewCta,
  RightChromeStack,
  CanvasRulers,
  CubeImmersive,
  InspectPreview,
  InspectToolbar,
  InspectNoVolumePill,
  PanelCollapseButton,
  PanelPeekTab,
  PlotLoadIndicator,
} from "./chrome";
import type { ChipSnapshot } from "./chrome/cube-snapshots";
import { FLOAT_PANEL } from "./chrome/sections";
import { WidgetPortalContext } from "./chrome/widget-portal-context";
import { cubeCellColoring } from "./cube-highlight";
import { INSPECT_WINDOW_UM, mountEngine, type EngineHandle } from "./engine";
import {
  GEOMETRY_MODE_IDS,
  INTERACTION_MODE_IDS,
  LANDMARK_MODE_IDS,
  type AnyModel,
} from "./helpers";
import { wrapLandmarksModel } from "./model";
import { isWindowSaved, useInspectCube } from "./use-inspect-cube";
import { useLandmarksModel } from "./use-landmarks-model";
import { useWidgetFullscreen } from "./use-widget-fullscreen";
import { usePlotBootstrap } from "./use-plot-bootstrap";

const SHELL_HEIGHT = 720;
const MIN_HEIGHT = 400;
const MAX_HEIGHT = 1400;
const NARROW_BREAKPOINT = 640;
/** No cube open: nothing to colour. */
const NO_COLORING: CellColoring = { kind: "groups", groups: [] };

const ALL_MODES = [
  ...INTERACTION_MODE_IDS,
  ...GEOMETRY_MODE_IDS,
  ...LANDMARK_MODE_IDS,
];

export function LandmarksView({
  model,
  hostEl,
  defaultHeight = SHELL_HEIGHT,
  cubeBudgets,
  inspectWindowUm,
  labelAlpha,
}: {
  hostEl: HTMLElement;
  model: AnyModel;
  /** Dev harness can pass a taller initial shell height; notebooks keep the 720px default. */
  defaultHeight?: number;
  /** Harness only: voxel budgets for the cube's coarse step (`preview`) and fine level (`dock`). */
  cubeBudgets?: { preview: number; dock: number };
  /** Harness only: the Inspect window's side (µm); the toy volume is smaller than the default 300. */
  inspectWindowUm?: number;
  /** Harness only: live Labels alpha from DialKit. */
  labelAlpha?: number;
}) {
  const dark = useNotebookTheme(hostEl.parentElement);
  const facade = useMemo(() => wrapLandmarksModel(model), [model]);
  const lm = useLandmarksModel(facade);
  const plotHostRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (el) setRootEl((prev) => (prev === el ? prev : el));
  }, []);
  const engineRef = useRef<EngineHandle | null>(null);
  const [engine, setEngine] = useState<EngineHandle | null>(null);
  const plotBootstrap = usePlotBootstrap(engine);
  const [shellHeight, setShellHeight] = useState(defaultHeight);
  const [narrow, setNarrow] = useState(false);
  const [collapsed, setCollapsed] = useState({ left: false, right: false });
  const savedHeightRef = useRef<number | null>(null);
  const wasFullscreenRef = useRef(false);

  const inspectCube = useInspectCube(facade, lm, engine);
  // One decoded-chunk cache per widget, kept across cube opens.
  const chunkCache = useMemo(() => new ChunkCache(), []);
  // Inspect entry thumbnails by selection id, kept across cube opens (never
  // synced). The cube adds them; the Selections panel shows them. The Map is
  // mutable, so the cube bumps `snapshotVersion` when it adds one.
  const snapshots = useMemo(() => new Map<string, ChipSnapshot>(), []);
  const [snapshotVersion, bumpSnapshotVersion] = useReducer((n: number) => n + 1, 0);
  // Drop snapshots of deleted selections (ids are reused).
  useEffect(() => {
    const ids = new Set(lm.selections.map((s) => String(s.id)));
    for (const id of snapshots.keys()) if (!ids.has(id)) snapshots.delete(id);
  }, [lm.selections, snapshots]);
  // The dock always loads level 0 for its window (only the 3D texture axis
  // limit can make it coarser); the preview's budget sizes its first step.
  const budgets = useMemo(
    () => cubeBudgets ?? { preview: PREVIEW_REGION_BUDGET, dock: Number.POSITIVE_INFINITY },
    [cubeBudgets],
  );
  const { hasVolume, cube, patchCube } = inspectCube;

  // Decode each packed buffer once per string, and only when there is a cube.
  const points = useMemo(
    () => (hasVolume ? decodeF32Base64(lm.points_data) : null),
    [hasVolume, lm.points_data],
  );
  const labelIds = useMemo(
    () => (hasVolume && lm.volume_label_ids ? decodeI32Base64(lm.volume_label_ids) : null),
    [hasVolume, lm.volume_label_ids],
  );
  const codes = useMemo(
    () => (hasVolume && lm.category_codes ? decodeI32Base64(lm.category_codes) : null),
    [hasVolume, lm.category_codes],
  );
  const coloring = useMemo(() => {
    if (!cube.open || !points || lm.inspect_cx == null || lm.inspect_cy == null) return NO_COLORING;
    return cubeCellColoring({
      points,
      xBounds: lm.x_bounds,
      yBounds: lm.y_bounds,
      labelIds,
      codes,
      columns: lm.category_columns.map((c) => ({
        name: c.name,
        labels: c.labels ?? [],
        palette: c.palette ?? [],
      })),
      activeCategory: lm.active_category,
      colorBy: lm.color_by,
      focus: { kind: lm.selected_kind, index: lm.selected_index },
      selections: lm.selections,
      window: { cx: lm.inspect_cx, cy: lm.inspect_cy, size: lm.inspect_size_um || INSPECT_WINDOW_UM },
    });
  }, [
    cube.open,
    points,
    lm.x_bounds,
    lm.y_bounds,
    labelIds,
    codes,
    lm.category_columns,
    lm.active_category,
    lm.color_by,
    lm.selected_kind,
    lm.selected_index,
    lm.selections,
    lm.inspect_cx,
    lm.inspect_cy,
    lm.inspect_size_um,
  ]);
  const inspecting = lm.mode === "inspect";
  // The immersive cube shows only in Inspect (leaving Inspect also closes it).
  const cubeOpen = hasVolume && cube.open && inspecting;

  // The user's landmarks, drawn in the cube views for context.
  const [landmarkGeometry, setLandmarkGeometry] = useState<CubeOverlay[] | null>(null);
  useEffect(() => {
    if (!engine || !hasVolume) return;
    const read = () => setLandmarkGeometry(engine.getLandmarkGeometry());
    read();
    return engine.subscribeLandmarks(read);
  }, [engine, hasVolume]);

  // Inspect clears the map: both docks collapse on entry (peek tabs stay, so
  // either can be reopened), and leaving restores the docks as they were.
  // Client-local, like the rest of the collapse state.
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;
  const preInspectRef = useRef<typeof collapsed | null>(null);
  useEffect(() => {
    if (inspecting) {
      preInspectRef.current = collapsedRef.current;
      setCollapsed({ left: true, right: true });
    } else if (preInspectRef.current) {
      setCollapsed(preInspectRef.current);
      preInspectRef.current = null;
    }
  }, [inspecting]);

  // The top slot swaps the tool pill and the Inspect pill (`<Rise>` each).
  const toolPillRef = useRef<HTMLDivElement>(null);
  const inspectPillRef = useRef<HTMLDivElement>(null);
  // The tool pill shows from the start: no entrance on the widget's first
  // render (Rise starts it in its effect, before the first frame we finish it).
  useEffect(() => {
    for (const a of toolPillRef.current?.getAnimations() ?? []) a.finish();
  }, []);
  // When the swap takes the focused control away (the leaving pill goes
  // inert), focus moves into the incoming pill: Exit Inspect on entry, the
  // restored tool's radio on exit. Runs before the browser blurs the inert
  // control, so a keyboard user keeps focus inside the widget.
  const wasInspectingRef = useRef(inspecting);
  useLayoutEffect(() => {
    if (wasInspectingRef.current === inspecting) return;
    wasInspectingRef.current = inspecting;
    const leaving = inspecting ? toolPillRef.current : inspectPillRef.current;
    const incoming = inspecting ? inspectPillRef.current : toolPillRef.current;
    const root = rootRef.current;
    if (!leaving || !root) return;
    const active = (root.getRootNode() as Document | ShadowRoot).activeElement;
    if (!active || !leaving.contains(active)) return;
    const target =
      incoming?.querySelector<HTMLElement>(
        inspecting ? '[aria-label="Exit Inspect"]' : '[role="radio"][aria-checked="true"]',
      ) ?? incoming?.querySelector<HTMLElement>("button:not([disabled])");
    if (target) {
      target.focus({ preventScroll: true });
    } else {
      root.tabIndex = -1;
      root.focus({ preventScroll: true });
    }
  }, [inspecting]);

  const syncEngineLayout = useCallback(() => {
    engineRef.current?.resize();
  }, []);

  const { isFullscreen, overlay, toggle } = useWidgetFullscreen(
    rootRef,
    syncEngineLayout,
  );

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onToggle = () => {
      void toggle();
    };
    el.addEventListener("landmarks-toggle-fullscreen", onToggle);
    return () => {
      el.removeEventListener("landmarks-toggle-fullscreen", onToggle);
    };
  }, [toggle]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth;
      setNarrow(width < NARROW_BREAKPOINT);
    });
    ro.observe(el);
    setNarrow(el.clientWidth < NARROW_BREAKPOINT);
    return () => ro.disconnect();
  }, []);

  // "[" / "]" toggle the left / right dock's collapsed state. Ignore key
  // events aimed at text entry so shortcuts don't fire while typing.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "[" && e.key !== "]") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const editable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable ||
        Boolean(target?.closest?.("[contenteditable]"));
      if (editable) return;
      e.preventDefault();
      const side = e.key === "[" ? "left" : "right";
      setCollapsed((c) => ({ ...c, [side]: !c[side] }));
    };
    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (isFullscreen && !wasFullscreenRef.current) {
      savedHeightRef.current = shellHeight;
    }
    if (!isFullscreen && wasFullscreenRef.current && savedHeightRef.current != null) {
      setShellHeight(savedHeightRef.current);
      savedHeightRef.current = null;
      syncEngineLayout();
    }
    wasFullscreenRef.current = isFullscreen;
  }, [isFullscreen, shellHeight, syncEngineLayout]);

  useEffect(() => {
    hostEl.style.width = "100%";
    hostEl.style.maxWidth = "100%";
    hostEl.style.minWidth = "0";
    hostEl.style.display = "block";
  }, [hostEl]);

  useEffect(() => {
    const host = plotHostRef.current;
    if (!host) return;
    const engine = mountEngine({ model: facade, host, inspectWindowUm });
    engineRef.current = engine;
    setEngine(engine);
    return () => {
      engine.destroy();
      engineRef.current = null;
      setEngine(null);
    };
    // Remount when Vite HMR replaces mountEngine (landmarks.js changes).
  }, [facade, mountEngine, inspectWindowUm]);

  const onResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const maxH = Math.min(window.innerHeight * 0.9, MAX_HEIGHT);
      const start = {
        y: event.clientY,
        h: shellHeight,
        maxH,
      };
      const move = (ev: PointerEvent) => {
        setShellHeight(
          Math.round(
            Math.min(start.maxH, Math.max(MIN_HEIGHT, start.h + (ev.clientY - start.y))),
          ),
        );
        syncEngineLayout();
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        syncEngineLayout();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [shellHeight, syncEngineLayout],
  );

  return (
    <WidgetPortalContext.Provider value={rootEl}>
    <div
      ref={rootRef}
      className={cn(
        "milume-widget landmarks relative min-w-0 w-full",
        dark && "dark landmarks--dark",
        !dark && "landmarks--light",
        narrow && "landmarks--narrow",
        isFullscreen && "landmarks--fs",
        overlay && "landmarks--overlay-fs",
        lm.show_rulers && "landmarks--rulers",
        // Docks and peek tabs float over the open cube (landmarks.css).
        cubeOpen && "landmarks--cube-open",
      )}
      data-rulers={lm.show_rulers ? "on" : "off"}
      onKeyDown={inspectCube.onKeyDown}
    >
      <div
        className="landmarks__body"
        style={isFullscreen ? undefined : { height: shellHeight }}
      >
        <div className="landmarks__figure">
          <div className="landmarks__main landmarks__main--plot relative">
            <div
              ref={plotHostRef}
              className="landmarks__plot-host relative min-h-0 flex-1 w-full h-full"
            />
            <PlotLoadIndicator bootstrap={plotBootstrap} />
            <CanvasRulers lm={lm} engine={engine} />
          </div>
        </div>
        {isFullscreen ? null : (
          <button
            type="button"
            className="landmarks__resize"
            aria-label="Resize height"
            title="Resize height"
            onPointerDown={onResizePointerDown}
          />
        )}
      </div>
      <div className="landmarks__chrome">
        <div
          className="landmarks__chrome-tools"
          onMouseDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          {/* One slot: the Inspect pill swaps in for the tool pill (both stack while one leaves). */}
          <Rise ref={toolPillRef} show={!inspecting} inert={inspecting}>
            <Topbar
              modes={ALL_MODES}
              mode={lm.mode}
              onMode={(mode) => lm.setMode(mode)}
              fullscreen={isFullscreen}
              onToggleFullscreen={() => {
                toggle();
              }}
              onZoomIn={() => engineRef.current?.zoomBy(1)}
              onZoomOut={() => engineRef.current?.zoomBy(-1)}
              onReset={() => engineRef.current?.resetZoom()}
            />
          </Rise>
          <Rise ref={inspectPillRef} show={inspecting} inert={!inspecting}>
            <InspectPill
              open={cubeOpen}
              sizeUm={lm.inspect_size_um || INSPECT_WINDOW_UM}
              load={toInspectLoad(cube.load, cube.loadError)}
              saved={isWindowSaved(lm)}
              canSave={lm.inspect_cx != null && lm.inspect_cy != null}
              fullscreen={isFullscreen}
              onExit={inspectCube.exitInspect}
              onSave={inspectCube.save}
              onToggleFullscreen={() => {
                toggle();
              }}
              onZoomIn={() => engineRef.current?.zoomBy(1)}
              onZoomOut={() => engineRef.current?.zoomBy(-1)}
              onResetZoom={() => engineRef.current?.resetZoom()}
            />
          </Rise>
        </div>

        {inspecting && hasVolume ? (
          <InspectToolbar
            settings={cube}
            patch={patchCube}
            labelsAvailable={Boolean(lm.volume?.labels_url)}
            pointsAvailable={(lm.render_mode || "points") === "points"}
            cut={inspectCube.cut}
            cutRanges={inspectCube.cutRanges}
            onCutLive={inspectCube.onCutLive}
            onCutCommit={inspectCube.onCutCommit}
            onReset={inspectCube.resetAdjust}
          />
        ) : inspecting && !hasVolume ? (
          <InspectNoVolumePill />
        ) : (
          <SelectionToolbar lm={lm} engine={engine} />
        )}

        {cubeOpen ? (
          <CubeImmersive
            lm={lm}
            engine={engine}
            settings={cube}
            patch={patchCube}
            cut={inspectCube.cut}
            dark={dark}
            coloring={coloring}
            cache={chunkCache}
            budgets={budgets}
            snapshots={snapshots}
            overlays={landmarkGeometry}
            onSnapshot={bumpSnapshotVersion}
            onPan={inspectCube.panWindow}
            onPanEnd={inspectCube.panEnd}
            onCutLive={inspectCube.onCutLive}
            onCutCommit={inspectCube.onCutCommit}
            labelAlpha={labelAlpha}
          />
        ) : null}

        {/* Kept mounted once there is a volume (hidden outside Inspect): no WebGL context churn. */}
        {hasVolume ? (
          <InspectPreview
            active={inspecting && !cube.open}
            lm={lm}
            engine={engine}
            rootEl={rootEl}
            settings={cube}
            coloring={coloring}
            dark={dark}
            cache={chunkCache}
            budgets={budgets}
            overlays={landmarkGeometry}
          />
        ) : null}

        <div
          className="landmarks__chrome-view"
          onMouseDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <ViewCta lm={lm} />
        </div>

        {narrow ? (
          <>
            <div
              className={cn(
                "landmarks__chrome-dock landmarks__chrome-dock--left landmarks__chrome-dock--narrow-stack",
                collapsed.left && "landmarks__chrome-dock--collapsed",
              )}
              data-collapsed={collapsed.left ? "true" : "false"}
              inert={collapsed.left}
              onMouseDown={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
            >
              <PanelCollapseButton
                side="left"
                onCollapse={() => setCollapsed((c) => ({ ...c, left: true }))}
              />
              <div
                className={cn(
                  FLOAT_PANEL,
                  "flex h-full min-h-0 max-h-full flex-1 flex-col",
                )}
                data-testid="info-explore-stack"
              >
                <RightChromeStack lm={lm} engine={engine} />
              </div>
              <LayersPanel
                lm={lm}
                snapshots={snapshots}
                snapshotVersion={snapshotVersion}
                stackZ={inspectCube.stackZ}
                onFocusEntry={inspectCube.focusEntry}
              />
            </div>
            {collapsed.left ? (
              <PanelPeekTab
                side="left"
                onExpand={() => setCollapsed((c) => ({ ...c, left: false }))}
              />
            ) : null}
          </>
        ) : (
          <>
            <div
              className={cn(
                "landmarks__chrome-dock landmarks__chrome-dock--left",
                collapsed.left && "landmarks__chrome-dock--collapsed",
              )}
              data-collapsed={collapsed.left ? "true" : "false"}
              inert={collapsed.left}
              onMouseDown={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
            >
              <PanelCollapseButton
                side="left"
                onCollapse={() => setCollapsed((c) => ({ ...c, left: true }))}
              />
              <LayersPanel
                lm={lm}
                snapshots={snapshots}
                snapshotVersion={snapshotVersion}
                stackZ={inspectCube.stackZ}
                onFocusEntry={inspectCube.focusEntry}
              />
            </div>
            {collapsed.left ? (
              <PanelPeekTab
                side="left"
                onExpand={() => setCollapsed((c) => ({ ...c, left: false }))}
              />
            ) : null}
            <div
              className={cn(
                "landmarks__chrome-dock landmarks__chrome-dock--right",
                collapsed.right && "landmarks__chrome-dock--collapsed",
              )}
              data-collapsed={collapsed.right ? "true" : "false"}
              inert={collapsed.right}
              onMouseDown={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
            >
              <PanelCollapseButton
                side="right"
                onCollapse={() => setCollapsed((c) => ({ ...c, right: true }))}
              />
              <div
                className={cn(
                  FLOAT_PANEL,
                  "flex h-full min-h-0 max-h-full w-full flex-1 flex-col",
                )}
                data-testid="info-explore-stack"
              >
                <RightChromeStack lm={lm} engine={engine} />
              </div>
            </div>
            {collapsed.right ? (
              <PanelPeekTab
                side="right"
                onExpand={() => setCollapsed((c) => ({ ...c, right: false }))}
              />
            ) : null}
            <div
              className="landmarks__chrome-minimap"
              onMouseDown={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
            >
              <MinimapPanel lm={lm} engine={engine} dark={dark} />
            </div>
          </>
        )}
        <LandmarkCanvasMenu lm={lm} engine={engine} rootEl={rootEl} />
      </div>
    </div>
    </WidgetPortalContext.Provider>
  );
}
