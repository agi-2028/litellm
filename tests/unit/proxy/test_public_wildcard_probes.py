from collections.abc import Mapping
from typing import Final

import pytest

import litellm
from litellm.proxy import health_check as hc_module
from litellm.proxy.health_check import resolve_health_check_mode, update_litellm_params_for_health_check
from litellm.proxy.health_check_utils.public_wildcard_probes import PublicWildcardProbes, public_wildcard_probes

PUBLIC_NAMES: Final = ("gpt-6.2-sol", "openai/gpt-6.1-terra", "open/gpt-6.1-terra", "openai/gpt-6-luna")


HUB_MODEL_LIST: Final = (
    {
        "model_name": "gpt-6.2-sol",
        "litellm_params": {"model": "openai/gpt-6.2-sol", "api_key": "sk-test"},
        "model_info": {"id": "sol-id"},
    },
    {
        "model_name": "openai/*",
        "litellm_params": {"model": "openai/*", "api_key": "sk-test"},
        "model_info": {"id": "openai-wildcard-id", "health_check_model": "openai/gpt-6-luna", "mode": "chat"},
    },
    {
        "model_name": "open/*",
        "litellm_params": {"model": "openai/*", "api_key": "sk-test"},
        "model_info": {"id": "open-wildcard-id", "health_check_model": "openai/gpt-6-luna"},
    },
)


def _hub_router(model_group_alias: Mapping[str, str] | None = None) -> litellm.Router:
    return litellm.Router(
        model_list=[dict(deployment) for deployment in HUB_MODEL_LIST],
        model_group_alias=dict(model_group_alias or {}),
    )


def _probe_rows(
    router: litellm.Router,
    checked: tuple[dict[str, object], ...],
    public_names: tuple[str, ...] = PUBLIC_NAMES,
) -> list[tuple[object, ...]]:
    probes: Final = public_wildcard_probes(router, public_names, checked)
    return sorted(
        (
            deployment["model_name"],
            deployment["model_info"]["health_check_model"],
            probes.public_name_by_probe_id[deployment["model_info"]["id"]],
            probes.is_probe({"model_id": deployment["model_info"]["id"]}),
        )
        for deployment in probes.deployments
    )


def test_each_public_model_only_a_wildcard_serves_gets_a_probe_of_that_model() -> None:
    router: Final = _hub_router()

    assert _probe_rows(router, HUB_MODEL_LIST) == [
        ("open/gpt-6.1-terra", "openai/gpt-6.1-terra", "open/gpt-6.1-terra", True),
        ("openai/gpt-6-luna", "openai/gpt-6-luna", "openai/gpt-6-luna", True),
        ("openai/gpt-6.1-terra", "openai/gpt-6.1-terra", "openai/gpt-6.1-terra", True),
    ]


def test_a_wildcard_the_cycle_does_not_check_gets_no_probes() -> None:
    router: Final = _hub_router()
    checked: Final = tuple(deployment for deployment in HUB_MODEL_LIST if deployment["model_name"] != "open/*")

    assert [row[0] for row in _probe_rows(router, checked)] == ["openai/gpt-6-luna", "openai/gpt-6.1-terra"]


def test_a_public_alias_is_probed_where_requests_for_it_route() -> None:
    router: Final = _hub_router({"openai/fast-qa": "gpt-6.2-sol", "openai/terra-qa": "open/gpt-6.1-terra"})

    assert _probe_rows(router, HUB_MODEL_LIST, ("openai/fast-qa", "openai/terra-qa")) == [
        ("openai/terra-qa", "openai/gpt-6.1-terra", "openai/terra-qa", True),
    ]


def test_a_probe_sends_the_request_its_wildcard_health_check_would_send(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(hc_module, "BACKGROUND_HEALTH_CHECK_MAX_TOKENS", None)
    monkeypatch.setattr(hc_module, "BACKGROUND_HEALTH_CHECK_MAX_TOKENS_REASONING", None)
    probes: Final = public_wildcard_probes(_hub_router(), ("openai/gpt-6-luna",), HUB_MODEL_LIST)
    [probe] = probes.deployments
    wildcard: Final = HUB_MODEL_LIST[1]

    sent: Final = update_litellm_params_for_health_check(
        dict(probe["model_info"]), dict(probe["litellm_params"]), deployment_model=None
    )
    wildcard_sent: Final = update_litellm_params_for_health_check(
        dict(wildcard["model_info"]), dict(wildcard["litellm_params"]), deployment_model=None
    )

    assert {key: value for key, value in sent.items() if key != "messages"} == {
        key: value for key, value in wildcard_sent.items() if key != "messages"
    }


def test_a_probe_is_checked_in_the_mode_of_the_model_it_serves() -> None:
    router: Final = _hub_router()
    served_model: Final = "openai/text-embedding-3-small"
    probes: Final = public_wildcard_probes(router, ("open/text-embedding-3-small",), HUB_MODEL_LIST)
    [probe] = probes.deployments

    assert resolve_health_check_mode(probe["model_info"], probe["litellm_params"]) == resolve_health_check_mode(
        {}, {"model": served_model}
    )


def test_a_probe_endpoint_from_another_pod_is_still_recognized_as_a_probe() -> None:
    no_probes_here: Final = public_wildcard_probes(_hub_router(), (), HUB_MODEL_LIST)
    other_pod_probes: Final = public_wildcard_probes(_hub_router(), PUBLIC_NAMES, HUB_MODEL_LIST)

    assert [no_probes_here.is_probe({"model_id": probe_id}) for probe_id in other_pod_probes.public_name_by_probe_id] == [
        True,
        True,
        True,
    ]
    assert PublicWildcardProbes.is_probe({"model_id": "sol-id"}) is False
