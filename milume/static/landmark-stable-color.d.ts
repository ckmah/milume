export const LANDMARK_COLORS: string[];

export function landmarkStableColor(
  id: string | number | null | undefined,
  fallbackIndex?: number,
): string;

export function landmarkColor(
  lm: { id?: string | number; color?: string | null } | null | undefined,
  fallbackIndex?: number,
): string;

export const LANDMARK_BUFFER_FILL_ALPHA: number;
export const LANDMARK_BUFFER_LINE_ALPHA: number;
