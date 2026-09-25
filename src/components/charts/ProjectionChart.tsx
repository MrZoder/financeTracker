"use client";

import { extent } from "d3-array";
import { scaleLinear } from "d3-scale";
import { area as d3Area, curveMonotoneX, line as d3Line } from "d3-shape";
import { motion } from "framer-motion";
import * as React from "react";
import { addDays, formatAUD, formatDate, type ISODate } from "@/engine";
import { cn } from "@/lib/utils";

export interface ChartSeries {
  id: string;
  label: string;
  color: string;
  /** Value per day, index 0 = today. */
  values: number[];
  dashed?: boolean;
  /** Draw a soft gradient fill under the line. */
  fill?: boolean;
  width?: number;
  muted?: boolean;
}

export type MarkerKind = "pay" | "bill" | "purchase" | "income" | "goal" | "milestone" | "event";

export interface ChartMarker {
  day: number;
  kind: MarkerKind;
  label: string;
  color?: string;
  amount?: number;
}

interface ProjectionChartProps {
  series: ChartSeries[];
  horizonDays: number;
  today: ISODate;
  markers?: ChartMarker[];
  /** Values for the days before today (oldest first). Drawn muted, left of the today line. */
  history?: number[];
  height?: number;
  className?: string;
  selectedDay?: number | null;
  onSelectDay?: (day: number | null) => void;
  renderTooltip?: (day: number) => React.ReactNode;
  yFormat?: (v: number) => string;
  /** Hide axes and grid for a decorative hero chart. */
  minimal?: boolean;
  includeZero?: boolean;
  animateIn?: boolean;
  ariaLabel?: string;
}

const SAMPLES = 220;
const HISTORY_SAMPLES = 80;

function useWidth<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(Math.round(w));
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

function sampleDays(horizon: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(Math.round((horizon * i) / (count - 1)));
  return out;
}

function markerVisible(kind: MarkerKind, horizon: number): boolean {
  if (kind === "goal" || kind === "milestone" || kind === "purchase") return true;
  if (kind === "income" || kind === "event") return horizon <= 400;
  return horizon <= 120;
}

function xTickDays(horizon: number, hasHistory: boolean, historyLen: number): number[] {
  const start = hasHistory ? -historyLen : 0;
  const span = horizon - start;
  const count = 5;
  const ticks: number[] = [];
  for (let i = 0; i <= count; i++) ticks.push(Math.round(start + (span * i) / count));
  return ticks;
}

function tickLabel(today: ISODate, day: number, horizon: number): string {
  const date = addDays(today, day);
  if (horizon <= 120) return formatDate(date, "short");
  if (horizon <= 400) return formatDate(date, "monthYear");
  return formatDate(date, "monthYear");
}

export function ProjectionChart({
  series,
  horizonDays,
  today,
  markers = [],
  history,
  height = 260,
  className,
  selectedDay = null,
  onSelectDay,
  renderTooltip,
  yFormat = (v) => formatAUD(v, { compact: true }),
  minimal,
  includeZero,
  animateIn = true,
  ariaLabel = "Financial projection chart",
}: ProjectionChartProps) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hoverDay, setHoverDay] = React.useState<number | null>(null);
  const gradientId = React.useId().replace(/:/g, "");
  const mounted = React.useRef(false);
  React.useEffect(() => {
    mounted.current = true;
  }, []);

  const padL = minimal ? 0 : 8;
  const padR = minimal ? 0 : 8;
  const padT = minimal ? 8 : 14;
  const padB = minimal ? 0 : 26;
  const yAxisW = minimal ? 0 : 44;

  const histLen = history?.length ?? 0;
  const xMin = histLen > 0 ? -histLen : 0;
  const horizon = Math.max(1, horizonDays);

  const geometry = React.useMemo(() => {
    const w = Math.max(width, 10);
    const days = sampleDays(horizon, SAMPLES);
    const allValues: number[] = [];
    for (const s of series) for (const d of days) allValues.push(s.values[Math.min(d, s.values.length - 1)] ?? 0);
    const histDays = histLen > 0 ? sampleDays(histLen - 1, HISTORY_SAMPLES).map((i) => i - (histLen - 1) - 1) : [];
    if (history) for (const hd of histDays) allValues.push(history[hd + histLen] ?? 0);
    let [lo, hi] = extent(allValues) as [number, number];
    if (lo === undefined || hi === undefined) {
      lo = 0;
      hi = 1;
    }
    if (includeZero || lo < 0) lo = Math.min(lo, 0);
    if (lo === hi) hi = lo + 1;
    const pad = (hi - lo) * 0.12;
    const x = scaleLinear().domain([xMin, horizon]).range([padL + yAxisW, w - padR]);
    const y = scaleLinear()
      .domain([lo - (lo < 0 || includeZero ? pad : pad * 0.6), hi + pad])
      .range([height - padB, padT]);
    const lineGen = d3Line<{ d: number; v: number }>()
      .x((p) => x(p.d))
      .y((p) => y(p.v))
      .curve(curveMonotoneX);
    const areaGen = d3Area<{ d: number; v: number }>()
      .x((p) => x(p.d))
      .y0(() => y(Math.max(lo - pad, Math.min(0, lo))))
      .y1((p) => y(p.v))
      .curve(curveMonotoneX);
    const paths = series.map((s) => {
      const pts = days.map((d) => ({ d, v: s.values[Math.min(d, s.values.length - 1)] ?? 0 }));
      return { series: s, line: lineGen(pts) ?? "", area: s.fill ? (areaGen(pts) ?? "") : null };
    });
    let historyPath: string | null = null;
    if (history && histLen > 1) {
      const pts = histDays.map((hd) => ({ d: hd, v: history[hd + histLen] ?? 0 }));
      pts.push({ d: 0, v: series[0]?.values[0] ?? pts[pts.length - 1]?.v ?? 0 });
      historyPath = lineGen(pts) ?? null;
    }
    return { x, y, paths, historyPath, lo, hi, w };
  }, [width, series, horizon, height, history, histLen, xMin, includeZero, padL, padR, padT, padB, yAxisW]);

  const { x, y, paths, historyPath, w } = geometry;
  const activeDay = hoverDay ?? selectedDay;
  const primary = series[0];

  const dayFromEvent = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const d = Math.round(x.invert(px));
    return Math.max(xMin, Math.min(horizon, d));
  };

  const valueAt = (s: ChartSeries, d: number) => (d < 0 ? (history?.[d + histLen] ?? s.values[0]) : s.values[Math.min(d, s.values.length - 1)]);

  const visibleMarkers = markers.filter((m) => markerVisible(m.kind, horizon) && m.day >= 0 && m.day <= horizon);
  const yTicks = minimal ? [] : y.ticks(4);
  const xTicks = minimal ? [] : xTickDays(horizon, histLen > 0, histLen);

  const tooltipLeft = activeDay !== null ? x(activeDay) : 0;
  const flip = tooltipLeft > w * 0.62;

  return (
    <div ref={ref} className={cn("relative w-full select-none", className)} style={{ height }}>
      {width > 0 && (
        <svg width={w} height={height} className="block overflow-visible" role="img" aria-label={ariaLabel}>
          <defs>
            {paths.map(({ series: s }) => (
              <linearGradient key={s.id} id={`${gradientId}-${s.id}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                <stop offset="60%" stopColor={s.color} stopOpacity={0.06} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          {/* Grid */}
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={padL + yAxisW} x2={w - padR} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.05)" />
              <text x={padL + yAxisW - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-fg-subtle text-[10px] tabular">
                {yFormat(t)}
              </text>
            </g>
          ))}
          {!minimal && geometry.lo < 0 && <line x1={padL + yAxisW} x2={w - padR} y1={y(0)} y2={y(0)} stroke="rgba(251,113,133,0.35)" strokeDasharray="3 4" />}
          {xTicks.map((d) => (
            <text key={d} x={x(d)} y={height - 8} textAnchor={d === xMin ? "start" : d === horizon ? "end" : "middle"} className="fill-fg-subtle text-[10px]">
              {tickLabel(today, d, horizon)}
            </text>
          ))}

          {/* History */}
          {historyPath && (
            <>
              <path d={historyPath} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
              <line x1={x(0)} x2={x(0)} y1={padT} y2={height - padB} stroke="rgba(255,255,255,0.12)" strokeDasharray="2 4" />
              {!minimal && (
                <text x={x(0)} y={padT - 2} textAnchor="middle" className="fill-fg-subtle text-[10px] uppercase tracking-wider">
                  Today
                </text>
              )}
            </>
          )}

          {/* Series */}
          {paths.map(({ series: s, line, area }, i) => (
            <g key={s.id}>
              {area && (
                <motion.path
                  d={area}
                  animate={{ d: area }}
                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  fill={`url(#${gradientId}-${s.id})`}
                  initial={animateIn && !mounted.current ? { opacity: 0 } : false}
                  whileInView={{ opacity: 1 }}
                />
              )}
              <motion.path
                d={line}
                animate={{ d: line, pathLength: 1, opacity: s.muted ? 0.55 : 1 }}
                initial={animateIn && !mounted.current ? { pathLength: 0, opacity: 0 } : false}
                transition={{ d: { duration: 0.8, ease: [0.16, 1, 0.3, 1] }, pathLength: { duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: i * 0.1 }, opacity: { duration: 0.4 } }}
                fill="none"
                stroke={s.color}
                strokeWidth={s.width ?? (i === 0 ? 2.2 : 1.8)}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={s.dashed ? "5 5" : undefined}
                style={{ filter: i === 0 && !s.muted ? `drop-shadow(0 0 6px ${s.color}55)` : undefined }}
              />
            </g>
          ))}

          {/* Markers */}
          {primary &&
            visibleMarkers.map((m, i) => {
              const cx = x(m.day);
              const cy = y(valueAt(primary, m.day));
              const color = m.color ?? (m.kind === "pay" || m.kind === "income" ? "#34d399" : m.kind === "purchase" ? "#fb7185" : m.kind === "bill" ? "rgba(255,255,255,0.35)" : "#fbbf24");
              if (m.kind === "goal" || m.kind === "milestone") {
                return (
                  <g key={`${m.kind}-${i}`} transform={`translate(${cx}, ${cy})`}>
                    <line y1={0} y2={-18} stroke={color} strokeOpacity={0.5} />
                    <circle r={4} fill={color} stroke="#08080a" strokeWidth={2} />
                    {!minimal && horizon <= 800 && (
                      <text y={-24} textAnchor="middle" className="text-[10px] font-medium" fill={color}>
                        {m.label.length > 18 ? `${m.label.slice(0, 17)}…` : m.label}
                      </text>
                    )}
                  </g>
                );
              }
              return <circle key={`${m.kind}-${i}`} cx={cx} cy={cy} r={m.kind === "purchase" ? 4 : 2.5} fill={color} stroke="#08080a" strokeWidth={m.kind === "purchase" ? 2 : 1} />;
            })}

          {/* Crosshair */}
          {activeDay !== null && (
            <g>
              <line x1={x(activeDay)} x2={x(activeDay)} y1={padT} y2={height - padB} stroke="rgba(255,255,255,0.2)" />
              {series.map((s) => (
                <circle key={s.id} cx={x(activeDay)} cy={y(valueAt(s, activeDay))} r={4.5} fill={s.color} stroke="#08080a" strokeWidth={2} />
              ))}
            </g>
          )}

          <rect
            x={0}
            y={0}
            width={w}
            height={height}
            fill="transparent"
            className={onSelectDay || renderTooltip ? "cursor-crosshair" : undefined}
            onPointerMove={(e) => setHoverDay(dayFromEvent(e))}
            onPointerDown={(e) => setHoverDay(dayFromEvent(e))}
            onPointerLeave={() => setHoverDay(null)}
            onClick={(e) => onSelectDay?.(dayFromEvent(e as unknown as React.PointerEvent<SVGRectElement>))}
          />
        </svg>
      )}

      {activeDay !== null && renderTooltip && width > 0 && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-[200px] max-w-[260px] rounded-2xl border border-white/10 bg-[#121216]/95 p-3 shadow-2xl backdrop-blur-xl"
          style={flip ? { right: w - tooltipLeft + 12 } : { left: tooltipLeft + 12 }}
        >
          {renderTooltip(activeDay)}
        </div>
      )}
    </div>
  );
}
