import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
  type RefObject,
} from "react";

import type { CubeCut } from "./VolumeCube";
import { CutPlates } from "./cut-plates";
import {
  type CutFace,
  cutFaceMarks,
  cutResizeCursor,
  faceKey,
  projectCutFaces,
  type PreBox,
} from "./cut-faces";

export type PointerHit = {
  face: CutFace | null;
  near: CutFace | null;
  dragDir: { x: number; y: number } | null;
};

type CutCamera = { zoom: number; rotationX: number; rotationOrbit: number };

export type VolumeCubeCutChromeHandle = {
  beginCutFace: (face: CutFace) => void;
  endCutFace: () => void;
};

type PointerAt = (clientX: number, clientY: number) => PointerHit;

/**
 * Cut-face plates and hover feedback. State lives here so pointer moves do not
 * re-render the Viv deck parent.
 */
export function VolumeCubeCutChrome({
  ref,
  hostRef,
  pointerAt,
  platesOn,
  handleBox,
  viewState,
  aimTarget,
  viewPixelSize,
  shownCut,
}: {
  ref?: Ref<VolumeCubeCutChromeHandle>;
  hostRef: RefObject<HTMLDivElement | null>;
  pointerAt: PointerAt;
  platesOn: boolean;
  handleBox: PreBox | null;
  viewState: CutCamera | null;
  aimTarget: number[];
  viewPixelSize: { width: number; height: number };
  shownCut: CubeCut;
}) {
  const [hoverFace, setHoverFace] = useState("");
  const [nearFace, setNearFace] = useState("");
  const [cutDragging, setCutDragging] = useState(false);
  const cutDraggingRef = useRef(false);
  const hoverRaf = useRef(0);
  const lastPointer = useRef({ x: Number.NaN, y: Number.NaN });

  useImperativeHandle(ref, () => ({
    beginCutFace: (face: CutFace) => {
      cutDraggingRef.current = true;
      setCutDragging(true);
      setHoverFace(faceKey(face));
      setNearFace("");
    },
    endCutFace: () => {
      cutDraggingRef.current = false;
      setCutDragging(false);
    },
  }));

  useEffect(() => {
    const node = hostRef.current;
    if (!node || !platesOn) return;
    const onMove = (e: PointerEvent) => {
      if (cutDraggingRef.current || (e.buttons & 1) !== 0) return;
      const { clientX: x, clientY: y } = e;
      if (x === lastPointer.current.x && y === lastPointer.current.y) return;
      lastPointer.current = { x, y };
      if (hoverRaf.current) return;
      hoverRaf.current = requestAnimationFrame(() => {
        hoverRaf.current = 0;
        const hit = pointerAt(lastPointer.current.x, lastPointer.current.y);
        const key = hit.face ? faceKey(hit.face) : "";
        const nearKey = hit.near ? faceKey(hit.near) : "";
        setHoverFace((prev) => (prev === key ? prev : key));
        setNearFace((prev) => (prev === nearKey ? prev : nearKey));
      });
    };
    node.addEventListener("pointermove", onMove);
    return () => {
      node.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(hoverRaf.current);
    };
  }, [hostRef, platesOn, pointerAt]);

  const plates = useMemo(
    () => (platesOn && handleBox && viewState ? projectCutFaces(handleBox, viewState, aimTarget, viewPixelSize) : []),
    [platesOn, handleBox, viewState, aimTarget, viewPixelSize],
  );
  const marks = useMemo(
    () =>
      platesOn && handleBox && viewState
        ? cutFaceMarks(handleBox, viewState, aimTarget, viewPixelSize)
        : { anchors: "", centers: "", near: "" },
    [platesOn, handleBox, viewState, aimTarget, viewPixelSize],
  );
  const aimed = plates.find((plate) => faceKey(plate.face) === hoverFace);
  const cutCursor = aimed && viewState ? cutResizeCursor(aimed.face, viewState) : "";

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    el.dataset.cutFace = hoverFace;
    el.dataset.cutNear = nearFace;
    el.dataset.cutDragging = String(cutDragging);
    el.dataset.cutCursor = cutCursor;
    el.dataset.cutAnchors = marks.anchors;
    el.dataset.cutCenters = marks.centers;
    el.dataset.cutNearAnchors = marks.near;
  }, [hostRef, hoverFace, nearFace, cutDragging, cutCursor, marks]);

  if (!platesOn || !viewState) return null;
  return (
    <CutPlates
      plates={plates}
      hover={hoverFace}
      near={nearFace}
      dragging={cutDragging}
      cut={shownCut}
      width={viewPixelSize.width}
      height={viewPixelSize.height}
    />
  );
}
