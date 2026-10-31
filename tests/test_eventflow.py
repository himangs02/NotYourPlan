"""
Comprehensive test suite for EventFlow.
Validates:
1. Goal JSON validation
2. Intervention DSL validation
3. Invalid gate/road references
4. Hard-constraint rejection
5. Accessible-route failure
6. Emergency-route failure
7. Score calculation formula
8. Same seed produces reproducible metrics
9. World version creation
10. What-if version diff
11. Provenance completeness
12. Gemini numeric-claim post-check
13. Meko fallback behavior if Meko is unavailable
"""
import pytest
from pydantic import ValidationError
from packages.schemas.models import (
    HardConstraintConfig,
    CandidatePlan,
    Intervention,
    CompiledGoal,
    SimulationRunResult,
    RunMetrics,
    GroupMetrics,
    EvaluationResult
)
from packages.scoring.calculator import DeterministicEvaluator
from packages.provenance.tracker import ProvenanceTracker
from services.simulation.runner import SumoSimulationRunner
from services.evaluation.engine import EvaluationEngine
from services.goal_compiler.compiler import GeminiGoalCompiler
from services.meko_context.service import MekoContextService
from db.seeds.venue_data import CAMPUS_VENUE_SNAPSHOT, DEFAULT_CANDIDATE_PLANS

# 1. Goal JSON Validation
def test_goal_json_validation():
    compiler = GeminiGoalCompiler()
    raw = "We have 3,000 attendees leaving an auditorium after the final show. Get 95% of them out within 10 minutes, keep the ambulance route clear, and preserve step-free routes for wheelchair users."
    compiled = compiler.compile_goal(raw, "evt-001", "v1")

    assert compiled.attendee_count == 3000
    assert compiled.constraints.max_p95_exit_time_sec == 600
    assert compiled.constraints.target_exit_percentage == 0.95
    assert compiled.constraints.require_step_free_access is True
    assert compiled.constraints.max_ambulance_delay_sec == 30

# 2. Intervention DSL Validation
def test_intervention_dsl_validation():
    valid_intervention = Intervention(
        type="stagger_zone",
        zone_id="zone_b",
        delay_seconds=90
    )
    assert valid_intervention.type == "stagger_zone"
    assert valid_intervention.delay_seconds == 90

    with pytest.raises(ValidationError):
        # Invalid intervention type
        Intervention(type="invalid_unknown_action")

# 3. Invalid gate/road references
def test_invalid_gate_road_references():
    valid_gates = {g["gate_id"] for g in CAMPUS_VENUE_SNAPSHOT["gates"]}
    valid_routes = {r["route_id"] for r in CAMPUS_VENUE_SNAPSHOT["roads_and_corridors"]}

    # Create plan with non-existent gate
    bad_plan = CandidatePlan(
        plan_id="bad_plan",
        name="Bad Plan",
        interventions=[
            Intervention(type="open_gate", gate_id="gate_nonexistent_99")
        ]
    )

    invalid_refs = [
        i.gate_id for i in bad_plan.interventions if i.gate_id and i.gate_id not in valid_gates
    ]
    assert len(invalid_refs) == 1
    assert "gate_nonexistent_99" in invalid_refs

# 4. Hard-constraint rejection (P95 time limit exceeded)
def test_hard_constraint_rejection():
    plan_c = next(CandidatePlan(**p) for p in DEFAULT_CANDIDATE_PLANS if p["plan_id"] == "plan_c")
    runner = SumoSimulationRunner()
    runs = runner.run_multi_seed(plan_c, [42, 101])

    constraints = HardConstraintConfig(max_p95_exit_time_sec=600, max_peak_density_ped_per_m2=2.50)
    eval_res = DeterministicEvaluator.evaluate_plan_runs(plan_c, runs, constraints)

    assert eval_res.status == "FAIL"
    assert any("exceeded hard constraint" in r or "density" in r for r in eval_res.rejection_reasons)
    assert eval_res.final_score is None

# 5. Accessible-route failure
def test_accessible_route_failure():
    plan_f = next(CandidatePlan(**p) for p in DEFAULT_CANDIDATE_PLANS if p["plan_id"] == "plan_f")
    runner = SumoSimulationRunner()
    runs = runner.run_multi_seed(plan_f, [42])

    constraints = HardConstraintConfig(require_step_free_access=True)
    eval_res = DeterministicEvaluator.evaluate_plan_runs(plan_f, runs, constraints)

    assert eval_res.status == "FAIL"
    assert eval_res.hard_constraints_status["step_free_access_preserved"] is False
    assert any("Step-free accessible route was obstructed" in r for r in eval_res.rejection_reasons)

# 6. Emergency-route failure
def test_emergency_route_failure():
    plan_a = next(CandidatePlan(**p) for p in DEFAULT_CANDIDATE_PLANS if p["plan_id"] == "plan_a")
    runner = SumoSimulationRunner()
    runs = runner.run_multi_seed(plan_a, [42])

    constraints = HardConstraintConfig(max_ambulance_delay_sec=30)
    eval_res = DeterministicEvaluator.evaluate_plan_runs(plan_a, runs, constraints)

    assert eval_res.status == "FAIL"
    assert eval_res.hard_constraints_status["ambulance_route_clear"] is False
    assert any("Emergency route compromised" in r for r in eval_res.rejection_reasons)

# 7. Score calculation formula
def test_score_calculation():
    plan_b = next(CandidatePlan(**p) for p in DEFAULT_CANDIDATE_PLANS if p["plan_id"] == "plan_b")
    runner = SumoSimulationRunner()
    runs = runner.run_multi_seed(plan_b, [42, 101, 777])

    constraints = HardConstraintConfig(max_p95_exit_time_sec=600)
    eval_res = DeterministicEvaluator.evaluate_plan_runs(plan_b, runs, constraints, staff_budget=20)

    assert eval_res.status == "PASS"
    assert eval_res.final_score is not None
    # Deterministic score should be positive and bounded between 0 and 1
    assert 0.10 <= eval_res.final_score <= 0.60
    assert "score_breakdown" in eval_res.aggregate_metrics

# 8. Same seed produces reproducible metrics
def test_reproducible_metrics():
    plan_b = next(CandidatePlan(**p) for p in DEFAULT_CANDIDATE_PLANS if p["plan_id"] == "plan_b")
    runner = SumoSimulationRunner()

    run1 = runner.run_plan_simulation(plan_b, seed=42)
    run2 = runner.run_plan_simulation(plan_b, seed=42)

    assert run1.metrics.overall_p95_exit_time_sec == run2.metrics.overall_p95_exit_time_sec
    assert run1.metrics.ambulance_delay_sec == run2.metrics.ambulance_delay_sec
    assert run1.metrics.peak_crowd_density_ped_per_m2 == run2.metrics.peak_crowd_density_ped_per_m2

# 9. World version creation
def test_world_version_creation():
    import copy
    v1_config = CAMPUS_VENUE_SNAPSHOT
    v2_config = copy.deepcopy(v1_config)

    # Block Gate 2 in v2
    for g in v2_config["gates"]:
        if g["gate_id"] == "gate_2":
            g["is_blocked"] = True

    gate_2_v1 = next(g for g in v1_config["gates"] if g["gate_id"] == "gate_2")
    gate_2_v2 = next(g for g in v2_config["gates"] if g["gate_id"] == "gate_2")

    assert gate_2_v1.get("is_blocked") is False
    assert gate_2_v2["is_blocked"] is True

# 10. What-if version diff
def test_what_if_version_diff():
    engine = EvaluationEngine()
    plans = [CandidatePlan(**p) for p in DEFAULT_CANDIDATE_PLANS]
    constraints = HardConstraintConfig()

    v1_rankings, _ = engine.evaluate_candidates(plans, constraints, seeds=[42])

    import copy
    v2_config = copy.deepcopy(CAMPUS_VENUE_SNAPSHOT)
    for g in v2_config["gates"]:
        if g["gate_id"] == "gate_2":
            g["is_blocked"] = True

    v2_rankings, _ = engine.evaluate_candidates(plans, constraints, seeds=[42], world_config=v2_config)

    diff = engine.compute_what_if_diff(v1_rankings, v2_rankings, "gate_2")

    assert diff["blocked_element"] == "gate_2"
    assert len(diff["ranking_shifts"]) > 0

# 11. Provenance completeness
def test_provenance_completeness():
    record = ProvenanceTracker.create_evidence_record(
        event_id="evt-001",
        world_version_id="world-v1",
        plan_id="plan_b",
        runs=[{"run_id": "run-01", "seed": 42}, {"run_id": "run-02", "seed": 101}]
    )
    is_complete = ProvenanceTracker.verify_provenance_completeness(record)
    assert is_complete is True
    assert record["data_classification"] == "SYNTHETIC_MODELED_CROWD"

# 12. Gemini numeric-claim post-check
def test_gemini_numeric_claim_post_check():
    compiler = GeminiGoalCompiler()
    # Verified metrics
    eval_res = EvaluationResult(
        plan_id="plan_b",
        status="PASS",
        aggregate_metrics={
            "avg_p95_exit_time_sec": 464.0,
            "p95_exit_time_display": "7m 44s",
            "max_ambulance_delay_sec": 5.8,
            "max_density_ped_per_m2": 1.88
        },
        hard_constraints_status={},
        human_impact_index={},
        provenance={}
    )

    explanation = compiler.explain_evaluation_results("Plan B", eval_res)
    # Explanation must strictly cite verified numbers from evaluation metrics
    assert "7m 44s" in explanation
    assert "1.88" in explanation
    assert "5.8" in explanation

# 13. Meko fallback behavior if Meko is unavailable
def test_meko_fallback_behavior():
    # Instantiate Meko service without remote credentials
    meko = MekoContextService(db=None)
    assert meko.mode == "YUGABYTEDB_CONTEXT_TABLE_FALLBACK"

    saved = meko.save_context(
        event_id="evt-fallback-01",
        role="Goal Interpreter",
        context_payload={"status": "fallback active"}
    )
    assert saved["storage_mode"] == "YUGABYTEDB_CONTEXT_TABLE_FALLBACK"
    assert saved["role"] == "Goal Interpreter"
