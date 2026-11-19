import type { components } from "@/lib/http/schema";

export type Budget = components["schemas"]["Budget"];
export interface BudgetFields {
  maxBudget: string;
  softBudget: string;
  budgetDuration: string;
  tpm: string;
  rpm: string;
  allowedModels: readonly string[];
}

type BudgetWindow = NonNullable<Budget["budget_limits"]>[number];

export interface BudgetEditorFields extends BudgetFields {
  budgetEnabled: boolean;
  budgetWindows: { budget: BudgetWindow; maxBudget: string }[];
}

const asText = (value: number | null | undefined): string => (value == null ? "" : String(value));

export const budgetFields = (budget: Budget | null | undefined): BudgetFields => ({
  maxBudget: asText(budget?.max_budget),
  softBudget: asText(budget?.soft_budget),
  budgetDuration: budget?.budget_duration ?? "",
  tpm: asText(budget?.tpm_limit),
  rpm: asText(budget?.rpm_limit),
  allowedModels: budget?.allowed_models ?? [],
});

const numericLimit = (raw: string, integer = false): number | null | undefined => {
  const value = raw.trim();
  if (!value) return null;
  if (!(integer ? /^\d+$/ : /^(?:\d+(?:\.\d*)?|\.\d+)$/).test(value)) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || (integer && !Number.isSafeInteger(number))) return undefined;
  return number;
};

export const parseBudget = (fields: BudgetFields): Budget | null => {
  const max = numericLimit(fields.maxBudget);
  const soft = numericLimit(fields.softBudget);
  const tpm = numericLimit(fields.tpm, true);
  const rpm = numericLimit(fields.rpm, true);
  if ([max, soft, tpm, rpm].includes(undefined)) return null;
  const models = fields.allowedModels.map((model) => model.trim()).filter(Boolean);
  return {
    max_budget: max,
    soft_budget: soft,
    tpm_limit: tpm,
    rpm_limit: rpm,
    budget_duration: fields.budgetDuration.trim() || null,
    allowed_models: models.length ? [...new Set(models)] : null,
  };
};

export const budgetEditorFields = (budget?: Budget | null): BudgetEditorFields => ({
  budgetEnabled: budget != null,
  ...budgetFields(budget),
  budgetWindows: (budget?.budget_limits ?? []).map((window) => ({
    budget: window,
    maxBudget: String(window.max_budget),
  })),
});

export const budgetEditorValue = (fields: BudgetEditorFields, original?: Budget | null) => {
  if (!fields.budgetEnabled) return { ok: true, value: null } as const;
  const parsed = parseBudget(fields);
  if (!parsed) return { ok: false, error: "customerPortal.hierarchy.invalidNumber" } as const;
  const windows: BudgetWindow[] = [];
  for (const window of fields.budgetWindows) {
    const parsedWindow = parseBudget({ ...fields, maxBudget: window.maxBudget });
    if (parsedWindow?.max_budget == null)
      return { ok: false, error: "customerPortal.hierarchy.invalidNumber" } as const;
    windows.push({ ...window.budget, max_budget: parsedWindow.max_budget });
  }
  return { ok: true, value: { ...original, ...parsed, budget_limits: windows.length ? windows : null } } as const;
};

export const compactBudgetEditorFields = (budget?: Budget | null): BudgetEditorFields => ({
  ...budgetEditorFields(budget),
  budgetDuration: budget == null ? "1mo" : budget.budget_duration ?? "",
});

type BudgetPeriod = "1mo" | "12mo";

export const budgetPeriodAmount = (fields: BudgetEditorFields, duration: BudgetPeriod): string => {
  const scalar = fields.budgetDuration === duration ? fields.maxBudget : "";
  const amounts = [
    scalar,
    ...fields.budgetWindows
      .filter((window) => window.budget.budget_duration === duration)
      .map((window) => window.maxBudget),
  ].filter((amount) => amount.trim() !== "");
  return amounts.reduce(
    (smallest, amount) => (smallest === "" || Number(amount) < Number(smallest) ? amount : smallest),
    "",
  );
};

export const updateBudgetPeriod = (
  fields: BudgetEditorFields,
  duration: BudgetPeriod,
  amount: string,
): BudgetEditorFields => {
  const scalarPeriod = fields.budgetDuration === duration;
  const hasWindow = fields.budgetWindows.some((window) => window.budget.budget_duration === duration);
  const updatedWindows = fields.budgetWindows.map((window) =>
    window.budget.budget_duration === duration ? { ...window, maxBudget: amount } : window,
  );
  return {
    ...fields,
    ...(scalarPeriod ? { maxBudget: amount } : {}),
    budgetWindows:
      scalarPeriod || hasWindow || !amount.trim()
        ? updatedWindows
        : [...updatedWindows, { budget: { budget_duration: duration, max_budget: 0 }, maxBudget: amount }],
  };
};

export const compactBudgetEditorValue = (fields: BudgetEditorFields, original?: Budget | null) =>
  budgetEditorValue(
    { ...fields, budgetWindows: fields.budgetWindows.filter((window) => window.maxBudget.trim() !== "") },
    original,
  );
