import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/cn.js";

/**
 * The M3 Expressive snackbar.
 *
 * It sits on the inverse surface, so it is legible over the map without a
 * second plate. The action is the inverse primary, and the message is
 * announced politely rather than interrupting the rider.
 */

export type M3SnackbarProps = {
  open: boolean;
  message: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  className?: string;
};

export function M3Snackbar({
  open,
  message,
  actionLabel,
  onAction,
  onDismiss,
  className,
}: M3SnackbarProps) {
  if (!open) return null;

  return (
    <div className={cn("m3-snackbar", className)} role="status" aria-live="polite">
      <span className="m3-snackbar__message">{message}</span>
      {actionLabel && onAction ? (
        <button type="button" className="m3-snackbar__action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          className="m3-snackbar__close"
          aria-label="Dismiss notification"
          onClick={onDismiss}
        >
          <X aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
