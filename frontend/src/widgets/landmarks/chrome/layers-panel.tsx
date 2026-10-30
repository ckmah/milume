import { useEffect, useMemo, useRef, useState } from "react";
import { LassoIcon, LayersIcon, SplineIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { FieldDescription } from "@/components/ui/field";
import { ItemGroup } from "@/components/ui/item";
import { cn } from "@/lib/utils";

import { landmarkColor, SELECTION_COLORS } from "../helpers";
import { inspectWindowOf } from "../use-inspect-cube";
import type { LandmarksModel } from "../use-landmarks-model";
import { type ChipSnapshot, windowKey } from "./cube-snapshots";
import { LayersStackSection, layersStackCount } from "./layers-stack-section";
import { PanelSectionHeader } from "./panel-section-header";
import { LayerRow } from "./primitives";
import { useWidgetPortal } from "./widget-portal-context";
import { SelectionCard } from "./selection-card";
import { FLOAT_PANEL, FLOAT_PANEL_CLIP } from "./sections";

const NO_SNAPSHOTS = new Map<string, ChipSnapshot>();

type DockSection = "selections" | "landmarks" | "layers";

function clearSelection(lm: LandmarksModel) {
  lm.select("", -1);
}

/**
 * Left dock: Selections, Landmarks, and Layers in a single-open accordion.
 */
export function LayersPanel({
  lm,
  snapshots = NO_SNAPSHOTS,
  snapshotVersion = 0,
  stackZ = null,
  onFocusEntry,
  minimise = false,
}: {
  lm: LandmarksModel;
  snapshots?: Map<string, ChipSnapshot>;
  snapshotVersion?: number;
  stackZ?: [number, number] | null;
  onFocusEntry?: (index: number) => void;
  minimise?: boolean;
}) {
  const { selections, landmarks, selected_kind, selected_index } = lm;
  const [openSection, setOpenSection] = useState<DockSection | null>("selections");

  useEffect(() => {
    if (minimise) setOpenSection(null);
    else setOpenSection((prev) => prev ?? "selections");
  }, [minimise]);

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
      setOpenSection((prev) => (prev === id ? null : id));
      return;
    }
    setOpenSection(id);
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

  const sectionOpen = (id: DockSection) => openSection === id;

  return (
    <div
      ref={rootRef}
      className={cn(
        "landmarks__layers-panel flex h-full min-h-0 flex-1 flex-col",
        minimise && "landmarks__layers-panel--minimise",
      )}
    >
      <Card className={cn(FLOAT_PANEL, "flex h-full min-h-0 flex-1 flex-col")}>
        <div className={cn(FLOAT_PANEL_CLIP, "flex h-full min-h-0 flex-1 flex-col")}>
          <div
            className={cn(
              "landmarks-panel-sections flex min-h-0 flex-1 flex-col",
              !minimise && "landmarks-overlay-scroll py-0",
            )}
          >
            <section
              className={cn(
                "landmarks-panel-section",
                sectionOpen("selections") && "landmarks-panel-section--open",
              )}
            >
              <PanelSectionHeader
                icon={LassoIcon}
                label="Selections"
                count={selections.length}
                open={sectionOpen("selections")}
                onToggle={() => toggleSection("selections")}
                pin={selectionPin}
                testId="panel-section-selections"
              />
              {sectionOpen("selections") ? (
                <div className="landmarks-panel-section__body px-0 pb-1.5">
                  {selections.length ? (
                    <ItemGroup className="gap-0.5">
                      {selections.map((sel, i) => (
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
                      ))}
                    </ItemGroup>
                  ) : (
                    <FieldDescription>No selections yet.</FieldDescription>
                  )}
                </div>
              ) : null}
            </section>

            <section
              className={cn(
                "landmarks-panel-section",
                sectionOpen("landmarks") && "landmarks-panel-section--open",
              )}
            >
              <PanelSectionHeader
                icon={SplineIcon}
                label="Landmarks"
                count={landmarks.length}
                open={sectionOpen("landmarks")}
                onToggle={() => toggleSection("landmarks")}
                pin={landmarkPin}
                testId="panel-section-landmarks"
              />
              {sectionOpen("landmarks") ? (
                <div className="landmarks-panel-section__body px-0 pb-1.5">
                  {landmarks.length ? (
                    <ItemGroup className="gap-0.5">
                      {landmarks.map((lmItem, i) => {
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
                      })}
                    </ItemGroup>
                  ) : (
                    <FieldDescription>No landmarks yet.</FieldDescription>
                  )}
                </div>
              ) : null}
            </section>

            <section
              className={cn(
                "landmarks-panel-section",
                sectionOpen("layers") && "landmarks-panel-section--open",
              )}
            >
              <PanelSectionHeader
                icon={LayersIcon}
                label="Layers"
                count={layersCount}
                open={sectionOpen("layers")}
                onToggle={() => toggleSection("layers")}
                testId="panel-section-layers"
              />
              {sectionOpen("layers") ? (
                <div className="landmarks-panel-section__body">
                  <LayersStackSection lm={lm} />
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </Card>
    </div>
  );
}
