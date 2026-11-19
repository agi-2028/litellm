import { useTranslation } from "react-i18next";
import { BudgetUsageProgress } from "@/components/shared/BudgetUsageProgress";
import { budgetUsageColor } from "@/components/shared/budgetUsageColor";
import { formatUsd } from "@/app/(dashboard)/usage/_components/components/overview/overviewData";
import { CUSTOMER_BUDGET_LABELS, customerBudgetPeriod, type CustomerBudgetUsage } from "./customerBudgetUsage";

function budgetPercentage(spend: number, limit: number | null): number {
  if (limit === null) return 0;
  if (limit === 0) return 100;
  return Math.max(0, Math.min(100, (spend / limit) * 100));
}

export function CustomerBudgetWindow({
  budget,
  showReset = false,
}: {
  budget: CustomerBudgetUsage;
  showReset?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const period = customerBudgetPeriod(budget.budget_duration);
  const label = t(CUSTOMER_BUDGET_LABELS[period]);
  const reset = budget.reset_at
    ? t("customerPortal.analytics.budgetResets", {
        date: new Date(budget.reset_at).toLocaleString(i18n.resolvedLanguage, { timeZone: "UTC" }),
      })
    : null;
  return (
    <div title={[budget.budget_duration, reset].filter(Boolean).join(" · ")}>
      <CustomerBudgetSpend spend={budget.spend} limit={budget.max_budget} label={label} compact={period === "yearly"} />
      {showReset && reset && <p className="mt-1 text-[11px] text-muted-foreground">{reset}</p>}
    </div>
  );
}

export default function CustomerBudgetSpend({
  spend,
  limit,
  label,
  compact = false,
}: {
  spend: number | null;
  limit: number | null;
  label: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const spendValue = spend === null ? t("customerPortal.analytics.unknownSpend") : formatUsd(spend);
  if (limit === null) {
    return (
      <div className="space-y-0.5 whitespace-nowrap tabular-nums">
        <div>{spendValue}</div>
        <div className="text-xs text-muted-foreground">{t("customerPortal.analytics.noLimit")}</div>
      </div>
    );
  }
  const value = `${spendValue} / ${formatUsd(limit)}`;
  const percentage = budgetPercentage(spend ?? 0, limit);
  const color = budgetUsageColor(percentage);
  const balance =
    spend === null
      ? null
      : t(spend > limit ? "customerPortal.analytics.budgetOver" : "customerPortal.analytics.budgetRemaining", {
          amount: formatUsd(Math.abs(limit - spend)),
        });
  if (compact) return <span className="whitespace-nowrap tabular-nums">{value}</span>;
  return (
    <div className="space-y-2 tabular-nums">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="whitespace-nowrap font-medium">{value}</span>
        {balance !== null && (
          <span
            className="whitespace-nowrap rounded px-1.5 py-0.5 text-xs"
            style={{
              backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)`,
              color: `color-mix(in oklab, ${color} 60%, var(--foreground))`,
            }}
          >
            {balance}
          </span>
        )}
      </div>
      {spend !== null && (
        <BudgetUsageProgress percentage={percentage} label={label} valueText={`${value}, ${balance}`} />
      )}
    </div>
  );
}
