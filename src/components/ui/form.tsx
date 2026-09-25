"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import { ChevronDown } from "lucide-react";
import * as React from "react";
import { parseMoney } from "@/engine";
import { cn } from "@/lib/utils";

const controlBase =
  "w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 text-[15px] text-fg placeholder:text-fg-subtle outline-none transition focus:border-positive/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-positive/20 disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(controlBase, "h-11", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(controlBase, "min-h-[88px] py-2.5 leading-relaxed", className)} {...props} />
));
Textarea.displayName = "Textarea";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, options, placeholder, ...props }, ref) => (
  <div className="relative">
    <select ref={ref} className={cn(controlBase, "h-11 appearance-none pr-10", className)} {...props}>
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled} className="bg-elevated text-fg">
          {o.label}
        </option>
      ))}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
  </div>
));
Select.displayName = "Select";

interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "size"> {
  /** Value in cents; null when empty/invalid. */
  value: number | null;
  onChange: (cents: number | null) => void;
  allowNegative?: boolean;
  size?: "md" | "lg" | "xl";
  autoFocus?: boolean;
}

/** Money input that keeps the raw text while typing and reports integer cents. */
export function MoneyInput({ value, onChange, allowNegative, className, size = "md", ...props }: MoneyInputProps) {
  const [text, setText] = React.useState(value === null ? "" : (value / 100).toFixed(2).replace(/\.00$/, ""));
  const lastEmitted = React.useRef<number | null>(value);

  React.useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setText(value === null ? "" : (value / 100).toFixed(2).replace(/\.00$/, ""));
    }
  }, [value]);

  const handle = (next: string) => {
    setText(next);
    const parsed = parseMoney(next);
    const cents = parsed === null ? null : allowNegative ? parsed : Math.abs(parsed);
    lastEmitted.current = cents;
    onChange(cents);
  };

  const sizing = size === "xl" ? "h-16 text-4xl font-semibold tracking-tight pl-10" : size === "lg" ? "h-13 text-2xl font-semibold pl-9" : "h-11 pl-8";
  const prefixSize = size === "xl" ? "text-3xl left-3.5" : size === "lg" ? "text-xl left-3.5" : "text-[15px] left-3.5";

  return (
    <div className="relative">
      <span className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-fg-subtle tabular", prefixSize)}>$</span>
      <input
        inputMode="decimal"
        autoComplete="off"
        className={cn(controlBase, "tabular", sizing, className)}
        value={text}
        onChange={(e) => handle(e.target.value)}
        onBlur={() => {
          const parsed = parseMoney(text);
          if (parsed !== null) setText((Math.abs(parsed) / 100).toFixed(2).replace(/\.00$/, ""));
        }}
        placeholder="0"
        {...props}
      />
    </div>
  );
}

export function Switch({ className, ...props }: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-white/[0.08] bg-white/[0.08] transition data-[state=checked]:border-positive/40 data-[state=checked]:bg-positive/80 disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
    </SwitchPrimitive.Root>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
  inline?: boolean;
}

export function Field({ label, hint, error, htmlFor, children, className, inline }: FieldProps) {
  if (inline) {
    return (
      <div className={cn("flex items-center justify-between gap-4 py-2", className)}>
        <div className="min-w-0">
          <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
            {label}
          </label>
          {hint ? <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p> : null}
        </div>
        {children}
      </div>
    );
  }
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium uppercase tracking-[0.12em] text-fg-subtle">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-negative">{error}</p> : hint ? <p className="text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

/** Pill-style option group (e.g. category or frequency pickers). */
export function ChipGroup<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition",
            value === o.value
              ? "border-positive/40 bg-positive-soft text-positive-bright"
              : "border-white/[0.08] bg-white/[0.03] text-fg-muted hover:border-white/[0.16] hover:text-fg",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
