import { VolumeLayer, XR3DLayer } from "@hms-dbmi/viv";

import type { Texture } from "./cell-volume";

/**
 * The image window on the GPU at its own dtype.
 *
 * Viv 0.22's XR3DLayer uploads every volume as float32 (`dataToTexture` casts
 * to a Float32Array, format r32float), and luma.gl keeps the upload array in
 * the texture's props: for a uint8 window that is 4 B/voxel on the GPU plus
 * 4 B/voxel on the CPU for 1 B of data. The cube's XR3DLayer (`CubeXR3DLayer`)
 * keeps Viv's raycast, box, cuts and filtering and replaces only that upload:
 *
 * - uint8 -> `r8unorm` (1 B/voxel)
 * - uint16 -> `r16unorm` (2 B/voxel) when the device has EXT_texture_norm16,
 *   else `r32float` as before (exact: every uint16 is a float32 integer)
 * - anything else (float32, int16, ...) -> `r32float` as before
 *
 * A unorm texture samples as `value / max`; `imageScale` (255, 65535 or 1)
 * turns the sample back into the raw value before Viv's contrast ramp, so
 * contrast limits keep their meaning (see `cubeRenderModule` in
 * cell-lut-extension.ts).
 *
 * No CPU copy is kept once the texture is written: the texels go in with
 * `copyImageData` (luma.gl keeps no reference to them), and the volume Viv
 * laid out for the upload is released right after (see `releaseVivVolume`).
 */

export type ImageFormat = "r8unorm" | "r16unorm" | "r32float";

export type ImageDevice = {
  createTexture(props: Record<string, unknown>): Texture & { copyImageData(options: { data: ArrayBufferView }): void };
  isTextureFormatSupported(format: string): boolean;
  isTextureFormatFilterable(format: string): boolean;
  /** Sets WebGL parameters around `fn` and restores the previous values. */
  withParametersWebGL?(parameters: Record<number, unknown>, fn: () => void): void;
};

type Volume = ArrayBufferView & ArrayLike<number>;

/** The texture format for a window Viv laid out as `data`, and the factor that turns a sample back into the raw value. */
export function imageTextureFormat(data: Volume, device: ImageDevice): { format: ImageFormat; scale: number } {
  if (data instanceof Uint8Array) return { format: "r8unorm", scale: 255 };
  if (
    data instanceof Uint16Array &&
    device.isTextureFormatSupported("r16unorm") &&
    device.isTextureFormatFilterable("r16unorm")
  ) {
    return { format: "r16unorm", scale: 65535 };
  }
  return { format: "r32float", scale: 1 };
}

/** What each image texture the cube made holds: its format and sample scale. */
const imageTextures = new WeakMap<object, { format: ImageFormat; scale: number }>();

export function imageTextureInfo(texture: unknown): { format: ImageFormat; scale: number } | null {
  return texture && typeof texture === "object" ? (imageTextures.get(texture) ?? null) : null;
}

/**
 * Free the CPU volume Viv laid out for the upload. Viv's VolumeLayer keeps it
 * in its state for the life of the window, but reads it only to create the
 * texture: its XR3DLayer re-uploads only when a new volume arrives (a new
 * array), and a new XR3DLayer (a new window size) comes with a new volume.
 * Detaching the buffer (the array stays, empty, as the identity Viv and the
 * label binding compare) lets it be collected. Only a buffer the array owns
 * whole is detached, never a view into someone else's.
 */
function releaseVivVolume(data: Volume): void {
  const buffer = data.buffer as ArrayBuffer & { transfer?: (length?: number) => ArrayBuffer };
  if (!(buffer instanceof ArrayBuffer) || data.byteOffset !== 0 || data.byteLength !== buffer.byteLength) return;
  if (typeof buffer.transfer === "function") buffer.transfer(0);
  else structuredClone(buffer, { transfer: [buffer] });
}

const GL_UNPACK_ALIGNMENT = 3317;

/** Viv's own sampler for volumes (XR3DLayer `dataToTexture`). */
const LINEAR = {
  minFilter: "linear",
  magFilter: "linear",
  addressModeU: "clamp-to-edge",
  addressModeV: "clamp-to-edge",
  addressModeW: "clamp-to-edge",
};

type LayerInstance = {
  props: Record<string, unknown>;
  context: { device: ImageDevice };
  state: Record<string, unknown>;
  renderLayers(): unknown;
};
const XR3DBase = XR3DLayer as unknown as new (...props: object[]) => LayerInstance;
const VolumeBase = VolumeLayer as unknown as new (...props: object[]) => LayerInstance;

/** Viv's XR3DLayer, uploading the image at its own dtype (see the module note). */
export class CubeXR3DLayer extends XR3DBase {
  static layerName = "CubeXR3DLayer";

  /** Called by Viv's `loadTexture` for each volume it is handed. */
  dataToTexture(data: Volume, width: number, height: number, depth: number): Texture {
    if (data.byteLength === 0 && width * height * depth > 0) {
      // Released after an earlier upload: Viv never re-reads a volume (see releaseVivVolume).
      throw new Error("CubeXR3DLayer: the image volume was already uploaded and released");
    }
    const { device } = this.context;
    const { format, scale } = imageTextureFormat(data, device);
    const texels = format === "r32float" && !(data instanceof Float32Array) ? new Float32Array(data) : data;
    const texture = device.createTexture({
      dimension: "3d",
      width,
      height,
      depth,
      format,
      mipmaps: false,
      sampler: LINEAR,
    });
    // Written after creation (not as `data`), so luma.gl keeps no reference
    // to the texels; rows of an odd-width window (A2: 667 B at r8) are not
    // 4-byte aligned, so the alignment is set for this upload only.
    const upload = () => texture.copyImageData({ data: texels });
    if (device.withParametersWebGL) device.withParametersWebGL({ [GL_UNPACK_ALIGNMENT]: 1 }, upload);
    else upload();
    imageTextures.set(texture, { format, scale });
    releaseVivVolume(data);
    return texture;
  }
}

/** Viv's VolumeLayer, drawing through `CubeXR3DLayer`. */
export class CubeVolumeLayer extends VolumeBase {
  static layerName = "CubeVolumeLayer";

  renderLayers() {
    const layer = super.renderLayers();
    // Viv's progress text before the first volume, else its XR3DLayer: the same props, our upload.
    if (!(layer instanceof XR3DLayer)) return layer;
    return new CubeXR3DLayer({ ...(layer as { props: Record<string, unknown> }).props });
  }
}
