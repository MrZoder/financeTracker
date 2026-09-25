"use client";

import { animate, useMotionValue, useMotionValueEvent } from "framer-motion";
import { useEffect, useRef, useState } from "react";
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
 * The server-rendered HTML carries the real value; the count-up is a client
 * enhancement. The text is React state (not a motion-value child), and a
 * plain timer pins the final value, so it is correct even when animation
 * frames are paused (background tab, low-power mode).
 */
export function AnimatedNumber({ value, format, className, duration = 1.1, delay = 0, fromZero = false }: AnimatedNumberProps) {
  const mv = useMotionValue(value);
  const [text, setText] = useState(() => format(value));
  const first = useRef(true);

  useMotionValueEvent(mv, "change", (v) => setText(format(Math.round(v))));

  useEffect(() => {
    const isFirst = first.current;
    first.current = false;
    if (isFirst && fromZero) mv.set(0);
    const seconds = isFirst ? duration : Math.min(duration, 0.7);
    const wait = isFirst ? delay : 0;
    const controls = animate(mv, value, { duration: seconds, delay: wait, ease: [0.16, 1, 0.3, 1] });
    const snap = window.setTimeout(() => {
      mv.set(value);
      setText(format(value));
    }, (seconds + wait) * 1000 + 600);
    return () => {
      controls.stop();
      window.clearTimeout(snap);
    };
    // `format` is intentionally excluded: callers pass inline lambdas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, mv, duration, delay, fromZero]);

  return <span className={cn("tabular", className)}>{text}</span>;
}
