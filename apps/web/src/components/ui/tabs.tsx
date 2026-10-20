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
          "inline-flex items-center gap-0.5 rounded-xl border border-line bg-surface-2 p-0.5",
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
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <BaseTabs.Tab
      value={value}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium text-ink-3",
        "transition-colors duration-150",
        "hover:text-ink",
        "data-[selected]:bg-surface data-[selected]:text-ink data-[selected]:shadow-[0_1px_2px_rgb(0_0_0/0.06)]",
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
