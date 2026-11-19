"use client";

import { $api } from "@/lib/http/api";

export function useAppBudgetGroups(existingIds: (string | null | undefined)[] = [], enabled = true) {
  const groups = $api.useQuery("get", "/management/v1/app_customer_organization_budget_groups", {}, { enabled });
  const missingIds = existingIds.filter(
    (id): id is string => Boolean(id) && !groups.data?.default_budgets.some((group) => group.budget_id === id),
  );
  const legacy = $api.useQuery(
    "get",
    "/management/v1/customer_organization_budget_groups",
    {},
    { enabled: enabled && Boolean(groups.data) && missingIds.length > 0 },
  );
  return {
    ...groups,
    data: groups.data
      ? {
          ...groups.data,
          default_budgets: [
            ...groups.data.default_budgets,
            ...(legacy.data?.default_budgets ?? []).filter((group) => missingIds.includes(group.budget_id)),
          ],
        }
      : undefined,
  };
}
