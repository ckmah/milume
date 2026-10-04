import { useEffect, useMemo, useRef, useState } from "react";

import { Card } from "@/components/ui/card";
import { FieldDescription } from "@/components/ui/field";
import { ItemGroup } from "@/components/ui/item";
import { cn } from "@/lib/utils";

import { landmarkStableColor, SELECTION_COLORS } from "../helpers";
import { inspectWindowOf } from "../use-inspect-cube";
import type { LandmarksModel } from "../use-landmarks-model";
import { type ChipSnapshot, windowKey } from "./cube-snapshots";
import { LayerRow } from "./primitives";
import { SelectionCard } from "./selection-card";
import { FLOAT_PANEL, FLOAT_PANEL_CLIP, SECTION_LABEL } from "./sections";

const NO_SNAPSHOTS = new Map<string, ChipSnapshot>();

/**
 * Left dock: selections + landmarks (single-select only). An inspect entry's
 * row shows its cube thumbnail, and clicking it restores its window and cut
 * (`onFocusEntry`); every selection row has a hover card (`SelectionCard`).
 */
export function LayersPanel({
  lm,
  snapshots = NO_SNAPSHOTS,
  snapshotVersion = 0,
  stackZ = null,
  onFocusEntry,
}: {
  lm: LandmarksModel;
  /** Inspect entry thumbnails by selection id (mutable; see `snapshotVersion`). */
  snapshots?: Map<string, ChipSnapshot>;
  /** Bumped when `snapshots` gains or replaces a thumbnail. */
  snapshotVersion?: number;
  /** The 3D image's Z extent (µm), once known: an entry cut to all of it has no depth line. */
  stackZ?: [number, number] | null;
  /** Focus an inspect entry and restore its window and cut (opens the cube). */
  onFocusEntry?: (index: number) => void;
}) {
  const { selections, landmarks, selected_kind, selected_index } = lm;
  // A thumbnail only while it shows its entry's window (ids are reused).
  const thumbs = useMemo(
    () =>
      selections.map((sel) => {
        const win = inspectWindowOf(sel);
        const snap = win ? snapshots.get(String(sel.id)) : undefined;
        return snap && win && snap.key === windowKey(win) ? snap : null;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the Map is mutable: snapshotVersion marks its changes
    [selections, snapshots, snapshotVersion],
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuContainer, setMenuContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setMenuContainer(
      (rootRef.current?.closest(
        ".milume-widget, .landmarks",
      ) as HTMLElement | null) ?? null,
    );
  }, []);

  return (
    <div
      ref={rootRef}
      className="landmarks__layers-panel flex h-full min-h-0 flex-1 flex-col"
    >
      <Card className={cn(FLOAT_PANEL, "flex h-full min-h-0 flex-1 flex-col")}>
        <div className={cn(FLOAT_PANEL_CLIP, "flex h-full min-h-0 flex-1 flex-col")}>
          <div className={cn("py-1.5", "landmarks-overlay-scroll min-h-0 flex-1")}>
            <section>
              <h3 className={SECTION_LABEL}>Selections</h3>
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
                        <SelectionCard lm={lm} index={i} snapshot={thumbs[i] ?? null} stackZ={stackZ} />
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
            </section>

            <section className="pt-1">
              <h3 className={SECTION_LABEL}>Landmarks</h3>
              {landmarks.length ? (
                <ItemGroup className="gap-0.5">
                  {landmarks.map((lmItem, i) => {
                    const color =
                      (typeof lmItem.color === "string" && lmItem.color) ||
                      landmarkStableColor(String(lmItem.id), i);
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
            </section>
          </div>
        </div>
      </Card>
    </div>
  );
}
