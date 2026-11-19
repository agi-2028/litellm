import { useTranslation } from "react-i18next";
import { $api } from "@/lib/http/api";
import { ErrorState } from "@/components/shared/ErrorState";
import CustomerLimitsFields, { type CustomerLimits } from "./CustomerLimitsFields";

const limitsIdPrefix = "cc";

export default function CreateCustomerOrganizationLimits(props: {
  fields: CustomerLimits;
  disabled: boolean;
  onChange: (patch: Partial<CustomerLimits>) => void;
}) {
  const { t } = useTranslation();
  const groups = $api.useQuery("get", "/management/v1/customer_organization_budget_groups", {});
  return (
    <>
      <CustomerLimitsFields
        {...props}
        profiles={groups.data?.default_budgets ?? []}
        title={t("customerPortal.createDialog.organizationLimits")}
        description={t("customerPortal.createDialog.organizationLimitsHelp")}
        idPrefix={limitsIdPrefix}
        loading={groups.isPending}
      />
      {groups.isError && <ErrorState onRetry={() => void groups.refetch()} />}
    </>
  );
}
