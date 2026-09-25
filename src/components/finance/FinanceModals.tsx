"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChartSpline, X } from "lucide-react";
import { useFinance } from "./FinanceProvider";
import { AddExpenseDialog } from "./dialogs/AddExpenseDialog";
import { AddIncomeDialog } from "./dialogs/AddIncomeDialog";
import { AddMenuSheet } from "./dialogs/AddMenuSheet";
import { AllocateDialog } from "./dialogs/AllocateDialog";
import { CommandBar } from "./dialogs/CommandBar";
import { ContributeDialog } from "./dialogs/ContributeDialog";
import { MarkPayDialog } from "./dialogs/MarkPayDialog";
import { SimulatorDialog } from "./dialogs/SimulatorDialog";
import { TransferDialog } from "./dialogs/TransferDialog";
import { UpdateBalancesDialog } from "./dialogs/UpdateBalancesDialog";
import { WhenDialog } from "./dialogs/WhenDialog";

/** Every global dialog, mounted once; each one gates itself on the modal state. */
export function FinanceModals() {
  const { overlay, setOverlay, modal } = useFinance();
  return (
    <>
      <SimulatorDialog />
      <AddIncomeDialog />
      <AddExpenseDialog />
      <TransferDialog />
      <ContributeDialog />
      <WhenDialog />
      <CommandBar />
      <AddMenuSheet />
      <MarkPayDialog />
      <AllocateDialog />
      <UpdateBalancesDialog />
      <AnimatePresence>
        {overlay && modal.kind === "none" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-warning/30 bg-[#15151a]/95 py-1.5 pl-3.5 pr-1.5 text-xs text-fg shadow-2xl backdrop-blur-xl lg:bottom-6"
          >
            <ChartSpline className="h-3.5 w-3.5 text-warning" />
            <span>
              Charts show <span className="font-medium text-warning">{overlay.label}</span>
            </span>
            <button type="button" onClick={() => setOverlay(null)} className="grid h-6 w-6 place-items-center rounded-full text-fg-subtle transition hover:bg-white/10 hover:text-fg" aria-label="Clear scenario overlay">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
