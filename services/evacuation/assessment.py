"""Phase 2.1: synthetic occupancy accounting, not a movement/safety solver."""
import hashlib
import json
from typing import Literal

from pydantic import BaseModel, Field


class OccupancyAssessmentRequest(BaseModel):
    event_id: str
    world_version_id: str
    incident_id: str = Field(min_length=1)
    building_zone_id: str = "zone_auditorium"
    blocked_gate_ids: list[str] = Field(default_factory=list)


class EvacuationZone(BaseModel):
    zone_id: str
    label: str
    occupant_count: int
    step_free_required: int
    general_count: int
    bounds: dict[str, float]
    status: Literal["ASSESSMENT_ONLY"] = "ASSESSMENT_ONLY"


class OccupancyAssessment(BaseModel):
    assessment_id: str
    event_id: str
    world_version_id: str
    incident_id: str
    building_zone_id: str
    building_name: str
    classification: Literal["SYNTHETIC_MODELED"] = "SYNTHETIC_MODELED"
    movement_authorized: Literal[False] = False
    affected_occupants: int
    elsewhere_occupants: int
    step_free_required: int
    zones: list[EvacuationZone]
    exit_inventory: list[dict]
    warnings: list[str]
    assumptions: list[str]


def assess_occupancy(req: OccupancyAssessmentRequest, world: dict) -> OccupancyAssessment:
    source_zones = world.get("zones", [])
    counts = [z.get("modeled_attendees", 0) for z in source_zones]
    if any(type(n) is not int or n < 0 for n in counts):
        raise ValueError("Occupancy counts must be non-negative integers")
    building = next((z for z in source_zones if z["zone_id"] == req.building_zone_id), None)
    # Explicit compatibility with the original persisted auditorium-tier schema.
    # Do not overwrite the immutable world or substitute current seed headcounts.
    legacy_tiers = (req.building_zone_id == "zone_auditorium" and
                    {z["zone_id"] for z in source_zones} == {"zone_a", "zone_b", "zone_c"} and
                    all("tier" in z.get("name", "").lower() for z in source_zones))
    if building is None and legacy_tiers:
        building = {"name": "Main Auditorium (legacy tier inventory)",
                    "modeled_attendees": sum(z.get("modeled_attendees", 0) for z in source_zones),
                    "position": {"x": 0, "z": 0}, "dimensions": {"width": 26, "depth": 18}}
    if building is None:
        raise ValueError("Building zone not found in selected world")
    gates = world.get("gates", [])
    if set(req.blocked_gate_ids) - {g["gate_id"] for g in gates}:
        raise ValueError("Unknown blocked gate")
    total = building.get("modeled_attendees", 0)
    ratio = world.get("attendee_groups", {}).get("mobility_impaired", {}).get("ratio")
    if not isinstance(ratio, (int, float)) or not 0 <= ratio <= 1:
        raise ValueError("A modeled step-free population ratio is required")
    assistance = round(total * ratio)
    pos, dims = building.get("position", {}), building.get("dimensions", {})
    width, depth = dims.get("width", 0), dims.get("depth", 0)
    if width <= 0 or depth <= 0:
        raise ValueError("Building footprint dimensions are required")
    # Allocate both cohorts separately so counts conserve exactly, including tiny rosters.
    def split(n):
        return [n // 3 + (i < n % 3) for i in range(3)]
    general, assisted = split(total - assistance), split(assistance)
    zones = [EvacuationZone(
        zone_id=f"{req.building_zone_id}:sector-{i + 1}",
        label=f"{label} sector", occupant_count=general[i] + assisted[i],
        step_free_required=assisted[i], general_count=general[i],
        bounds={"x": pos.get("x", 0) - width / 2 + width / 3 * (i + .5),
                "z": pos.get("z", 0), "width": width / 3, "depth": depth},
    ) for i, label in enumerate(["West", "Central", "East"])]
    if legacy_tiers:
        # Keep the original tier identities and exact counts; geometry is only
        # a schematic display, never an inferred interior navigation mesh.
        remaining = assistance
        for i, source in enumerate(sorted(source_zones, key=lambda z: z["zone_id"])):
            count = source["modeled_attendees"]
            later_capacity = sum(z["modeled_attendees"] for z in sorted(source_zones, key=lambda z: z["zone_id"])[i + 1:])
            assigned = max(remaining - later_capacity, min(count, remaining, round(count * ratio)))
            zones[i].zone_id = source["zone_id"]
            zones[i].label = source["name"]
            zones[i].occupant_count = count
            zones[i].step_free_required = assigned
            zones[i].general_count = count - assigned
            remaining -= assigned
    exits = []
    for gate in gates:
        blocked = gate.get("is_blocked", False) or gate.get("status") == "BLOCKED" or gate["gate_id"] in req.blocked_gate_ids
        exits.append({"gate_id": gate["gate_id"], "name": gate["name"],
                      "blocked": bool(blocked), "step_free": bool(gate.get("is_step_free", False)),
                      "capacity_per_sec": gate.get("flow_capacity_ped_per_sec"),
                      "route_verified": False})
    warnings = ["Movement withheld: interior exits, hazard clearance, shared exit capacity and congestion have not been evaluated.",
                "Floor-level occupancy and internal stair/ramp geometry are unknown; no floor-specific evacuation order is inferred."]
    if legacy_tiers:
        warnings.append("Legacy auditorium tiers preserved. Overlay boxes are schematic slots on a 26 × 18 display footprint, not surveyed tier boundaries.")
    if assistance and not any(e["step_free"] and not e["blocked"] for e in exits):
        warnings.append("No open step-free campus gate in this scenario. Assistance needs remain unresolved.")
    if not any(not e["blocked"] for e in exits):
        warnings.append("All campus gates are blocked. No evacuation route is authorized.")
    fingerprint = hashlib.sha256(json.dumps({"request": req.model_dump(), "world": world,
                                            "assessment_version": 1}, sort_keys=True).encode()).hexdigest()[:20]
    return OccupancyAssessment(
        assessment_id=f"occupancy-{fingerprint}", **req.model_dump(exclude={"blocked_gate_ids"}),
        building_name=building["name"], affected_occupants=total,
        elsewhere_occupants=sum(counts) - total, step_free_required=assistance,
        zones=zones, exit_inventory=exits, warnings=warnings,
        assumptions=["Counts come from the selected world's modeled zone inventory, not sensors or camera detection.",
                     "Original tier counts are preserved; overlay locations are schematic." if legacy_tiers else "Three equal-width schematic sectors; population is allocated evenly, not inferred from the 3D mesh.",
                     f"Step-free needs use the configured {ratio:.0%} population assumption; this is not a measured headcount.",
                     "Campus gates are an inventory only; a clear gate does not establish a safe interior route."],
    )
