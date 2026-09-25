"use client";

import { Check } from "lucide-react";
import * as React from "react";
import { useFinance } from "@/components/finance/FinanceProvider";
import { DateInput } from "@/components/finance/dialogs/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { ChipGroup, Field, Input, MoneyInput, Switch, Textarea } from "@/components/ui/form";
import { Segmented } from "@/components/ui/segmented";
import { deleteGoal, setGoalStatus, upsertGoal } from "@/data/actions";
import type { GoalView } from "@/data/repository";
import type { GoalKind, GoalPriority } from "@/engine";
import { GOAL_COLORS, GOAL_ICONS, GOAL_KINDS, GOAL_PRIORITIES, cycleNoun } from "@/lib/meta";
import { cn } from "@/lib/utils";

type ContributionMode = "fixed" | "remainder" | "manual";

export function GoalDialog({ open, onOpenChange, goal }: { open: boolean; onOpenChange: (open: boolean) => void; goal: GoalView | null }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <GoalForm goal={goal} close={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function GoalForm({ goal, close }: { goal: GoalView | null; close: () => void }) {
  const { run, pending, input, projection, data } = useFinance();
  const primary = input.incomeSources.find((s) => s.id === projection.primarySourceId);
  const noun = cycleNoun(primary?.schedule?.frequency);
  const [name, setName] = React.useState(goal?.name ?? "");
  const [icon, setIcon] = React.useState(goal?.icon ?? "target");
  const [color, setColor] = React.useState(goal?.color ?? GOAL_COLORS[1]);
  const [kind, setKind] = React.useState<GoalKind>(goal?.kind ?? "savings");
  const [priority, setPriority] = React.useState<GoalPriority>(goal?.priority ?? "normal");
  const [target, setTarget] = React.useState<number | null>(goal?.targetCents ?? null);
  const [saved, setSaved] = React.useState<number | null>(goal ? goal.balance : null);
  const [desiredDate, setDesiredDate] = React.useState<string | null>(goal?.desiredDate ?? null);
  const [mode, setMode] = React.useState<ContributionMode>(goal ? (goal.autoContributionCents ? "fixed" : goal.absorbsRemainder ? "remainder" : "manual") : "fixed");
  const [auto, setAuto] = React.useState<number | null>(goal?.autoContributionCents ?? null);
  const [spendOnCompletion, setSpendOnCompletion] = React.useState(goal?.onCompletion === "spend");
  const [notes, setNotes] = React.useState(goal?.notes ?? "");
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const remainderTaken = data.goals.find((g) => g.absorbsRemainder && g.status === "active" && g.id !== goal?.id);
  const valid = name.trim().length > 0 && target !== null && target > 0 && (mode !== "fixed" || (auto !== null && auto > 0));

  const submit = async () => {
    if (!valid || target === null) return;
    const result = await run(
      () =>
        upsertGoal({
          id: goal?.id,
          name: name.trim(),
          icon,
          color,
          kind,
          priority,
          targetCents: target,
          desiredDate: desiredDate || null,
          autoContributionCents: mode === "fixed" ? auto : null,
          absorbsRemainder: mode === "remainder",
          onCompletion: kind === "purchase" && spendOnCompletion ? "spend" : "hold",
          notes: notes.trim() || null,
          initialBalanceCents: goal ? undefined : (saved ?? 0),
          currentBalanceCents: goal ? saved : undefined,
        }),
      { success: goal ? "Goal updated" : `${name.trim()} added` },
    );
    if (result) close();
  };

  const archive = async () => {
    if (!goal) return;
    const result = await run(() => setGoalStatus(goal.id, "archived"), { success: "Goal archived" });
    if (result !== undefined) close();
  };

  const remove = async () => {
    if (!goal) return;
    const result = await run(() => deleteGoal(goal.id), { success: "Goal deleted" });
    if (result !== undefined) close();
  };

  return (
    <DialogContent title={goal ? "Edit goal" : "New goal"} size="lg" description={goal ? undefined : "Give it a target and Trajectory will tell you the day you get there."}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <Field label="Name" htmlFor="goal-name">
            <Input id="goal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="PC Upgrade" autoFocus={!goal} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Target">
              <MoneyInput value={target} onChange={setTarget} size="lg" aria-label="Target amount" />
            </Field>
            {kind !== "milestone" && (
              <Field label={goal ? "Saved so far" : "Already saved"} hint={goal ? "Change this if reality differs — the difference is recorded, not overwritten." : "Cash you've set aside for this."}>
                <MoneyInput value={saved} onChange={setSaved} size="lg" aria-label="Saved so far" />
              </Field>
            )}
          </div>
          <Field label="Type">
            <ChipGroup value={kind} onChange={setKind} options={GOAL_KINDS.map((k) => ({ value: k.value, label: k.label }))} />
            <p className="mt-1.5 text-xs text-fg-subtle">{GOAL_KINDS.find((k) => k.value === kind)?.hint}</p>
          </Field>
          {kind !== "milestone" && (
            <Field label="Priority" hint="Surplus flows to higher priorities first. Emergency funds always come first.">
              <ChipGroup value={priority} onChange={setPriority} options={GOAL_PRIORITIES.map((p) => ({ value: p.value, label: p.label }))} />
            </Field>
          )}
          <Field label="Want it by" hint="Optional. Trajectory tells you if you're on track.">
            <div className="flex items-center gap-2">
              <DateInput value={desiredDate ?? ""} onChange={setDesiredDate} min={input.today} className="w-auto" />
              {desiredDate && (
                <Button variant="ghost" size="sm" onClick={() => setDesiredDate(null)}>
                  Clear
                </Button>
              )}
            </div>
          </Field>
        </div>

        <div className="space-y-5">
          {kind !== "milestone" && (
            <Field label={`Contributions each ${noun}`}>
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: "fixed", label: "Fixed amount" },
                  { value: "remainder", label: "Whatever's left" },
                  { value: "manual", label: "Manual only" },
                ]}
                size="sm"
                className="flex-wrap"
              />
              <div className="mt-3">
                {mode === "fixed" && <MoneyInput value={auto} onChange={setAuto} aria-label={`Contribution per ${noun}`} placeholder="250" />}
                {mode === "remainder" && (
                  <p className="text-xs text-fg-subtle">
                    After bills, usual spending, buffer and fixed contributions, the surplus lands here.
                    {remainderTaken ? ` ${remainderTaken.name} currently absorbs the remainder too — priority decides who gets it first.` : ""}
                  </p>
                )}
                {mode === "manual" && <p className="text-xs text-fg-subtle">Only grows when you move money in yourself.</p>}
              </div>
            </Field>
          )}
          {kind === "purchase" && (
            <Field label="Spend the money when the goal is reached" hint="Shows the purchase on the timeline and drops cash by the target." inline>
              <Switch checked={spendOnCompletion} onCheckedChange={setSpendOnCompletion} />
            </Field>
          )}
          <Field label="Icon">
            <div className="grid grid-cols-7 gap-1.5">
              {Object.entries(GOAL_ICONS).map(([key, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setIcon(key)}
                  aria-label={key}
                  className={cn("grid h-9 w-9 place-items-center rounded-xl border transition", icon === key ? "border-white/30 bg-white/[0.1] text-fg" : "border-white/[0.06] text-fg-muted hover:bg-white/[0.05]")}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </Field>
          <Field label="Colour">
            <div className="flex flex-wrap gap-2">
              {GOAL_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  className="grid h-8 w-8 place-items-center rounded-full ring-offset-2 ring-offset-[#101014] transition"
                  style={{ background: c, boxShadow: color === c ? `0 0 0 2px #101014, 0 0 0 4px ${c}` : undefined }}
                >
                  {color === c && <Check className="h-4 w-4 text-black/70" />}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Parts list, links, why it matters…" />
          </Field>
        </div>
      </div>
      <DialogFooter className="sm:justify-between">
        <div className="flex gap-2">
          {goal && !confirmDelete && (
            <>
              <Button variant="ghost" size="sm" onClick={archive} disabled={pending}>
                Archive
              </Button>
              <Button variant="ghost" size="sm" className="text-negative" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            </>
          )}
          {goal && confirmDelete && (
            <Button variant="danger" size="sm" onClick={remove} loading={pending}>
              Delete permanently, including its history
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!valid} loading={pending}>
            {goal ? "Save" : "Add goal"}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}
