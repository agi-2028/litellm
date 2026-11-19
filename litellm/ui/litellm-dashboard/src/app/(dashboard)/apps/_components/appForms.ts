import type { components } from "@/lib/http/schema";

export type App = components["schemas"]["App"];
export type Budget = components["schemas"]["Budget"];
export type AppOrganization = components["schemas"]["AppOrganization"];
export type AppMember = components["schemas"]["AppMember"];
export type AppResourceType = components["schemas"]["AppResourceType"];
export type AppResource = components["schemas"]["AppResource"];
export const APP_RESOURCE_LABELS = {
  team: "apps.resourceTypes.team",
  project: "apps.resourceTypes.project",
  virtual_key: "apps.resourceTypes.virtual_key",
} as const satisfies Record<AppResourceType, string>;

const MAX_SURCHARGE_PERCENT = 1000;

export const appSurchargeField = (margin?: number | null): string =>
  margin === null || margin === undefined ? "" : String(Number((margin * 100).toFixed(6)));

export const appSurchargeValue = (text: string): { ok: true; value: number | null } | { ok: false } => {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, value: null };
  const percent = Number(trimmed);
  if (!Number.isFinite(percent) || percent < 0 || percent > MAX_SURCHARGE_PERCENT) return { ok: false };
  return { ok: true, value: Number((percent / 100).toFixed(8)) };
};
