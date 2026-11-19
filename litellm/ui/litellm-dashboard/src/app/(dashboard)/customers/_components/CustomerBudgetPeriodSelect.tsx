import { useState } from "react";
import type { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const periodLabels: Record<string, ParseKeys> = {
  custom: "customerPortal.budgetEditor.customPeriod",
  none: "customerPortal.budgetEditor.noReset",
  "1mo": "customerPortal.createDialog.perMonth",
  "12mo": "customerPortal.createDialog.perYear",
};

export default function CustomerBudgetPeriodSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [custom, setCustom] = useState(false);
  const customPeriod = custom || !["", "1mo", "12mo"].includes(value);
  const period = customPeriod ? "custom" : value || "none";
  const changePeriod = (next: string | null) => {
    setCustom(next === "custom");
    if (next === "none") onChange("");
    if (next === "1mo" || next === "12mo") onChange(next);
  };
  return (
    <>
      {customPeriod && (
        <Input
          aria-label={t("customerPortal.budgetEditor.customPeriod")}
          value={value}
          className="w-20 shrink-0 rounded-none border-0 border-l shadow-none"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <Select value={period} onValueChange={changePeriod}>
        <SelectTrigger
          aria-label={t("customerPortal.hierarchy.budgetDuration")}
          className="h-full shrink-0 rounded-l-none border-0 border-l bg-muted/30 px-3 shadow-none"
        >
          <SelectValue>{t(periodLabels[period])}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1mo">{t("customerPortal.createDialog.perMonth")}</SelectItem>
          <SelectItem value="12mo">{t("customerPortal.createDialog.perYear")}</SelectItem>
          <SelectItem value="none">{t("customerPortal.budgetEditor.noReset")}</SelectItem>
          <SelectItem value="custom">{t("customerPortal.budgetEditor.customPeriod")}</SelectItem>
        </SelectContent>
      </Select>
    </>
  );
}
