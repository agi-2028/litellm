import { backgroundFetchClient, fetchClient } from "@/lib/http/api";
import { ApiError } from "@/lib/http/client";
import type { CreatedCustomerHierarchyEntity, CustomerHierarchyCreate, Team } from "./customerHierarchyForms";

async function defaultCustomerTeam(organizationId: string): Promise<Team | null> {
  const teamId = `${organizationId}:default`;
  const getTeam = async () => {
    const result = await backgroundFetchClient.GET("/management/v1/customer_teams/{customer_team_id}", {
      params: { path: { customer_team_id: teamId } },
    });
    return result.data?.parent_org_id === organizationId ? result.data : null;
  };
  try {
    return await getTeam();
  } catch (cause) {
    if (!(cause instanceof ApiError) || cause.status !== 404) throw cause;
  }
  try {
    const result = await backgroundFetchClient.POST("/management/v1/customer_teams", {
      body: { customer_team_id: teamId, parent_org_id: organizationId, alias: "default" },
    });
    return result.response.status === 201 && result.data?.parent_org_id === organizationId ? result.data : null;
  } catch (cause) {
    if (!(cause instanceof ApiError) || cause.status !== 409) throw cause;
    return getTeam();
  }
}

export async function createCustomerHierarchyEntity(
  create: CustomerHierarchyCreate,
): Promise<CreatedCustomerHierarchyEntity | null> {
  if (create.kind === "team") {
    const result = await fetchClient.POST("/management/v1/customer_teams", { body: create.body });
    if (result.response.status !== 201 || !result.data) return null;
    return { kind: "team", record: result.data };
  }
  if (create.defaultTeamOrganizationId && !(await defaultCustomerTeam(create.defaultTeamOrganizationId))) return null;
  const result = await fetchClient.POST("/management/v1/customer_members", { body: create.body });
  if (result.response.status !== 201 || !result.data) return null;
  return { kind: "member", record: result.data };
}
