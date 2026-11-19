"use client";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { fetchClient } from "@/lib/http/api";
import { extractProxyErrorMessage } from "@/lib/http/client";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { loadApps } from "./appApi";
import { compactAppBudgetFields, compactAppBudgetValue, type App, type AppMember } from "./appForms";
import AppBudgetCompactFields from "./AppBudgetCompactFields";
import { CustomerBudgetSourceSelect } from "../../customers/_components/CustomerLimitsFields";
import { CustomerBudgetDialog, CustomerBudgetForm } from "../../customers/_components/CustomerBudgetDialog";
import AppBudgetLimits from "./AppBudgetLimits";
import AppBudgetSpendCells, { AppBudgetIdentity, AppBudgetTable, type AppUsageContext } from "./AppBudgetCells";

const BUDGET_SOURCES = {
  member_override: "apps.memberOverride",
  customer_default: "apps.inheritedCustomer",
  app_default: "apps.inheritedApp",
  none: "apps.noInheritedBudget",
} as const;

export default function CustomerMemberApps({
  memberId,
  usageContext,
  onAppSelect,
}: {
  memberId: string;
  usageContext?: AppUsageContext;
  onAppSelect?: (appId: string) => void;
}) {
  const { t } = useTranslation();
  const apps = useQuery({ queryKey: ["apps"], queryFn: () => loadApps() });
  return (
    <section className="space-y-4 border-t pt-6" aria-label={t("apps.memberTitle")}>
      <h2 className="text-base font-semibold">{t("apps.memberTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("apps.memberHint")}</p>
      {apps.isPending && <p role="status">{t("apps.loading")}</p>}
      {apps.isError && <p role="alert">{extractProxyErrorMessage(apps.error)}</p>}
      {apps.data?.length === 0 && <p>{t("apps.noMemberApps")}</p>}
      {apps.data && apps.data.length > 0 && (
        <AppBudgetTable scope="member" usageLayout={Boolean(usageContext)}>
          {apps.data.map((app) => (
            <MemberAppRow
              key={app.app_id}
              app={app}
              memberId={memberId}
              usageContext={usageContext}
              onAppSelect={onAppSelect}
            />
          ))}
        </AppBudgetTable>
      )}
    </section>
  );
}

function MemberAppRow({
  app,
  memberId,
  usageContext,
  onAppSelect,
}: {
  app: App;
  memberId: string;
  usageContext?: AppUsageContext;
  onAppSelect?: (appId: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const member = useQuery({
    queryKey: ["app-member", app.app_id, memberId],
    queryFn: async () => {
      const response = await fetchClient.GET("/management/v1/apps/{app_id}/customer_members/{customer_member_id}", {
        params: { path: { app_id: app.app_id, customer_member_id: memberId } },
      });
      return response.data;
    },
  });
  if (member.isPending)
    return (
      <TableRow>
        <TableCell className="py-4 font-medium">{app.alias}</TableCell>
        <TableCell colSpan={usageContext ? 8 : 2}>
          <p role="status">{t("apps.loading")}</p>
        </TableCell>
      </TableRow>
    );
  if (member.isError)
    return (
      <TableRow>
        <TableCell className="py-4 font-medium">{app.alias}</TableCell>
        <TableCell colSpan={usageContext ? 8 : 2}>
          <p role="alert">{extractProxyErrorMessage(member.error)}</p>
          <Button variant="ghost" size="xs" onClick={() => void member.refetch()}>
            {t("apps.retry")}
          </Button>
        </TableCell>
      </TableRow>
    );
  const sourceLabel = t(BUDGET_SOURCES[member.data?.budget_source ?? "none"]);
  return (
    <>
      <TableRow>
        <AppBudgetIdentity
          app={app}
          row={member.data}
          sourceLabel={usageContext ? undefined : sourceLabel}
          onAppSelect={onAppSelect}
        />
        {usageContext && member.data ? (
          <>
            <TableCell className="px-4 text-muted-foreground">{sourceLabel}</TableCell>
            <AppBudgetSpendCells appId={app.app_id} alias={app.alias} row={member.data} context={usageContext} />
          </>
        ) : (
          <TableCell className="py-4">
            <AppBudgetLimits
              budget={member.data?.effective_budget}
              usage={member.data?.budget_usage}
              cumulativeSpend={member.data?.spend}
            />
          </TableCell>
        )}
        <TableCell className={usageContext ? "px-4 text-right" : undefined}>
          <Button
            variant="ghost"
            size="xs"
            aria-label={t("apps.editMemberBudget", { alias: app.alias })}
            onClick={() => setEditing(!editing)}
          >
            {t("apps.edit")}
          </Button>
        </TableCell>
      </TableRow>
      {editing && member.data && (
        <MemberBudgetForm
          app={app}
          row={member.data}
          onCancel={() => setEditing(false)}
          onSaved={async () => {
            await member.refetch();
            setEditing(false);
          }}
        />
      )}
    </>
  );
}

function MemberBudgetForm({
  app,
  row,
  onSaved,
  onCancel,
}: {
  app: App;
  row: AppMember;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const original = row.budget_override_id ? row.effective_budget : null;
  const [fields, setFields] = useState(() => compactAppBudgetFields(original));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const budget = compactAppBudgetValue(fields, original);
    if (!budget.ok) {
      setError(t(budget.error));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await fetchClient.PUT("/management/v1/apps/{app_id}/customer_members/{customer_member_id}", {
        params: { path: { app_id: app.app_id, customer_member_id: row.customer_member_id } },
        body: { budget_override: budget.value },
      });
      await onSaved();
    } catch (failure) {
      setError(extractProxyErrorMessage(failure));
    } finally {
      setPending(false);
    }
  };
  return (
    <CustomerBudgetDialog
      title={t("apps.editMemberBudget", { alias: app.alias })}
      description={t("apps.memberOverrideHint")}
      pending={pending}
      onClose={onCancel}
    >
      <CustomerBudgetForm
        pending={pending}
        error={error}
        onSubmit={save}
        onClose={onCancel}
        saveLabel={t("apps.saveMemberBudget")}
      >
        <CustomerBudgetSourceSelect
          profiles={[]}
          value={fields.budgetEnabled ? "custom" : "inherit"}
          title={t("apps.source")}
          disabled={pending}
          inheritedOption={{ label: t("apps.inheritedBudget"), summary: t("apps.inheritMemberHint") }}
          onChange={(value) => setFields((current) => ({ ...current, budgetEnabled: value === "custom" }))}
        />
        {fields.budgetEnabled && (
          <AppBudgetCompactFields
            id={`app-member-${app.app_id}`}
            fields={fields}
            original={original}
            disabled={pending}
            onChange={setFields}
          />
        )}
      </CustomerBudgetForm>
    </CustomerBudgetDialog>
  );
}
