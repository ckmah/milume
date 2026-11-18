import { Radio } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";

import { cn } from "@/lib/utils";

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("grid gap-2", className)}
      {...props}
    />
  );
}

function RadioGroupItem({ className, ...props }: Radio.Root.Props) {
  return (
    <Radio.Root data-slot="radio-group-item" className={cn("tact-radio", className)} {...props}>
      <Radio.Indicator className="tact-radio-ind" />
    </Radio.Root>
  );
}

export { RadioGroup, RadioGroupItem };
