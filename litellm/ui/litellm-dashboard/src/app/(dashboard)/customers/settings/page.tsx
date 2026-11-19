"use client";

import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import useAuthorized from "@/app/(dashboard)/hooks/useAuthorized";
import { isProxyAdminRole } from "@/utils/roles";
import { $api } from "@/lib/http/api";
import { ErrorState } from "@/components/shared/ErrorState";
import type { BudgetGroups } from "../_components/customerBudgetGroupsPlan";
import CustomerBudgetGroups from "../_components/CustomerBudgetGroups";
import { Button } from "@/components/ui/button";
import { uiHref } from "@/utils/uiHref";

export default function CustomerSettings() {
  const { t } = useTranslation();
  const { accessToken, userRole } = useAuthorized();
  const queryClient = useQueryClient();
  const canManage = Boolean(accessToken && isProxyAdminRole(userRole));
  const groups = $api.useQuery("get", "/management/v1/customer_organization_budget_groups", {}, { enabled: canManage });
  const appGroups = $api.useQuery(
    "get",
    "/management/v1/app_customer_organization_budget_groups",
    {},
    { enabled: canManage },
  );
  const saved = (data: BudgetGroups) => {
    queryClient.setQueryData(
      $api.queryOptions("get", "/management/v1/customer_organization_budget_groups", {}).queryKey,
      data,
    );
    void queryClient.invalidateQueries({ queryKey: ["customer-hierarchy"] });
    void queryClient.invalidateQueries({ queryKey: ["customer-organizations"] });
  };
  const appGroupsSaved = (data: BudgetGroups) => {
    queryClient.setQueryData(
      $api.queryOptions("get", "/management/v1/app_customer_organization_budget_groups", {}).queryKey,
      data,
    );
    void queryClient.invalidateQueries({ queryKey: ["apps"] });
    void queryClient.invalidateQueries({ queryKey: ["app-organization"] });
    void queryClient.invalidateQueries({ queryKey: ["app-member"] });
  };
  if (!canManage) return <ErrorState message={t("customerPortal.hierarchy.adminOnly")} />;
  return (
    <main className="space-y-5 px-6 py-5">
      <h1 className="text-lg font-semibold">{t("customerPortal.budgetGroups.title")}</h1>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-5">
        <p className="text-sm text-muted-foreground">{t("customerPortal.budgetGroups.settingsHint")}</p>
        <Button variant="outline" nativeButton={false} render={<a href={uiHref("apps")} />}>
          {t("apps.definition.title")}
        </Button>
      </div>
      <section aria-labelledby="organization-budget-groups" className="space-y-4">
        <div className="space-y-1">
          <h2 id="organization-budget-groups" className="font-semibold">
            {t("customerPortal.organizationGroups.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("customerPortal.organizationGroups.help")}</p>
        </div>
        {groups.data && <CustomerBudgetGroups global organization={groups.data} onSaved={saved} />}
        {groups.isError && <ErrorState onRetry={() => void groups.refetch()} />}
        {groups.isPending && <p>{t("customerPortal.common.loading")}</p>}
      </section>
      <section aria-labelledby="app-organization-budget-groups" className="space-y-4 border-t pt-6">
        <div className="space-y-1">
          <h2 id="app-organization-budget-groups" className="font-semibold">
            {t("customerPortal.appOrganizationGroups.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("customerPortal.appOrganizationGroups.help")}</p>
        </div>
        {appGroups.data && (
          <CustomerBudgetGroups global scope="app" organization={appGroups.data} onSaved={appGroupsSaved} />
        )}
        {appGroups.isError && <ErrorState onRetry={() => void appGroups.refetch()} />}
        {appGroups.isPending && <p>{t("customerPortal.common.loading")}</p>}
      </section>
    </main>
  );
}
