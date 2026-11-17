import { generateHeroPoints, type HeroPoint } from "./camera.ts";

export type HeroField = {
  points: HeroPoint[];
};

export function createHeroField(): HeroField {
  return { points: generateHeroPoints() };
}
