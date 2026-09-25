"use client";

import { ArrowLeftRight, Calculator, Clock, Minus, Plus, Target } from "lucide-react";
import { useFinance, type ModalState } from "@/components/finance/FinanceProvider";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const ITEMS: { label: string; hint: string; icon: typeof Plus; tone: string; modal: ModalState }[] = [
  { label: "Add income", hint: "Pay, side jobs, sales", icon: Plus, tone: "bg-positive-soft text-positive-bright", modal: { kind: "income" } },
  { label: "Add expense", hint: "Something you spent", icon: Minus, tone: "bg-negative-soft text-negative", modal: { kind: "expense" } },
  { label: "What if I spend…", hint: "Simulate a purchase", icon: Calculator, tone: "bg-warning-soft text-warning", modal: { kind: "simulator" } },
  { label: "Transfer money", hint: "Between accounts", icon: ArrowLeftRight, tone: "bg-accent-soft text-accent", modal: { kind: "transfer" } },
  { label: "Move to a goal", hint: "Earmark cash", icon: Target, tone: "bg-white/[0.08] text-fg", modal: { kind: "contribute" } },
  { label: "When will I have…", hint: "Date for a target", icon: Clock, tone: "bg-white/[0.08] text-fg", modal: { kind: "when" } },
];

export function AddMenuSheet() {
  const { modal, closeModal, openModal } = useFinance();
  const open = modal.kind === "add-menu";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeModal()}>
      <DialogContent title="Quick add" size="sm">
        <div className="grid grid-cols-2 gap-2.5">
          {ITEMS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => openModal(item.modal)}
              className="flex flex-col items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 text-left transition hover:bg-white/[0.06] active:scale-[0.98]"
            >
              <span className={`grid h-10 w-10 place-items-center rounded-xl ${item.tone}`}>
                <item.icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-medium text-fg">{item.label}</span>
                <span className="block text-xs text-fg-subtle">{item.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
