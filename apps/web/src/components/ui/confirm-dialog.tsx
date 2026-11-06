import { Dialog } from "@base-ui/react/dialog";
import type { FormEvent, ReactNode } from "react";

import { cn } from "../../lib/cn.js";
import { Button } from "./button.js";
import { Spinner } from "./feedback.js";

/**
 * A confirmation.
 *
 * It asks before an action that leaves the device or removes something
 * the rider cannot get back. The dialog is the only place that question
 * is asked, so a settings row never grows a form of its own.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  busy = false,
  busyLabel,
  confirmDisabled = false,
  error,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  busy?: boolean;
  busyLabel?: string;
  confirmDisabled?: boolean;
  error?: string | null;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy || confirmDisabled) return;
    onConfirm();
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        onOpenChange(next);
      }}
      disablePointerDismissal={busy}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          className={cn(
            "fixed inset-0 z-[80] bg-ink/40",
            "transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            "data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
          )}
        />
        <Dialog.Viewport
          className={cn(
            "pointer-events-none fixed inset-0 z-[80] flex items-end justify-center p-4",
            "pb-[max(1rem,env(safe-area-inset-bottom))] lg:items-center",
          )}
        >
          <Dialog.Popup
            className={cn(
              "panel pointer-events-auto w-full max-w-[400px] rounded-[4px] p-4",
              "transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              "data-[ending-style]:translate-y-2 data-[ending-style]:opacity-0",
              "data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0",
            )}
          >
            <Dialog.Title className="text-[20px] font-semibold leading-[1.2] tracking-[-0.01em] text-ink">
              {title}
            </Dialog.Title>
            <form onSubmit={submit} className="mt-2 flex flex-col gap-3">
              <Dialog.Description className="text-[15px] leading-[1.55] text-ink-2">
                {description}
              </Dialog.Description>
              {children}
              {error ? (
                <p role="alert" className="text-[13px] leading-[1.5] text-danger">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-col gap-2 lg:flex-row lg:justify-end">
                <Dialog.Close
                  render={
                    <Button variant="secondary" className="w-full lg:w-auto" disabled={busy} />
                  }
                >
                  {cancelLabel}
                </Dialog.Close>
                <Button
                  type="submit"
                  variant={tone === "danger" ? "danger" : "primary"}
                  className="w-full lg:w-auto"
                  disabled={busy || confirmDisabled}
                >
                  {confirmLabel}
                </Button>
              </div>
              {busy && busyLabel ? <Spinner label={busyLabel} /> : null}
            </form>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
