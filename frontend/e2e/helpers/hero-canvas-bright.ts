/** Count RGBA pixels whose R+G+B exceed `minSum` (WebGL readPixels). */
export async function canvasBrightPixelCount(
  page: import("@playwright/test").Page,
  selector: string,
  minSum = 40,
): Promise<number> {
  return page.evaluate(
    ({ sel, minSum }) => {
      const c = document.querySelector(sel) as HTMLCanvasElement | null;
      const gl = c?.getContext("webgl2") ?? c?.getContext("webgl");
      if (!c || !gl) return 0;
      const w = c.width;
      const h = c.height;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let bright = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i]! + px[i + 1]! + px[i + 2]! > minSum) bright++;
      }
      return bright;
    },
    { sel: selector, minSum },
  );
}

export const HERO_MIN_BRIGHT_PIXELS = 50;
