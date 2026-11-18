import { useTranslation } from "react-i18next";
import { $api } from "@/lib/http/api";
import { ErrorState } from "@/components/shared/ErrorState";
import { SearchSelect } from "@/components/shared/SearchSelect";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { customerBudgetPeriod } from "./customerBudgetUsage";
import type { CustomerOrganizationFields } from "./customerOrganizationForm";

type OrganizationLimits = Pick<
  CustomerOrganizationFields,
  "budgetMode" | "budgetId" | "budgetAmount" | "budgetDuration" | "tpm" | "rpm"
>;

const rateFields = ["tpm", "rpm"] as const;

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
  const selectedGroup = groups.data?.default_budgets.find((group) => group.budget_id === fields.budgetId);
  const spendLimits = selectedGroup
    ? [
        ...(selectedGroup.max_budget == null
          ? []
          : [{ max_budget: selectedGroup.max_budget, budget_duration: selectedGroup.budget_duration ?? null }]),
        ...(selectedGroup.budget_limits ?? []),
      ]
    : [];
  return (
    <section className="space-y-4" aria-labelledby="cc-limits-heading">
      <div className="space-y-1">
        <h3 id="cc-limits-heading" className="font-semibold">
          {t("customerPortal.createDialog.organizationLimits")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("customerPortal.createDialog.organizationLimitsHelp")}</p>
      </div>
      <Tabs
        value={fields.budgetMode}
        onValueChange={(value) => {
          if (value === "custom" || value === "profile") onChange({ budgetMode: value });
        }}
        className="gap-4"
      >
        <TabsList aria-label={t("customerPortal.createDialog.limitSource")}>
          <TabsTrigger value="custom" disabled={disabled}>
            {t("customerPortal.createDialog.customLimits")}
          </TabsTrigger>
          <TabsTrigger value="profile" disabled={disabled}>
            {t("customerPortal.createDialog.useProfile")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="custom">
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
        </TabsContent>
        <TabsContent value="profile" className="space-y-3">
          <div className="grid items-start gap-4 sm:grid-cols-[1.4fr_2fr]">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="cc-profile" className="font-normal text-muted-foreground">
                {t("customerPortal.createDialog.profile")}
              </Label>
              <SearchSelect
                id="cc-profile"
                options={(groups.data?.default_budgets ?? []).map((group) => ({
                  value: group.budget_id,
                  label: group.name,
                }))}
                value={fields.budgetId || null}
                onValueChange={(value) => onChange({ budgetId: value ?? "" })}
                placeholder={t("customerPortal.createDialog.profilePlaceholder")}
                disabled={disabled || groups.isPending}
                className="h-9"
              />
            </div>
            {selectedGroup && (
              <dl
                className="grid grid-cols-3 gap-4 rounded-lg border bg-muted/20 p-3"
                aria-label={t("customerPortal.createDialog.profileLimits")}
              >
                <div className="min-w-0 space-y-1.5">
                  <dt className="text-xs text-muted-foreground">{t("customerPortal.createDialog.budget")}</dt>
                  <dd className="text-sm tabular-nums">
                    {spendLimits.length === 0
                      ? t("customerPortal.createDialog.noLimit")
                      : spendLimits.map((limit, index) => {
                          const period = customerBudgetPeriod(limit.budget_duration ?? null);
                          return (
                            <div key={`${limit.budget_duration}-${index}`}>
                              {t("format.usd", { val: limit.max_budget })}
                              {period === "monthly" && ` ${t("customerPortal.createDialog.perMonth")}`}
                              {period === "yearly" && ` ${t("customerPortal.createDialog.perYear")}`}
                              {period === "other" && limit.budget_duration && ` / ${limit.budget_duration}`}
                            </div>
                          );
                        })}
                  </dd>
                </div>
                {rateFields.map((field) => (
                  <div key={field} className="min-w-0 space-y-1.5">
                    <dt className="text-xs text-muted-foreground">{t(`customerPortal.createDialog.${field}Short`)}</dt>
                    <dd className="text-sm tabular-nums">
                      {selectedGroup[`${field}_limit`] == null
                        ? t("customerPortal.createDialog.noLimit")
                        : t("format.number", { val: selectedGroup[`${field}_limit`] })}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("customerPortal.createDialog.profileHelp")}</p>
          {groups.isError && <ErrorState onRetry={() => void groups.refetch()} />}
        </TabsContent>
      </Tabs>
    </section>
  );
}
