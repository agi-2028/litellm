import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import CustomerBudgetAmountInput from "./CustomerBudgetAmountInput";
import CustomerBudgetPeriodSelect from "./CustomerBudgetPeriodSelect";
import CustomerAllowedModelsSelect from "./CustomerAllowedModelsSelect";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { customerBudgetPeriod } from "./customerBudgetUsage";
import type { BudgetFields, Organization } from "./customerHierarchyForms";
import type { CustomerOrganizationFields } from "./customerOrganizationForm";

export type CustomerLimits = Pick<
  CustomerOrganizationFields,
  "budgetMode" | "budgetId" | "budgetAmount" | "budgetDuration" | "tpm" | "rpm"
>;

const rateFields = ["tpm", "rpm"] as const;
const currencyOptions = { style: "currency", minimumFractionDigits: 0, maximumFractionDigits: 2 } as const;

function LimitOptionContent({ label, summary }: { label: string; summary: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col items-start gap-1 whitespace-normal sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="font-medium">{label}</span>
      <span className="text-sm text-muted-foreground sm:text-right">{summary}</span>
    </span>
  );
}

export function CustomerBudgetSourceSelect({
  profiles,
  value,
  onChange,
  title,
  disabled,
  loading = false,
  inheritedOption,
}: {
  profiles: Organization["default_budgets"];
  value: string;
  onChange: (value: string | null) => void;
  title: string;
  disabled: boolean;
  loading?: boolean;
  inheritedOption?: { label: string; summary: string };
}) {
  const { t } = useTranslation();
  const profileOptions = profiles.map((group) => {
    const spendLimits = [
      ...(group.max_budget == null
        ? []
        : [{ max_budget: group.max_budget, budget_duration: group.budget_duration ?? null }]),
      ...(group.budget_limits ?? []),
    ];
    const spendSummary = spendLimits.map((limit) => {
      const amount = t("format.number", { val: limit.max_budget, ...currencyOptions });
      const period = customerBudgetPeriod(limit.budget_duration ?? null);
      if (period === "monthly") return t("customerPortal.createDialog.profileMonthlyBudget", { amount });
      if (period === "yearly") return t("customerPortal.createDialog.profileYearlyBudget", { amount });
      return limit.budget_duration
        ? t("customerPortal.createDialog.profilePeriodBudget", { amount, duration: limit.budget_duration })
        : amount;
    });
    const rateSummary = rateFields.map((field) =>
      group[`${field}_limit`] == null
        ? t(`customerPortal.createDialog.${field}NoLimit`)
        : t(`customerPortal.detail.${field}`, {
            val: t("format.compactNumber", { val: group[`${field}_limit`] }),
          }),
    );
    return {
      value: `profile:${group.budget_id}`,
      budgetId: group.budget_id,
      label: group.name,
      summary: [
        ...(spendSummary.length ? spendSummary : [t("customerPortal.rateLimits.noSpendLimit")]),
        ...rateSummary,
        ...(group.allowed_models?.length
          ? [`${t("customerPortal.hierarchy.allowedModels")}: ${group.allowed_models.join(", ")}`]
          : []),
      ].join(" · "),
    };
  });
  const customOption = {
    value: "custom",
    label: t("customerPortal.createDialog.customLimits"),
    summary: t("customerPortal.createDialog.customLimitsHelp"),
  };
  const selectedOption = value === "custom" ? customOption : profileOptions.find((option) => option.value === value);
  const selection =
    value === "inherit"
      ? inheritedOption
      : selectedOption ??
        (value.startsWith("profile:")
          ? {
              label: t("customerPortal.hierarchy.unknownTemplate", { id: value.slice("profile:".length) }),
              summary: "",
            }
          : undefined);
  return (
    <Select value={value} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger aria-label={title} className="w-full gap-4 px-3 py-3 data-[size=default]:h-auto">
        <SelectValue className="min-w-0" placeholder={t("customerPortal.createDialog.profilePlaceholder")}>
          {selection && <LimitOptionContent label={selection.label} summary={selection.summary} />}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="p-1">
        {inheritedOption && (
          <SelectItem value="inherit" className="py-3">
            <LimitOptionContent label={inheritedOption.label} summary={inheritedOption.summary} />
          </SelectItem>
        )}
        {loading && (
          <SelectItem value="loading" disabled>
            {t("customerPortal.common.loading")}
          </SelectItem>
        )}
        {profileOptions.map((option) => (
          <SelectItem key={option.value} value={option.value} label={option.label} className="py-3">
            <LimitOptionContent label={option.label} summary={option.summary} />
          </SelectItem>
        ))}
        {profileOptions.length > 0 && <SelectSeparator />}
        <SelectItem
          value={customOption.value}
          label={t("customerPortal.createDialog.enterCustomLimits")}
          className="py-3"
        >
          {t("customerPortal.createDialog.enterCustomLimits")}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

type CustomerLimitValues = Pick<CustomerLimits, "budgetAmount" | "budgetDuration" | "tpm" | "rpm">;

export function CustomerCustomLimitFields({
  fields,
  onChange,
  disabled,
  idPrefix,
  inheritBlank = false,
  periodControl,
}: {
  fields: CustomerLimitValues;
  onChange: (patch: Partial<CustomerLimitValues>) => void;
  disabled: boolean;
  idPrefix: string;
  inheritBlank?: boolean;
  periodControl?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 sm:grid-cols-[1.5fr_1fr_1fr]">
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`${idPrefix}-budget`} className="font-normal text-muted-foreground">
          {t("customerPortal.createDialog.budget")}
        </Label>
        <CustomerBudgetAmountInput
          id={`${idPrefix}-budget`}
          label={t("customerPortal.createDialog.spendLimitLabel")}
          disabled={disabled}
          placeholder={t(
            inheritBlank ? "customerPortal.hierarchy.useDefaultLimits" : "customerPortal.createDialog.noLimit",
          )}
          value={fields.budgetAmount}
          onChange={(budgetAmount) => onChange({ budgetAmount })}
        >
          {periodControl ?? (
            <Select
              value={fields.budgetDuration}
              disabled={disabled}
              onValueChange={(value) => {
                if (value === "1mo" || value === "12mo") onChange({ budgetDuration: value });
              }}
            >
              <SelectTrigger
                aria-label={t("customerPortal.hierarchy.budgetDuration")}
                className="h-full shrink-0 rounded-l-none border-0 border-l bg-muted/30 px-3 shadow-none"
              >
                <SelectValue>
                  {t(
                    fields.budgetDuration === "1mo"
                      ? "customerPortal.createDialog.perMonth"
                      : "customerPortal.createDialog.perYear",
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1mo">{t("customerPortal.createDialog.perMonth")}</SelectItem>
                <SelectItem value="12mo">{t("customerPortal.createDialog.perYear")}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </CustomerBudgetAmountInput>
      </div>
      {rateFields.map((field) => (
        <div key={field} className="min-w-0 space-y-2">
          <Label htmlFor={`${idPrefix}-${field}`} className="font-normal text-muted-foreground">
            {t(`customerPortal.createDialog.${field}Short`)}
          </Label>
          <Input
            id={`${idPrefix}-${field}`}
            aria-label={t(`customerPortal.hierarchy.${field}`)}
            type="number"
            min={0}
            step={1}
            placeholder={t(
              inheritBlank ? "customerPortal.hierarchy.useDefaultLimits" : "customerPortal.createDialog.noLimit",
            )}
            value={fields[field]}
            onChange={(event) => onChange({ [field]: event.target.value })}
          />
        </div>
      ))}
    </div>
  );
}

export function CustomerCustomBudgetFields({
  fields,
  onChange,
  idPrefix,
  inheritBlank = false,
  children,
}: {
  fields: BudgetFields;
  onChange: {
    (key: Exclude<keyof BudgetFields, "allowedModels">, value: string): void;
    (key: "allowedModels", value: readonly string[]): void;
  };
  idPrefix: string;
  inheritBlank?: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const changeLimits = (patch: Partial<CustomerLimitValues>) => {
    if (patch.budgetAmount !== undefined) onChange("maxBudget", patch.budgetAmount);
    if (patch.tpm !== undefined) onChange("tpm", patch.tpm);
    if (patch.rpm !== undefined) onChange("rpm", patch.rpm);
  };
  return (
    <div className="space-y-5">
      <CustomerCustomLimitFields
        fields={{
          budgetAmount: fields.maxBudget,
          budgetDuration: fields.budgetDuration === "12mo" ? "12mo" : "1mo",
          tpm: fields.tpm,
          rpm: fields.rpm,
        }}
        idPrefix={idPrefix}
        disabled={false}
        inheritBlank={inheritBlank}
        periodControl={
          <CustomerBudgetPeriodSelect
            value={fields.budgetDuration}
            onChange={(value) => onChange("budgetDuration", value)}
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
            placeholder={t(
              inheritBlank ? "customerPortal.hierarchy.useDefaultLimits" : "customerPortal.createDialog.noLimit",
            )}
            value={fields.softBudget}
            onChange={(value) => onChange("softBudget", value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-models`} className="font-normal text-muted-foreground">
            {t("customerPortal.hierarchy.allowedModels")}
          </Label>
          <CustomerAllowedModelsSelect
            id={`${idPrefix}-models`}
            value={fields.allowedModels}
            onChange={(value) => onChange("allowedModels", value)}
          />
          <p className="text-xs text-muted-foreground">{t("customerPortal.hierarchy.allowedModelsHint")}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function CustomerLimitsFields({
  fields,
  disabled,
  onChange,
  profiles,
  title,
  description,
  idPrefix,
  loading = false,
  customHint,
}: {
  fields: CustomerLimits;
  disabled: boolean;
  onChange: (patch: Partial<CustomerLimits>) => void;
  profiles?: Organization["default_budgets"];
  title: string;
  description: string;
  idPrefix: string;
  loading?: boolean;
  customHint?: string;
}) {
  const isCustom = profiles === undefined || fields.budgetMode === "custom";
  const selectSource = (value: string | null) => {
    if (value === "custom") return onChange({ budgetMode: "custom" });
    const profile = profiles?.find((group) => `profile:${group.budget_id}` === value);
    if (profile) onChange({ budgetMode: "profile", budgetId: profile.budget_id });
  };
  return (
    <section className="space-y-4" aria-labelledby={`${idPrefix}-limits-heading`}>
      <div className="space-y-1">
        <h3 id={`${idPrefix}-limits-heading`} className="font-semibold">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {profiles !== undefined && (
        <CustomerBudgetSourceSelect
          profiles={profiles}
          value={isCustom ? "custom" : `profile:${fields.budgetId}`}
          title={title}
          disabled={disabled}
          loading={loading}
          onChange={selectSource}
        />
      )}
      {isCustom && (
        <CustomerCustomLimitFields
          fields={fields}
          disabled={disabled}
          idPrefix={idPrefix}
          inheritBlank={Boolean(customHint)}
          onChange={onChange}
        />
      )}
      {isCustom && customHint && <p className="text-xs text-muted-foreground">{customHint}</p>}
    </section>
  );
}
