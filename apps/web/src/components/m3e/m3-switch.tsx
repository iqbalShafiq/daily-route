import { cn } from "../../lib/cn.js";

/**
 * The M3 Expressive switch.
 *
 * A switch is a binary setting that takes effect immediately, so it carries
 * `role="switch"` and `aria-checked`, not a checkbox role. The thumb grows
 * from 16px to 24px as it travels, which is the expressive motion.
 */

export type M3SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** The setting the switch controls. A switch has no visible label of its own. */
  "aria-label": string;
  disabled?: boolean;
  className?: string;
};

export function M3Switch({
  checked,
  onCheckedChange,
  "aria-label": ariaLabel,
  disabled = false,
  className,
}: M3SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={cn("m3-switch", checked && "is-checked", className)}
      onClick={() => onCheckedChange(!checked)}
    >
      <span className="m3-switch__thumb" aria-hidden="true" />
    </button>
  );
}
