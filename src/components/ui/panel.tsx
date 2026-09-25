import * as React from "react";
import { formatAUD } from "@/engine";
import { cn } from "@/lib/utils";

interface PanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  eyebrow?: React.ReactNode;
  action?: React.ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  strong?: boolean;
}

const paddings = { none: "", sm: "p-4", md: "p-5 sm:p-6", lg: "p-6 sm:p-8" };

/** The one surface used everywhere: soft glass, hairline border, no heavy card chrome. */
export function Panel({ title, eyebrow, action, padding = "md", strong, className, children, ...props }: PanelProps) {
  return (
    <section className={cn("relative rounded-[22px]", strong ? "glass-strong" : "glass", paddings[padding], className)} {...props}>
      {(title || eyebrow || action) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow ? <Kicker>{eyebrow}</Kicker> : null}
            {title ? <h2 className="mt-0.5 text-[15px] font-semibold tracking-tight text-fg">{title}</h2> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kicker({ className, children }: { className?: string; children: React.ReactNode }) {
  return <p className={cn("text-[11px] font-medium uppercase tracking-[0.14em] text-fg-subtle", className)}>{children}</p>;
}

export function SectionTitle({ title, description, action, className }: { title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, sub, className, valueClassName }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; className?: string; valueClassName?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <Kicker>{label}</Kicker>
      <div className={cn("mt-1 text-xl font-semibold tracking-tight tabular text-fg", valueClassName)}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-fg-muted">{sub}</div> : null}
    </div>
  );
}

/** Coloured money delta chip: +$2,140 / −$310. */
export function Delta({ cents, className, suffix, invert }: { cents: number; className?: string; suffix?: string; invert?: boolean }) {
  const positive = invert ? cents < 0 : cents > 0;
  const negative = invert ? cents > 0 : cents < 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular",
        positive && "bg-positive-soft text-positive-bright",
        negative && "bg-negative-soft text-negative",
        !positive && !negative && "bg-white/[0.06] text-fg-muted",
        className,
      )}
    >
      {formatAUD(cents, { sign: true })}
      {suffix ? <span className="text-fg-subtle">{suffix}</span> : null}
    </span>
  );
}

/** Small label pill used for statuses and tags. */
export function Tag({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "positive" | "negative" | "warning" | "accent"; className?: string }) {
  const tones = {
    neutral: "bg-white/[0.06] text-fg-muted",
    positive: "bg-positive-soft text-positive-bright",
    negative: "bg-negative-soft text-negative",
    warning: "bg-warning-soft text-warning",
    accent: "bg-accent-soft text-accent",
  };
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", tones[tone], className)}>{children}</span>;
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.1] px-6 py-10 text-center">
      {icon ? <div className="mb-3 text-fg-subtle">{icon}</div> : null}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
