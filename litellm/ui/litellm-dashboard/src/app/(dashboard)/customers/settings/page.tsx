"use client";

import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import useAuthorized from "@/app/(dashboard)/hooks/useAuthorized";
import { isProxyAdminRole } from "@/utils/roles";
import { $api } from "@/lib/http/api";
import { ErrorState } from "@/components/shared/ErrorState";
import type { BudgetGroups } from "../_components/customerBudgetGroupsPlan";
import CustomerBudgetGroups from "../_components/CustomerBudgetGroups";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { uiHref } from "@/utils/uiHref";

const budgetGroupTab = parseAsStringLiteral(["organization", "app"])
  .withDefault("organization")
  .withOptions({ history: "push" });

export default function CustomerSettings() {
  const { t } = useTranslation();
  const [tab, setTab] = useQueryState("tab", budgetGroupTab);
  const changeTab = (value: unknown) => {
    if (value === "organization" || value === "app") void setTab(value);
  };
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("customerPortal.budgetGroups.settingsHint")}</p>
        <Button variant="outline" nativeButton={false} render={<a href={uiHref("apps")} />}>
          {t("apps.definition.title")}
        </Button>
      </div>
      <Tabs value={tab} onValueChange={changeTab} className="gap-6">
        <div className="overflow-x-auto border-b">
          <TabsList variant="line" aria-label={t("customerPortal.budgetGroups.title")} className="h-auto gap-6 p-0">
            <TabsTrigger
              value="organization"
              className="flex-none rounded-none px-0 py-3 group-data-horizontal/tabs:after:bottom-0"
            >
              {t("customerPortal.budgetGroups.overallTab")}
            </TabsTrigger>
            <TabsTrigger
              value="app"
              className="flex-none rounded-none px-0 py-3 group-data-horizontal/tabs:after:bottom-0"
            >
              {t("customerPortal.budgetGroups.appTab")}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="organization" keepMounted>
          {groups.data && <CustomerBudgetGroups global organization={groups.data} onSaved={saved} />}
          {groups.isError && <ErrorState onRetry={() => void groups.refetch()} />}
          {groups.isPending && <p>{t("customerPortal.common.loading")}</p>}
        </TabsContent>
        <TabsContent value="app" keepMounted>
          {appGroups.data && (
            <CustomerBudgetGroups global scope="app" organization={appGroups.data} onSaved={appGroupsSaved} />
          )}
          {appGroups.isError && <ErrorState onRetry={() => void appGroups.refetch()} />}
          {appGroups.isPending && <p>{t("customerPortal.common.loading")}</p>}
        </TabsContent>
      </Tabs>
    </main>
  );
}
