"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** Maximum width on desktop. */
  size?: "sm" | "md" | "lg" | "xl";
  hideClose?: boolean;
  title: string;
  description?: string;
  /** Visually hide the title (still announced to screen readers). */
  hideTitle?: boolean;
  headerExtra?: React.ReactNode;
}

const sizes = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" };

/**
 * Bottom sheet on phones, centred glass dialog on larger screens.
 */
export const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, children, size = "md", hideClose, title, description, hideTitle, headerExtra, ...props }, ref) => (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed z-50 flex w-full flex-col overflow-hidden outline-none",
          "bottom-0 left-0 right-0 top-auto max-h-[92dvh] rounded-t-[28px] glass-strong bg-[#101014]/95 safe-bottom",
          "data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out",
          "sm:bottom-auto sm:right-auto sm:left-1/2 sm:top-1/2 sm:max-h-[88dvh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px]",
          "sm:data-[state=open]:animate-dialog-in sm:data-[state=closed]:animate-dialog-out",
          sizes[size],
          className,
        )}
        {...props}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-white/15 sm:hidden" aria-hidden />
        <div className={cn("flex items-start justify-between gap-4 px-6 pt-5 sm:pt-6", hideTitle && "sr-only")}>
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-lg font-semibold tracking-tight text-fg">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm text-fg-muted">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <div className="flex items-center gap-2">
            {headerExtra}
            {!hideClose && (
              <DialogPrimitive.Close className="rounded-full p-2 text-fg-subtle transition hover:bg-white/[0.08] hover:text-fg" aria-label="Close">
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  ),
);
DialogContent.displayName = "DialogContent";

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}
