"""
EventFlow Schemas - Pydantic models for constraints, plans, simulations, and provenance.
"""
from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field
import uuid
from datetime import datetime

# Group definitions
GroupType = Literal["general", "mobility_impaired", "responders"]

class Intervention(BaseModel):
    type: Literal["open_gate", "close_gate", "stagger_zone", "reserve_emergency_route", "assign_zone_to_exit"]
    gate_id: Optional[str] = None
    zone_id: Optional[str] = None
    route_id: Optional[str] = None
    exit_id: Optional[str] = None
    delay_seconds: Optional[int] = 0
    start_seconds: Optional[int] = 0
    end_seconds: Optional[int] = 900
    details: Optional[Dict[str, Any]] = Field(default_factory=dict)

class CandidatePlan(BaseModel):
    plan_id: str
    name: str
    description: Optional[str] = ""
    interventions: List[Intervention]
    staff_required: int = Field(default=0, ge=0)
    source: Literal["gemini", "template", "operator"] = "template"

class HardConstraintConfig(BaseModel):
    max_p95_exit_time_sec: int = Field(default=600, description="Target exit time for 95% of crowd (seconds)")
    target_exit_percentage: float = Field(default=0.95, ge=0.5, le=1.0)
    max_ambulance_delay_sec: int = Field(default=30, description="Max allowed delay on emergency corridor (seconds)")
    require_step_free_access: bool = Field(default=True, description="Accessible step-free route must remain operational")
    max_peak_density_ped_per_m2: float = Field(default=2.5, description="Unsafe threshold is > 2.5 ped/m²")
    max_staff_budget: int = Field(default=20, description="Max available staff count")
    max_stuck_agents: int = Field(default=5, description="Max allowed stuck agents (deadlock check)")

class CompiledGoal(BaseModel):
    goal_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_id: str
    world_version_id: str
    raw_text: str
    attendee_count: int = 3000
    staff_budget: int = 20
    constraints: HardConstraintConfig = Field(default_factory=HardConstraintConfig)
    assumptions_summary: List[str] = Field(default_factory=list)

class GroupMetrics(BaseModel):
    p95_exit_time_sec: float
    avg_exit_time_sec: float
    distance_walked_m: float
    queue_wait_time_sec: float
    peak_density_ped_per_m2: float

class RunMetrics(BaseModel):
    overall_p95_exit_time_sec: float
    p95_exit_time_seconds: float = 0.0
    avg_exit_time_seconds: float = 0.0
    percentage_exited_at_limit: float
    completion_rate: float = 1.0
    stuck_agents: int = 0
    ambulance_delay_sec: float
    emergency_route_delay_seconds: float = 0.0
    emergency_corridor_clear: bool
    step_free_route_preserved: bool
    accessible_route_available: bool = True
    step_free_flow_rate_ped_per_min: float
    peak_crowd_density_ped_per_m2: float
    peak_density: float = 0.0
    bottleneck_location: str
    group_metrics: Dict[str, GroupMetrics]

class SimulationRunResult(BaseModel):
    run_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_id: str
    seed: int
    stage: Literal["screening", "stress_test"] = "screening"
    simulator_name: str = "SUMO"
    simulator_version: str = "1.21.0-eventflow"
    status: Literal["COMPLETED", "FAILED"] = "COMPLETED"
    duration_ms: int = 120
    metrics: RunMetrics
    health: Dict[str, Any] = Field(default_factory=lambda: {"gridlock_detected": False, "teleported_agents": 0})
    created_at: datetime = Field(default_factory=datetime.utcnow)

class CausalChain(BaseModel):
    trigger_action: str
    intermediate_flow_shift: str
    congestion_point: str
    impact_metric: str
    rejection_verdict: str
    evidence_diff: Dict[str, Any]

class EvaluationResult(BaseModel):
    evaluation_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    plan_id: str
    status: Literal["PASS", "FAIL"]
    rejection_reasons: List[str] = Field(default_factory=list)
    final_score: Optional[float] = None
    aggregate_metrics: Dict[str, Any]
    hard_constraints_status: Dict[str, bool]
    human_impact_index: Dict[str, Any]
    causal_chains: Optional[List[CausalChain]] = None
    provenance: Dict[str, Any]

class ProvenanceRecord(BaseModel):
    event_id: str
    world_version_id: str
    plan_id: str
    run_ids: List[str]
    seeds: List[int]
    simulator_name: str
    simulator_version: str
    is_cached: bool = False
    is_modeled: bool = True
    generated_at: str

class OperatorChecklistStep(BaseModel):
    time_offset_sec: int
    time_label: str
    role: str
    action: str
    criticality: Literal["CRITICAL", "STANDARD", "CAUTION"]
    step_free_note: Optional[str] = None

class FallbackTrigger(BaseModel):
    condition: str
    immediate_action: str
    notification_role: str

class ActionPlan(BaseModel):
    action_plan_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    decision_id: str
    selected_plan_id: str
    plan_name: str
    steps: List[OperatorChecklistStep]
    tripwires: List[FallbackTrigger]
    fallback_steps: List[str]
    assumptions: List[str]
    language: Literal["en", "hi"] = "en"
    translated_checklist: Optional[List[Dict[str, str]]] = None
