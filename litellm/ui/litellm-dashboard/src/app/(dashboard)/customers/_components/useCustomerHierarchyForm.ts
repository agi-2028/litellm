import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { saveCustomerHierarchy } from "./customerHierarchyApi";
import { useCustomerBudgetSave } from "./useCustomerBudgetSave";
import {
  buildCustomerHierarchyPatch,
  customerEntityId,
  customerHierarchyFields,
  CUSTOMER_HIERARCHY_FORM_ERRORS,
  type CustomerHierarchyEntity,
  type CustomerHierarchyFields,
  type Organization,
} from "./customerHierarchyForms";

export function useCustomerHierarchyForm(
  entity: CustomerHierarchyEntity,
  organization: Organization,
  onSaved: () => void,
  onPendingChange?: (pending: boolean) => void,
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const initial = customerHierarchyFields(entity, organization);
  const [fields, setFields] = useState(initial);
  const { pending, error, setError, run } = useCustomerBudgetSave(onPendingChange);
  const update = <K extends keyof CustomerHierarchyFields>(key: K, value: CustomerHierarchyFields[K]) => {
    setFields((current) => ({ ...current, [key]: value }));
    setError(null);
  };
  const reset = () => {
    setFields(initial);
    setError(null);
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const result = buildCustomerHierarchyPatch(entity, fields, organization);
    if (!result.ok) return setError(t(CUSTOMER_HIERARCHY_FORM_ERRORS[result.error]));
    await run(async () => {
      const saved = await saveCustomerHierarchy(customerEntityId(entity), result.patch);
      if (!saved.data) return setError(t("customerPortal.hierarchy.error"));
      await queryClient.cancelQueries({ queryKey: saved.queryKey, exact: true });
      queryClient.setQueryData(saved.queryKey, saved.data);
      void queryClient.invalidateQueries({ queryKey: ["customer-hierarchy"] });
      void queryClient.invalidateQueries({ queryKey: ["customer-organizations"] });
      void queryClient.invalidateQueries({ queryKey: ["get", "/management/v1/customer_teams/{customer_team_id}"] });
      void queryClient.invalidateQueries({ queryKey: ["get", "/management/v1/customer_members/{customer_member_id}"] });
      void queryClient.invalidateQueries({
        queryKey: ["get", "/management/v1/customer_organizations/{customer_org_id}"],
      });
      toast.success(t("customerPortal.hierarchy.saved"));
      onSaved();
    });
  };
  return { fields, update, reset, pending, error, save, dirty: JSON.stringify(fields) !== JSON.stringify(initial) };
}
