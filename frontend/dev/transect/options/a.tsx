import type { OptionProps } from "./types";

export function OptionA({ scene }: OptionProps) {
  return (
    <div data-testid="transect-option-a" data-stops={scene.stops.length} className="hidden" />
  );
}
