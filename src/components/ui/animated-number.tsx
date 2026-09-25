"use client";

import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface AnimatedNumberProps {
  value: number;
  format: (n: number) => string;
  className?: string;
  duration?: number;
  delay?: number;
  /** Count up from zero on first mount (hero numbers). */
  fromZero?: boolean;
}

/**
 * Tweens between values so money visibly moves instead of snapping.
 * The server-rendered HTML always carries the real value; the count-up is a
 * client enhancement, and a timer guarantees the final value even if
 * animation frames are paused (background tab).
 */
export function AnimatedNumber({ value, format, className, duration = 1.1, delay = 0, fromZero = false }: AnimatedNumberProps) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(Math.round(v)));
  const first = useRef(true);

  useEffect(() => {
    const isFirst = first.current;
    first.current = false;
    if (isFirst && fromZero) mv.set(0);
    const seconds = isFirst ? duration : Math.min(duration, 0.7);
    const wait = isFirst ? delay : 0;
    const controls = animate(mv, value, { duration: seconds, delay: wait, ease: [0.16, 1, 0.3, 1] });
    const snap = window.setTimeout(() => mv.set(value), (seconds + wait) * 1000 + 800);
    return () => {
      controls.stop();
      window.clearTimeout(snap);
    };
  }, [value, mv, duration, delay, fromZero]);

  return <motion.span className={cn("tabular", className)}>{text}</motion.span>;
}
