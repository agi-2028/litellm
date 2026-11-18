"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { $api } from "@/lib/http/api";
import { extractProxyErrorMessage } from "@/lib/http/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildCustomerOrganizationBody,
  initialCustomerOrganizationFields,
  type CustomerOrganizationFormError,
} from "./customerOrganizationForm";

import CreateCustomerOrganizationLimits from "./CreateCustomerOrganizationLimits";
import CustomerBudgetGroupsEditor from "./CustomerBudgetGroupsEditor";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (customerOrgId: string) => void;
}

export default function CreateCustomerDialog({ open, onOpenChange, onCreated }: Props) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [fields, setFields] = useState(initialCustomerOrganizationFields);
  const [error, setError] = useState<CustomerOrganizationFormError | null>(null);
  const create = $api.useMutation("post", "/management/v1/customer_organizations", {
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["get", "/management/v1/customer_portal/limits"] }),
    onSuccess: (customer) => {
      toast.success(t("customerPortal.toasts.created", { name: customer.alias || fields.name.trim() }));
      onCreated(customer.customer_org_id);
      setFields(initialCustomerOrganizationFields());
      setError(null);
      onOpenChange(false);
    },
    onError: (e: unknown) =>
      toast.error(t("customerPortal.toasts.createFailed", { error: extractProxyErrorMessage(e) })),
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (create.isPending) return;
    const result = buildCustomerOrganizationBody(fields);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    create.mutate({ body: result.body });
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader className="shrink-0 border-b px-6 py-5">
            <DialogTitle className="text-xl">{t("customerPortal.createDialog.title")}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto px-6 py-6">
            <fieldset disabled={create.isPending} className="min-w-0 space-y-7">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cc-name" className="font-normal text-muted-foreground">
                    {t("customerPortal.createDialog.name")}
                  </Label>
                  <Input
                    id="cc-name"
                    value={fields.name}
                    onChange={(event) => setFields({ ...fields, name: event.target.value })}
                    placeholder={t("customerPortal.createDialog.namePlaceholder")}
                    autoFocus
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cc-org-id" className="font-normal text-muted-foreground">
                    {t("customerPortal.createDialog.customerIdOptional")}
                  </Label>
                  <Input
                    id="cc-org-id"
                    value={fields.customerOrgId}
                    onChange={(event) => setFields({ ...fields, customerOrgId: event.target.value })}
                    placeholder={t("customerPortal.createDialog.customerIdPlaceholder")}
                  />
                </div>
              </div>
              <CreateCustomerOrganizationLimits
                fields={fields}
                disabled={create.isPending}
                onChange={(patch) => {
                  setFields({ ...fields, ...patch });
                  setError(null);
                }}
              />
              <CustomerBudgetGroupsEditor
                groups={fields.groups}
                defaultGroupId={fields.defaultGroupId}
                disabled={create.isPending}
                layout="table"
                onChange={(groups, defaultGroupId) => {
                  setFields({ ...fields, groups, defaultGroupId });
                  setError(null);
                }}
              />
            </fieldset>
            {error && (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {t(`customerPortal.createDialog.errors.${error}`)}
              </p>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t bg-muted/20 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              {t("customerPortal.common.cancel")}
            </Button>
            <Button type="submit" disabled={!fields.name.trim() || create.isPending}>
              {create.isPending ? t("customerPortal.createDialog.creating") : t("customerPortal.createDialog.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
