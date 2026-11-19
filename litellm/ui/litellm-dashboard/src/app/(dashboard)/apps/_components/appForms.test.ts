import { describe, expect, it } from "vitest";
import {
  appBudgetFields,
  appBudgetValue,
  appBudgetPeriodAmount,
  compactAppBudgetFields,
  compactAppBudgetValue,
  updateAppBudgetPeriod,
  appSurchargeField,
  appSurchargeValue,
} from "./appForms";

describe("app budget forms", () => {
  it("saves a rate-only budget and preserves zero limits", () => {
    expect(appBudgetValue({ ...appBudgetFields({}), tpm: "50000", rpm: "0" })).toMatchObject({
      ok: true,
      value: { max_budget: null, budget_limits: null, tpm_limit: 50000, rpm_limit: 0 },
    });
  });

  it("preserves spend windows and model rules when changing RPM", () => {
    const original = {
      tpm_limit: 50000,
      rpm_limit: 60,
      model_tpm_limit: { "test-model": 10000 },
      budget_limits: [{ budget_duration: "1mo", max_budget: 100, reset_at: "2027-01-01T00:00:00Z" }],
    };
    expect(appBudgetValue({ ...appBudgetFields(original), rpm: "" }, original)).toMatchObject({
      ok: true,
      value: { ...original, rpm_limit: null },
    });
  });

  it("should preserve limits not edited by the shared fields", () => {
    const original = { max_budget: 10, budget_limits: [{ budget_duration: "1mo" as const, max_budget: 5 }] };
    const result = appBudgetValue({ ...appBudgetFields(original), maxBudget: "20" }, original);
    expect(result).toMatchObject({ ok: true, value: { max_budget: 20, budget_limits: original.budget_limits } });
  });
  it("should clear a disabled budget pointer", () => {
    expect(appBudgetValue(appBudgetFields())).toEqual({ ok: true, value: null });
  });
  it("should edit an existing monthly window without leaving its old cap active", () => {
    const original = { budget_limits: [{ budget_duration: "1mo" as const, max_budget: 5 }] };
    const fields = appBudgetFields(original);
    fields.budgetWindows[0].maxBudget = "25";
    expect(appBudgetValue(fields, original)).toMatchObject({
      ok: true,
      value: { budget_limits: [{ budget_duration: "1mo", max_budget: 25 }] },
    });
  });
  it("should reject a cleared window amount until the limit is explicitly removed", () => {
    const fields = appBudgetFields({ budget_limits: [{ budget_duration: "1mo", max_budget: 5 }] });
    fields.budgetWindows[0].maxBudget = "";
    expect(appBudgetValue(fields).ok).toBe(false);
  });
  it.each(["-1", "NaN", "Infinity", "1.2.3"])("should reject invalid numeric input %s", (maxBudget) => {
    expect(appBudgetValue({ ...appBudgetFields({}), maxBudget }).ok).toBe(false);
  });
});

describe("compact app budget forms", () => {
  it("saves monthly and yearly caps together with rate limits", () => {
    const monthly = updateAppBudgetPeriod({ ...compactAppBudgetFields(), budgetEnabled: true }, "1mo", "100");
    const yearly = updateAppBudgetPeriod(monthly, "12mo", "1000");
    expect(compactAppBudgetValue({ ...yearly, tpm: "50000", rpm: "100" })).toMatchObject({
      ok: true,
      value: {
        max_budget: 100,
        budget_duration: "1mo",
        budget_limits: [{ budget_duration: "12mo", max_budget: 1000 }],
        tpm_limit: 50000,
        rpm_limit: 100,
      },
    });
  });

  it.each(["1mo", "12mo"] as const)("saves only the selected %s cap, including zero", (period) => {
    const fields = updateAppBudgetPeriod({ ...compactAppBudgetFields(), budgetEnabled: true }, period, "0");
    const result = compactAppBudgetValue(fields);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(appBudgetPeriodAmount(compactAppBudgetFields(result.value), period)).toBe("0");
    expect(appBudgetPeriodAmount(compactAppBudgetFields(result.value), period === "1mo" ? "12mo" : "1mo")).toBe("");
  });

  it("updates every matching cap without keeping an old lower limit, while preserving reset dates and other limits", () => {
    const original = {
      max_budget: 80,
      budget_duration: "1mo",
      soft_budget: 50,
      model_tpm_limit: { "test-model": 5000 },
      budget_limits: [
        { budget_duration: "1mo", max_budget: 100, reset_at: "2027-01-01T00:00:00Z" },
        { budget_duration: "12mo", max_budget: 1000, reset_at: "2027-07-01T00:00:00Z" },
        { budget_duration: "1d", max_budget: 20, reset_at: "2026-12-15T00:00:00Z" },
      ],
    };
    const fields = compactAppBudgetFields(original);
    expect(appBudgetPeriodAmount(fields, "1mo")).toBe("80");
    const updated = updateAppBudgetPeriod(fields, "1mo", "150");
    expect(compactAppBudgetValue(updated, original)).toMatchObject({
      ok: true,
      value: {
        ...original,
        max_budget: 150,
        budget_limits: [{ ...original.budget_limits[0], max_budget: 150 }, ...original.budget_limits.slice(1)],
      },
    });
  });

  it("removes both scalar and window caps when a period is cleared", () => {
    const original = {
      max_budget: 80,
      budget_duration: "1mo",
      budget_limits: [
        { budget_duration: "1mo", max_budget: 100 },
        { budget_duration: "12mo", max_budget: 1000 },
      ],
    };
    const monthlyCleared = updateAppBudgetPeriod(compactAppBudgetFields(original), "1mo", " ");
    expect(compactAppBudgetValue(monthlyCleared, original)).toMatchObject({
      ok: true,
      value: { max_budget: null, budget_limits: [original.budget_limits[1]] },
    });
    const allCleared = updateAppBudgetPeriod(monthlyCleared, "12mo", "");
    expect(compactAppBudgetValue({ ...allCleared, tpm: "25000" }, original)).toMatchObject({
      ok: true,
      value: { max_budget: null, budget_limits: null, tpm_limit: 25000 },
    });
  });

  it.each(["-1", "Infinity", "bad"])("rejects invalid yearly cap %s", (amount) => {
    const fields = updateAppBudgetPeriod({ ...compactAppBudgetFields(), budgetEnabled: true }, "12mo", amount);
    expect(compactAppBudgetValue(fields).ok).toBe(false);
  });
});

describe("app surcharge form", () => {
  it.each([
    ["2", 0.02],
    [" 2.5 ", 0.025],
    ["0", 0],
    ["1000", 10],
  ])("should send %s percent as the fraction %s", (text, fraction) => {
    expect(appSurchargeValue(text)).toEqual({ ok: true, value: fraction });
  });

  it("should send an empty field as null so the app falls back to the gateway surcharge", () => {
    expect(appSurchargeValue("  ")).toEqual({ ok: true, value: null });
  });

  it.each(["-1", "1000.1", "two", "Infinity"])("should refuse %s", (text) => {
    expect(appSurchargeValue(text)).toEqual({ ok: false });
  });

  it.each([
    [0.02, "2"],
    [0.025, "2.5"],
    [0, "0"],
    [null, ""],
    [undefined, ""],
  ])("should show the stored fraction %s as %s percent", (margin, text) => {
    expect(appSurchargeField(margin)).toBe(text);
  });
});
