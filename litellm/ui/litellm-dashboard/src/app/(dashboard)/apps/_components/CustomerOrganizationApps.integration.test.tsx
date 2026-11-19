import { chooseAppOption } from "./appTestUtils";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { registerBaseUrlGetter } from "@/lib/http/runtime";
import { uiHref } from "@/utils/uiHref";
import {
  jsonResponse as json,
  renderWithProviders as render,
  screen,
  fireEvent,
  act,
  waitFor,
  within,
  testQueryClient,
} from "../../../../../tests/test-utils";
import CustomerOrganizationApps from "./CustomerOrganizationApps";

const resource = { resource_type: "team", resource_id: "team-chat", alias: "chat", app_id: null };
const app = {
  ...resource,
  app_id: "app-chat",
  spend: 0,
  created_at: "",
  updated_at: "",
  created_by: "",
  updated_by: "",
};
const assignedBudget = {
  app_id: app.app_id,
  customer_org_id: "org-1",
  tier_budget_id: "standard",
  spend: 5,
  effective_budget: {
    budget_limits: [
      { budget_duration: "1mo", max_budget: 100 },
      { budget_duration: "12mo", max_budget: 1000 },
    ],
  },
};
const fetchMock = vi.fn<typeof fetch>();
let configured: boolean;
let bound: boolean;
let assigned: boolean;
let requests: Request[];
let associationStatus: number;
let customAssociation: object | null;

beforeEach(() => {
  configured = true;
  bound = false;
  assigned = false;
  associationStatus = 404;
  customAssociation = null;
  requests = [];
  testQueryClient.clear();
  registerBaseUrlGetter(() => "http://localhost");
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const request = new Request(input);
    requests.push(request.clone());
    const path = new URL(request.url).pathname;
    if (path.includes("/daily/activity")) return json({ results: [], metadata: { has_more: false, total_pages: 1 } });
    if (path.endsWith("/apps/definition")) return json({ resource_type: configured ? "team" : null });
    if (path.endsWith("/apps/resources"))
      return json([
        { ...resource, app_id: bound ? app.app_id : null },
        { ...resource, resource_id: "team-search", alias: "search", app_id: null },
      ]);
    if (path.endsWith("/apps")) {
      if (request.method === "POST") {
        bound = true;
        return json(app);
      }
      return json(bound ? [app] : []);
    }
    if (path.endsWith("/customer_organization_budget_groups"))
      return json({
        default_budgets: [
          { budget_id: "org-standard", name: "Standard", max_budget: 1000 },
          { budget_id: "org-enterprise", name: "Enterprise", max_budget: 5000 },
        ],
      });
    if (path.endsWith("/app_customer_organization_budget_groups"))
      return json({
        default_budgets: [{ budget_id: "standard", name: "Tier 1", max_budget: 100 }],
        revision: "a".repeat(64),
      });
    if (request.method === "PUT") {
      assigned = true;
      return json({ app_id: app.app_id, customer_org_id: "org-1", spend: 0 });
    }
    if (path.endsWith("/customer_organizations/org-1"))
      return assigned
        ? json(customAssociation ?? assignedBudget)
        : json({ detail: "Association unavailable" }, associationStatus);
    if (path.endsWith("/models")) return json({ data: [] });
    throw new Error(`Unexpected request ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("customer app budgets", () => {
  it("shows current-month app tokens and share of the entire customer spend in the compact table", async () => {
    bound = true;
    assigned = true;
    const serve = fetchMock.getMockImplementation()!;
    const usageRequests: URL[] = [];
    let totalAvailable = false;
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(new Request(input, init).url);
      if (!url.pathname.includes("/daily/activity")) return serve(input, init);
      usageRequests.push(url);
      if (url.pathname.endsWith("/aggregated") && !totalAvailable)
        return json({ detail: "Organization total unavailable" }, 503);
      const appScoped = url.searchParams.get("app_id") === app.app_id;
      const metrics = {
        spend: appScoped ? 20 : 100,
        total_tokens: 1500,
        prompt_tokens: 1000,
        completion_tokens: 500,
        api_requests: 3,
      };
      return json({
        results: [
          { date: url.searchParams.get("start_date"), metrics, breakdown: { entities: { "org-1": { metrics } } } },
        ],
        metadata: { has_more: false, total_pages: 1, total_spend: metrics.spend },
      });
    });
    const user = userEvent.setup();
    render(<CustomerOrganizationApps organizationId="org-1" />);
    const table = within(await screen.findByRole("table", { name: "App budgets" }));
    const tokens = await table.findByRole("button", { name: "1,500 total tokens. View breakdown" });
    expect(table.getByRole("columnheader", { name: "Budget & usage" })).toBeInTheDocument();
    expect(table.getByRole("columnheader", { name: "Tokens" })).toBeInTheDocument();
    const retry = await table.findByRole("button", { name: /Retry/ });
    expect(retry).toHaveAttribute("title", "Organization total unavailable");
    expect(tokens).toHaveTextContent("1.5K");
    totalAvailable = true;
    await user.click(retry);
    expect(await table.findByText("20%")).toBeInTheDocument();
    expect(table.getByRole("meter", { name: "Share of customer spend" })).toHaveAttribute("aria-valuenow", "20");
    expect(
      usageRequests.every(
        (url) => (url.searchParams.get("customer_org_ids") ?? url.searchParams.get("customer_org_id")) === "org-1",
      ),
    ).toBe(true);
    expect(usageRequests.filter((url) => url.searchParams.get("app_id") === app.app_id)).toHaveLength(1);
    const monthlyTotal = usageRequests.find((url) => url.pathname.endsWith("/aggregated"));
    expect(monthlyTotal?.searchParams.has("app_id")).toBe(false);
    expect(
      usageRequests.some(
        (url) =>
          url.searchParams.get("app_id") === app.app_id &&
          url.searchParams.get("start_date") === monthlyTotal?.searchParams.get("start_date") &&
          url.searchParams.get("end_date") === monthlyTotal?.searchParams.get("end_date"),
      ),
    ).toBe(true);
    await user.click(tokens);
    expect(await screen.findByText("Input tokens")).toBeInTheDocument();
    expect(screen.getByText("1,000")).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
  });

  it.each(["loading", "error"] as const)("keeps a legacy assignment while the catalog is %s", async (status) => {
    bound = true;
    assigned = true;
    const serve = fetchMock.getMockImplementation()!;
    let legacyAvailable = false;
    const { promise, resolve } = Promise.withResolvers<void>();
    fetchMock.mockImplementation(async (input, init) => {
      const request = input as Request;
      const path = new URL(request.url).pathname;
      if (request.method === "GET" && path.endsWith("/customer_organizations/org-1"))
        return json({ ...assignedBudget, tier_budget_id: "org-standard" });
      if (path === "/management/v1/customer_organization_budget_groups") {
        if (status === "loading") await promise;
        if (status === "error" && !legacyAvailable) return json({ detail: "Legacy catalog unavailable" }, 503);
      }
      return serve(input, init);
    });
    const user = userEvent.setup();
    render(<CustomerOrganizationApps organizationId="org-1" />);
    await user.click(await screen.findByRole("button", { name: "Edit budget for chat" }));
    if (status === "error") expect(await screen.findByText("Legacy catalog unavailable")).toBeInTheDocument();
    const source = await screen.findByRole("combobox", { name: "Budget source" });
    const save = screen.getByRole("button", { name: "Save app budget" });
    expect(source).toBeDisabled();
    expect(save).toBeDisabled();
    if (status === "loading") await act(async () => resolve());
    else {
      legacyAvailable = true;
      await user.click(screen.getByRole("button", { name: "Retry" }));
    }
    await waitFor(() => expect(source).toHaveTextContent("Standard"));
    if (status === "loading") {
      await user.click(source);
      expect(await screen.findByRole("option", { name: /^Tier 1/ })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: /^Enterprise/ })).not.toBeInTheDocument();
      await user.click(screen.getByRole("option", { name: /^Standard/ }));
    }
    await user.click(save);
    await waitFor(() => expect(requests.some((request) => request.method === "PUT")).toBe(true));
    expect(await requests.find((request) => request.method === "PUT")!.json()).toEqual({
      budget_id: "org-standard",
      customer_member_budget: null,
    });
  });

  it("should show recorded period usage separately from cumulative spend", async () => {
    bound = true;
    assigned = true;
    const usage = [
      { source: "window", budget_duration: "1mo", max_budget: 100, spend: 7, reset_at: "2026-12-01T00:00:00Z" },
      { source: "window", budget_duration: "12mo", max_budget: 1000, spend: 12, reset_at: "2027-01-01T00:00:00Z" },
    ];
    const serve = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      const request = input as Request;
      if (new URL(request.url).pathname.endsWith("/customer_organizations/org-1"))
        return json({ ...assignedBudget, spend: 500, budget_usage: usage });
      return serve(input, init);
    });
    render(<CustomerOrganizationApps organizationId="org-1" />);
    await screen.findByRole("button", { name: "Edit budget for chat" });
    const table = within(screen.getByRole("table", { name: "App budgets" }));
    expect(table.queryByText("$500.00")).not.toBeInTheDocument();
    expect(table.queryByRole("columnheader", { name: "Tracked spend (USD)" })).not.toBeInTheDocument();
    expect(table.getByText("$7.00 of $100.00 used")).toBeInTheDocument();
    const monthlyProgress = table.getByRole("progressbar", { name: "App budget used" });
    expect(Number(monthlyProgress.getAttribute("aria-valuenow"))).toBeCloseTo(7);
    expect(table.queryByText("$12.00 / $1,000.00")).not.toBeInTheDocument();
    expect(table.getByRole("button", { name: "Budget details" })).toBeInTheDocument();
    expect(table.getByText("$93.00 remaining")).toBeInTheDocument();
  });
  it("should summarize the monthly group limit with additional limits in details", async () => {
    bound = true;
    assigned = true;
    render(<CustomerOrganizationApps organizationId="org-1" />);
    await screen.findByRole("button", { name: "Edit budget for chat" });
    const table = within(screen.getByRole("table", { name: "App budgets" }));
    expect(await table.findByRole("cell", { name: "Tier 1", exact: true })).toBeInTheDocument();
    expect(table.getByText("$100.00")).toBeInTheDocument();
    expect(table.queryByText("$1,000.00")).not.toBeInTheDocument();
    expect(table.getByRole("button", { name: "Budget details" })).toBeInTheDocument();
    expect(table.queryByText("No spend limit")).not.toBeInTheDocument();
  });
  it("should route Add app budget to Gateway setup when the app definition is unset", async () => {
    configured = false;
    render(<CustomerOrganizationApps organizationId="org-1" />);
    expect(await screen.findByText(/Define what an app is in your Gateway/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add app budget" })).toHaveAttribute("href", uiHref("apps"));
    expect(requests.every((request) => request.method === "GET")).toBe(true);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("should select an existing resource and assign a shared profile with a customer-specific member default", async () => {
    const user = userEvent.setup();
    render(<CustomerOrganizationApps organizationId="org-1" organizationAlias="Customer Y" />);
    await user.click(await screen.findByRole("button", { name: "Add app budget" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Add app budget" }));
    await chooseAppOption(user, dialog.getByRole("combobox", { name: "Select an app" }), "chat");
    expect(dialog.getByRole("textbox", { name: "Customer organization" })).toHaveValue("Customer Y");
    await user.click(screen.getByRole("combobox", { name: "Budget source" }));
    expect(await screen.findByRole("option", { name: /^Tier 1/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /^Standard/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: /^Tier 1/ }));
    const member = within(screen.getByRole("region", { name: "Per-member limits (optional)" }));
    await user.click(member.getByRole("switch", { name: "Set per-member limits" }));
    act(() => {
      fireEvent.change(member.getByRole("spinbutton", { name: "Monthly budget" }), { target: { value: "20" } });
      fireEvent.change(member.getByRole("spinbutton", { name: "Yearly budget" }), { target: { value: "200" } });
      fireEvent.change(member.getByRole("spinbutton", { name: "Tokens per minute" }), { target: { value: "30000" } });
      fireEvent.change(member.getByRole("spinbutton", { name: "Requests per minute" }), { target: { value: "60" } });
    });
    await user.click(screen.getByRole("button", { name: "Save app budget" }));
    await waitFor(() => expect(requests.some((request) => request.method === "PUT")).toBe(true));
    const mutations = requests.filter((request) => request.method !== "GET");
    expect(mutations.map((request) => request.method)).toEqual(["POST", "PUT"]);
    expect(await mutations[0].json()).toEqual({ resource_id: "team-chat", resource_type: "team" });
    expect(new URL(mutations[1].url).pathname).toBe("/management/v1/apps/app-chat/customer_organizations/org-1");
    expect(await mutations[1].json()).toMatchObject({
      budget_id: "standard",
      customer_member_budget: {
        max_budget: 20,
        budget_duration: "1mo",
        budget_limits: [{ budget_duration: "12mo", max_budget: 200 }],
        tpm_limit: 30000,
        rpm_limit: 60,
      },
    });
    expect(await screen.findByRole("button", { name: "Edit budget for chat" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("should edit in a modal and start a fresh selection after canceling", async () => {
    bound = true;
    assigned = true;
    const user = userEvent.setup();
    render(<CustomerOrganizationApps organizationId="org-1" organizationAlias="Customer Y" />);
    await user.click(await screen.findByRole("button", { name: "Edit budget for chat" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Budget for chat" }));
    expect(dialog.getByRole("textbox", { name: "Customer organization" })).toHaveValue("Customer Y");
    expect(dialog.getByRole("textbox", { name: "App", exact: true })).toHaveValue("chat");
    expect(dialog.getByRole("combobox", { name: "Budget source" })).toHaveTextContent("Tier 1");
    await user.click(dialog.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Add app budget" }));
    const fresh = within(await screen.findByRole("dialog", { name: "Add app budget" }));
    expect(fresh.getByRole("combobox", { name: "Select an app" })).toHaveValue("");
    expect(fresh.getByRole("textbox", { name: "Customer organization" })).toHaveValue("Customer Y");
    expect(requests.every((request) => request.method === "GET")).toBe(true);
  });

  it("should save a custom budget without creating a tier or changing the global customer budget", async () => {
    const user = userEvent.setup();
    render(<CustomerOrganizationApps organizationId="org-1" />);
    await user.click(await screen.findByRole("button", { name: "Add app budget" }));
    await chooseAppOption(user, await screen.findByRole("combobox", { name: "Select an app" }), "search");
    await user.click(screen.getByRole("combobox", { name: "Budget source" }));
    await user.click(screen.getByRole("option", { name: "Enter custom limits instead" }));
    act(() => {
      fireEvent.change(screen.getByRole("spinbutton", { name: "Monthly budget" }), { target: { value: "100" } });
      fireEvent.change(screen.getByRole("spinbutton", { name: "Yearly budget" }), { target: { value: "1000" } });
      fireEvent.change(screen.getByRole("spinbutton", { name: "Tokens per minute" }), { target: { value: "50000" } });
      fireEvent.change(screen.getByRole("spinbutton", { name: "Requests per minute" }), { target: { value: "120" } });
    });

    expect(screen.getByRole("switch", { name: "Set per-member limits" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save app budget" }));
    await waitFor(() => expect(requests.some((request) => request.method === "PUT")).toBe(true));
    expect(await requests.find((request) => request.method === "PUT")!.json()).toMatchObject({
      budget: {
        max_budget: 100,
        budget_duration: "1mo",
        budget_limits: [{ budget_duration: "12mo", max_budget: 1000 }],
        tpm_limit: 50000,
        rpm_limit: 120,
      },
      customer_member_budget: null,
    });
    expect(requests.some((request) => request.method === "PATCH")).toBe(false);
  });

  it("clears custom and member overrides when switching to a preset and disabling per-member limits", async () => {
    bound = true;
    assigned = true;
    const serve = fetchMock.getMockImplementation()!;
    const customBudget = {
      ...assignedBudget,
      tier_budget_id: null,
      budget_override_id: "custom-budget",
      budget_override: assignedBudget.effective_budget,
      customer_member_budget_id: "member-budget",
      effective_customer_member_budget: { max_budget: 20, budget_duration: "1mo", rpm_limit: 60 },
    };
    fetchMock.mockImplementation(async (input, init) => {
      const request = input as Request;
      if (request.method === "GET" && new URL(request.url).pathname.endsWith("/customer_organizations/org-1"))
        return json(customBudget);
      return serve(input, init);
    });
    const user = userEvent.setup();
    render(<CustomerOrganizationApps organizationId="org-1" />);
    await user.click(await screen.findByRole("button", { name: "Edit budget for chat" }));
    const limits = within(screen.getByRole("region", { name: "Budget source" }));
    expect(limits.getByRole("spinbutton", { name: "Monthly budget" })).toHaveValue(100);
    expect(limits.getByRole("spinbutton", { name: "Yearly budget" })).toHaveValue(1000);
    const member = within(screen.getByRole("region", { name: "Per-member limits (optional)" }));
    expect(member.getByRole("switch", { name: "Set per-member limits" })).toBeChecked();
    expect(member.getByRole("spinbutton", { name: "Monthly budget" })).toHaveValue(20);
    await user.click(limits.getByRole("combobox", { name: "Budget source" }));
    await user.click(await screen.findByRole("option", { name: /^Tier 1/ }));
    await user.click(member.getByRole("switch", { name: "Set per-member limits" }));
    expect(screen.queryByRole("spinbutton", { name: "Monthly budget" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save app budget" }));
    await waitFor(() => expect(requests.some((request) => request.method === "PUT")).toBe(true));
    expect(await requests.find((request) => request.method === "PUT")!.json()).toEqual({
      budget_id: "standard",
      budget_override: null,
      customer_member_budget: null,
    });
  });

  it.each(["custom", "legacy", "temporary"])(
    "should save a private org budget and preserve temporary overrides %s",
    async (source) => {
      bound = true;
      assigned = true;
      const legacy = source === "legacy";
      const temporary = source === "temporary";
      customAssociation = {
        ...assignedBudget,
        budget_id: legacy ? null : "private",
        budget: legacy ? null : { max_budget: 5, budget_duration: "1mo" },
        budget_override: legacy || temporary ? { max_budget: legacy ? 5 : 20, budget_duration: "1mo" } : null,
        budget_override_id: legacy || temporary ? "override" : null,
        budget_override_expires_at: temporary ? "2027-01-01T00:00:00Z" : null,
      };
      const user = userEvent.setup();
      render(<CustomerOrganizationApps organizationId="org-1" />);
      await user.click(await screen.findByRole("button", { name: "Edit budget for chat" }));
      expect(screen.getByRole("spinbutton", { name: "Monthly budget" })).toHaveValue(5);
      fireEvent.change(screen.getByRole("spinbutton", { name: "Monthly budget" }), { target: { value: "7" } });
      await user.click(screen.getByRole("button", { name: "Save app budget" }));
      await waitFor(() => expect(requests.some((request) => request.method === "PUT")).toBe(true));
      expect(await requests.find((request) => request.method === "PUT")!.json()).toEqual({
        budget: {
          max_budget: 7,
          soft_budget: null,
          tpm_limit: null,
          rpm_limit: null,
          budget_duration: "1mo",
          allowed_models: null,
          budget_limits: null,
        },
        customer_member_budget: null,
        ...(legacy ? { budget_override: null } : {}),
      });
    },
  );

  it("should keep association read failures visible instead of overwriting an unknown budget", async () => {
    bound = true;
    associationStatus = 503;
    const user = userEvent.setup();
    render(<CustomerOrganizationApps organizationId="org-1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Association unavailable");
    await user.click(screen.getByRole("button", { name: "Add app budget" }));
    await chooseAppOption(user, await screen.findByRole("combobox", { name: "Select an app" }), "chat");
    expect(screen.queryByRole("button", { name: "Save app budget" })).not.toBeInTheDocument();
    expect(requests.every((request) => request.method === "GET")).toBe(true);
  });
});
