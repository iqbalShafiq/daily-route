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
  panels,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  /** The panels that belong to the list, rendered underneath it. */
  panels?: ReactNode;
  className?: string;
}) {
  return (
    <BaseTabs.Root
      value={value}
      onValueChange={(next) => onValueChange(next as string)}
      className="flex flex-col gap-3"
    >
      <BaseTabs.List
        className={cn(
          "inline-flex w-fit items-center gap-0.5 rounded-[4px] border border-line-strong bg-surface-2 p-0.5",
          className,
        )}
      >
        {children}
      </BaseTabs.List>
      {panels}
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
        "inline-flex h-11 cursor-pointer items-center gap-2 rounded-[4px] px-3 text-[13px] font-medium text-ink-3",
        "transition-[background-color,color,box-shadow] duration-150",
        "hover:text-ink",
        // The chosen tab is unmistakable: ink on paper, the way a station
        // sign marks the line you are standing on.
        "data-[active]:bg-ink data-[active]:font-semibold data-[active]:text-bg",
        "data-[active]:shadow-raised",
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
