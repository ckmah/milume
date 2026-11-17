/** CSS skins over the base-nova kit. Not shadcn presets. `shadcn add` has no game style. */
export const GAME_SKINS = ["game-hud", "game-loadout", "game-tact"];

export function isGameSkin(value) {
  return GAME_SKINS.includes(value);
}
