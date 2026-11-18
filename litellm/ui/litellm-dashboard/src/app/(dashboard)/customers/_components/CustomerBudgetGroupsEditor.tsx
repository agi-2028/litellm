import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { defaultCustomerCapPolicy, type CustomerBudgetGroupFields } from "./customerOrganizationForm";
import { CustomerRateLimitFields } from "./CustomerRateLimits";
import CustomerBudgetAmountInput from "./CustomerBudgetAmountInput";
import CustomerBudgetGroupsTable from "./CustomerBudgetGroupsTable";

const groupBudgetFields = [
  ["monthlyBudget", "monthly"],
  ["yearlyBudget", "yearly"],
] as const;

export default function CustomerBudgetGroupsEditor({
  groups,
  defaultGroupId,
  onChange,
  disabled = false,
  showHeading = true,
  memberGroups = true,
  layout = "cards",
}: {
  groups: CustomerBudgetGroupFields[];
  defaultGroupId: string;
  onChange: (groups: CustomerBudgetGroupFields[], defaultGroupId: string) => void;
  disabled?: boolean;
  showHeading?: boolean;
  memberGroups?: boolean;
  layout?: "cards" | "table";
}) {
  const { t } = useTranslation();
  const updateGroup = (id: string, patch: Partial<Omit<CustomerBudgetGroupFields, "id">>) =>
    onChange(
      groups.map((group) => (group.id === id ? { ...group, ...patch } : group)),
      defaultGroupId,
    );
  const removeGroup = (id: string) => {
    const remaining = groups.filter((group) => group.id !== id);
    onChange(remaining, memberGroups && defaultGroupId === id ? remaining[0]?.id ?? "" : defaultGroupId);
  };
  const addGroup = () => {
    const group: CustomerBudgetGroupFields = {
      id: uuidv4(),
      name: "",
      monthlyBudget: "",
      yearlyBudget: "",
      tpm: "",
      rpm: "",
      capPolicy: defaultCustomerCapPolicy,
    };
    onChange([...groups, group], memberGroups && !groups.length ? group.id : defaultGroupId);
  };
  if (layout === "table" && memberGroups) {
    return (
      <CustomerBudgetGroupsTable
        groups={groups}
        defaultGroupId={defaultGroupId}
        disabled={disabled}
        onUpdate={updateGroup}
        onRemove={removeGroup}
        onAdd={addGroup}
        onDefaultChange={(id) => onChange(groups, id)}
      />
    );
  }
  return (
    <section
      className={showHeading ? "space-y-3 border-t pt-5" : "space-y-3"}
      aria-label={t(memberGroups ? "customerPortal.createDialog.groups" : "customerPortal.organizationGroups.title")}
    >
      <div>
        {showHeading && <h3 className="font-medium">{t("customerPortal.createDialog.groups")}</h3>}
        <p className="mt-1 text-xs text-muted-foreground">
          {t(memberGroups ? "customerPortal.createDialog.groupsHelp" : "customerPortal.organizationGroups.help")}
        </p>
      </div>
      <RadioGroup
        role={memberGroups ? "radiogroup" : "group"}
        value={defaultGroupId}
        onValueChange={(value) => onChange(groups, String(value))}
        aria-label={t(
          memberGroups ? "customerPortal.createDialog.defaultGroup" : "customerPortal.organizationGroups.title",
        )}
        disabled={disabled}
        className="gap-3"
      >
        {groups.map((group, index) => (
          <div
            key={group.id}
            className={`space-y-3 rounded-lg border p-3 ${memberGroups && group.id === defaultGroupId ? "bg-muted/40" : ""}`}
          >
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor={`cc-group-${group.id}`} className="text-xs font-normal leading-4 text-muted-foreground">
                  {t("customerPortal.createDialog.groupName")}
                </Label>
                <Input
                  id={`cc-group-${group.id}`}
                  aria-label={t("customerPortal.createDialog.groupNameLabel", { index: index + 1 })}
                  value={group.name}
                  onChange={(event) => updateGroup(group.id, { name: event.target.value })}
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex h-9 shrink-0 items-center gap-2">
                {memberGroups && (
                  <Label className="text-xs font-normal leading-4 text-muted-foreground">
                    <RadioGroupItem
                      value={group.id}
                      aria-label={t("customerPortal.createDialog.useDefault", { name: group.name || index + 1 })}
                    />
                    <span aria-hidden="true">{t("customerPortal.createDialog.default")}</span>
                  </Label>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={memberGroups && groups.length === 1}
                  onClick={() => removeGroup(group.id)}
                  aria-label={t("customerPortal.createDialog.removeGroup", { name: group.name || index + 1 })}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className={`grid grid-cols-2 gap-3 ${memberGroups ? "sm:grid-cols-[1fr_1fr_1.5fr]" : ""}`}>
              {groupBudgetFields.map(([field, period]) => (
                <div className="min-w-0 space-y-1.5" key={field}>
                  <Label
                    htmlFor={`cc-${period}-${group.id}`}
                    className="text-xs font-normal leading-4 text-muted-foreground"
                  >
                    {t(`customerPortal.createDialog.${period}`)}
                  </Label>
                  <CustomerBudgetAmountInput
                    id={`cc-${period}-${group.id}`}
                    label={t(`customerPortal.createDialog.${period}Label`, { index: index + 1 })}
                    value={group[field]}
                    onChange={(value) => updateGroup(group.id, { [field]: value })}
                  />
                </div>
              ))}
              {memberGroups && (
                <div className="col-span-2 min-w-0 space-y-1.5 sm:col-span-1">
                  <Label htmlFor={`cc-cap-${group.id}`} className="text-xs font-normal leading-4 text-muted-foreground">
                    {t("customerPortal.budgetGroups.atCap")}
                  </Label>
                  <Select
                    value={group.capPolicy}
                    disabled={disabled}
                    onValueChange={(value) => {
                      if (value === "pause_until_reset" || value === "pause_allow_increase") {
                        updateGroup(group.id, { capPolicy: value });
                      }
                    }}
                  >
                    <SelectTrigger
                      id={`cc-cap-${group.id}`}
                      aria-label={t("customerPortal.budgetGroups.atCapLabel", { index: index + 1 })}
                      className="w-full min-w-0 text-xs"
                    >
                      <SelectValue>
                        {t(
                          group.capPolicy === "pause_allow_increase"
                            ? "customerPortal.budgetGroups.pauseAllowIncrease"
                            : "customerPortal.budgetGroups.pauseUntilReset",
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pause_until_reset">
                        {t("customerPortal.budgetGroups.pauseUntilReset")}
                      </SelectItem>
                      <SelectItem value="pause_allow_increase">
                        {t("customerPortal.budgetGroups.pauseAllowIncrease")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="border-t pt-3">
              <CustomerRateLimitFields
                id={`cc-rates-${group.id}`}
                label={t("customerPortal.rateLimits.group", { index: index + 1 })}
                tpm={group.tpm}
                rpm={group.rpm}
                onChange={(field, value) => updateGroup(group.id, { [field]: value })}
                showHint={false}
                compact
              />
            </div>
          </div>
        ))}
      </RadioGroup>
      <Button type="button" variant="ghost" size="sm" onClick={addGroup}>
        <Plus className="size-4" />
        {t("customerPortal.createDialog.addGroup")}
      </Button>
    </section>
  );
}
