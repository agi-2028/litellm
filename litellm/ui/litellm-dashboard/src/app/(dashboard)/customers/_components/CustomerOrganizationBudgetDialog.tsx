"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { $api, fetchClient } from "@/lib/http/api";
import { extractProxyErrorMessage } from "@/lib/http/client";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import CustomerOrganizationBudgetFields from "./CustomerOrganizationBudgetFields";
import {
  buildCustomerHierarchyPatch,
  customerHierarchyFields,
  CUSTOMER_HIERARCHY_FORM_ERRORS,
  type Organization,
} from "./customerHierarchyForms";

function BudgetForm({
  organization,
  pending,
  onPendingChange,
  onClose,
}: {
  organization: Organization;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const entity = { kind: "organization", record: organization } as const;
  const initial = customerHierarchyFields(entity);
  const [fields, setFields] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(fields) !== JSON.stringify(initial);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const result = buildCustomerHierarchyPatch(entity, fields);
    if (!result.ok) {
      setError(t(CUSTOMER_HIERARCHY_FORM_ERRORS[result.error]));
      return;
    }
    if (result.patch.kind !== "organization") return;
    onPendingChange(true);
    setError(null);
    try {
      const response = await fetchClient.PATCH("/management/v1/customer_organizations/{customer_org_id}", {
        params: { path: { customer_org_id: organization.customer_org_id } },
        body: result.patch.body,
      });
      if (!response.data) {
        setError(t("customerPortal.hierarchy.error"));
        return;
      }
      queryClient.setQueryData(
        $api.queryOptions("get", "/management/v1/customer_organizations/{customer_org_id}", {
          params: { path: { customer_org_id: organization.customer_org_id } },
        }).queryKey,
        response.data,
      );
      void queryClient.invalidateQueries({ queryKey: ["customer-hierarchy"] });
      void queryClient.invalidateQueries({ queryKey: ["customer-organizations"] });
      toast.success(t("customerPortal.hierarchy.saved"));
      onClose();
    } catch (cause) {
      setError(extractProxyErrorMessage(cause));
    } finally {
      onPendingChange(false);
    }
  };
  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void save(event)}>
      <div className="min-h-0 overflow-y-auto px-6 py-6">
        <fieldset disabled={pending} className="min-w-0">
          <CustomerOrganizationBudgetFields
            organization={organization}
            fields={fields}
            onChange={(key, value) => {
              setFields((current) => ({ ...current, [key]: value }));
              setError(null);
            }}
            idPrefix="edit-org-budget"
          />
        </fieldset>
      </div>
      <div className="shrink-0 border-t bg-muted/20 px-6 py-4">
        {error && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            {t("customerPortal.common.cancel")}
          </Button>
          <Button type="submit" disabled={pending || !dirty}>
            {t(pending ? "customerPortal.hierarchy.saving" : "customerPortal.hierarchy.save")}
          </Button>
        </DialogFooter>
      </div>
    </form>
  );
}

export default function CustomerOrganizationBudgetDialog({
  organizationId,
  onClose,
}: {
  organizationId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const organization = $api.useQuery("get", "/management/v1/customer_organizations/{customer_org_id}", {
    params: { path: { customer_org_id: organizationId } },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent
        className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
        showCloseButton={!pending}
      >
        <DialogHeader className="shrink-0 border-b px-6 py-5">
          <DialogTitle className="text-xl">{t("customerPortal.budgetEditor.title")}</DialogTitle>
          <DialogDescription>{organization.data?.alias || organizationId}</DialogDescription>
        </DialogHeader>
        {organization.isPending && <p className="p-6">{t("customerPortal.common.loading")}</p>}
        {organization.isError && <ErrorState onRetry={() => void organization.refetch()} />}
        {organization.data && (
          <BudgetForm
            key={organization.data.updated_at}
            organization={organization.data}
            pending={pending}
            onPendingChange={setPending}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
