import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import useAuthorized from "@/app/(dashboard)/hooks/useAuthorized";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { customerBudgetPeriod } from "../../customers/_components/customerBudgetUsage";
import { Button } from "@/components/ui/button";
import { extractProxyErrorMessage } from "@/lib/http/client";
import { customerAppSpendCall, type CustomerUsageScope } from "../../customers/_components/customerUsageApi";
import { calendarDate, customerPresetRange } from "../../customers/_components/customerUsageRange";
import {
  CustomerSpendCells,
  CustomerSpendMetricsCells,
  CustomerSpendHeaders,
  CustomerSpendMetricsHeaders,
} from "../../customers/_components/CustomerSpendCells";
import CustomerTokenTotal from "../../customers/_components/CustomerTokenTotal";
import { customerOrganizationsUsageCall } from "../../customers/_components/customerOrganizations";
import { appBudgetWindows, appUsageEntity } from "./appBudgetPresentation";
import type { App, AppMember, AppOrganization } from "./appForms";

export interface AppUsageContext {
  scope: CustomerUsageScope;
  startDate: string;
  endDate: string;
  organizationSpend: number | null;
}

export default function AppBudgetSpendCells({
  appId,
  alias,
  row,
  context,
  compact = false,
}: {
  appId: string;
  alias: string;
  row: AppOrganization | AppMember;
  context: AppUsageContext;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { accessToken } = useAuthorized();
  const month = customerPresetRange("month");
  const year = compact ? month : customerPresetRange("YTD");
  const periods = {
    monthStartDate: calendarDate(month.from),
    monthEndDate: calendarDate(month.to),
    yearStartDate: calendarDate(year.from),
    yearEndDate: calendarDate(year.to),
  };
  const activityOptions = {
    queryKey: ["customer-app-usage", appId, context.scope, context.startDate, context.endDate, periods],
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      const request = { ...context, ...periods, appId, accessToken: accessToken!, signal };
      return customerAppSpendCall(request);
    },
    enabled: Boolean(accessToken),
  };
  const activity = useQuery(activityOptions);
  const organizationOptions = {
    queryKey: ["customer-app-organization-spend", context.scope.org, periods.monthStartDate, periods.monthEndDate],
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      const request = {
        ids: [context.scope.org],
        startDate: periods.monthStartDate,
        endDate: periods.monthEndDate,
        accessToken: accessToken!,
        signal,
      };
      return customerOrganizationsUsageCall(request);
    },
    enabled: Boolean(accessToken) && context.organizationSpend === null,
  };
  const organization = useQuery(organizationOptions);
  const Cells = compact ? CustomerSpendMetricsCells : CustomerSpendCells;
  return (
    <Cells
      entity={appUsageEntity(appId, alias, row)}
      monthlySpend={activity.data?.monthlySpend ?? null}
      yearlySpend={activity.data?.yearlySpend ?? null}
      tokens={activity.data?.tokenDetails.tokens ?? null}
      tokenContent={
        activity.isError ? (
          <Button
            variant="ghost"
            size="xs"
            title={extractProxyErrorMessage(activity.error)}
            onClick={() => void activity.refetch()}
          >
            {t("customerPortal.analytics.unknownSpend")} · {t("apps.retry")}
          </Button>
        ) : (
          <CustomerTokenTotal usage={activity.data?.tokenDetails ?? null} />
        )
      }
      organizationSpend={context.organizationSpend ?? organization.data?.metadata.total_spend ?? null}
      usageLayout
    />
  );
}

export function AppBudgetIdentity({
  app,
  row,
  sourceLabel,
  onAppSelect,
}: {
  app: App;
  row: AppOrganization | AppMember | undefined;
  sourceLabel?: string;
  onAppSelect?: (appId: string) => void;
}) {
  const { t } = useTranslation();
  const { primary } = appBudgetWindows(row?.effective_budget, row?.budget_usage);
  const period = customerBudgetPeriod(primary?.budget_duration ?? null);
  const periodLabel = period === "other" ? primary?.budget_duration : t(`apps.${period}`);
  return (
    <TableCell className="px-4 py-3">
      {onAppSelect ? (
        <button
          type="button"
          onClick={() => onAppSelect(app.app_id)}
          className="block text-left font-medium hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {app.alias}
        </button>
      ) : (
        <span className="block font-medium">{app.alias}</span>
      )}
      <span className="mt-1 block text-xs text-muted-foreground">
        {[sourceLabel, periodLabel].filter(Boolean).join(" · ")}
      </span>
    </TableCell>
  );
}

export function AppBudgetTable({
  scope,
  usageLayout = false,
  children,
}: {
  scope: "organization" | "member";
  usageLayout?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const organization = scope === "organization";
  return (
    <div className={usageLayout ? "overflow-hidden rounded-lg border" : "overflow-x-auto"}>
      <Table className="w-full text-sm" aria-label={t(organization ? "apps.organizationTitle" : "apps.memberTitle")}>
        <TableHeader>
          <TableRow>
            <TableHead className="px-4 py-3">{t("apps.alias")}</TableHead>
            {(organization || usageLayout) && (
              <TableHead className="px-4">{t(organization ? "apps.profile" : "apps.source")}</TableHead>
            )}
            {usageLayout ? (
              <CustomerSpendHeaders usageLayout>
                <TableHead className="px-4">{t("customerPortal.hierarchy.maxBudget")}</TableHead>
              </CustomerSpendHeaders>
            ) : (
              <>
                <TableHead className="px-4">{t(organization ? "apps.effectiveBudget" : "apps.memberBudget")}</TableHead>
                {organization && <CustomerSpendMetricsHeaders usageLayout />}
              </>
            )}
            <TableHead className="px-4 text-right">{t("apps.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}
