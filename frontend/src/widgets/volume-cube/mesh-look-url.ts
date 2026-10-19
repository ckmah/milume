import type { MeshLook } from "./cell-mesh";

/**
 * URL overrides for the mesh look (proto-cell-mesh-ts), 0 = off: `?meshFresnel=` head-on alpha
 * floor, `?meshShine=` specular 0..1, `?meshFlat=` shading flatness 0..1, `?meshImgBoost=` mesh-mode
 * image boost 0..1; `?meshAlpha=` peak opacity. Unset fields fall back to DEFAULT_MESH_LOOK.
 */
export function urlMeshLook(search = typeof window === "undefined" ? "" : window.location.search): Partial<MeshLook> {
  const q = new URLSearchParams(search);
  const out: Partial<MeshLook> = {};
  const keys = [["opacity", "meshAlpha"], ["fresnelMin", "meshFresnel"], ["shine", "meshShine"], ["flat", "meshFlat"], ["imgBoost", "meshImgBoost"]] as const;
  for (const [k, name] of keys) {
    const v = q.get(name);
    if (v != null && v !== "" && Number.isFinite(Number(v))) out[k] = Number(v);
  }
  return out;
}
