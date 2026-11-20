import type { OptionProps } from "./types";

export function OptionB({ scene }: OptionProps) {
  return (
    <div data-testid="transect-option-b" data-stops={scene.stops.length} className="hidden" />
  );
}
