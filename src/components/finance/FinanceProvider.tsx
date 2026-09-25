"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import type { AppData } from "@/data/repository";
import { friendlyError } from "@/lib/errors";
import {
  buildPayCycleView,
  runProjection,
  simulate,
  type EngineInput,
  type ISODate,
  type PayCycleView,
  type ProjectionResult,
  type ScenarioEventInput,
  type Simulation,
} from "@/engine";

export type ModalState =
  | { kind: "none" }
  | { kind: "simulator"; preset?: { label?: string; amount?: number; date?: ISODate } }
  | { kind: "income"; preset?: { amount?: number; description?: string; incomeType?: string; date?: ISODate } }
  | { kind: "expense"; preset?: { amount?: number; description?: string; category?: string; date?: ISODate } }
  | { kind: "transfer" }
  | { kind: "contribute"; preset?: { goalId?: string | null; amount?: number } }
  | { kind: "when"; preset?: { amount?: number; byDate?: ISODate | null } }
  | { kind: "command"; initial?: string }
  | { kind: "add-menu" }
  | { kind: "mark-pay"; preset: { incomeSourceId: string; scheduledDate: ISODate; amount: number } }
  | { kind: "allocate" }
  | { kind: "balances" };

interface FinanceContextValue {
  data: AppData;
  today: ISODate;
  input: EngineInput;
  projection: ProjectionResult;
  payCycle: PayCycleView;
  /** Hypothetical events currently overlaid on charts (from the simulator or scenario lab). */
  overlay: { events: ScenarioEventInput[]; label: string } | null;
  setOverlay: (overlay: { events: ScenarioEventInput[]; label: string } | null) => void;
  overlayProjection: ProjectionResult | null;
  simulate: (events: ScenarioEventInput[]) => Simulation;
  modal: ModalState;
  openModal: (modal: ModalState) => void;
  closeModal: () => void;
  /** Run a server action with toasts and a data refresh. */
  run: <T>(fn: () => Promise<T>, options?: { success?: string; error?: string }) => Promise<T | undefined>;
  pending: boolean;
}

const FinanceContext = React.createContext<FinanceContextValue | null>(null);

export function FinanceProvider({ data, children }: { data: AppData; children: React.ReactNode }) {
  const router = useRouter();
  const [modal, setModal] = React.useState<ModalState>({ kind: "none" });
  const [overlay, setOverlay] = React.useState<{ events: ScenarioEventInput[]; label: string } | null>(null);
  const [pending, setPending] = React.useState(false);

  const input = data.engineInput;
  const projection = React.useMemo(() => runProjection(input), [input]);
  const payCycle = React.useMemo(() => buildPayCycleView(input, projection, data.cycleActuals), [input, projection, data.cycleActuals]);
  const overlayProjection = React.useMemo(
    () => (overlay && overlay.events.length > 0 ? runProjection({ ...input, scenarioEvents: [...input.scenarioEvents, ...overlay.events] }) : null),
    [input, overlay],
  );

  // Record one snapshot per day so history survives asset revaluations. Best effort.
  React.useEffect(() => {
    const key = "trajectory:snapshot";
    try {
      if (window.localStorage.getItem(key) === data.today) return;
    } catch {
      /* storage unavailable */
    }
    void fetch("/api/snapshot", { method: "POST" })
      .then((res) => {
        if (res.ok) {
          try {
            window.localStorage.setItem(key, data.today);
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => undefined);
  }, [data.today]);

  const simulateFn = React.useCallback((events: ScenarioEventInput[]) => simulate(input, events, projection), [input, projection]);

  const run = React.useCallback(
    async <T,>(fn: () => Promise<T>, options?: { success?: string; error?: string }) => {
      setPending(true);
      try {
        const result = await fn();
        if (options?.success) toast.success(options.success);
        router.refresh();
        return result;
      } catch (error) {
        toast.error(options?.error ?? friendlyError(error));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [router],
  );

  const value = React.useMemo<FinanceContextValue>(
    () => ({
      data,
      today: data.today,
      input,
      projection,
      payCycle,
      overlay,
      setOverlay,
      overlayProjection,
      simulate: simulateFn,
      modal,
      openModal: setModal,
      closeModal: () => setModal({ kind: "none" }),
      run,
      pending,
    }),
    [data, input, projection, payCycle, overlay, overlayProjection, simulateFn, modal, run, pending],
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance(): FinanceContextValue {
  const ctx = React.useContext(FinanceContext);
  if (!ctx) throw new Error("useFinance must be used inside FinanceProvider");
  return ctx;
}
