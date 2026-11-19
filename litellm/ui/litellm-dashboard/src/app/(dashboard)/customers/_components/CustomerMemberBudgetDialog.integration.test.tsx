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
import { customerUsageEntity } from "./customerUsageApi";
import type { Member, Organization } from "./customerHierarchyForms";

vi.mock("@/app/(dashboard)/hooks/models/useModels", () => ({
  useAllProxyModels: () => ({ data: { data: [] }, isLoading: false, isError: false }),
}));

const audit = { created_at: "", updated_at: "", created_by: "", updated_by: "", spend: 10 };
const organization: Organization = {
  ...audit,
  customer_org_id: "org-1",
  default_budgets: [{ budget_id: "standard", name: "Standard", max_budget: 500 }],
};
const override = {
  max_budget: 100,
  budget_duration: "1mo",
  soft_budget: 80,
  tpm_limit: 1000,
  rpm_limit: 10,
  allowed_models: ["configured-model"],
  budget_limits: [
    { max_budget: 1000, budget_duration: "12mo", reset_at: "2027-01-01T00:00:00Z" },
    { max_budget: 30, budget_duration: "7d" },
  ],
};
const member: Member = {
  ...audit,
  customer_member_id: "member-1",
  parent_org_id: "org-1",
  parent_team_ids: ["team-1"],
  alias: "Example member",
  budget_id: "standard",
  budget_override: override,
  budget_override_expires_at: "2027-01-02T04:05:06.000Z",
  effective_budget: override,
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
      entity={customerUsageEntity(member.customer_member_id, member)}
      scope={{ org: "org-1", team: null, member: member.customer_member_id }}
      settingsHref="/customers/manage?org=org-1&member=member-1&tab=settings"
    />,
  );

describe("member budget dialog", () => {
  beforeEach(() => {
    testQueryClient.clear();
    registerBaseUrlGetter(() => "http://localhost");
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const path = new URL((input as Request).url).pathname;
      if (path.endsWith("/customer_organizations/org-1")) return json(organization);
      if (path.endsWith("/customer_members/member-1")) return json(member);
      throw new Error(`Unexpected request ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("saves monthly and yearly overrides while preserving additional limits, models and expiry", async () => {
    const user = userEvent.setup();
    renderSummary();
    await user.click(screen.getByRole("button", { name: "Edit budget", exact: true }));
    const dialog = within(await screen.findByRole("dialog", { name: "Edit member budget", exact: true }));
    expect(await dialog.findByRole("spinbutton", { name: "Monthly budget" })).toHaveValue(100);
    fireEvent.change(dialog.getByRole("spinbutton", { name: "Monthly budget" }), { target: { value: "200" } });
    fireEvent.change(dialog.getByRole("spinbutton", { name: "Yearly budget" }), { target: { value: "2400" } });
    fireEvent.change(dialog.getByRole("spinbutton", { name: "Requests per minute" }), { target: { value: "0" } });
    await user.click(dialog.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes()).toHaveLength(1);
    expect(new URL(writes()[0].url).pathname).toBe("/management/v1/customer_members/member-1");
    expect(await writes()[0].clone().json()).toEqual({
      budget_override: {
        ...override,
        max_budget: 200,
        rpm_limit: 0,
        budget_limits: [{ ...override.budget_limits[0], max_budget: 2400 }, override.budget_limits[1]],
      },
      budget_override_expires_at: member.budget_override_expires_at,
    });
  });

  it("selects a preset and removes the custom override and its expiry", async () => {
    const user = userEvent.setup();
    renderSummary();
    await user.click(screen.getByRole("button", { name: "Edit budget", exact: true }));
    const source = await screen.findByRole("combobox", { name: "Member limits" });
    await chooseSelectOption(user, source, /^Standard/);
    expect(screen.queryByRole("spinbutton", { name: "Monthly budget" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(await writes()[0].clone().json()).toEqual({
      budget_id: "standard",
      budget_override: null,
      budget_override_expires_at: null,
    });
  });

  it("adds a rate-only override without replacing the member's inherited spend period", async () => {
    const inheritedMember = { ...member, budget_override: null, budget_override_expires_at: null };
    fetchMock.mockImplementation(async (input) =>
      json(
        new URL((input as Request).url).pathname.endsWith("/customer_members/member-1")
          ? inheritedMember
          : organization,
      ),
    );
    const user = userEvent.setup();
    renderSummary();
    await user.click(screen.getByRole("button", { name: "Edit budget", exact: true }));
    await chooseSelectOption(
      user,
      await screen.findByRole("combobox", { name: "Member limits" }),
      "Enter custom limits instead",
    );
    fireEvent.change(screen.getByRole("spinbutton", { name: "Tokens per minute" }), { target: { value: "2000" } });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(await writes()[0].clone().json()).toEqual({
      budget_override: {
        max_budget: null,
        soft_budget: null,
        budget_duration: null,
        budget_limits: null,
        tpm_limit: 2000,
        rpm_limit: null,
        allowed_models: null,
      },
      budget_override_expires_at: null,
    });
  });

  it("discards a cancelled draft and retains unsaved values after a failed save", async () => {
    const serve = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) =>
      input instanceof Request && input.method === "PATCH"
        ? json({ detail: "Member budget unavailable" }, 503)
        : serve(input, init),
    );
    const user = userEvent.setup();
    renderSummary();
    await user.click(screen.getByRole("button", { name: "Edit budget", exact: true }));
    fireEvent.change(await screen.findByRole("spinbutton", { name: "Monthly budget" }), { target: { value: "999" } });
    await user.click(screen.getByRole("button", { name: "Cancel", exact: true }));
    expect(writes()).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Edit budget", exact: true }));
    expect(await screen.findByRole("spinbutton", { name: "Monthly budget" })).toHaveValue(100);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Monthly budget" }), { target: { value: "200" } });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Member budget unavailable");
    expect(screen.getByRole("spinbutton", { name: "Monthly budget" })).toHaveValue(200);
  });
});
