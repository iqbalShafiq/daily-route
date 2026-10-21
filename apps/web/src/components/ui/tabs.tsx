import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";

import { cn } from "../../lib/cn.js";

/**
 * The segmented control.
 *
 * It switches between views inside one region, which is why it is a tab
 * and not a row of buttons: the keyboard behaviour and the ARIA roles come
 * from the headless implementation.
 */
export function Tabs({
  value,
  onValueChange,
  children,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <BaseTabs.Root value={value} onValueChange={(next) => onValueChange(next as string)}>
      <BaseTabs.List
        className={cn(
          "inline-flex items-center gap-1 rounded-xl border border-line bg-surface-2 p-1",
          className,
        )}
      >
        {children}
      </BaseTabs.List>
    </BaseTabs.Root>
  );
}

export function Tab({
  value,
  children,
  className,
  title,
}: {
  value: string;
  children: ReactNode;
  className?: string;
  /** The explanation that appears when the pointer rests on the tab. */
  title?: string | undefined;
}) {
  return (
    <BaseTabs.Tab
      value={value}
      title={title}
      className={cn(
        "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium text-ink-3",
        "transition-[background-color,color,box-shadow] duration-150",
        "hover:text-ink",
        // The chosen tab is unmistakable: the accent of the interface, with
        // the text colour that goes with it. Base UI marks the active tab
        // with `data-active`.
        "data-[active]:bg-accent data-[active]:font-semibold data-[active]:text-accent-ink",
        "data-[active]:shadow-[0_1px_2px_rgb(0_0_0/0.12)]",
        className,
      )}
    >
      {children}
    </BaseTabs.Tab>
  );
}

export function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  return (
    <BaseTabs.Panel value={value} className="focus:outline-none">
      {children}
    </BaseTabs.Panel>
  );
}
