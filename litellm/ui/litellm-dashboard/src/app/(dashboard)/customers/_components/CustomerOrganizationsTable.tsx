import { useTranslation } from "react-i18next";
import type { SortingState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { createSerializer, parseAsString } from "nuqs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/cva.config";
import { uiHref } from "@/utils/uiHref";
import { $api } from "@/lib/http/api";
import CustomerBudgetSpend, { CustomerBudgetWindow } from "./CustomerBudgetSpend";
import { customerOrganizationBudgetSource, type CustomerOrganizationRow } from "./customerOrganizations";
import { CustomerBudgetLimitCell } from "./CustomerBudgetColumn";

const usageHref = createSerializer({ org: parseAsString, from: parseAsString, to: parseAsString });
const SORT_DIRECTIONS = ["ascending", "descending"] as const;
const COLUMNS = [
  { id: "customer", label: "customerPortal.list.columns.customer" },
  { id: "spend", label: "customerPortal.analytics.monthlySpend" },
  { id: "budget", label: "customerPortal.hierarchy.maxBudget" },
  { id: "share", label: "customerPortal.list.columns.overallSpendShare" },
  { id: "status", label: "customerPortal.list.columns.status" },
] as const;
const GROUP_COLORS = [
  { dot: "bg-amber-600", badge: "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40" },
  { dot: "bg-emerald-600", badge: "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40" },
  { dot: "bg-violet-500", badge: "border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/40" },
  { dot: "bg-sky-500", badge: "border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40" },
  { dot: "bg-rose-500", badge: "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40" },
] as const;

function OrganizationBudgetBadge({
  source,
  color,
}: {
  source: ReturnType<typeof customerOrganizationBudgetSource>;
  color?: (typeof GROUP_COLORS)[number];
}) {
  const { t } = useTranslation();
  if (!source) return null;
  if (source.kind === "custom") {
    return (
      <Badge variant="outline" className="border-dashed bg-background text-muted-foreground">
        {t("customerPortal.organizationGroups.customBadge")}
      </Badge>
    );
  }
  const name = source.name ?? t("customerPortal.organizationGroups.groupBadge");
  return (
    <Badge
      variant="outline"
      className={cn("max-w-40 gap-1.5", color?.badge ?? "bg-muted/40")}
      title={name}
      aria-label={t("customerPortal.organizationGroups.assignedGroup", { name })}
    >
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", color?.dot ?? "bg-muted-foreground")} />
      <span className="truncate">{name}</span>
    </Badge>
  );
}

export default function CustomerOrganizationsTable({
  rows,
  sorting,
  onSort,
  loading,
  searching,
  startDate,
  endDate,
}: {
  rows: readonly CustomerOrganizationRow[];
  sorting: SortingState;
  onSort: (sorting: SortingState) => void;
  loading: boolean;
  searching: boolean;
  startDate: string;
  endDate: string;
}) {
  const { t } = useTranslation();
  const groups = $api.useQuery("get", "/management/v1/customer_organization_budget_groups", {});
  const groupColors = new Map(
    groups.data?.default_budgets.map((group, index) => [group.budget_id, GROUP_COLORS[index % GROUP_COLORS.length]]),
  );
  return (
    <Table aria-label={t("customerPortal.list.title")}>
      <TableHeader>
        <TableRow>
          {COLUMNS.map(({ id, label }) => {
            const active = sorting[0]?.id === id;
            const descending = sorting[0]?.desc ?? false;
            const SortIcon = descending ? ArrowDown : ArrowUp;
            const Icon = active ? SortIcon : ArrowUpDown;
            const direction = SORT_DIRECTIONS[Number(descending)];
            return (
              <TableHead
                key={id}
                aria-sort={active ? direction : "none"}
                className={cn("px-4", id === "spend" && "min-w-60", id === "status" && "text-right")}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="-mx-2 gap-2"
                  onClick={() => onSort([{ id, desc: active ? !descending : id !== "customer" && id !== "budget" }])}
                >
                  {t(label)}
                  <Icon aria-hidden="true" className="size-3.5" />
                </Button>
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading && (
          <TableRow>
            <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
              {t("customerPortal.list.loading")}
            </TableCell>
          </TableRow>
        )}
        {!loading && rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
              {t(searching ? "customerPortal.list.noMatches" : "customerPortal.list.empty")}
            </TableCell>
          </TableRow>
        )}
        {!loading &&
          rows.map(({ organization, monthlySpend, monthlyBudgets, budgetLimit, share, status }) => {
            const label = organization.alias || organization.customer_org_id;
            const percentage = Math.max(0, Math.min(100, share * 100));
            const shareLabel = t("format.number", { val: share, style: "percent", maximumFractionDigits: 1 });
            return (
              <TableRow key={organization.customer_org_id}>
                <TableCell className="px-4 py-5">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
                    >
                      {label
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => part.charAt(0))
                        .join("")
                        .toLocaleUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <a
                        className="block max-w-52 truncate font-medium hover:text-primary hover:underline"
                        title={label}
                        href={usageHref(uiHref("customers/usage"), {
                          org: organization.customer_org_id,
                          from: startDate,
                          to: endDate,
                        })}
                      >
                        {label}
                      </a>
                      {label !== organization.customer_org_id && (
                        <p
                          className="max-w-52 truncate font-mono text-[11px] text-muted-foreground"
                          title={organization.customer_org_id}
                        >
                          {organization.customer_org_id}
                        </p>
                      )}
                      <a
                        className="mt-1 inline-block text-xs text-muted-foreground hover:text-foreground hover:underline"
                        href={`${usageHref(uiHref("customers/usage"), { org: organization.customer_org_id, from: startDate, to: endDate })}#app-budgets`}
                      >
                        {t("apps.organizationTitle")}
                      </a>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-4">
                  <div className="max-w-lg space-y-3">
                    {monthlyBudgets.map((budget) => (
                      <CustomerBudgetWindow
                        key={`${budget.source}-${budget.budget_duration}`}
                        budget={budget}
                        showReset={monthlyBudgets.length > 1}
                      />
                    ))}
                    {monthlyBudgets.length === 0 && (
                      <CustomerBudgetSpend
                        spend={monthlySpend}
                        limit={null}
                        label={t("customerPortal.analytics.monthlySpend")}
                      />
                    )}
                  </div>
                </TableCell>
                <CustomerBudgetLimitCell limit={budgetLimit} rateLimits={organization.budget}>
                  <OrganizationBudgetBadge
                    source={customerOrganizationBudgetSource(organization, groups.data?.default_budgets)}
                    color={groupColors.get(organization.budget_id ?? "")}
                  />
                </CustomerBudgetLimitCell>
                <TableCell className="px-4">
                  <div className="flex items-center gap-3">
                    <div
                      role="meter"
                      aria-label={t("customerPortal.list.columns.overallSpendShare")}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percentage}
                      aria-valuetext={shareLabel}
                      className="h-2 w-24 overflow-hidden rounded-full bg-muted"
                    >
                      <div className="h-full rounded-full bg-primary/60" style={{ width: `${percentage}%` }} />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">{shareLabel}</span>
                  </div>
                </TableCell>
                <TableCell className="px-4 text-right">
                  <span
                    className={cn(
                      "inline-flex whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xs",
                      status === "customerPortal.analytics.reachedLimit" && "bg-destructive/10 text-destructive",
                    )}
                  >
                    {t(status)}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
      </TableBody>
    </Table>
  );
}
