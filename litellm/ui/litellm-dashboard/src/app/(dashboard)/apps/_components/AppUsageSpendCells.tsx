import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import useAuthorized from "@/app/(dashboard)/hooks/useAuthorized";
import { Button } from "@/components/ui/button";
import { extractProxyErrorMessage } from "@/lib/http/client";
import { customerAppSpendCall, type CustomerUsageScope } from "../../customers/_components/customerUsageApi";
import { calendarDate, customerPresetRange } from "../../customers/_components/customerUsageRange";
import { CustomerSpendCells } from "../../customers/_components/CustomerSpendCells";
import CustomerTokenTotal from "../../customers/_components/CustomerTokenTotal";
import { customerOrganizationsUsageCall } from "../../customers/_components/customerOrganizations";
import { appUsageEntity } from "./appBudgetPresentation";
import type { AppMember, AppOrganization } from "./appForms";

export interface AppUsageContext {
  scope: CustomerUsageScope;
  startDate: string;
  endDate: string;
  organizationSpend: number | null;
}

export default function AppUsageSpendCells({
  appId,
  alias,
  row,
  context,
}: {
  appId: string;
  alias: string;
  row: AppOrganization | AppMember;
  context: AppUsageContext;
}) {
  const { t } = useTranslation();
  const { accessToken } = useAuthorized();
  const month = customerPresetRange("month");
  const year = customerPresetRange("YTD");
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
  const entity = appUsageEntity(appId, alias, row);
  return (
    <CustomerSpendCells
      entity={entity}
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
