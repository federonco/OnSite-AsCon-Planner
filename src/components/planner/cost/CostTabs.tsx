"use client";

export type CostTab = "daily" | "accruals" | "forecast";

export default function CostTabs({
  active,
  onChange,
}: {
  active: CostTab;
  onChange: (next: CostTab) => void;
}) {
  const tabs: Array<{ id: CostTab; label: string }> = [
    { id: "daily", label: "Daily Cost" },
    { id: "accruals", label: "Accruals" },
    { id: "forecast", label: "Forecast" },
  ];

  return (
    <div className="flex rounded-dashboard-md border border-dashboard-border bg-dashboard-bg p-0.5">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`rounded-dashboard-sm px-3 py-1.5 text-dashboard-sm font-medium transition-colors ${
            active === t.id
              ? "bg-dashboard-surface text-dashboard-text-primary shadow-sm"
              : "text-dashboard-text-secondary hover:text-dashboard-text-primary"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

