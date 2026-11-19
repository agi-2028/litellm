"use client";

import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type BudgetFields,
  type CustomerHierarchyFields,
  type CustomerHierarchyEntity,
  type Organization,
} from "./customerHierarchyForms";
import CustomerAllowedModelsSelect from "./CustomerAllowedModelsSelect";
import CustomerOrganizationBudgetFields from "./CustomerOrganizationBudgetFields";
import { CustomerRateLimitFields } from "./CustomerRateLimits";
import { CustomerBudgetSourceSelect, CustomerCustomBudgetFields } from "./CustomerLimitsFields";

interface Props {
  kind: CustomerHierarchyEntity["kind"];
  organization: Organization;
  fields: CustomerHierarchyFields;
  onChange: <K extends keyof CustomerHierarchyFields>(key: K, value: CustomerHierarchyFields[K]) => void;
  idPrefix: string;
}

export default function CustomerHierarchyBudgetFields({
  kind,
  organization,
  fields,
  onChange: update,
  idPrefix,
}: Props) {
  const { t } = useTranslation();
  if (kind === "organization") {
    return (
      <div className="border-t pt-6">
        <CustomerOrganizationBudgetFields
          organization={organization}
          fields={fields}
          onChange={update}
          idPrefix={idPrefix}
        />
      </div>
    );
  }
  const custom = fields.budgetEnabled || !fields.templateId;
  const selectSource = (value: string | null) => {
    if (value === "custom") return update("budgetEnabled", true);
    if (!value?.startsWith("profile:")) return;
    update("templateId", value.slice("profile:".length));
    update("budgetEnabled", false);
  };
  const updateCustom = <K extends keyof CustomerHierarchyFields>(key: K, value: CustomerHierarchyFields[K]) => {
    update("budgetEnabled", true);
    update(key, value);
  };
  return (
    <section className="space-y-4 border-t pt-6" aria-labelledby={`${idPrefix}-budget-title`}>
      <div>
        <h2 id={`${idPrefix}-budget-title`} className="text-base font-medium">
          {t("customerPortal.hierarchy.budgetTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(kind === "member" ? "customerPortal.hierarchy.memberBudgetHint" : "customerPortal.hierarchy.budgetHint")}
        </p>
      </div>
      {kind === "member" && (
        <CustomerBudgetSourceSelect
          profiles={organization.default_budgets.map((profile) => ({
            ...profile,
            name:
              profile.budget_id === organization.default_budget_template_id
                ? t("customerPortal.hierarchy.defaultTemplate", { name: profile.name })
                : profile.name,
          }))}
          value={custom ? "custom" : `profile:${fields.templateId}`}
          title={t("customerPortal.hierarchy.template")}
          disabled={false}
          onChange={selectSource}
        />
      )}
      {kind === "team" && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${idPrefix}-budget-enabled`}
              checked={fields.budgetEnabled}
              onCheckedChange={(checked) => update("budgetEnabled", checked)}
            />
            <Label htmlFor={`${idPrefix}-budget-enabled`}>{t("customerPortal.hierarchy.budgetEnabled")}</Label>
          </div>
        </div>
      )}
      {kind === "member" && custom && (
        <CustomerCustomBudgetFields
          fields={fields}
          onChange={updateCustom}
          idPrefix={idPrefix}
          inheritBlank={Boolean(fields.templateId)}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-expiry`} className="font-normal text-muted-foreground">
              {t("customerPortal.hierarchy.overrideExpiry")}
            </Label>
            <Input
              id={`${idPrefix}-expiry`}
              type="datetime-local"
              value={fields.overrideExpiry}
              onChange={(event) => update("overrideExpiry", event.target.value)}
              aria-describedby={`${idPrefix}-expiry-hint`}
            />
            <p id={`${idPrefix}-expiry-hint`} className="text-xs text-muted-foreground">
              {t("customerPortal.hierarchy.overrideExpiryHint")}
            </p>
          </div>
        </CustomerCustomBudgetFields>
      )}
      {kind === "team" && fields.budgetEnabled && (
        <CustomerBudgetFields fields={fields} onChange={update} idPrefix={idPrefix} />
      )}
    </section>
  );
}

export function CustomerBudgetFields({
  fields,
  onChange: update,
  idPrefix,
  hideMaxBudget = false,
  children,
}: {
  fields: BudgetFields;
  onChange: {
    (key: Exclude<keyof BudgetFields, "allowedModels">, value: string): void;
    (key: "allowedModels", value: readonly string[]): void;
  };
  idPrefix: string;
  hideMaxBudget?: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const numericFields = [
    ["maxBudget", "customerPortal.hierarchy.maxBudget", "any"],
    ["softBudget", "customerPortal.hierarchy.softBudget", "any"],
  ] as const;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {numericFields.map(([name, label, step]) => (
          <div hidden={hideMaxBudget && name === "maxBudget"} className="space-y-1.5" key={name}>
            <Label htmlFor={`${idPrefix}-${name}`}>{t(label)}</Label>
            <Input
              id={`${idPrefix}-${name}`}
              type="number"
              min="0"
              step={step}
              value={fields[name]}
              onChange={(event) => update(name, event.target.value)}
            />
          </div>
        ))}
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-duration`}>{t("customerPortal.hierarchy.budgetDuration")}</Label>
          <Input
            id={`${idPrefix}-duration`}
            value={fields.budgetDuration}
            onChange={(event) => update("budgetDuration", event.target.value)}
            aria-describedby={`${idPrefix}-duration-hint`}
          />
          <p id={`${idPrefix}-duration-hint`} className="text-xs text-muted-foreground">
            {t("customerPortal.hierarchy.budgetDurationHint")}
          </p>
        </div>
        {children}
      </div>
      <CustomerRateLimitFields id={idPrefix} tpm={fields.tpm} rpm={fields.rpm} onChange={update} />
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-models`}>{t("customerPortal.hierarchy.allowedModels")}</Label>
        <CustomerAllowedModelsSelect
          id={`${idPrefix}-models`}
          value={fields.allowedModels}
          onChange={(models) => update("allowedModels", models)}
        />
        <p id={`${idPrefix}-models-hint`} className="text-xs text-muted-foreground">
          {t("customerPortal.hierarchy.allowedModelsHint")}
        </p>
      </div>
    </div>
  );
}
