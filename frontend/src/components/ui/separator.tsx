import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";

import { cn } from "@/lib/utils";

function Separator({
  className,
  orientation = "horizontal",
  decorative: _decorative,
  ...props
}: SeparatorPrimitive.Props & { decorative?: boolean }) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "tact-separator shrink-0 bg-transparent",
        orientation === "horizontal" ? "h-2 w-full" : "h-full w-2",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
