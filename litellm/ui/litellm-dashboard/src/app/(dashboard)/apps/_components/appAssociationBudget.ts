import {
  compactBudgetEditorValue,
  permanentBudgetEditorValue,
  type Budget,
  type BudgetEditorFields,
} from "../../customers/_components/customerBudgetForm";
import type { App, AppMember, AppOrganization } from "./appForms";

type Association = AppMember | AppOrganization;
export const appOrganizationPresetId = (row?: AppOrganization | null, app?: App) =>
  row?.budget_id ?? row?.tier_budget_id ?? app?.default_tier_budget_id;

export const hasLegacyAppBudget = (row?: Association | null) =>
  row?.budget_override != null && row.budget_override_expires_at == null;

export function associationBaseBudget(row: Association | null, inherited?: Budget | null): Budget | null {
  const base = row?.budget ?? inherited ?? null;
  if (!hasLegacyAppBudget(row)) return base;
  const override = row!.budget_override!;
  const windows = new Map(
    (override.max_budget != null ? [] : base?.budget_limits ?? []).map((window) => [window.budget_duration, window]),
  );
  const merged = new Map([
    ...windows,
    ...(override.budget_limits ?? []).map((window) => [window.budget_duration, window] as const),
  ]);
  return {
    ...base,
    ...Object.fromEntries(Object.entries(override).filter(([, value]) => value != null)),
    allowed_models: override.allowed_models?.length ? override.allowed_models : base?.allowed_models,
    budget_limits: merged.size ? [...merged.values()] : null,
  };
}

export function associationBudgetPatch(fields: BudgetEditorFields, original: Budget | null, row: Association | null) {
  const parsed = hasLegacyAppBudget(row)
    ? compactBudgetEditorValue(fields, original)
    : permanentBudgetEditorValue(fields, original);
  return parsed.ok
    ? ({
        ok: true,
        value: { budget: parsed.value, ...(hasLegacyAppBudget(row) ? { budget_override: null } : {}) },
      } as const)
    : parsed;
}
