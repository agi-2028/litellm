import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { extractProxyErrorMessage } from "@/lib/http/client";
import { saveCustomerHierarchy } from "./customerHierarchyApi";
import {
  buildCustomerHierarchyPatch,
  customerEntityId,
  customerHierarchyFields,
  CUSTOMER_HIERARCHY_FORM_ERRORS,
  type CustomerHierarchyEntity,
  type CustomerHierarchyFields,
} from "./customerHierarchyForms";

export function useCustomerHierarchyForm(
  entity: CustomerHierarchyEntity,
  onSaved: () => void,
  onPendingChange?: (pending: boolean) => void,
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const initial = customerHierarchyFields(entity);
  const [fields, setFields] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    const result = buildCustomerHierarchyPatch(entity, fields);
    if (!result.ok) return setError(t(CUSTOMER_HIERARCHY_FORM_ERRORS[result.error]));
    setPending(true);
    onPendingChange?.(true);
    setError(null);
    try {
      const saved = await saveCustomerHierarchy(customerEntityId(entity), result.patch);
      if (!saved) return setError(t("customerPortal.hierarchy.error"));
      void queryClient.invalidateQueries({ queryKey: ["customer-hierarchy"] });
      void queryClient.invalidateQueries({ queryKey: ["customer-organizations"] });
      void queryClient.invalidateQueries({ queryKey: ["get", "/management/v1/customer_members/{customer_member_id}"] });
      void queryClient.invalidateQueries({
        queryKey: ["get", "/management/v1/customer_organizations/{customer_org_id}"],
      });
      toast.success(t("customerPortal.hierarchy.saved"));
      onSaved();
    } catch (cause) {
      setError(extractProxyErrorMessage(cause));
    } finally {
      setPending(false);
      onPendingChange?.(false);
    }
  };
  return { fields, update, reset, pending, error, save, dirty: JSON.stringify(fields) !== JSON.stringify(initial) };
}
