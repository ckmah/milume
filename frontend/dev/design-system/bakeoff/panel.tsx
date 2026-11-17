import { useState, type ComponentType } from "react";

type Kit = Record<string, ComponentType<Record<string, unknown>>>;

const RAMPS = ["Viridis", "Magma", "Gray"] as const;

export function LayersSlice({ kit }: { kit: Kit }) {
  const {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Field,
    FieldLabel,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Separator,
    Slider,
    Switch,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
  } = kit;

  const [visible, setVisible] = useState(true);
  const [size, setSize] = useState(2.25);
  const [ramp, setRamp] = useState<string>("Viridis");

  return (
    <TooltipProvider delay={0}>
      <Card data-bakeoff-panel="">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Layers</CardTitle>
          <DropdownMenu open>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              More
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="right" sideOffset={12}>
              <DropdownMenuItem>Solo visible</DropdownMenuItem>
              <DropdownMenuItem>Reset contrast</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
              Cells
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="flex flex-col gap-4 pt-4">
                <Field orientation="horizontal">
                  <FieldLabel>Visible</FieldLabel>
                  <Switch
                    checked={visible}
                    aria-label="Show cells"
                    onCheckedChange={(next: boolean) => setVisible(next)}
                  />
                </Field>
                <div className="flex items-center justify-between gap-4">
                  <span>Size</span>
                  <span data-bakeoff-size>{size.toFixed(2)}</span>
                </div>
                <Slider
                  min={0.5}
                  max={4}
                  step={0.25}
                  value={[size]}
                  aria-label="Point size"
                  onValueChange={(value: number | readonly number[]) => {
                    const next = typeof value === "number" ? value : value[0];
                    if (typeof next === "number") setSize(next);
                  }}
                />
                <div className="flex items-center justify-between gap-4">
                  <span>Ramp</span>
                  <Select
                    value={ramp}
                    onValueChange={(next: string | null) => {
                      if (next) setRamp(next);
                    }}
                  >
                    <SelectTrigger aria-label="Color ramp">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RAMPS.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
          <Separator />
          <Collapsible>
            <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
              Image
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p>Closed in this slice.</p>
            </CollapsibleContent>
          </Collapsible>
          <div className="flex items-center gap-3">
            <Tooltip open>
              <TooltipTrigger render={<Button variant="ghost" aria-label="Layer help" />}>
                ?
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                Show or hide
              </TooltipContent>
            </Tooltip>
            <Button variant="outline" className="flex-1">
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
