from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from itertools import chain
from types import MappingProxyType
from typing import TYPE_CHECKING, Final

from pydantic import TypeAdapter
from typing_extensions import ReadOnly, TypedDict

from litellm.proxy.health_check import resolve_health_check_mode

if TYPE_CHECKING:
    from litellm.router import Router

_PROBE_ID_PREFIX: Final = "public-wildcard-probe:"


class _WildcardDeployment(TypedDict):
    litellm_params: ReadOnly[Mapping[str, object]]
    model_info: ReadOnly[Mapping[str, object]]


_WILDCARD_DEPLOYMENT: Final = TypeAdapter(_WildcardDeployment)
_MODEL_INFO: Final = TypeAdapter(Mapping[str, object])


@dataclass(frozen=True, slots=True)
class _Probe:
    probe_id: str
    public_name: str
    deployment: Mapping[str, object]


@dataclass(frozen=True, slots=True)
class PublicWildcardProbes:
    deployments: tuple[Mapping[str, object], ...]
    public_name_by_probe_id: Mapping[str, str]

    @staticmethod
    def is_probe(endpoint: Mapping[str, object]) -> bool:
        model_id: Final = endpoint.get("model_id")
        return isinstance(model_id, str) and model_id.startswith(_PROBE_ID_PREFIX)


def _deployment_id(deployment: Mapping[str, object]) -> str | None:
    info: Final = deployment.get("model_info")
    ident: Final = _MODEL_INFO.validate_python(info).get("id") if isinstance(info, Mapping) else None
    return str(ident) if ident else None


def _probe(
    public_name: str, served: _WildcardDeployment, wildcard: _WildcardDeployment, source_id: str
) -> _Probe | None:
    served_model: Final = served["litellm_params"].get("model")
    if not isinstance(served_model, str):
        return None
    probe_id: Final = f"{_PROBE_ID_PREFIX}{source_id}:{public_name}"
    mode: Final = resolve_health_check_mode(wildcard["model_info"], served["litellm_params"])
    return _Probe(
        probe_id=probe_id,
        public_name=public_name,
        deployment={
            "model_name": public_name,
            "litellm_params": dict(wildcard["litellm_params"]),
            "model_info": {
                **wildcard["model_info"],
                **({"mode": mode} if mode is not None else {}),
                "health_check_model": served_model,
                "id": probe_id,
            },
        },
    )


def _probes_for(
    router: "Router", public_name: str, checked_by_id: Mapping[str, Mapping[str, object]]
) -> tuple[_Probe, ...]:
    registry: Final = router.registry()
    routed_name: Final = registry.resolve(public_name, kind="group")
    if registry.deployments(routed_name, source="named"):
        return ()
    served_copies: Final = tuple(
        _WILDCARD_DEPLOYMENT.validate_python(entry) for entry in registry.deployments(routed_name, source="wildcard")
    )
    candidates: Final = (
        _probe(public_name, served, _WILDCARD_DEPLOYMENT.validate_python(checked_by_id[source_id]), source_id)
        for served in served_copies
        if (source_id := _deployment_id(served)) is not None and source_id in checked_by_id
    )
    return tuple(probe for probe in candidates if probe is not None)


def public_wildcard_probes(
    router: "Router | None",
    public_model_groups: Iterable[str] | None,
    checked_deployments: Sequence[Mapping[str, object]],
) -> PublicWildcardProbes:
    if router is None or not public_model_groups:
        return PublicWildcardProbes(deployments=(), public_name_by_probe_id=MappingProxyType({}))
    checked_by_id: Final = MappingProxyType(
        {ident: deployment for deployment in checked_deployments if (ident := _deployment_id(deployment))}
    )
    probes: Final = tuple(
        chain.from_iterable(_probes_for(router, name, checked_by_id) for name in sorted(frozenset(public_model_groups)))
    )
    return PublicWildcardProbes(
        deployments=tuple(probe.deployment for probe in probes),
        public_name_by_probe_id=MappingProxyType({probe.probe_id: probe.public_name for probe in probes}),
    )
