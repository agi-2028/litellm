import { useTranslation } from "react-i18next";
import { $api } from "@/lib/http/api";
import { ErrorState } from "@/components/shared/ErrorState";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { customerBudgetPeriod } from "./customerBudgetUsage";
import type { CustomerOrganizationFields } from "./customerOrganizationForm";

type OrganizationLimits = Pick<
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

export default function CreateCustomerOrganizationLimits({
  fields,
  disabled,
  onChange,
}: {
  fields: OrganizationLimits;
  disabled: boolean;
  onChange: (patch: Partial<OrganizationLimits>) => void;
}) {
  const { t } = useTranslation();
  const groups = $api.useQuery("get", "/management/v1/customer_organization_budget_groups", {});
  const profileOptions = (groups.data?.default_budgets ?? []).map((group) => {
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
      ].join(" · "),
    };
  });
  const customOption = {
    value: "custom",
    label: t("customerPortal.createDialog.customLimits"),
    summary: t("customerPortal.createDialog.customLimitsHelp"),
  };
  const isCustom = fields.budgetMode === "custom";
  const selectedOption = isCustom ? customOption : profileOptions.find((option) => option.budgetId === fields.budgetId);
  const selectLimitSource = (value: string | null) => {
    if (value === customOption.value) {
      onChange({ budgetMode: "custom" });
      return;
    }
    const profile = profileOptions.find((option) => option.value === value);
    if (profile) onChange({ budgetMode: "profile", budgetId: profile.budgetId });
  };
  return (
    <section className="space-y-4" aria-labelledby="cc-limits-heading">
      <div className="space-y-1">
        <h3 id="cc-limits-heading" className="font-semibold">
          {t("customerPortal.createDialog.organizationLimits")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("customerPortal.createDialog.organizationLimitsHelp")}</p>
      </div>
      <Select
        value={isCustom ? customOption.value : `profile:${fields.budgetId}`}
        disabled={disabled}
        onValueChange={selectLimitSource}
      >
        <SelectTrigger
          aria-label={t("customerPortal.createDialog.organizationLimits")}
          className="w-full gap-4 px-3 py-3 data-[size=default]:h-auto"
        >
          <SelectValue className="min-w-0" placeholder={t("customerPortal.createDialog.profilePlaceholder")}>
            {selectedOption && <LimitOptionContent label={selectedOption.label} summary={selectedOption.summary} />}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="p-1">
          {groups.isPending && (
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
          <SelectItem value={customOption.value} label={customOption.label} className="py-3">
            {t("customerPortal.createDialog.enterCustomLimits")}
          </SelectItem>
        </SelectContent>
      </Select>
      {isCustom && (
        <div className="grid gap-4 sm:grid-cols-[1.5fr_1fr_1fr]">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="cc-budget" className="font-normal text-muted-foreground">
              {t("customerPortal.createDialog.budget")}
            </Label>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>$</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                id="cc-budget"
                aria-label={t("customerPortal.createDialog.spendLimitLabel")}
                type="number"
                min={0}
                step="any"
                placeholder={t("customerPortal.createDialog.noLimit")}
                value={fields.budgetAmount}
                onChange={(event) => onChange({ budgetAmount: event.target.value })}
              />
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
            </InputGroup>
          </div>
          {rateFields.map((field) => (
            <div key={field} className="min-w-0 space-y-2">
              <Label htmlFor={`cc-${field}`} className="font-normal text-muted-foreground">
                {t(`customerPortal.createDialog.${field}Short`)}
              </Label>
              <Input
                id={`cc-${field}`}
                aria-label={t(`customerPortal.hierarchy.${field}`)}
                type="number"
                min={0}
                step={1}
                placeholder={t("customerPortal.createDialog.noLimit")}
                value={fields[field]}
                onChange={(event) => onChange({ [field]: event.target.value })}
              />
            </div>
          ))}
        </div>
      )}
      {groups.isError && <ErrorState onRetry={() => void groups.refetch()} />}
    </section>
  );
}
