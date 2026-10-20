import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names, letting later Tailwind utilities win.
 *
 * `clsx` handles the conditional syntax; `tailwind-merge` resolves the
 * conflicts, so a component can accept a `className` override without the
 * caller having to know which utility the component already applied.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
