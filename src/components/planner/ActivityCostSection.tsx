"use client";

import { useMemo } from "react";
import type { PlannerAssignedCostEntry } from "@/lib/planner-types";
import { computeActivityCostSummary, formatCost } from "@/lib/planner-cost-utils";
import ActivityCostsModal from "./ActivityCostsModal";

interface ActivityCostSectionProps {
  activityId: string | null;
  activityTitle: string;
  budgetAmount: string;
  progressPercent: number;
  durationDays: number;
  defaultCostDate: string;
  costsOpen: boolean;
  onCostsOpenChange: (open: boolean) => void;
  onBudgetChange: (value: string) => void;
  draftEntries?: PlannerAssignedCostEntry[];
  onDraftEntriesChange?: (entries: PlannerAssignedCostEntry[]) => void;
  inputClass: string;
}

export default function ActivityCostSection({
  activityId,
  activityTitle,
  budgetAmount,
  progressPercent,
  durationDays,
  defaultCostDate,
  costsOpen,
  onCostsOpenChange,
  onBudgetChange,
  draftEntries,
  onDraftEntriesChange,
  inputClass,
}: ActivityCostSectionProps) {
  const budgetNum = Number(budgetAmount) || 0;
  const draftSummary = useMemo(() => {
    const rows = (draftEntries ?? []).map((e) => ({
      id: e.id,
      activity_id: "__draft__",
      catalogue_item_id: e.catalogue_item_id ?? null,
      name: e.name,
      unit: e.unit,
      unit_rate: e.unit_rate,
      override_unit_rate: e.override_unit_rate ?? null,
      quantity: e.quantity,
      amount: e.amount,
      cost_date: e.cost_date,
      category: e.category,
      description: e.description,
      created_at: e.created_at,
    }));
    return computeActivityCostSummary(
      budgetAmount.trim() !== "" ? budgetNum : null,
      rows,
      progressPercent
    );
  }, [draftEntries, budgetAmount, budgetNum, progressPercent]);

  return (
    <div className="space-y-3">
      <p className="text-dashboard-xs font-medium text-dashboard-text-secondary">Costs</p>

      <div>
        <label className="mb-1 block text-dashboard-sm text-dashboard-text-secondary">
          Budget ($)
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={budgetAmount}
          onChange={(e) => onBudgetChange(e.target.value)}
          placeholder="0.00"
          className={inputClass}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onCostsOpenChange(true)}
          className="rounded-dashboard-md bg-gradient-to-r from-[#5B5FEF] to-[#6D72F6] px-4 py-2 text-dashboard-sm font-medium text-white shadow-dashboard-card"
        >
          Manage activity costs…
        </button>
        {!activityId && (draftEntries?.length ?? 0) > 0 && (
          <span className="text-dashboard-xs text-dashboard-text-muted">
            {draftEntries!.length} line{draftEntries!.length !== 1 ? "s" : ""} ready · est. $
            {formatCost(draftSummary.actual)}
          </span>
        )}
      </div>

      <ActivityCostsModal
        open={costsOpen}
        onClose={() => onCostsOpenChange(false)}
        activityId={activityId}
        activityTitle={activityTitle}
        budgetAmount={budgetAmount}
        progressPercent={progressPercent}
        durationDays={durationDays}
        defaultCostDate={defaultCostDate}
        draftEntries={draftEntries}
        onDraftEntriesChange={onDraftEntriesChange}
        inputClass={inputClass}
      />
    </div>
  );
}
