import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { registerBaseUrlGetter } from "@/lib/http/runtime";
import {
  chooseSelectOption,
  fireEvent,
  renderWithProviders as render,
  screen,
  testQueryClient,
  waitFor,
  within,
} from "../../../../../tests/test-utils";
import CustomerBudgetSummary from "./CustomerBudgetSummary";
import type { Organization } from "./customerHierarchyForms";

const organization: Organization = {
  customer_org_id: "org-1",
  alias: "Example",
  created_at: "",
  updated_at: "",
  created_by: "",
  updated_by: "",
  spend: 10,
  default_budgets: [],
  budget_id: "owned",
  budget_is_shared: false,
  budget: {
    max_budget: 100,
    soft_budget: 80,
    budget_duration: "7d",
    tpm_limit: 1000,
    rpm_limit: 10,
    allowed_models: ["configured-model"],
    budget_limits: [{ max_budget: 1000, budget_duration: "12mo" }],
  },
};
const fetchMock = vi.fn<typeof fetch>();
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const writes = () =>
  fetchMock.mock.calls
    .map(([input]) => input)
    .filter((input): input is Request => input instanceof Request && input.method === "PATCH");
const renderSummary = () =>
  render(
    <CustomerBudgetSummary
      entity={{
        id: "org-1",
        label: "Example",
        spend: 10,
        budgetLimit: 100,
        budgetDuration: "7d",
        budgetLimits: [],
        budgetResetAt: null,
      }}
      scope={{ org: "org-1", team: null, member: null }}
      settingsHref="/customers/manage?org=org-1&tab=settings"
    />,
  );

describe("organization budget dialog", () => {
  beforeEach(() => {
    testQueryClient.clear();
    registerBaseUrlGetter(() => "http://localhost");
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const request = input as Request;
      const path = new URL(request.url).pathname;
      if (path.endsWith("/customer_organization_budget_groups"))
        return json({ default_budgets: [{ budget_id: "standard", name: "Standard", max_budget: 500 }] });
      if (path.endsWith("/customer_organizations/org-1")) return json(organization);
      if (path.endsWith("/models")) return json({ data: [{ id: "configured-model", owned_by: "openai" }] });
      throw new Error(`Unexpected request ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("opens from the budget summary and saves custom spend, soft budget, rates and reset period", async () => {
    const user = userEvent.setup();
    renderSummary();
    await user.click(screen.getByRole("button", { name: "Edit budget" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Edit organization budget" }));
    expect(await dialog.findByRole("spinbutton", { name: "Spend limit (USD)" })).toHaveValue(100);
    expect(dialog.getByRole("textbox", { name: "Custom period" })).toHaveValue("7d");
    fireEvent.change(dialog.getByRole("spinbutton", { name: "Spend limit (USD)" }), { target: { value: "200" } });
    fireEvent.change(dialog.getByRole("spinbutton", { name: "Soft budget (USD)" }), { target: { value: "150" } });
    fireEvent.change(dialog.getByRole("spinbutton", { name: "Tokens per minute" }), { target: { value: "2000" } });
    fireEvent.change(dialog.getByRole("spinbutton", { name: "Requests per minute" }), { target: { value: "0" } });
    await chooseSelectOption(user, dialog.getByRole("combobox", { name: "Reset period" }), "/ month");
    await user.click(dialog.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes()).toHaveLength(1);
    expect(new URL(writes()[0].url).pathname).toBe("/management/v1/customer_organizations/org-1");
    expect(await writes()[0].clone().json()).toEqual({
      budget: {
        ...organization.budget,
        max_budget: 200,
        soft_budget: 150,
        budget_duration: "1mo",
        tpm_limit: 2000,
        rpm_limit: 0,
      },
    });
  });

  it("selects an organization preset and submits its ID without custom overrides", async () => {
    const user = userEvent.setup();
    renderSummary();
    await user.click(screen.getByRole("button", { name: "Edit budget" }));
    const source = await screen.findByRole("combobox", { name: "Customer organization limits" });
    await waitFor(() => expect(source).toBeEnabled());
    await chooseSelectOption(user, source, /^Standard/);
    expect(screen.queryByRole("spinbutton", { name: "Spend limit (USD)" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(await writes()[0].clone().json()).toEqual({ budget_id: "standard" });
  });

  it("discards unsaved values on cancel and reopens with the saved budget", async () => {
    const user = userEvent.setup();
    renderSummary();
    await user.click(screen.getByRole("button", { name: "Edit budget" }));
    fireEvent.change(await screen.findByRole("spinbutton", { name: "Spend limit (USD)" }), {
      target: { value: "999" },
    });
    await user.click(screen.getByRole("button", { name: "Cancel", exact: true }));
    expect(writes()).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Edit budget" }));
    expect(await screen.findByRole("spinbutton", { name: "Spend limit (USD)" })).toHaveValue(100);
  });

  it("keeps custom values visible when saving fails", async () => {
    const serve = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) =>
      input instanceof Request && input.method === "PATCH"
        ? json({ detail: "Budget update unavailable" }, 503)
        : serve(input, init),
    );
    const user = userEvent.setup();
    renderSummary();
    await user.click(screen.getByRole("button", { name: "Edit budget" }));
    fireEvent.change(await screen.findByRole("spinbutton", { name: "Spend limit (USD)" }), {
      target: { value: "200" },
    });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Budget update unavailable");
    expect(screen.getByRole("spinbutton", { name: "Spend limit (USD)" })).toHaveValue(200);
    expect(screen.getByRole("dialog", { name: "Edit organization budget" })).toBeInTheDocument();
  });
});
