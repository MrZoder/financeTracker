"use client";

import { motion } from "framer-motion";
import {
  Activity,
  Calculator,
  FlaskConical,
  LayoutDashboard,
  Plus,
  Receipt,
  Search,
  Settings2,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { useFinance } from "@/components/finance/FinanceProvider";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/timeline", label: "Timeline", icon: Activity },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/net-worth", label: "Net Worth", icon: Wallet },
  { href: "/scenarios", label: "Scenario Lab", icon: FlaskConical },
  { href: "/insights", label: "Insights", icon: Sparkles },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

const MOBILE_NAV = [NAV[0], NAV[1], null, NAV[2], NAV[3]] as const;

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-1">
      <span className="relative grid h-8 w-8 place-items-center rounded-xl bg-positive/15 ring-1 ring-positive/30">
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17l5-6 4 3 5-8 4 4" className="text-positive" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-fg">Trajectory</span>
    </Link>
  );
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { openModal, data, projection } = useFinance();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openModal({ kind: "command" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openModal]);

  return (
    <TooltipProvider>
      <div className="min-h-dvh lg:pl-[240px]">
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-[240px] flex-col border-r border-white/[0.06] bg-bg/70 px-4 py-5 backdrop-blur-xl lg:flex">
          <Logo />
          <nav className="mt-8 flex flex-1 flex-col gap-1">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                    active ? "text-fg" : "text-fg-muted hover:bg-white/[0.04] hover:text-fg",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-xl bg-white/[0.07] ring-1 ring-white/[0.06]"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  <item.icon className={cn("relative z-10 h-4 w-4", active ? "text-positive" : "")} />
                  <span className="relative z-10">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-4 space-y-2">
            <Button variant="secondary" className="w-full justify-start" onClick={() => openModal({ kind: "simulator" })}>
              <Calculator className="h-4 w-4 text-warning" />
              What if I spend…
            </Button>
            <Button variant="primary" className="w-full justify-start" onClick={() => openModal({ kind: "income" })}>
              <Plus className="h-4 w-4" />
              Add income
            </Button>
          </div>
          {data.isDemo && (
            <p className="mt-4 rounded-xl border border-warning/20 bg-warning-soft px-3 py-2 text-[11px] leading-relaxed text-warning">
              Demo data. Fictional numbers —{" "}
              <Link href="/settings#data" className="underline underline-offset-2">
                start fresh
              </Link>{" "}
              to use your own.
            </p>
          )}
        </aside>

        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-bg/70 backdrop-blur-xl safe-top">
          <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <div className="lg:hidden">
              <Logo />
            </div>
            <button
              type="button"
              onClick={() => openModal({ kind: "command" })}
              className="ml-auto flex h-9 w-full max-w-md items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 text-left text-sm text-fg-subtle transition hover:border-white/[0.14] hover:bg-white/[0.06] lg:ml-0"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="hidden truncate sm:inline">Spent 74 on dinner · When will I have 15k? · Move 500 to PC</span>
              <span className="truncate sm:hidden">Type a command…</span>
              <kbd className="ml-auto hidden rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-fg-subtle lg:inline">⌘K</kbd>
            </button>
            <div className="hidden items-center gap-2 lg:flex">
              {projection.nextPayday && (
                <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-fg-muted tabular">
                  Next pay in <span className="font-medium text-fg">{projection.nextPayday.day === 0 ? "today" : `${projection.nextPayday.day}d`}</span>
                </span>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1180px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12">
          <motion.div key={pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
            {children}
          </motion.div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-bg/80 backdrop-blur-xl safe-bottom lg:hidden">
          <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center px-2">
            {MOBILE_NAV.map((item, i) =>
              item === null ? (
                <div key="plus" className="flex justify-center">
                  <button
                    type="button"
                    aria-label="Add"
                    onClick={() => openModal({ kind: "add-menu" })}
                    className="-mt-6 grid h-14 w-14 place-items-center rounded-full bg-positive text-[#04120b] shadow-[0_10px_30px_-8px_rgba(52,211,153,0.7)] transition active:scale-95"
                  >
                    <Plus className="h-6 w-6" strokeWidth={2.4} />
                  </button>
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 py-1 text-[10px] font-medium",
                    isActive(pathname, item.href) ? "text-positive" : "text-fg-subtle",
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                  <span className="sr-only">{i}</span>
                </Link>
              ),
            )}
          </div>
        </nav>
      </div>
    </TooltipProvider>
  );
}
