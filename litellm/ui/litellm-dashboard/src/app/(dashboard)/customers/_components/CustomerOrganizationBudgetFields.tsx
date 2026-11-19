import { useTranslation } from "react-i18next";
import { $api } from "@/lib/http/api";
import { ErrorState } from "@/components/shared/ErrorState";
import { Label } from "@/components/ui/label";
import CustomerAllowedModelsSelect from "./CustomerAllowedModelsSelect";
import CustomerBudgetAmountInput from "./CustomerBudgetAmountInput";
import CustomerBudgetPeriodSelect from "./CustomerBudgetPeriodSelect";
import { CustomerBudgetSourceSelect, CustomerCustomLimitFields, type CustomerLimits } from "./CustomerLimitsFields";
import {
  BUDGET_FIELDS,
  customerHierarchyFields,
  type CustomerHierarchyFields,
  type Organization,
} from "./customerHierarchyForms";

export default function CustomerOrganizationBudgetFields({
  organization,
  fields,
  onChange,
  idPrefix,
}: {
  organization: Organization;
  fields: CustomerHierarchyFields;
  onChange: <K extends keyof CustomerHierarchyFields>(key: K, value: CustomerHierarchyFields[K]) => void;
  idPrefix: string;
}) {
  const { t } = useTranslation();
  const groups = $api.useQuery("get", "/management/v1/customer_organization_budget_groups", {});
  const profiles = groups.data?.default_budgets ?? [];
  const originalGroup =
    organization.budget_is_shared ?? profiles.some((group) => group.budget_id === organization.budget_id);
  const usingGroup =
    fields.templateId === organization.budget_id
      ? originalGroup
      : profiles.some((group) => group.budget_id === fields.templateId);
  const budgetReady = !organization.budget_id || organization.budget_is_shared === false || Boolean(groups.data);
  const updateCustom = <K extends keyof CustomerHierarchyFields>(key: K, value: CustomerHierarchyFields[K]) => {
    onChange("budgetEnabled", true);
    onChange(key, value);
  };
  const selectSource = (value: string | null) => {
    if (value === "custom") {
      onChange("templateId", originalGroup ? "" : organization.budget_id ?? "");
      if (usingGroup) {
        onChange("budgetEnabled", true);
        if (originalGroup) onChange("budgetDuration", "1mo");
      }
      return;
    }
    const profile = profiles.find((group) => `profile:${group.budget_id}` === value);
    if (!profile) return;
    const initial = customerHierarchyFields({ kind: "organization", record: organization });
    for (const key of [...BUDGET_FIELDS, "allowedModels"] as const) onChange(key, initial[key]);
    onChange("templateId", profile.budget_id);
  };
  const changeLimits = (patch: Partial<CustomerLimits>) => {
    if (patch.budgetAmount !== undefined) updateCustom("maxBudget", patch.budgetAmount);
    if (patch.tpm !== undefined) updateCustom("tpm", patch.tpm);
    if (patch.rpm !== undefined) updateCustom("rpm", patch.rpm);
  };
  return (
    <section className="space-y-4" aria-labelledby={`${idPrefix}-limits-heading`}>
      <div className="space-y-1">
        <h3 id={`${idPrefix}-limits-heading`} className="font-semibold">
          {t("customerPortal.createDialog.organizationLimits")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("customerPortal.createDialog.organizationLimitsHelp")}</p>
      </div>
      <CustomerBudgetSourceSelect
        profiles={profiles}
        value={usingGroup ? `profile:${fields.templateId}` : "custom"}
        onChange={selectSource}
        title={t("customerPortal.createDialog.organizationLimits")}
        disabled={!budgetReady}
        loading={groups.isPending}
      />
      {groups.isError && <ErrorState onRetry={() => void groups.refetch()} />}
      {budgetReady && !usingGroup && (
        <div className="space-y-5">
          <CustomerCustomLimitFields
            fields={{
              budgetAmount: fields.budgetEnabled ? fields.maxBudget : "",
              budgetDuration: fields.budgetDuration === "12mo" ? "12mo" : "1mo",
              tpm: fields.budgetEnabled ? fields.tpm : "",
              rpm: fields.budgetEnabled ? fields.rpm : "",
            }}
            idPrefix={idPrefix}
            disabled={false}
            periodControl={
              <CustomerBudgetPeriodSelect
                value={fields.budgetDuration}
                onChange={(value) => updateCustom("budgetDuration", value)}
              />
            }
            onChange={changeLimits}
          />
          <div className="grid gap-4 border-t pt-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-soft-budget`} className="font-normal text-muted-foreground">
                {t("customerPortal.hierarchy.softBudget")}
              </Label>
              <CustomerBudgetAmountInput
                id={`${idPrefix}-soft-budget`}
                label={t("customerPortal.hierarchy.softBudget")}
                value={fields.budgetEnabled ? fields.softBudget : ""}
                onChange={(value) => updateCustom("softBudget", value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-models`} className="font-normal text-muted-foreground">
                {t("customerPortal.hierarchy.allowedModels")}
              </Label>
              <CustomerAllowedModelsSelect
                id={`${idPrefix}-models`}
                value={fields.budgetEnabled ? fields.allowedModels : []}
                onChange={(value) => updateCustom("allowedModels", value)}
              />
              <p className="text-xs text-muted-foreground">{t("customerPortal.hierarchy.allowedModelsHint")}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
