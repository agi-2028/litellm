import { type BudgetEditorFields, budgetPeriodAmount, updateBudgetPeriod } from "./customerBudgetForm";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import CustomerBudgetAmountInput from "./CustomerBudgetAmountInput";
import { Label } from "@/components/ui/label";
import CustomerAllowedModelsSelect from "./CustomerAllowedModelsSelect";
import type { Budget } from "./customerBudgetForm";

const rateFields = ["tpm", "rpm"] as const;

export default function CustomerBudgetCompactFields({
  fields,
  original,
  onChange,
  disabled,
  id,
}: {
  fields: BudgetEditorFields;
  original?: Budget | null;
  onChange: (fields: BudgetEditorFields) => void;
  disabled: boolean;
  id: string;
}) {
  const { t } = useTranslation();
  const periods = ["1mo", "12mo"] as const;
  const hasOtherSpendLimit =
    original?.max_budget != null && original.budget_duration !== "1mo" && original.budget_duration !== "12mo";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {periods.map((period) => (
          <div key={period} className="min-w-0 space-y-2">
            <Label htmlFor={`${id}-${period}`} className="font-normal text-muted-foreground">
              {t(period === "1mo" ? "apps.monthlyBudget" : "apps.yearlyBudget")}
            </Label>
            <CustomerBudgetAmountInput
              id={`${id}-${period}`}
              label={t(period === "1mo" ? "apps.monthlyBudget" : "apps.yearlyBudget")}
              disabled={disabled}
              value={budgetPeriodAmount(fields, period)}
              onChange={(value) => onChange(updateBudgetPeriod(fields, period, value))}
            />
          </div>
        ))}
        {rateFields.map((field) => (
          <div key={field} className="min-w-0 space-y-2">
            <Label htmlFor={`${id}-${field}`} className="font-normal text-muted-foreground">
              {t(`customerPortal.hierarchy.${field}`)}
            </Label>
            <Input
              id={`${id}-${field}`}
              type="number"
              min={0}
              step={1}
              disabled={disabled}
              placeholder={t("customerPortal.createDialog.noLimit")}
              value={fields[field]}
              onChange={(event) => onChange({ ...fields, [field]: event.target.value })}
            />
          </div>
        ))}
      </div>
      {hasOtherSpendLimit && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${id}-other-spend`} className="font-normal text-muted-foreground">
              {t("apps.additionalSpendLimit")}
            </Label>
            <Input
              id={`${id}-other-spend`}
              type="number"
              min={0}
              step="any"
              disabled={disabled}
              value={fields.maxBudget}
              onChange={(event) => onChange({ ...fields, maxBudget: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-duration`} className="font-normal text-muted-foreground">
              {t("apps.customResetPeriod")}
            </Label>
            <Input
              id={`${id}-duration`}
              disabled={disabled}
              value={fields.budgetDuration}
              placeholder={t("apps.noReset")}
              onChange={(event) => onChange({ ...fields, budgetDuration: event.target.value })}
            />
          </div>
        </div>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">{t("apps.advancedLimits")}</summary>
        <div className="mt-4 space-y-4">
          {fields.budgetWindows.map((window, index) => {
            if (window.budget.budget_duration === "1mo" || window.budget.budget_duration === "12mo") return null;
            return (
              <div key={`${window.budget.budget_duration}-${index}`} className="space-y-2">
                <Label htmlFor={`${id}-window-${index}`} className="font-normal text-muted-foreground">
                  {t("apps.windowBudget", { period: window.budget.budget_duration })}
                </Label>
                <Input
                  id={`${id}-window-${index}`}
                  type="number"
                  min={0}
                  step="any"
                  placeholder={t("customerPortal.createDialog.noLimit")}
                  value={window.maxBudget}
                  onChange={(event) =>
                    onChange({
                      ...fields,
                      budgetWindows: fields.budgetWindows.map((entry, entryIndex) =>
                        index === entryIndex ? { ...entry, maxBudget: event.target.value } : entry,
                      ),
                    })
                  }
                />
              </div>
            );
          })}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${id}-soft`} className="font-normal text-muted-foreground">
                {t("customerPortal.hierarchy.softBudget")}
              </Label>
              <Input
                id={`${id}-soft`}
                type="number"
                min={0}
                step="any"
                value={fields.softBudget}
                onChange={(event) => onChange({ ...fields, softBudget: event.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-models`} className="font-normal text-muted-foreground">
              {t("customerPortal.hierarchy.allowedModels")}
            </Label>
            <CustomerAllowedModelsSelect
              id={`${id}-models`}
              value={fields.allowedModels}
              onChange={(allowedModels) => onChange({ ...fields, allowedModels })}
            />
          </div>
        </div>
      </details>
    </div>
  );
}
