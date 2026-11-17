import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { SoftFloatCapsuleSlider } from "@/widgets/landmarks/chrome/soft-float-slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SpringPopover } from "@/components/ui/spring-popover";
import { useWidgetPortal } from "@/widgets/landmarks/chrome/widget-portal-context";

import { DsSection, StateCell } from "./stage";

const LONG = "Epithelial crypt base, a label long enough to overflow the control";

function SliderReadoutSpecimens() {
  const [hundredths, setHundredths] = useState(0.5);
  const [whole, setWhole] = useState(12);
  const [thousandths, setThousandths] = useState(0.5);
  const [stride, setStride] = useState(0.6);
  const loose = 0.1 + 0.2 + 0.4;
  const looseInt = 0.14 * 100;
  const looseMilli = 0.7 + 0.1;
  return (
    <div className="flex w-full flex-col gap-2">
      <SoftFloatCapsuleSlider
        caption="Opacity"
        aria-label="Opacity hundredths"
        testId="slider-readout-hundredths"
        value={hundredths}
        min={0}
        max={loose}
        step={0.01}
        displayValue={hundredths}
        onValueChange={setHundredths}
      />
      <SoftFloatCapsuleSlider
        caption="Count"
        aria-label="Count"
        testId="slider-readout-integer"
        value={whole}
        min={0}
        max={looseInt}
        step={1}
        displayValue={whole}
        onValueChange={setWhole}
      />
      <SoftFloatCapsuleSlider
        caption="Fine"
        aria-label="Fine"
        testId="slider-readout-thousandths"
        value={thousandths}
        min={0}
        max={looseMilli}
        step={0.001}
        displayValue={thousandths}
        onValueChange={setThousandths}
      />
      <SoftFloatCapsuleSlider
        caption="Stride"
        aria-label="Stride"
        testId="slider-readout-binary-step"
        value={stride}
        min={0}
        max={1}
        step={0.1 + 0.2}
        displayValue={stride}
        onValueChange={setStride}
      />
    </div>
  );
}

function forceAttr(state: string): { "data-ds-force"?: string } {
  if (state === "hover" || state === "focus-visible" || state === "active") {
    return { "data-ds-force": state };
  }
  return {};
}

function PopoverSpecimen({ open }: { open: boolean }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const portal = useWidgetPortal();
  return (
    <>
      <Button ref={anchorRef} type="button" size="sm" variant="outline">
        Anchor
      </Button>
      <SpringPopover
        open={open}
        onOpenChange={() => {}}
        portal={portal}
        anchorRef={anchorRef}
        place={() => ({ left: 8, top: 44, origin: "top left" })}
      >
        <p className="m-0 text-xs">Spring popover</p>
      </SpringPopover>
    </>
  );
}

export function UiSections() {
  const [tab, setTab] = useState("map");
  return (
    <>
      <DsSection id="buttons" title="Buttons">
        {(["default", "hover", "focus-visible", "active"] as const).map((state) => (
          <StateCell key={state} state={state}>
            <div className="ds-row">
              <Button type="button" {...forceAttr(state)}>
                Save
              </Button>
              <Button type="button" variant="outline" size="sm" {...forceAttr(state)}>
                Outline
              </Button>
              <Button type="button" variant="ghost" size="sm" {...forceAttr(state)}>
                Ghost
              </Button>
              <Button type="button" variant="destructive" size="sm" {...forceAttr(state)}>
                Delete
              </Button>
            </div>
          </StateCell>
        ))}
        <StateCell state="disabled">
          <Button type="button" disabled>
            Save
          </Button>
        </StateCell>
        <StateCell state="overflow">
          <div className="max-w-[10rem] overflow-hidden">
            <Button type="button" className="max-w-full">
              <span className="truncate">{LONG}</span>
            </Button>
          </div>
        </StateCell>
      </DsSection>

      <DsSection id="toggles" title="Toggles">
        <StateCell state="default">
          <div className="ds-row">
            <Switch aria-label="Layer visible" />
            <Toggle aria-label="Probe">Off</Toggle>
          </div>
        </StateCell>
        <StateCell state="active">
          <div className="ds-row">
            <Switch checked aria-label="Layer visible" />
            <Toggle pressed aria-label="Probe">
              On
            </Toggle>
          </div>
        </StateCell>
        <StateCell state="hover">
          <Switch aria-label="Layer visible" {...forceAttr("hover")} />
        </StateCell>
        <StateCell state="focus-visible">
          <Switch aria-label="Layer visible" {...forceAttr("focus-visible")} />
        </StateCell>
        <StateCell state="disabled">
          <div className="ds-row">
            <Switch disabled aria-label="Layer visible" />
            <Toggle disabled aria-label="Probe">
              Off
            </Toggle>
          </div>
        </StateCell>
        <StateCell state="default">
          <RadioGroup defaultValue="a" aria-label="Basis">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="a" id="basis-a" />
              <Label htmlFor="basis-a">Points</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="b" id="basis-b" disabled />
              <Label htmlFor="basis-b">Raster</Label>
            </div>
          </RadioGroup>
        </StateCell>
      </DsSection>

      <DsSection id="sliders" title="Sliders" note="Raw track and step readouts. Dock and layers use the same rows.">
        <StateCell state="default">
          <Slider aria-label="Opacity" value={[42]} />
        </StateCell>
        <StateCell state="active">
          <Slider aria-label="Contrast" value={[20, 80]} />
        </StateCell>
        <StateCell state="hover">
          <div className="landmarks-slider-control">
            <Slider aria-label="Opacity" value={[42]} />
          </div>
        </StateCell>
        <StateCell state="focus-visible">
          <div className="landmarks-slider-control">
            <Slider aria-label="Opacity" value={[42]} {...forceAttr("focus-visible")} />
          </div>
        </StateCell>
        <StateCell state="disabled">
          <Slider aria-label="Opacity" value={[42]} disabled />
        </StateCell>
        <StateCell state="empty">
          <Slider aria-label="Opacity" value={[0]} />
        </StateCell>
        <StateCell state="default">
          <SliderReadoutSpecimens />
        </StateCell>
      </DsSection>

      <DsSection id="popovers" title="Popovers">
        <StateCell state="closed" stageClassName="min-h-16">
          <PopoverSpecimen open={false} />
        </StateCell>
        <StateCell state="open" stageClassName="min-h-28">
          <PopoverSpecimen open />
        </StateCell>
        <StateCell state="open" stageClassName="min-h-28">
          <HoverCard open>
            <HoverCardTrigger asChild>
              <Button type="button" size="sm" variant="outline">
                Hover card
              </Button>
            </HoverCardTrigger>
            <HoverCardContent>Selection summary</HoverCardContent>
          </HoverCard>
        </StateCell>
        <StateCell state="closed">
          <HoverCard open={false}>
            <HoverCardTrigger asChild>
              <Button type="button" size="sm" variant="outline">
                Hover card
              </Button>
            </HoverCardTrigger>
            <HoverCardContent>Selection summary</HoverCardContent>
          </HoverCard>
        </StateCell>
      </DsSection>

      <DsSection id="menus" title="Menus">
        <StateCell state="closed">
          <DropdownMenu open={false} modal={false}>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="outline">
                Shape
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Lasso</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </StateCell>
        <StateCell state="open" stageClassName="min-h-36">
          <DropdownMenu open modal={false}>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="outline">
                Shape
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Lasso</DropdownMenuItem>
              <DropdownMenuItem disabled>Polygon</DropdownMenuItem>
              <DropdownMenuItem>{LONG}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </StateCell>
        <StateCell state="empty" stageClassName="min-h-28">
          <Combobox items={[]} inputValue="zzzz">
            <ComboboxInput aria-label="Genes" placeholder="Search genes" />
            <ComboboxContent>
              <ComboboxEmpty>No genes</ComboboxEmpty>
              <ComboboxList>
                {(item: string) => (
                  <ComboboxItem key={item} value={item}>
                    {item}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </StateCell>
        <StateCell state="open" stageClassName="min-h-36">
          <Combobox items={["Epcam", "Col1a1"]}>
            <ComboboxInput aria-label="Genes" placeholder="Search genes" />
            <ComboboxContent>
              <ComboboxEmpty>No genes</ComboboxEmpty>
              <ComboboxList>
                {(item: string) => (
                  <ComboboxItem key={item} value={item}>
                    {item}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </StateCell>
        <StateCell state="disabled">
          <Combobox items={["Epcam"]} disabled>
            <ComboboxInput aria-label="Genes" disabled placeholder="Search genes" />
            <ComboboxContent>
              <ComboboxList>
                {(item: string) => (
                  <ComboboxItem key={item} value={item}>
                    {item}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </StateCell>
      </DsSection>

      <DsSection id="tabs" title="Tabs">
        <StateCell state="active">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="genes">Genes</TabsTrigger>
              <TabsTrigger value="info" disabled>
                Info
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </StateCell>
        <StateCell state="overflow">
          <Tabs value="long" onValueChange={() => {}}>
            <TabsList>
              <TabsTrigger value="long">{LONG}</TabsTrigger>
            </TabsList>
          </Tabs>
        </StateCell>
        <StateCell state="open">
          <Collapsible open>
            <CollapsibleTrigger asChild>
              <Button type="button" size="sm" variant="ghost">
                Layers
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>Three channels</CollapsibleContent>
          </Collapsible>
        </StateCell>
        <StateCell state="closed">
          <Collapsible open={false}>
            <CollapsibleTrigger asChild>
              <Button type="button" size="sm" variant="ghost">
                Layers
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>Three channels</CollapsibleContent>
          </Collapsible>
        </StateCell>
      </DsSection>

      <DsSection id="tooltips" title="Tooltips">
        <StateCell state="closed">
          <Tooltip open={false}>
            <TooltipTrigger asChild>
              <Button type="button" size="sm" variant="outline">
                Closed
              </Button>
            </TooltipTrigger>
            <TooltipContent>Hidden tip</TooltipContent>
          </Tooltip>
        </StateCell>
        <StateCell state="open" stageClassName="min-h-20">
          <Tooltip open>
            <TooltipTrigger asChild>
              <Button type="button" size="sm" variant="outline">
                Open
              </Button>
            </TooltipTrigger>
            <TooltipContent>Probe the point under the cursor</TooltipContent>
          </Tooltip>
        </StateCell>
        <StateCell state="overflow" stageClassName="min-h-24">
          <Tooltip open>
            <TooltipTrigger asChild>
              <Button type="button" size="sm" variant="outline">
                Long
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[12rem]">{LONG}</TooltipContent>
          </Tooltip>
        </StateCell>
      </DsSection>

      <DsSection id="inputs" title="Inputs">
        <StateCell state="default">
          <Field>
            <FieldLabel htmlFor="ds-name">Name</FieldLabel>
            <Input id="ds-name" defaultValue="crypt-1" />
            <FieldDescription>Landmark id</FieldDescription>
          </Field>
        </StateCell>
        <StateCell state="hover">
          <Input aria-label="Name" defaultValue="crypt-1" {...forceAttr("hover")} />
        </StateCell>
        <StateCell state="focus-visible">
          <Input aria-label="Name" defaultValue="crypt-1" {...forceAttr("focus-visible")} />
        </StateCell>
        <StateCell state="disabled">
          <Input aria-label="Name" defaultValue="crypt-1" disabled />
        </StateCell>
        <StateCell state="error">
          <Field data-invalid="true">
            <FieldLabel htmlFor="ds-hex">Hex</FieldLabel>
            <Input id="ds-hex" aria-invalid defaultValue="zz" />
            <FieldError>Not a hex color</FieldError>
          </Field>
        </StateCell>
        <StateCell state="overflow">
          <Input aria-label="Name" defaultValue={LONG} className="max-w-full" />
        </StateCell>
        <StateCell state="empty">
          <Textarea aria-label="Note" placeholder="Empty note" />
        </StateCell>
        <StateCell state="default">
          <InputGroup>
            <InputGroupAddon>
              <InputGroupText>µm</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput aria-label="Size" defaultValue="12" />
          </InputGroup>
        </StateCell>
        <StateCell state="error">
          <InputGroup>
            <InputGroupInput aria-label="Size" aria-invalid defaultValue="-1" />
          </InputGroup>
        </StateCell>
      </DsSection>

      <DsSection id="badges" title="Badges">
        <StateCell state="default">
          <div className="ds-row">
            <Badge>3</Badge>
            <Badge variant="secondary">Raster</Badge>
            <Badge variant="outline">Gene</Badge>
            <Badge variant="destructive">Error</Badge>
          </div>
        </StateCell>
        <StateCell state="overflow">
          <div className="max-w-[8rem] overflow-hidden">
            <Badge className="max-w-full">
              <span className="truncate">{LONG}</span>
            </Badge>
          </div>
        </StateCell>
        <StateCell state="default">
          <Item variant="outline" size="sm">
            <ItemContent>
              <ItemTitle>Epithelium</ItemTitle>
              <ItemDescription>1,204 cells</ItemDescription>
            </ItemContent>
          </Item>
        </StateCell>
        <StateCell state="default">
          <Card>
            <CardHeader>
              <CardTitle>Info</CardTitle>
              <CardDescription>Selection</CardDescription>
            </CardHeader>
            <CardContent className="text-xs">No points in scope.</CardContent>
          </Card>
        </StateCell>
        <StateCell state="default">
          <div className="flex h-8 items-center gap-2">
            <span className="text-xs">Map</span>
            <Separator orientation="vertical" />
            <span className="text-xs">Genes</span>
          </div>
        </StateCell>
      </DsSection>
    </>
  );
}
