from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from itertools import chain
from types import MappingProxyType
from typing import TYPE_CHECKING, Final

from pydantic import TypeAdapter
from typing_extensions import ReadOnly, TypedDict

if TYPE_CHECKING:
    from litellm.router import Router

_PROBE_ID_PREFIX: Final = "public-wildcard-probe"
_WILDCARD_ONLY_MODEL_INFO_KEYS: Final = frozenset({"id", "health_check_model"})


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

    def is_probe(self, endpoint: Mapping[str, object]) -> bool:
        return endpoint.get("model_id") in self.public_name_by_probe_id


def _deployment_id(deployment: Mapping[str, object]) -> str | None:
    info: Final = deployment.get("model_info")
    ident: Final = _MODEL_INFO.validate_python(info).get("id") if isinstance(info, Mapping) else None
    return str(ident) if ident else None


def _probe(public_name: str, wildcard: _WildcardDeployment, source_id: str) -> _Probe:
    probe_id: Final = f"{_PROBE_ID_PREFIX}:{source_id}:{public_name}"
    route_settings: Final = {
        key: value for key, value in wildcard["model_info"].items() if key not in _WILDCARD_ONLY_MODEL_INFO_KEYS
    }
    return _Probe(
        probe_id=probe_id,
        public_name=public_name,
        deployment={
            "model_name": public_name,
            "litellm_params": dict(wildcard["litellm_params"]),
            "model_info": {**route_settings, "id": probe_id},
        },
    )


def _probes_for(router: "Router", public_name: str, checked_ids: frozenset[str]) -> tuple[_Probe, ...]:
    registry: Final = router.registry()
    if registry.deployments(public_name, source="named"):
        return ()
    wildcards: Final = tuple(
        _WILDCARD_DEPLOYMENT.validate_python(entry) for entry in registry.deployments(public_name, source="wildcard")
    )
    return tuple(
        _probe(public_name, wildcard, source_id)
        for wildcard in wildcards
        if (source_id := _deployment_id(wildcard)) is not None and source_id in checked_ids
    )


def public_wildcard_probes(
    router: "Router | None",
    public_model_groups: Iterable[str] | None,
    checked_deployments: Sequence[Mapping[str, object]],
) -> PublicWildcardProbes:
    if router is None or not public_model_groups:
        return PublicWildcardProbes(deployments=(), public_name_by_probe_id=MappingProxyType({}))
    checked_ids: Final = frozenset(ident for deployment in checked_deployments if (ident := _deployment_id(deployment)))
    probes: Final = tuple(
        chain.from_iterable(_probes_for(router, name, checked_ids) for name in sorted(frozenset(public_model_groups)))
    )
    return PublicWildcardProbes(
        deployments=tuple(probe.deployment for probe in probes),
        public_name_by_probe_id=MappingProxyType({probe.probe_id: probe.public_name for probe in probes}),
    )
