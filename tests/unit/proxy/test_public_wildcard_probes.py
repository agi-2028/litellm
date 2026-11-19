from typing import Final

import litellm
from litellm.proxy.health_check_utils.public_wildcard_probes import public_wildcard_probes

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


def _hub_router() -> litellm.Router:
    return litellm.Router(model_list=[dict(deployment) for deployment in HUB_MODEL_LIST])


def _probe_rows(router: litellm.Router, checked: tuple[dict[str, object], ...]) -> list[tuple[object, ...]]:
    probes: Final = public_wildcard_probes(router, PUBLIC_NAMES, checked)
    return sorted(
        (
            deployment["model_name"],
            deployment["litellm_params"]["model"],
            deployment["model_info"].get("health_check_model"),
            deployment["model_info"].get("mode"),
            probes.public_name_by_probe_id[deployment["model_info"]["id"]],
            probes.is_probe({"model_id": deployment["model_info"]["id"]}),
        )
        for deployment in probes.deployments
    )


def test_each_public_model_only_a_wildcard_serves_gets_a_probe_of_that_model() -> None:
    router: Final = _hub_router()

    assert _probe_rows(router, HUB_MODEL_LIST) == [
        ("open/gpt-6.1-terra", "openai/gpt-6.1-terra", None, None, "open/gpt-6.1-terra", True),
        ("openai/gpt-6-luna", "openai/gpt-6-luna", None, "chat", "openai/gpt-6-luna", True),
        ("openai/gpt-6.1-terra", "openai/gpt-6.1-terra", None, "chat", "openai/gpt-6.1-terra", True),
    ]


def test_a_wildcard_the_cycle_does_not_check_gets_no_probes() -> None:
    router: Final = _hub_router()
    checked: Final = tuple(deployment for deployment in HUB_MODEL_LIST if deployment["model_name"] != "open/*")

    assert [row[0] for row in _probe_rows(router, checked)] == ["openai/gpt-6-luna", "openai/gpt-6.1-terra"]

