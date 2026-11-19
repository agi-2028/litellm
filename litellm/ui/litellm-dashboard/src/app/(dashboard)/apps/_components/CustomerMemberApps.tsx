"use client";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { fetchClient } from "@/lib/http/api";
import { extractProxyErrorMessage } from "@/lib/http/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadApps } from "./appApi";
import { compactAppBudgetFields, compactAppBudgetValue, type App, type AppMember } from "./appForms";
import AppBudgetCompactFields from "./AppBudgetCompactFields";
import { CustomerBudgetSourceSelect } from "../../customers/_components/CustomerLimitsFields";
import AppBudgetLimits from "./AppBudgetLimits";
import { appBudgetWindows } from "./appBudgetPresentation";
import { customerBudgetPeriod } from "../../customers/_components/customerBudgetUsage";
import AppUsageSpendCells, { type AppUsageContext } from "./AppUsageSpendCells";
import { CustomerSpendHeaders } from "../../customers/_components/CustomerSpendCells";

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
        <div className={usageContext ? "overflow-hidden rounded-lg border" : undefined}>
          <Table className="w-full text-left text-sm" aria-label={t("apps.memberTitle")}>
            <TableHeader>
              <TableRow>
                <TableHead
                  className={usageContext ? "px-4" : "border-b py-3 text-xs font-medium text-muted-foreground"}
                >
                  {t("apps.alias")}
                </TableHead>
                {usageContext ? (
                  <>
                    <TableHead className="px-4">{t("apps.source")}</TableHead>
                    <CustomerSpendHeaders usageLayout>
                      <TableHead className="px-4">{t("customerPortal.hierarchy.maxBudget")}</TableHead>
                    </CustomerSpendHeaders>
                  </>
                ) : (
                  <TableHead className="border-b py-3 text-xs font-medium text-muted-foreground">
                    {t("apps.memberBudget")}
                  </TableHead>
                )}
                <TableHead
                  className={
                    usageContext ? "px-4 text-right" : "border-b py-3 text-xs font-medium text-muted-foreground"
                  }
                >
                  {t("apps.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apps.data.map((app) => (
                <MemberAppRow
                  key={app.app_id}
                  app={app}
                  memberId={memberId}
                  usageContext={usageContext}
                  onAppSelect={onAppSelect}
                />
              ))}
            </TableBody>
          </Table>
        </div>
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
        <MemberAppIdentity app={app} row={member.data} usageContext={usageContext} onAppSelect={onAppSelect} />
        {usageContext && member.data ? (
          <>
            <TableCell className="px-4 text-muted-foreground">{sourceLabel}</TableCell>
            <AppUsageSpendCells appId={app.app_id} alias={app.alias} row={member.data} context={usageContext} />
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

function MemberAppIdentity({
  app,
  row,
  usageContext,
  onAppSelect,
}: {
  app: App;
  row: AppMember | undefined;
  usageContext?: AppUsageContext;
  onAppSelect?: (appId: string) => void;
}) {
  const { t } = useTranslation();
  const { primary } = appBudgetWindows(row?.effective_budget, row?.budget_usage);
  const period = customerBudgetPeriod(primary?.budget_duration ?? null);
  const periodLabel = period === "other" ? primary?.budget_duration : t(`apps.${period}`);
  const sourceLabel = t(BUDGET_SOURCES[row?.budget_source ?? "none"]);
  return (
    <TableCell className={usageContext ? "px-4 py-5" : "py-4"}>
      {onAppSelect ? (
        <button
          type="button"
          onClick={() => onAppSelect(app.app_id)}
          className="font-medium hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {app.alias}
        </button>
      ) : (
        <span className="font-medium">{app.alias}</span>
      )}
      <span className="mt-1 block text-xs text-muted-foreground">
        {usageContext ? periodLabel : [sourceLabel, periodLabel].filter(Boolean).join(" · ")}
      </span>
    </TableCell>
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
    <Dialog open onOpenChange={(open) => !open && !pending && onCancel()}>
      <DialogContent
        className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
        showCloseButton={!pending}
      >
        <DialogHeader className="shrink-0 border-b px-6 py-5">
          <DialogTitle className="text-xl">{t("apps.editMemberBudget", { alias: app.alias })}</DialogTitle>
          <DialogDescription>{t("apps.memberOverrideHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <fieldset disabled={pending} className="min-h-0 space-y-5 overflow-y-auto px-6 py-6">
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
          </fieldset>
          <div className="shrink-0 border-t bg-muted/20 px-6 py-4">
            {error && (
              <p role="alert" className="mb-3 text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
                {t("apps.cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {t("apps.saveMemberBudget")}
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
