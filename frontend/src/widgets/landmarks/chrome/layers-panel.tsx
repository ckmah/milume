import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FieldDescription } from "@/components/ui/field";
import { GroupBody } from "@/components/ui/group-rise";
import { cn } from "@/lib/utils";

import { landmarkColor, SELECTION_COLORS } from "../helpers";
import { inspectWindowOf } from "../use-inspect-cube";
import type { LandmarksModel } from "../use-landmarks-model";
import { type ChipSnapshot, windowKey } from "./cube-snapshots";
import { LayersStackSection, layersStackCount } from "./layers-stack-section";
import { PanelSectionHeader } from "./panel-section-header";
import type { EngineHandle } from "../engine";
import { PseudospaceGroup, SparkleButton } from "./pseudospace-group";
import { LayerRow, PanelBand } from "./primitives";
import { useWidgetPortal } from "./widget-portal-context";
import { SelectionCard } from "./selection-card";

const NO_SNAPSHOTS = new Map<string, ChipSnapshot>();

const DOCK_SECTIONS = ["selections", "landmarks", "layers"] as const;
type DockSection = (typeof DOCK_SECTIONS)[number];

function clearSelection(lm: LandmarksModel) {
  lm.select("", -1);
}

function withToggled(open: ReadonlySet<DockSection>, id: DockSection) {
  const next = new Set(open);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * Cap open bodies to the dock budget. A list that fits the leftover stays at
 * its content. Lists that do not fit share whatever is left after those.
 */
function capOpenBodies(root: HTMLElement, dock: HTMLElement) {
  const scrolls = [
    ...root.querySelectorAll<HTMLElement>(".landmarks-panel-section--open .landmarks-panel-section__scroll"),
  ];
  for (const scroll of scrolls) scroll.style.maxHeight = "";
  // Used height is the cap once an uncapped list hits the dock max-height.
  const budget = dock.getBoundingClientRect().height;
  if (!Number.isFinite(budget) || budget <= 0 || scrolls.length === 0) return;

  const headers = [...root.querySelectorAll<HTMLElement>(".landmarks-panel-section-header")].reduce(
    (sum, header) => sum + header.getBoundingClientRect().height,
    0,
  );
  const sectionsEl = root.querySelector(".landmarks-panel-sections");
  const dockBox = dock.getBoundingClientRect();
  const sectionsTop = sectionsEl?.getBoundingClientRect().top ?? dockBox.top;
  const rootStyle = getComputedStyle(root);
  const below =
    Number.parseFloat(rootStyle.paddingBottom) + Number.parseFloat(rootStyle.borderBottomWidth);
  const available = Math.max(0, budget - (sectionsTop - dockBox.top) - below - headers);
  // On a phone the color stack already took its cap. A share under one row
  // would clip the group, so the panel scrolls and each body keeps its content.
  const row = Number.parseFloat(getComputedStyle(root).getPropertyValue("--lm-layer-row-h")) || 30;
  if (root.closest(".landmarks--narrow") && available < scrolls.length * row) return;
  const contents = scrolls.map((scroll) => scroll.scrollHeight);
  const order = contents
    .map((height, index) => ({ height, index }))
    .sort((a, b) => a.height - b.height || a.index - b.index);
  let remaining = available;
  for (let n = 0; n < order.length; n++) {
    const height = order[n].height;
    const same = order.slice(n).filter((item) => item.height === height).length;
    if (height * same <= remaining + 1) {
      remaining -= height;
      continue;
    }
    const share = Math.max(0, remaining / (order.length - n));
    for (let k = n; k < order.length; k++) {
      scrolls[order[k].index].style.maxHeight = `${share}px`;
    }
    return;
  }
}

/** Scroll lives on the wrapper. GroupBody keeps overflow hidden so the height motion can clip. */
function SectionBody({
  open,
  className,
  children,
}: {
  open: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="landmarks-panel-section__scroll landmarks-overlay-scroll">
      <GroupBody open={open} className={className}>
        {children}
      </GroupBody>
    </div>
  );
}

/**
 * Left dock. Selections, Landmarks, and Layers open independently.
 * The open set lasts for this mount, including minimise. A remount starts with all three open.
 */
export function LayersPanel({
  lm,
  engine = null,
  snapshots = NO_SNAPSHOTS,
  snapshotVersion = 0,
  stackZ = null,
  onFocusEntry,
  minimise = false,
  grouping: groupingProp,
  onGroupingChange,
  pseudospaceOrder: orderProp,
  onPseudospaceOrderChange,
}: {
  lm: LandmarksModel;
  engine?: EngineHandle | null;
  snapshots?: Map<string, ChipSnapshot>;
  snapshotVersion?: number;
  stackZ?: [number, number] | null;
  onFocusEntry?: (index: number) => void;
  minimise?: boolean;
  /** Shared across the wide and phone docks so a resize keeps the group. */
  grouping?: boolean;
  onGroupingChange?: (on: boolean) => void;
  pseudospaceOrder?: string[];
  onPseudospaceOrderChange?: (order: string[]) => void;
}) {
  const { selections, landmarks, selected_kind, selected_index } = lm;
  const [openSections, setOpenSections] = useState<ReadonlySet<DockSection>>(
    () => new Set(DOCK_SECTIONS),
  );
  const [minimisePeek, setMinimisePeek] = useState<DockSection | null>(null);
  const [groupingLocal, setGroupingLocal] = useState(false);
  const [orderLocal, setOrderLocal] = useState<string[]>([]);
  const grouping = groupingProp ?? groupingLocal;
  const pseudospaceOrder = orderProp ?? orderLocal;
  const setGrouping = (on: boolean) => {
    onGroupingChange?.(on);
    if (groupingProp === undefined) setGroupingLocal(on);
  };
  const setPseudospaceOrder = (order: string[]) => {
    onPseudospaceOrderChange?.(order);
    if (orderProp === undefined) setOrderLocal(order);
  };

  useEffect(() => {
    if (minimise) setMinimisePeek(null);
  }, [minimise]);

  useEffect(() => {
    if (!grouping || minimise) return;
    setOpenSections((prev) => (prev.has("landmarks") ? prev : new Set([...prev, "landmarks"])));
  }, [grouping, minimise]);

  const thumbs = useMemo(
    () =>
      selections.map((sel) => {
        const win = inspectWindowOf(sel);
        const snap = win ? snapshots.get(String(sel.id)) : undefined;
        return snap && win && snap.key === windowKey(win) ? snap : null;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutable Map
    [selections, snapshots, snapshotVersion],
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const menuContainer = useWidgetPortal();

  const toggleSection = (id: DockSection) => {
    if (minimise) {
      setMinimisePeek((prev) => (prev === id ? null : id));
      return;
    }
    setOpenSections((prev) => withToggled(prev, id));
  };

  const selectionPin =
    selected_kind === "selection" && selected_index >= 0 && selections[selected_index]
      ? {
          label: String(selections[selected_index].id),
          color: SELECTION_COLORS[selected_index % SELECTION_COLORS.length],
          onClear: () => clearSelection(lm),
          clearLabel: `Clear selection ${selections[selected_index].id}`,
        }
      : null;

  const landmarkPin =
    selected_kind === "landmark" && selected_index >= 0 && landmarks[selected_index]
      ? {
          label: String(landmarks[selected_index].id),
          color: landmarkColor(landmarks[selected_index], selected_index),
          onClear: () => clearSelection(lm),
          clearLabel: `Clear landmark ${landmarks[selected_index].id}`,
        }
      : null;

  const layersCount = layersStackCount(lm);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const dock = root?.closest(".landmarks__chrome-dock");
    const widget = root?.closest(".milume-widget");
    if (!root || !(dock instanceof HTMLElement) || !(widget instanceof HTMLElement)) return;
    const apply = () => capOpenBodies(root, dock);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(widget);
    return () => observer.disconnect();
  }, [openSections, minimise, minimisePeek, selections.length, landmarks.length, layersCount]);

  const sectionOpen = (id: DockSection) =>
    minimise ? minimisePeek === id : openSections.has(id);

  return (
    <div
      ref={rootRef}
      className={cn(
        "landmarks__layers-panel landmarks-float landmarks-float--panel pointer-events-auto flex h-full min-h-0 max-h-full flex-1 flex-col overflow-hidden",
        minimise && "landmarks__layers-panel--minimise",
      )}
    >
          <div
            className="landmarks-panel-sections flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <PanelBand
              className={cn(sectionOpen("selections") && "landmarks-panel-section--open")}
            >
              <PanelSectionHeader
                label="Selections"
                open={sectionOpen("selections")}
                onToggle={() => toggleSection("selections")}
                pin={selectionPin}
                testId="panel-section-selections"
                minimise={minimise}
              />
              <SectionBody
                open={sectionOpen("selections")}
                className="landmarks-panel-section__body flex flex-col gap-0.5 px-0 pb-1.5"
              >
                {selections.length ? (
                  selections.map((sel, i) => (
                    <LayerRow
                      key={`${sel.id}-${i}`}
                      testId="selection-row"
                      active={
                        selected_kind === "selection" && selected_index === i
                      }
                      color={SELECTION_COLORS[i % SELECTION_COLORS.length]}
                      swatchVariant="selection"
                      label={sel.id}
                      hidden={!!sel.hidden}
                      menuContainer={menuContainer}
                      thumbnail={thumbs[i]?.url ?? null}
                      hoverContent={
                        <SelectionCard
                          lm={lm}
                          index={i}
                          snapshot={thumbs[i] ?? null}
                          stackZ={stackZ}
                        />
                      }
                      onSelect={() =>
                        inspectWindowOf(sel) && onFocusEntry
                          ? onFocusEntry(i)
                          : lm.select("selection", i)
                      }
                      onRename={(next) => lm.renameSelection(i, next)}
                      onToggleHidden={() => lm.toggleSelectionHidden(i)}
                      onDelete={() => lm.deleteSelection(i)}
                    />
                  ))
                ) : (
                  <FieldDescription>No selections yet.</FieldDescription>
                )}
              </SectionBody>
            </PanelBand>

            <PanelBand
              className={cn(sectionOpen("landmarks") && "landmarks-panel-section--open")}
            >
              <PanelSectionHeader
                label="Landmarks"
                open={sectionOpen("landmarks")}
                onToggle={() => toggleSection("landmarks")}
                pin={landmarkPin}
                action={
                  <SparkleButton
                    on={grouping}
                    onToggle={() => {
                      setGrouping(!grouping);
                      setPseudospaceOrder([]);
                    }}
                  />
                }
                testId="panel-section-landmarks"
                minimise={minimise}
              />
              <SectionBody
                open={sectionOpen("landmarks")}
                className="landmarks-panel-section__body flex flex-col gap-0.5 px-0 pb-1.5"
              >
                {grouping ? (
                  <PseudospaceGroup
                    lm={lm}
                    engine={engine}
                    order={pseudospaceOrder}
                    onOrder={setPseudospaceOrder}
                  />
                ) : landmarks.length ? (
                  landmarks.map((lmItem, i) => {
                    const color = landmarkColor(lmItem, i);
                    return (
                      <LayerRow
                        key={`${lmItem.id}-${i}`}
                        active={
                          selected_kind === "landmark" && selected_index === i
                        }
                        color={color}
                        swatchVariant="solid"
                        label={String(lmItem.id)}
                        hidden={!!lmItem.hidden}
                        menuContainer={menuContainer}
                        onSelect={() => lm.select("landmark", i)}
                        onRename={(next) => lm.renameLandmark(i, next)}
                        onToggleHidden={() => lm.toggleLandmarkHidden(i)}
                        onDelete={() => lm.deleteLandmark(i)}
                      />
                    );
                  })
                ) : (
                  <FieldDescription>No landmarks yet.</FieldDescription>
                )}
              </SectionBody>
            </PanelBand>

            <PanelBand
              tone={sectionOpen("layers")}
              className={cn(sectionOpen("layers") && "landmarks-panel-section--open")}
            >
              <PanelSectionHeader
                label="Layers"
                open={sectionOpen("layers")}
                onToggle={() => toggleSection("layers")}
                testId="panel-section-layers"
                minimise={minimise}
              />
              <SectionBody
                open={sectionOpen("layers")}
                className="landmarks-panel-section__body"
              >
                <LayersStackSection lm={lm} />
              </SectionBody>
            </PanelBand>
          </div>
    </div>
  );
}
