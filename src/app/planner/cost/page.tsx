"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/ui/AppShell";
import { Sidebar } from "@/components/ui/Sidebar";
import { TopHeader } from "@/components/ui/TopHeader";
import CostTabs, { type CostTab } from "@/components/planner/cost/CostTabs";
import DailyCostView from "@/components/planner/cost/DailyCostView";
import AccrualsView from "@/components/planner/cost/AccrualsView";
import ForecastView from "@/components/planner/cost/ForecastView";
import PlannerCostLibraryModal from "@/components/planner/PlannerCostLibraryModal";

type Crew = { id: string; name: string };
type Section = { id: string; name: string };
type WbsOption = { id: string; code: string; label: string | null; is_active: boolean; sort_order: number };
type CatalogueOption = {
  id: string;
  name: string;
  description: string | null;
  category: "labour" | "machinery" | "materials";
  unit: string;
  unit_rate: number;
  cost_code?: string | null;
};
type DailyRow = {
  cost_date: string;
  cost_code: string | null;
  activity_name: string;
  category: "labour" | "machinery" | "materials";
  item_name: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  crew_name: string | null;
  resource_crew: string | null;
  section_name: string | null;
};
type SummaryPayload = {
  total?: number;
  by_category?: Record<string, number>;
  by_cost_code?: Array<{ cost_code: string; amount: number }>;
  total_forecast?: number;
  total_variance_vs_budget?: number;
};
type DailyPayload = { rows: DailyRow[]; summary: SummaryPayload };
type AccrualRow = {
  cost_code: string | null;
  activity_name: string;
  category: "labour" | "machinery" | "materials";
  daily_amount: number;
  overlap_days: number;
  accrued_amount: number;
};
type AccrualPayload = {
  rows: AccrualRow[];
  by_day: Array<{ date: string; amount: number }>;
  summary: SummaryPayload;
};
type ForecastActivity = {
  activity_name: string;
  start_date: string;
  end_date: string;
  duration_days: number;
  assigned_resources: number;
  total_estimated_cost: number;
  daily_burn_rate: number;
  variance_vs_budget: number | null;
};
type ForecastPayload = { activities: ForecastActivity[]; summary: SummaryPayload };

function currentYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function defaultShiftDuration(ymd: string): number {
  const d = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  if (d >= 1 && d <= 4) return 9.5;
  if (d === 5) return 9;
  return 0;
}

function qtyFromUnit(unit: string, shiftDuration: number): number {
  const u = unit.trim().toLowerCase();
  if (!u) return 1;
  if (u === "h" || u === "hr" || u === "hrs" || u === "hour" || u === "hours") {
    return shiftDuration;
  }
  if (u === "day" || u === "days" || u === "d") {
    return 1;
  }
  return 1;
}

export default function PlannerCostPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = String(searchParams.get("tab") ?? "daily");
  const activeTab: CostTab =
    tabParam === "accruals" || tabParam === "forecast" ? tabParam : "daily";

  const [crews, setCrews] = useState<Crew[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [crewId, setCrewId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [costCode, setCostCode] = useState("");
  const [fromDate, setFromDate] = useState(() => addDays(currentYmd(), -7));
  const [toDate, setToDate] = useState(() => currentYmd());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<DailyPayload | AccrualPayload | ForecastPayload | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [wbsLibrary, setWbsLibrary] = useState<WbsOption[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueOption[]>([]);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSuccess, setManualSuccess] = useState<string | null>(null);
  const [manualWbsCode, setManualWbsCode] = useState("");
  const [manualDate, setManualDate] = useState(() => addDays(currentYmd(), -1));
  const [manualShiftDuration, setManualShiftDuration] = useState(() => String(defaultShiftDuration(currentYmd())));
  const [manualSearch, setManualSearch] = useState("");
  const [manualCategoryFilter, setManualCategoryFilter] = useState<"" | "labour" | "machinery" | "materials">("");
  const [selectedCatalogueIds, setSelectedCatalogueIds] = useState<string[]>([]);
  const [manualQtyById, setManualQtyById] = useState<Record<string, string>>({});
  const [manualUnitById, setManualUnitById] = useState<Record<string, string>>({});
  const [assignedCatalogueIds, setAssignedCatalogueIds] = useState<string[]>([]);
  const [dayAllocatedDetails, setDayAllocatedDetails] = useState<
    Array<{
      wbs_code: string;
      lines: Array<{
        id: string;
        item_name: string;
        quantity: number;
        unit: string;
        amount: number;
        category: "labour" | "machinery" | "materials";
      }>;
      total: number;
    }>
  >([]);
  const [dayAllocatedByCategory, setDayAllocatedByCategory] = useState<{
    labour: number;
    machinery: number;
    materials: number;
  }>({ labour: 0, machinery: 0, materials: 0 });
  const [deletingAllocatedId, setDeletingAllocatedId] = useState<string | null>(null);
  const [showCostLibrary, setShowCostLibrary] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/planner/crews");
      const body = (await res.json().catch(() => ({}))) as { crews?: Crew[] };
      setCrews(body.crews ?? []);
    })().catch(() => setCrews([]));
  }, []);

  useEffect(() => {
    if (!crewId) {
      setSections([]);
      setSectionId("");
      return;
    }
    (async () => {
      const res = await fetch(`/api/planner/sections?crew_id=${encodeURIComponent(crewId)}`);
      const body = (await res.json().catch(() => ({}))) as { sections?: Section[] };
      setSections(body.sections ?? []);
    })().catch(() => setSections([]));
  }, [crewId]);

  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (activeTab !== "daily") {
      if (crewId) q.set("crew_id", crewId);
      if (sectionId) q.set("section_id", sectionId);
      if (costCode) q.set("cost_code", costCode);
      if (fromDate) q.set("from", fromDate);
      if (toDate) q.set("to", toDate);
    }
    return q.toString();
  }, [activeTab, crewId, sectionId, costCode, fromDate, toDate]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const base =
      activeTab === "daily"
        ? "/api/planner/cost/daily"
        : activeTab === "accruals"
          ? "/api/planner/cost/accruals"
          : "/api/planner/cost/forecast";
    fetch(`${base}?${query}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as
          | DailyPayload
          | AccrualPayload
          | ForecastPayload
          | { error?: string };
        if (!res.ok) {
          const errMsg =
            body && typeof body === "object" && "error" in body
              ? String((body as { error?: unknown }).error ?? res.statusText)
              : res.statusText;
          throw new Error(errMsg);
        }
        setPayload(body as DailyPayload | AccrualPayload | ForecastPayload);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load cost data"))
      .finally(() => setLoading(false));
  }, [activeTab, query, reloadTick]);

  useEffect(() => {
    if (activeTab !== "daily") return;
    fetch("/api/planner/wbs")
      .then(async (res) => {
        const body = (await res.json().catch(() => [])) as Array<Record<string, unknown>>;
        if (!res.ok || !Array.isArray(body)) throw new Error("Could not load WBS");
        const mapped = body
          .map((r) => ({
            id: String(r.id ?? ""),
            code: String(r.code ?? "").trim(),
            label: r.label != null && String(r.label).trim() ? String(r.label) : null,
            is_active: Boolean(r.is_active ?? true),
            sort_order: Number(r.sort_order ?? 0),
          }))
          .filter((r) => r.id && r.code)
          .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));
        setWbsLibrary(mapped);
        if (!mapped.some((w) => w.code === manualWbsCode)) {
          setManualWbsCode(mapped[0]?.code ?? "");
        }
      })
      .catch(() => setWbsLibrary([]));
  }, [activeTab, manualWbsCode]);

  useEffect(() => {
    if (activeTab !== "daily") return;
    if (!manualDate) {
      setAssignedCatalogueIds([]);
      return;
    }
    const q = new URLSearchParams({ cost_date: manualDate });
    fetch(`/api/planner/cost/daily-entry?${q.toString()}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          catalogue_item_ids?: string[];
          error?: string;
        };
        if (!res.ok) throw new Error(String(body.error ?? "Could not load assigned resources"));
        setAssignedCatalogueIds(
          Array.isArray(body.catalogue_item_ids)
            ? body.catalogue_item_ids.map((x) => String(x)).filter(Boolean)
            : []
        );
      })
      .catch(() => setAssignedCatalogueIds([]));
  }, [activeTab, manualDate, reloadTick]);

  useEffect(() => {
    if (activeTab !== "daily") return;
    fetch("/api/planner/cost-catalogue")
      .then(async (res) => {
        const body = (await res.json().catch(() => [])) as Array<Record<string, unknown>>;
        if (!res.ok || !Array.isArray(body)) throw new Error("Could not load catalogue");
        const mapped = body
          .map((r) => ({
            id: String(r.id ?? ""),
            name: String(r.name ?? "").trim(),
            description:
              r.description != null && String(r.description).trim() !== ""
                ? String(r.description).trim()
                : null,
            category: String(r.category ?? "materials") as "labour" | "machinery" | "materials",
            unit: String(r.unit ?? "unit"),
            unit_rate: Number(r.unit_rate ?? 0),
            cost_code:
              r.cost_code != null && String(r.cost_code).trim() !== ""
                ? String(r.cost_code).trim()
                : null,
          }))
          .filter((r) => r.id && r.name);
        setCatalogue(mapped);
      })
      .catch(() => setCatalogue([]));
  }, [activeTab]);

  useEffect(() => {
    setManualShiftDuration(String(defaultShiftDuration(manualDate)));
  }, [manualDate]);

  const filteredCatalogue = useMemo(() => {
    const q = manualSearch.trim().toLowerCase();
    return catalogue.filter((c) => {
      if (assignedCatalogueIds.includes(c.id)) return false;
      if (manualCategoryFilter && c.category !== manualCategoryFilter) return false;
      if (!q) return true;
      return `${c.name} ${c.description ?? ""} ${c.category} ${c.unit}`.toLowerCase().includes(q);
    });
  }, [catalogue, assignedCatalogueIds, manualCategoryFilter, manualSearch]);

  useEffect(() => {
    if (activeTab !== "daily") return;
    if (!manualDate) {
      setDayAllocatedDetails([]);
      return;
    }
    const q = new URLSearchParams({ cost_date: manualDate });
    fetch(`/api/planner/cost/daily-entry?${q.toString()}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          rows?: Array<Record<string, unknown>>;
          error?: string;
        };
        if (!res.ok) throw new Error(String(body.error ?? "Could not load day allocations"));
        const rows = Array.isArray(body.rows) ? body.rows : [];
        const map = new Map<
          string,
          {
            lines: Array<{
              id: string;
              item_name: string;
              quantity: number;
              unit: string;
              amount: number;
              category: "labour" | "machinery" | "materials";
            }>;
            total: number;
          }
        >();
        const byCat = { labour: 0, machinery: 0, materials: 0 };
        for (const r of rows) {
          const code = String(r.wbs_code ?? "").trim() || "Uncoded";
          const bucket = map.get(code) ?? { lines: [], total: 0 };
          const rawCategory = String(r.category ?? "materials");
          const category: "labour" | "machinery" | "materials" =
            rawCategory === "labour" || rawCategory === "machinery" || rawCategory === "materials"
              ? rawCategory
              : "materials";
          const line = {
            id: String(r.id ?? ""),
            item_name: String(r.item_name ?? ""),
            quantity: Number(r.quantity ?? 0),
            unit: String(r.unit ?? "unit"),
            amount: Number(r.amount ?? 0),
            category,
          };
          bucket.lines.push(line);
          bucket.total += line.amount;
          byCat[category] += line.amount;
          map.set(code, bucket);
        }
        setDayAllocatedDetails(
          Array.from(map.entries())
            .map(([wbs_code, v]) => ({ wbs_code, lines: v.lines, total: v.total }))
            .sort((a, b) => a.wbs_code.localeCompare(b.wbs_code))
        );
        setDayAllocatedByCategory(byCat);
      })
      .catch(() => {
        setDayAllocatedDetails([]);
        setDayAllocatedByCategory({ labour: 0, machinery: 0, materials: 0 });
      });
  }, [activeTab, manualDate, reloadTick]);

  const deleteAllocatedLine = async (id: string) => {
    if (!id) return;
    setDeletingAllocatedId(id);
    try {
      const res = await fetch(`/api/planner/cost/daily-entry?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(String(body.error ?? "Could not delete allocation"));
      setReloadTick((x) => x + 1);
    } catch (e) {
      setManualError(e instanceof Error ? e.message : "Could not delete allocation");
    } finally {
      setDeletingAllocatedId(null);
    }
  };

  const toggleCatalogue = (id: string, checked: boolean) => {
    setSelectedCatalogueIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  };

  const addManualDailyCost = async () => {
    setManualError(null);
    setManualSuccess(null);
    if (!manualWbsCode) {
      setManualError("Select WBS");
      return;
    }
    if (selectedCatalogueIds.length === 0) {
      setManualError("Select at least one resource");
      return;
    }
    const shiftDuration = Number(manualShiftDuration);
    if (!Number.isFinite(shiftDuration) || shiftDuration < 0) {
      setManualError("Shift duration must be 0 or greater");
      return;
    }
    setManualSaving(true);
    try {
      const selectedItems = catalogue.filter((c) => selectedCatalogueIds.includes(c.id));
      if (selectedItems.length === 0) throw new Error("Selected resources are no longer available");

      for (const item of selectedItems) {
        const unitRaw = (manualUnitById[item.id] ?? item.unit).trim() || item.unit;
        const qtyRaw = Number(manualQtyById[item.id] ?? String(qtyFromUnit(unitRaw, shiftDuration)));
        if (!Number.isFinite(qtyRaw) || qtyRaw <= 0) {
          throw new Error(`Invalid quantity for ${item.name}`);
        }
        const res = await fetch("/api/planner/cost/daily-entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wbs_code: manualWbsCode,
            catalogue_item_id: item.id,
            name: item.name,
            unit: unitRaw,
            unit_rate: item.unit_rate,
            override_unit_rate: null,
            quantity: qtyRaw,
            cost_date: manualDate,
            category: item.category,
            description: "Manual daily cost entry",
          }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(String(body.error ?? `Could not save ${item.name}`));
      }
      setManualSuccess(`Added ${selectedItems.length} daily cost item(s)`);
      setSelectedCatalogueIds([]);
      setManualQtyById({});
      setManualUnitById({});
      setReloadTick((x) => x + 1);
    } catch (e) {
      setManualError(e instanceof Error ? e.message : "Could not save cost");
    } finally {
      setManualSaving(false);
    }
  };

  const onTabChange = (next: CostTab) => {
    const q = new URLSearchParams(searchParams.toString());
    q.set("tab", next);
    router.replace(`${pathname}?${q.toString()}`);
  };

  return (
    <AppShell
      sidebar={<Sidebar activeId="cost" />}
      header={
        <TopHeader
          left={
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <h1 className="text-dashboard-xl font-semibold text-dashboard-text-primary">Planner Cost</h1>
              <CostTabs active={activeTab} onChange={onTabChange} />
            </div>
          }
          right={
            <button
              type="button"
              onClick={() => setShowCostLibrary(true)}
              className="rounded-dashboard-md px-4 py-2.5 text-dashboard-sm font-medium text-dashboard-text-secondary transition-[background-color,color] duration-dashboard-fast hover:bg-dashboard-bg hover:text-dashboard-text-primary"
            >
              Resource library
            </button>
          }
        />
      }
    >
      <div className="mx-auto max-w-[1600px] space-y-4">
        {activeTab !== "daily" && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div>
              <label className="mb-1 block text-dashboard-xs text-dashboard-text-secondary">Crew</label>
              <select value={crewId} onChange={(e) => setCrewId(e.target.value)} className="w-full rounded-dashboard-md border border-dashboard-border bg-dashboard-surface px-3 py-2 text-dashboard-sm">
                <option value="">All crews</option>
                {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-dashboard-xs text-dashboard-text-secondary">Section</label>
              <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="w-full rounded-dashboard-md border border-dashboard-border bg-dashboard-surface px-3 py-2 text-dashboard-sm">
                <option value="">All sections</option>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-dashboard-xs text-dashboard-text-secondary">Cost code</label>
              <input value={costCode} onChange={(e) => setCostCode(e.target.value)} className="w-full rounded-dashboard-md border border-dashboard-border bg-dashboard-surface px-3 py-2 text-dashboard-sm" placeholder="e.g. NS020" />
            </div>
            <div>
              <label className="mb-1 block text-dashboard-xs text-dashboard-text-secondary">From</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full rounded-dashboard-md border border-dashboard-border bg-dashboard-surface px-3 py-2 text-dashboard-sm" />
            </div>
            <div>
              <label className="mb-1 block text-dashboard-xs text-dashboard-text-secondary">To</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full rounded-dashboard-md border border-dashboard-border bg-dashboard-surface px-3 py-2 text-dashboard-sm" />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-dashboard-md border border-dashboard-status-danger/40 bg-dashboard-status-danger/10 px-3 py-2 text-dashboard-sm text-dashboard-status-danger">
            {error}
          </div>
        )}

        {activeTab === "daily" && (
          <div className="rounded-dashboard-md border border-dashboard-border bg-dashboard-surface p-3">
            <p className="mb-3 text-dashboard-sm font-medium text-dashboard-text-primary">Add daily cost</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
              <div className="md:col-span-2">
                <label className="mb-1 block text-dashboard-xs text-dashboard-text-secondary">WBS</label>
                <select value={manualWbsCode} onChange={(e) => setManualWbsCode(e.target.value)} className="w-full rounded-dashboard-md border border-dashboard-border bg-dashboard-surface px-3 py-2 text-dashboard-sm">
                  <option value="">Select WBS</option>
                  {wbsLibrary.map((w) => <option key={w.id} value={w.code}>{w.label ? `${w.code} — ${w.label}` : w.code}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-dashboard-xs text-dashboard-text-secondary">Date</label>
                <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="w-full rounded-dashboard-md border border-dashboard-border bg-dashboard-surface px-3 py-2 text-dashboard-sm" />
              </div>
              <div>
                <label className="mb-1 block text-dashboard-xs text-dashboard-text-secondary">Shift duration (h)</label>
                <input type="number" min="0" step="0.5" value={manualShiftDuration} onChange={(e) => setManualShiftDuration(e.target.value)} className="w-full rounded-dashboard-md border border-dashboard-border bg-dashboard-surface px-3 py-2 text-dashboard-sm" />
              </div>
              <div className="flex items-end">
                <button type="button" onClick={addManualDailyCost} disabled={manualSaving} className="w-full rounded-dashboard-md border border-dashboard-border bg-dashboard-primary px-3 py-2 text-dashboard-sm font-medium text-white disabled:opacity-60">
                  {manualSaving ? "Adding..." : "Add cost"}
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
              <input value={manualSearch} onChange={(e) => setManualSearch(e.target.value)} placeholder="Search resource..." className="rounded-dashboard-md border border-dashboard-border bg-dashboard-surface px-3 py-2 text-dashboard-sm md:col-span-2" />
              <select value={manualCategoryFilter} onChange={(e) => setManualCategoryFilter(e.target.value as "" | "labour" | "machinery" | "materials")} className="rounded-dashboard-md border border-dashboard-border bg-dashboard-surface px-3 py-2 text-dashboard-sm">
                <option value="">All categories</option>
                <option value="labour">Labor</option>
                <option value="machinery">Machinery</option>
                <option value="materials">Material</option>
              </select>
              <p className="self-center text-dashboard-xs text-dashboard-text-secondary">Selected: {selectedCatalogueIds.length}</p>
            </div>
            <div className="mt-2 max-h-56 overflow-y-auto rounded-dashboard-md border border-dashboard-border">
              <table className="min-w-full text-left text-dashboard-xs">
                <thead className="border-b border-dashboard-border bg-dashboard-bg text-dashboard-text-secondary">
                  <tr>
                    <th className="px-3 py-2 font-medium">Use</th>
                    <th className="px-3 py-2 font-medium">Resource</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium">Unit</th>
                    <th className="px-3 py-2 font-medium">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCatalogue.map((c) => {
                    const selected = selectedCatalogueIds.includes(c.id);
                    const unitValue = manualUnitById[c.id] ?? c.unit;
                    const qtyValue =
                      manualQtyById[c.id] ??
                      String(qtyFromUnit(unitValue, Number(manualShiftDuration) || 0));
                    return (
                      <tr key={c.id} className="border-t border-dashboard-border">
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={selected} onChange={(e) => toggleCatalogue(c.id, e.target.checked)} />
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-dashboard-xs text-dashboard-text-primary">{c.name}</p>
                          {c.description ? (
                            <p className="text-dashboard-xs text-dashboard-text-secondary">{c.description}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 capitalize">{c.category}</td>
                        <td className="px-3 py-2">
                          <input
                            value={unitValue}
                            onChange={(e) =>
                              setManualUnitById((prev) => ({ ...prev, [c.id]: e.target.value }))
                            }
                            disabled={!selected}
                            className="w-20 rounded-dashboard-sm border border-dashboard-border bg-dashboard-surface px-2 py-1 text-dashboard-xs disabled:opacity-60"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={qtyValue}
                            onChange={(e) =>
                              setManualQtyById((prev) => ({ ...prev, [c.id]: e.target.value }))
                            }
                            disabled={!selected}
                            className="w-20 rounded-dashboard-sm border border-dashboard-border bg-dashboard-surface px-2 py-1 text-dashboard-xs disabled:opacity-60"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(manualError || manualSuccess) && (
              <p className={`mt-2 text-dashboard-xs ${manualError ? "text-dashboard-status-danger" : "text-dashboard-status-success"}`}>
                {manualError ?? manualSuccess}
              </p>
            )}
          </div>
        )}

        {activeTab === "daily" && (
          <DailyCostView
            loading={loading}
            rows={("rows" in (payload ?? {}) ? (payload as DailyPayload).rows : []) ?? []}
            total={Number(("summary" in (payload ?? {}) ? (payload as DailyPayload).summary?.total : 0) ?? 0)}
            byCategory={(("summary" in (payload ?? {}) ? (payload as DailyPayload).summary?.by_category : undefined) ?? {})}
            byCostCode={(("summary" in (payload ?? {}) ? (payload as DailyPayload).summary?.by_cost_code : undefined) ?? [])}
            allocatedByCostCode={dayAllocatedDetails}
            allocatedByCategory={dayAllocatedByCategory}
            onDeleteAllocatedLine={deleteAllocatedLine}
            deletingAllocatedId={deletingAllocatedId}
          />
        )}
        {activeTab === "accruals" && (
          <AccrualsView
            loading={loading}
            rows={("rows" in (payload ?? {}) ? (payload as AccrualPayload).rows : []) ?? []}
            total={Number(("summary" in (payload ?? {}) ? (payload as AccrualPayload).summary?.total : 0) ?? 0)}
            byDay={(("by_day" in (payload ?? {}) ? (payload as AccrualPayload).by_day : undefined) ?? [])}
            byCostCode={(("summary" in (payload ?? {}) ? (payload as AccrualPayload).summary?.by_cost_code : undefined) ?? [])}
          />
        )}
        {activeTab === "forecast" && (
          <ForecastView
            loading={loading}
            activities={("activities" in (payload ?? {}) ? (payload as ForecastPayload).activities : []) ?? []}
            totalForecast={Number(("summary" in (payload ?? {}) ? (payload as ForecastPayload).summary?.total_forecast : 0) ?? 0)}
            totalVariance={Number(("summary" in (payload ?? {}) ? (payload as ForecastPayload).summary?.total_variance_vs_budget : 0) ?? 0)}
          />
        )}
      </div>
      <PlannerCostLibraryModal open={showCostLibrary} onClose={() => setShowCostLibrary(false)} />
    </AppShell>
  );
}

