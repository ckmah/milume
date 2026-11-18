import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";

import { TabsList } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { PILL_TABS_LIST } from "./sections";

/**
 * Soft Float sliding-pill TabsList (transitions.dev tabs-sliding).
 * Measures the active trigger and tweens a background pill under it.
 */
export function TactSlidingTabsList({
  value,
  className,
  children,
  ...props
}: ComponentProps<typeof TabsList> & { value: string }) {
  const listRef = useRef<HTMLDivElement>(null);
  const hasMountedRef = useRef(false);
  const prevValueRef = useRef(value);
  const [pill, setPill] = useState({ left: 0, width: 0, ready: false });

  const measure = useCallback((animate: boolean) => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>(
      '[data-state="active"], [aria-selected="true"]',
    );
    if (!active) return;
    const next = {
      left: active.offsetLeft,
      width: active.offsetWidth,
      ready: true,
    };
    if (!animate) {
      list.style.setProperty("--lm-tab-pill-dur", "0ms");
      setPill(next);
      requestAnimationFrame(() => {
        list.style.removeProperty("--lm-tab-pill-dur");
      });
      return;
    }
    setPill(next);
  }, []);

  useLayoutEffect(() => {
    const valueChanged = prevValueRef.current !== value;
    prevValueRef.current = value;
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      measure(false);
      return;
    }
    // Slide only when the active tab changes; snap on resize/children churn.
    measure(valueChanged);
  }, [value, measure, children]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure(false));
    ro.observe(list);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <TabsList
      ref={listRef}
      className={cn(PILL_TABS_LIST, className)}
      {...props}
    >
      <span
        aria-hidden
        className="landmarks-sliding-tabs__pill"
        style={{
          transform: `translateX(${pill.left}px)`,
          width: pill.width,
          opacity: pill.ready ? 1 : 0,
        }}
      />
      {children as ReactNode}
    </TabsList>
  );
}
