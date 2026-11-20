import type { OptionProps } from "./types";

export function OptionC({ scene }: OptionProps) {
  return (
    <div data-testid="transect-option-c" data-stops={scene.stops.length} className="hidden" />
  );
}
