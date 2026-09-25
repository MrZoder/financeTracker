"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-[background-color,color,transform,box-shadow,opacity] duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-positive/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary:
          "bg-positive text-[#04120b] shadow-[0_8px_30px_-10px_rgba(52,211,153,0.6)] hover:bg-positive-bright hover:shadow-[0_10px_36px_-10px_rgba(52,211,153,0.7)]",
        secondary: "bg-white/[0.06] text-fg border border-white/[0.08] hover:bg-white/[0.1] hover:border-white/[0.14]",
        ghost: "text-fg-muted hover:text-fg hover:bg-white/[0.06]",
        outline: "border border-white/[0.12] text-fg hover:bg-white/[0.05]",
        danger: "bg-negative-soft text-negative border border-negative/20 hover:bg-negative/20",
        accent: "bg-accent-soft text-accent border border-accent/20 hover:bg-accent/20",
        warning: "bg-warning-soft text-warning border border-warning/20 hover:bg-warning/20",
      },
      size: {
        xs: "h-7 px-2.5 text-xs rounded-lg",
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-5 text-[15px] rounded-2xl",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8 rounded-lg",
        "icon-lg": "h-12 w-12 rounded-2xl",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

export { buttonVariants };
