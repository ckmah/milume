import { VolumeLayer } from "@hms-dbmi/viv";

import { encodeLabels } from "@/widgets/volume-cube/cell-volume";

/**
 * e2e probe (volume-cube harness, imported by `volume-cube.spec.ts`): hands the
 * installed Viv's VolumeLayer a labels raster through a loader, takes the
 * volume it lays out for upload (`onViewportLoad`), and checks `encodeLabels`
 * puts every voxel's id at the same texel. Guards `vivRow` in cell-volume.ts,
 * which copies Viv's own (quirky) row order.
 */
export async function vivLayoutMismatches(width: number, height: number, depth: number) {
  const plane = width * height;
  // A distinct id per voxel, with some background.
  const ids = new Uint32Array(plane * depth);
  for (let i = 0; i < ids.length; i++) ids[i] = i % 7 === 3 ? 0 : i + 1;
  const source = {
    shape: [depth, height, width],
    labels: ["z", "y", "x"],
    dtype: "Uint32",
    tileSize: 256,
    meta: { physicalSizes: { x: { size: 1, unit: "µm" }, y: { size: 1, unit: "µm" }, z: { size: 1, unit: "µm" } } },
    getRaster: async ({ selection }: { selection: { z?: number } }) => {
      const z = selection.z ?? 0;
      return { data: ids.subarray(z * plane, (z + 1) * plane), width, height };
    },
  };
  const viv = await new Promise<ArrayLike<number>>((resolve) => {
    const props = {
      loader: [source],
      selections: [{}],
      resolution: 0,
      onViewportLoad: (volumes: { data: ArrayLike<number> }[]) => resolve(volumes[0]!.data),
    };
    // Only VolumeLayer's load step runs: no deck, no GPU.
    const layer = { props, setState() {}, clearState() {} };
    (VolumeLayer.prototype as unknown as { updateState(this: unknown, u: unknown): void }).updateState.call(layer, {
      oldProps: {},
      props,
    });
  });
  const { data, cells } = encodeLabels(ids, width, height);
  let mismatches = 0;
  for (let q = 0; q < ids.length; q++) {
    const idx = data[2 * q]! + 256 * (data[2 * q + 1]! & 127);
    if ((idx ? cells[idx] : 0) !== viv[q]) mismatches++;
  }
  return { texels: ids.length, mismatches };
}
