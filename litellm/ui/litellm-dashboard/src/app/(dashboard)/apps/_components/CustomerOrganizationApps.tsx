"use client";

import { compactBudgetEditorFields, compactBudgetEditorValue } from "../../customers/_components/customerBudgetForm";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { CustomerBudgetDialog, CustomerBudgetForm } from "../../customers/_components/CustomerBudgetDialog";
import { useCustomerBudgetSave } from "../../customers/_components/useCustomerBudgetSave";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { SearchSelect } from "@/components/shared/SearchSelect";
import { ErrorState } from "@/components/shared/ErrorState";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { fetchClient } from "@/lib/http/api";
import { ApiError, extractProxyErrorMessage } from "@/lib/http/client";
import { uiHref } from "@/utils/uiHref";
import { appDefinitionKey, appResourcesKey, loadAppDefinition, loadAppResources, loadApps } from "./appApi";
import { type App, type AppResource, type AppOrganization } from "./appForms";
import CustomerBudgetCompactFields from "../../customers/_components/CustomerBudgetCompactFields";
import { CustomerBudgetSourceSelect } from "../../customers/_components/CustomerLimitsFields";
import AppBudgetLimits from "./AppBudgetLimits";
import { useAppBudgetGroups } from "./useAppBudgetGroups";
import AppBudgetSpendCells, { AppBudgetIdentity, AppBudgetTable, type AppUsageContext } from "./AppBudgetCells";
import { calendarDate, customerPresetRange } from "../../customers/_components/customerUsageRange";

const organizationAppKey = (appId: string | null, organizationId: string) =>
  ["app-organization", appId, organizationId] as const;
const loadOrganizationApp = async (appId: string, organizationId: string) => {
  try {
    const response = await fetchClient.GET("/management/v1/apps/{app_id}/customer_organizations/{customer_org_id}", {
      params: { path: { app_id: appId, customer_org_id: organizationId } },
    });
    return response.data ?? null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
};

export default function CustomerOrganizationApps({
  organizationId,
  organizationAlias,
  onAppSelect,
  usageContext,
}: {
  organizationId: string;
  organizationAlias?: string | null;
  onAppSelect?: (appId: string) => void;
  usageContext?: AppUsageContext;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AppResource | null>(null);
  const [pending, setPending] = useState(false);
  const { definition, resourceType, groups, resources, rows, loading, error, noRows, ready, setupNeeded } =
    useOrganizationApps(organizationId);
  const month = customerPresetRange("month");
  const closeDialog = () => {
    setAdding(false);
    setEditing(null);
  };
  return (
    <section id="app-budgets" className="space-y-4 border-t pt-6" aria-label={t("apps.organizationTitle")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("apps.organizationTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("apps.organizationHint")}</p>
        </div>
        <AddAppBudgetAction
          setupNeeded={setupNeeded}
          disabled={definition.isPending || definition.isError}
          onAdd={() => {
            setAdding(true);
            setEditing(null);
          }}
        />
      </div>
      {loading && (
        <p role="status" className="text-sm">
          {t("apps.loading")}
        </p>
      )}
      {error && <ErrorState message={extractProxyErrorMessage(error)} />}
      {setupNeeded && <p className="text-sm text-muted-foreground">{t("apps.defineFirst")}</p>}
      {noRows && ready && <p className="text-sm text-muted-foreground">{t("apps.noOrganizationBudgets")}</p>}
      {rows.length > 0 && (
        <OrganizationAppsTable
          rows={rows}
          groups={groups.data?.default_budgets ?? []}
          onAppSelect={onAppSelect}
          usageLayout={Boolean(usageContext)}
          usageContext={
            usageContext ?? {
              scope: { org: organizationId, team: null, member: null },
              startDate: calendarDate(month.from),
              endDate: calendarDate(month.to),
              organizationSpend: null,
            }
          }
          onEdit={(resource) => {
            setAdding(false);
            setEditing(resource);
          }}
        />
      )}
      <CustomerBudgetDialog
        open={adding || editing !== null}
        onClose={closeDialog}
        pending={pending}
        title={adding ? t("apps.addBudget") : t("apps.budgetFor", { alias: editing?.alias })}
        description={t("apps.organizationHint")}
        className="sm:max-w-2xl"
      >
        <div className="grid shrink-0 gap-4 px-6 pt-6 last:pb-6 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="app-budget-customer" className="text-sm text-muted-foreground">
              {t("apps.customer")}
            </label>
            <Input id="app-budget-customer" value={organizationAlias || organizationId} readOnly />
          </div>
          {adding && resourceType ? (
            <OrganizationAppPicker resources={resources} selected={editing} pending={pending} onChange={setEditing} />
          ) : (
            <div className="space-y-2">
              <label htmlFor="app-budget-resource" className="text-sm text-muted-foreground">
                {t("apps.alias")}
              </label>
              <Input id="app-budget-resource" value={editing?.alias ?? ""} readOnly />
            </div>
          )}
        </div>
        {editing && (
          <OrganizationApp
            key={`${editing.resource_type}:${editing.resource_id}`}
            resource={editing}
            organizationId={organizationId}
            organizationAlias={organizationAlias}
            pending={pending}
            onPendingChange={setPending}
            onClose={closeDialog}
          />
        )}
      </CustomerBudgetDialog>
    </section>
  );
}

function OrganizationAppPicker({
  resources,
  selected,
  pending,
  onChange,
}: {
  resources: ReturnType<typeof useOrganizationApps>["resources"];
  selected: AppResource | null;
  pending: boolean;
  onChange: (resource: AppResource | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <label htmlFor="organization-app" className="block text-sm text-muted-foreground">
        {t("apps.selectApp")}
      </label>
      <SearchSelect
        id="organization-app"
        className="w-full"
        placeholder={t("apps.selectApp")}
        value={selected?.resource_id}
        onValueChange={(value) => onChange(resources.data?.find((resource) => resource.resource_id === value) ?? null)}
        disabled={!resources.data || pending}
        options={resources.data?.map((resource) => ({ value: resource.resource_id, label: resource.alias })) ?? []}
      />
      {resources.data?.length === 0 && <p className="text-sm text-muted-foreground">{t("apps.noResources")}</p>}
      {resources.isError && (
        <p role="alert" className="text-sm text-destructive">
          {extractProxyErrorMessage(resources.error)}
        </p>
      )}
    </div>
  );
}

function AddAppBudgetAction({
  setupNeeded,
  disabled,
  onAdd,
}: {
  setupNeeded: boolean;
  disabled: boolean;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  if (setupNeeded)
    return (
      <Button nativeButton={false} role="link" render={<a href={uiHref("apps")} />}>
        {t("apps.addBudget")}
      </Button>
    );
  return (
    <Button type="button" disabled={disabled} onClick={onAdd}>
      {t("apps.addBudget")}
    </Button>
  );
}

function useOrganizationApps(organizationId: string) {
  const definition = useQuery({ queryKey: appDefinitionKey, queryFn: loadAppDefinition });
  const resourceType = definition.data?.resource_type ?? null;
  const apps = useQuery({ queryKey: ["apps"], queryFn: () => loadApps(), enabled: resourceType !== null });
  const associations = useQueries({
    queries: (apps.data ?? []).map((app) => ({
      queryKey: organizationAppKey(app.app_id, organizationId),
      queryFn: () => loadOrganizationApp(app.app_id, organizationId),
      retry: false,
    })),
  });
  const groups = useAppBudgetGroups(
    (apps.data ?? []).map((app, index) => associations[index]?.data?.tier_budget_id ?? app.default_tier_budget_id),
    resourceType !== null,
  );
  const resources = useQuery({
    queryKey: appResourcesKey(resourceType),
    queryFn: () => loadAppResources(resourceType!),
    enabled: resourceType !== null,
  });
  const rows = (apps.data ?? []).flatMap((app, index) => {
    const association = associations[index];
    return association?.data ? [{ app, row: association.data }] : [];
  });
  const loadingAssociations = apps.isPending || associations.some((query) => query.isPending);
  const loading = definition.isPending || (resourceType !== null && loadingAssociations);
  const failedAssociation = associations.find((query) => query.isError);
  const error = definition.error ?? apps.error ?? failedAssociation?.error;
  const noRows = resourceType !== null && rows.length === 0;
  const ready = !loading && !error;
  const setupNeeded = Boolean(definition.data) && resourceType === null;
  return { definition, resourceType, groups, resources, rows, loading, error, noRows, ready, setupNeeded };
}

function OrganizationAppsTable({
  rows,
  groups,
  onEdit,
  onAppSelect,
  usageContext,
  usageLayout,
}: {
  rows: { app: App; row: AppOrganization }[];
  groups: { budget_id: string; name: string }[];
  onEdit: (resource: AppResource) => void;
  onAppSelect?: (appId: string) => void;
  usageContext: AppUsageContext;
  usageLayout: boolean;
}) {
  const { t } = useTranslation();
  return (
    <AppBudgetTable scope="organization" usageLayout={usageLayout}>
      {rows.map(({ app, row }) => {
        const profileId = row.tier_budget_id ?? app.default_tier_budget_id;
        const profileName = groups.find((group) => group.budget_id === profileId)?.name;
        let sourceLabel = t("apps.appDefault");
        if (row.budget_override_id) sourceLabel = t("customerPortal.organizationGroups.customBadge");
        else if (row.tier_budget_id) sourceLabel = profileName ?? t("apps.profile");
        if (!row.budget_override_id && !row.tier_budget_id && profileName)
          sourceLabel = `${profileName} · ${sourceLabel}`;
        const resource: AppResource = {
          resource_type: app.resource_type,
          resource_id: app.resource_id,
          app_id: app.app_id,
          alias: app.alias,
        };
        return (
          <TableRow key={app.app_id} className="border-b">
            <AppBudgetIdentity app={app} row={row} onAppSelect={onAppSelect} />
            <TableCell className="px-4 py-3 text-muted-foreground">
              <span className="block max-w-48 truncate" title={sourceLabel}>
                {sourceLabel}
              </span>
            </TableCell>
            {usageLayout ? (
              <AppBudgetSpendCells appId={app.app_id} alias={app.alias} row={row} context={usageContext} />
            ) : (
              <>
                <TableCell className="px-4 py-3">
                  <AppBudgetLimits budget={row.effective_budget} usage={row.budget_usage} cumulativeSpend={row.spend} />
                </TableCell>
                <AppBudgetSpendCells appId={app.app_id} alias={app.alias} row={row} context={usageContext} compact />
              </>
            )}
            <TableCell className="px-4 py-3 text-right">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onEdit(resource)}
                aria-label={t("apps.editBudgetFor", { alias: app.alias })}
              >
                {t("apps.edit")}
              </Button>
            </TableCell>
          </TableRow>
        );
      })}
    </AppBudgetTable>
  );
}

function OrganizationApp({
  resource,
  organizationId,
  organizationAlias,
  pending,
  onPendingChange,
  onClose,
}: {
  resource: AppResource;
  organizationId: string;
  organizationAlias?: string | null;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const associationOptions = {
    queryKey: organizationAppKey(resource.app_id ?? null, organizationId),
    queryFn: () => loadOrganizationApp(resource.app_id!, organizationId),
    enabled: Boolean(resource.app_id),
    retry: false,
  };
  const association = useQuery(associationOptions);
  if (resource.app_id && association.isPending) return <p role="status">{t("apps.loading")}</p>;
  if (association.isError)
    return (
      <ErrorState message={extractProxyErrorMessage(association.error)} onRetry={() => void association.refetch()} />
    );
  return (
    <OrganizationAppForm
      resource={resource}
      organizationId={organizationId}
      organizationAlias={organizationAlias}
      row={association.data ?? null}
      pending={pending}
      onPendingChange={onPendingChange}
      onClose={onClose}
    />
  );
}

function organizationBudgetSource(row: AppOrganization | null): "inherit" | "profile" | "custom" {
  if (row?.budget_override_id) return "custom";
  if (row?.tier_budget_id) return "profile";
  return "inherit";
}

function OrganizationAppForm({
  resource,
  organizationId,
  organizationAlias,
  row,
  pending,
  onPendingChange,
  onClose,
}: {
  resource: AppResource;
  organizationId: string;
  organizationAlias?: string | null;
  row: AppOrganization | null;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const groups = useAppBudgetGroups([row?.tier_budget_id]);
  const [source, setSource] = useState(() => organizationBudgetSource(row));
  const [profile, setProfile] = useState(row?.tier_budget_id ?? "");
  const [override, setOverride] = useState(() =>
    compactBudgetEditorFields(row?.budget_override_id ? row.effective_budget : null),
  );
  const [member, setMember] = useState(() =>
    compactBudgetEditorFields(row?.customer_member_budget_id ? row.effective_customer_member_budget : null),
  );
  const { error, setError, run } = useCustomerBudgetSave(onPendingChange);
  const profileUnavailable = source === "profile" && !groups.isSuccess;
  const changeSource = (value: string | null) => {
    if (value === "custom" || value === "inherit") {
      setSource(value);
      return;
    }
    const group = groups.data?.default_budgets.find((group) => `profile:${group.budget_id}` === value);
    if (group) {
      setSource("profile");
      setProfile(group.budget_id);
    }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || profileUnavailable) return;
    const budget = compactBudgetEditorValue(
      { ...override, budgetEnabled: source === "custom" },
      row?.budget_override_id ? row.effective_budget : null,
    );
    const memberBudget = compactBudgetEditorValue(
      member,
      row?.customer_member_budget_id ? row.effective_customer_member_budget : null,
    );
    const missingProfile = source === "profile" && !profile;
    if (!budget.ok || !memberBudget.ok || missingProfile) {
      setError(t(source === "profile" && !profile ? "apps.chooseProfile" : "customerPortal.hierarchy.invalidNumber"));
      return;
    }
    await run(async () => {
      let appId = resource.app_id;
      if (!appId) {
        const created = await fetchClient.POST("/management/v1/apps", {
          body: { resource_id: resource.resource_id, resource_type: resource.resource_type },
        });
        if (!created.data) throw new Error(t("apps.saveFailed"));
        appId = created.data.app_id;
      }
      await fetchClient.PUT("/management/v1/apps/{app_id}/customer_organizations/{customer_org_id}", {
        params: { path: { app_id: appId, customer_org_id: organizationId } },
        body: {
          tier_budget_id: source === "profile" ? profile : null,
          budget_override: budget.value,
          customer_member_budget: memberBudget.value,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["apps"] });
      await queryClient.invalidateQueries({ queryKey: ["app-resources"] });
      await queryClient.invalidateQueries({ queryKey: ["app-organization"] });
      await queryClient.invalidateQueries({ queryKey: ["app-member"] });
      onClose();
    });
  };
  return (
    <CustomerBudgetForm
      onSubmit={save}
      pending={pending}
      error={error}
      onClose={onClose}
      dirty={!profileUnavailable}
      saveLabel={t("apps.saveBudget")}
      label={t("apps.organizationSettings")}
    >
      <section aria-labelledby="app-budget-source-heading" className="space-y-4">
        <div className="space-y-1">
          <h3 id="app-budget-source-heading" className="font-semibold">
            {t("apps.source")}
          </h3>
          <p className="text-sm text-muted-foreground">{t("apps.customerAppLimitHint")}</p>
        </div>
        <CustomerBudgetSourceSelect
          profiles={groups.data?.default_budgets ?? []}
          value={source === "profile" ? `profile:${profile}` : source}
          onChange={changeSource}
          title={t("apps.source")}
          disabled={pending || !groups.isSuccess}
          loading={groups.isPending}
          inheritedOption={{ label: t("apps.appDefault"), summary: t("apps.appDefaultHint") }}
        />
        {groups.isError && (
          <ErrorState message={extractProxyErrorMessage(groups.error)} onRetry={() => void groups.refetch()} />
        )}
        {source === "custom" && (
          <CustomerBudgetCompactFields
            fields={override}
            original={row?.budget_override_id ? row.effective_budget : null}
            onChange={setOverride}
            disabled={pending}
            id="org-app-override"
          />
        )}
      </section>
      <section aria-labelledby="app-member-limits-heading" className="space-y-4 border-t pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 id="app-member-limits-heading" className="font-semibold">
              {t("apps.optionalMemberLimits")}
            </h3>
            <p className="text-sm text-muted-foreground">{t("apps.optionalMemberLimitsHint")}</p>
          </div>
          <Switch
            aria-label={t("apps.enableMemberLimits")}
            checked={member.budgetEnabled}
            disabled={pending}
            onCheckedChange={(budgetEnabled) => setMember((current) => ({ ...current, budgetEnabled }))}
          />
        </div>
        {member.budgetEnabled && (
          <CustomerBudgetCompactFields
            fields={member}
            original={row?.customer_member_budget_id ? row.effective_customer_member_budget : null}
            onChange={setMember}
            disabled={pending}
            id="org-app-member"
          />
        )}
      </section>
      <p className="text-xs text-muted-foreground">
        {t("apps.onlyThisPair", { customer: organizationAlias || organizationId, alias: resource.alias })}
      </p>
    </CustomerBudgetForm>
  );
}
