import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { components } from "@/lib/http/schema";

export const rateFields = ["tpm", "rpm"] as const;

export function CustomerRateLimitInput(props: ComponentProps<typeof Input>) {
  const { t } = useTranslation();
  return <Input type="number" min={0} step={1} placeholder={t("customerPortal.createDialog.noLimit")} {...props} />;
}

export type CustomerRateLimits = Pick<components["schemas"]["Budget"], "tpm_limit" | "rpm_limit">;

const hasCustomerRateLimits = (limits?: CustomerRateLimits | null): boolean =>
  [limits?.tpm_limit, limits?.rpm_limit].some((limit) => limit != null);

export function CustomerRateLimitFields({
  id,
  tpm,
  rpm,
  onChange,
}: {
  id: string;
  tpm: string;
  rpm: string;
  onChange: (field: "tpm" | "rpm", value: string) => void;
}) {
  const { t } = useTranslation();
  const values = { tpm, rpm };
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-medium">{t("customerPortal.rateLimits.title")}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {rateFields.map((field) => (
          <div key={field} className="min-w-0 space-y-1.5">
            <Label htmlFor={`${id}-${field}`}>{t(`customerPortal.hierarchy.${field}`)}</Label>
            <CustomerRateLimitInput
              id={`${id}-${field}`}
              value={values[field]}
              onChange={(event) => onChange(field, event.target.value)}
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("customerPortal.rateLimits.hint")}</p>
    </fieldset>
  );
}

export function CustomerRateLimitSummary({ limits }: { limits?: CustomerRateLimits | null }) {
  const { t } = useTranslation();
  if (!hasCustomerRateLimits(limits)) return null;
  return (
    <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
      {limits?.tpm_limit != null && (
        <span>{t("customerPortal.detail.tpm", { val: t("format.number", { val: limits.tpm_limit }) })}</span>
      )}
      {limits?.rpm_limit != null && (
        <span>{t("customerPortal.detail.rpm", { val: t("format.number", { val: limits.rpm_limit }) })}</span>
      )}
    </p>
  );
}
