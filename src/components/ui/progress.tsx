"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ProgressProps {
  /** 0..1 */
  value: number;
  color?: string;
  className?: string;
  height?: number;
  /** Optional second value drawn as a ghost segment (e.g. projected). */
  ghost?: number;
  glow?: boolean;
}

export function Progress({ value, color = "#34d399", className, height = 6, ghost, glow }: ProgressProps) {
  const pct = Math.max(0, Math.min(1, value));
  const ghostPct = ghost === undefined ? 0 : Math.max(pct, Math.min(1, ghost));
  return (
    <div className={cn("relative w-full overflow-hidden rounded-full bg-white/[0.06]", className)} style={{ height }}>
      {ghost !== undefined && (
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: color, opacity: 0.25 }}
          initial={{ width: 0 }}
          animate={{ width: `${ghostPct * 100}%` }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      )}
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ background: color, boxShadow: glow ? `0 0 14px ${color}66` : undefined }}
        initial={{ width: 0 }}
        animate={{ width: `${pct * 100}%` }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}

/** Circular progress ring used for countdowns and goal completion. */
export function Ring({
  value,
  size = 56,
  stroke = 5,
  color = "#34d399",
  track = "rgba(255,255,255,0.08)",
  children,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
