"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { $api, fetchClient } from "@/lib/http/api";
import { extractProxyErrorMessage } from "@/lib/http/client";
import { ErrorState } from "@/components/shared/ErrorState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AppBudgetCompactFields from "../../apps/_components/AppBudgetCompactFields";
import { compactAppBudgetFields, compactAppBudgetValue } from "../../apps/_components/appForms";
import { CustomerBudgetDialog, CustomerBudgetForm } from "./CustomerBudgetDialog";
import { CustomerBudgetSourceSelect } from "./CustomerLimitsFields";
import { customerHierarchyFields, type Member, type Organization } from "./customerHierarchyForms";

function MemberBudgetForm({
  member,
  organization,
  pending,
  onPendingChange,
  onClose,
}: {
  member: Member;
  organization: Organization;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const initialSource = member.budget_override || !member.budget_id ? "custom" : `profile:${member.budget_id}`;
  const initialExpiry = customerHierarchyFields({ kind: "member", record: member }).overrideExpiry;
  const [source, setSource] = useState(initialSource);
  const [fields, setFields] = useState(() => compactAppBudgetFields(member.budget_override));
  const [expiry, setExpiry] = useState(initialExpiry);
  const [error, setError] = useState<string | null>(null);
  const dirty =
    source !== initialSource ||
    expiry !== initialExpiry ||
    JSON.stringify(fields) !== JSON.stringify(compactAppBudgetFields(member.budget_override));
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const custom = source === "custom";
    const budget = compactAppBudgetValue({ ...fields, budgetEnabled: custom }, member.budget_override);
    if (!budget.ok) return setError(t(budget.error));
    const expiresAt = custom && expiry ? new Date(expiry) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) return setError(t("customerPortal.hierarchy.invalidExpiry"));
    const nextExpiry =
      expiry === initialExpiry ? member.budget_override_expires_at ?? null : expiresAt?.toISOString() ?? null;
    const body = {
      ...(!custom ? { budget_id: source.slice("profile:".length) } : {}),
      budget_override: budget.value && {
        ...budget.value,
        budget_duration:
          budget.value.max_budget == null
            ? member.budget_override?.budget_duration ?? null
            : budget.value.budget_duration,
      },
      budget_override_expires_at: custom ? nextExpiry : null,
    };
    onPendingChange(true);
    setError(null);
    try {
      const response = await fetchClient.PATCH("/management/v1/customer_members/{customer_member_id}", {
        params: { path: { customer_member_id: member.customer_member_id } },
        body,
      });
      if (!response.data) return setError(t("customerPortal.hierarchy.error"));
      queryClient.setQueryData(
        $api.queryOptions("get", "/management/v1/customer_members/{customer_member_id}", {
          params: { path: { customer_member_id: member.customer_member_id } },
        }).queryKey,
        response.data,
      );
      void queryClient.invalidateQueries({ queryKey: ["customer-hierarchy"] });
      toast.success(t("customerPortal.hierarchy.saved"));
      onClose();
    } catch (cause) {
      setError(extractProxyErrorMessage(cause));
    } finally {
      onPendingChange(false);
    }
  };
  return (
    <CustomerBudgetForm
      pending={pending}
      error={error}
      dirty={dirty}
      onSubmit={(event) => void save(event)}
      onClose={onClose}
    >
      <CustomerBudgetSourceSelect
        profiles={organization.default_budgets}
        value={source}
        title={t("customerPortal.hierarchy.memberLimits")}
        disabled={pending}
        onChange={(value) => value && setSource(value)}
      />
      {source === "custom" && (
        <>
          <AppBudgetCompactFields
            fields={fields}
            original={member.budget_override}
            onChange={setFields}
            disabled={pending}
            id="edit-member-budget"
          />
          <p className="text-xs text-muted-foreground">{t("customerPortal.hierarchy.memberBudgetHint")}</p>
          <div className="space-y-2">
            <Label htmlFor="edit-member-budget-expiry" className="font-normal text-muted-foreground">
              {t("customerPortal.hierarchy.overrideExpiry")}
            </Label>
            <Input
              id="edit-member-budget-expiry"
              type="datetime-local"
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("customerPortal.hierarchy.overrideExpiryHint")}</p>
          </div>
        </>
      )}
    </CustomerBudgetForm>
  );
}

export default function CustomerMemberBudgetDialog({
  memberId,
  organizationId,
  onClose,
}: {
  memberId: string;
  organizationId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const member = $api.useQuery("get", "/management/v1/customer_members/{customer_member_id}", {
    params: { path: { customer_member_id: memberId } },
  });
  const organization = $api.useQuery("get", "/management/v1/customer_organizations/{customer_org_id}", {
    params: { path: { customer_org_id: organizationId } },
  });
  return (
    <CustomerBudgetDialog
      title={t("customerPortal.budgetEditor.memberTitle")}
      description={member.data?.alias || memberId}
      pending={pending}
      onClose={onClose}
    >
      {(member.isPending || organization.isPending) && <p className="p-6">{t("customerPortal.common.loading")}</p>}
      {(member.isError || organization.isError) && (
        <ErrorState onRetry={() => void Promise.all([member.refetch(), organization.refetch()])} />
      )}
      {member.data && organization.data && (
        <MemberBudgetForm
          key={member.data.updated_at}
          member={member.data}
          organization={organization.data}
          pending={pending}
          onPendingChange={setPending}
          onClose={onClose}
        />
      )}
    </CustomerBudgetDialog>
  );
}
