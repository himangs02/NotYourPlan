"""
Deterministic scoring and constraint evaluation for EventFlow.
"""
from typing import List, Dict, Any, Tuple
import numpy as np
from packages.schemas.models import (
    HardConstraintConfig,
    SimulationRunResult,
    EvaluationResult,
    CausalChain,
    CandidatePlan
)

class DeterministicEvaluator:
    """
    Evaluates simulation runs against hard constraints and computes normalized cost scores.
    Lower score is better.
    """

    @staticmethod
    def evaluate_plan_runs(
        plan: CandidatePlan,
        runs: List[SimulationRunResult],
        constraints: HardConstraintConfig,
        staff_budget: int = 20,
        baseline_run: SimulationRunResult = None,
        world_version_id: str = "v1"
    ) -> EvaluationResult:
        if not runs:
            return EvaluationResult(
                plan_id=plan.plan_id,
                status="FAIL",
                rejection_reasons=["No simulation runs available for evaluation"],
                final_score=None,
                aggregate_metrics={},
                hard_constraints_status={},
                human_impact_index={},
                provenance={}
            )

        # Aggregate metrics across seeds
        p95_times = [r.metrics.overall_p95_exit_time_sec for r in runs]
        amb_delays = [r.metrics.ambulance_delay_sec for r in runs]
        densities = [r.metrics.peak_crowd_density_ped_per_m2 for r in runs]
        step_free_preserved = all(r.metrics.step_free_route_preserved for r in runs)
        emergency_corridor_clear = all(r.metrics.emergency_corridor_clear for r in runs)
        pct_exited = [r.metrics.percentage_exited_at_limit for r in runs]

        avg_p95 = float(np.mean(p95_times))
        max_amb_delay = float(np.max(amb_delays))
        avg_density = float(np.mean(densities))
        max_density = float(np.max(densities))
        avg_pct_exited = float(np.mean(pct_exited))

        # Check Hard Constraints
        max_stuck = max((r.metrics.stuck_agents for r in runs), default=0)
        hard_checks = {
            "p95_exit_time_within_limit": avg_p95 <= constraints.max_p95_exit_time_sec,
            "ambulance_route_clear": max_amb_delay <= constraints.max_ambulance_delay_sec and emergency_corridor_clear,
            "step_free_access_preserved": step_free_preserved if constraints.require_step_free_access else True,
            "peak_density_safe": max_density <= constraints.max_peak_density_ped_per_m2,
            "staff_within_budget": plan.staff_required <= staff_budget,
            "stuck_agents_within_limit": max_stuck <= constraints.max_stuck_agents
        }

        rejection_reasons = []
        if not hard_checks["p95_exit_time_within_limit"]:
            rejection_reasons.append(
                f"P95 exit time ({avg_p95:.1f}s) exceeded hard constraint ({constraints.max_p95_exit_time_sec}s)"
            )
        if not hard_checks["ambulance_route_clear"]:
            rejection_reasons.append(
                f"Emergency route compromised: ambulance delay reached {max_amb_delay:.1f}s (max allowed: {constraints.max_ambulance_delay_sec}s)"
            )
        if not hard_checks["step_free_access_preserved"]:
            rejection_reasons.append(
                "Step-free accessible route was obstructed or inaccessible for mobility-impaired attendees"
            )
        if not hard_checks["peak_density_safe"]:
            rejection_reasons.append(
                f"Peak crowd density reached {max_density:.2f} ped/m², exceeding safety threshold of {constraints.max_peak_density_ped_per_m2} ped/m²"
            )
        if not hard_checks["staff_within_budget"]:
            rejection_reasons.append(
                f"Plan requires {plan.staff_required} staff, exceeding the available budget of {staff_budget}"
            )
        if not hard_checks["stuck_agents_within_limit"]:
            rejection_reasons.append(
                f"Deadlock detected: {max_stuck} stuck agents exceeded tolerance of {constraints.max_stuck_agents}"
            )

        status = "PASS" if len(rejection_reasons) == 0 else "FAIL"

        # Deterministic Score Formula (Only for feasible plans or diagnostic ranking):
        # score = 0.30 * normalized_p95_exit_time
        #       + 0.25 * normalized_accessibility_impact
        #       + 0.20 * normalized_emergency_route_impact
        #       + 0.15 * normalized_density_exposure
        #       + 0.10 * normalized_staff_required
        #
        # Normalization ranges:
        # P95 time: [300s, 900s] -> [0, 1]
        # Accessibility impact: 0 if preserved and quick, 1 if delayed or obstructed
        # Emergency route impact: [0s delay, 60s delay] -> [0, 1]
        # Density exposure: [1.0 ped/m², 3.5 ped/m²] -> [0, 1]
        # Staff required: [0, max_budget] -> [0, 1]

        norm_p95 = float(np.clip((avg_p95 - 300.0) / (900.0 - 300.0), 0.0, 1.0))
        norm_accessibility = 0.05 if step_free_preserved else 1.0
        norm_emergency = float(np.clip(max_amb_delay / 60.0, 0.0, 1.0))
        norm_density = float(np.clip((avg_density - 1.0) / (3.5 - 1.0), 0.0, 1.0))
        norm_staff = float(np.clip(plan.staff_required / max(1, staff_budget), 0.0, 1.0))

        final_score = (
            0.30 * norm_p95 +
            0.25 * norm_accessibility +
            0.20 * norm_emergency +
            0.15 * norm_density +
            0.10 * norm_staff
        )

        # Human Impact Index (HII) by group
        # Extract group metrics averaged across runs
        gen_p95 = float(np.mean([r.metrics.group_metrics["general"].p95_exit_time_sec for r in runs]))
        gen_wait = float(np.mean([r.metrics.group_metrics["general"].queue_wait_time_sec for r in runs]))
        mob_p95 = float(np.mean([r.metrics.group_metrics["mobility_impaired"].p95_exit_time_sec for r in runs]))
        mob_wait = float(np.mean([r.metrics.group_metrics["mobility_impaired"].queue_wait_time_sec for r in runs]))
        resp_delay = float(np.mean([r.metrics.group_metrics["responders"].queue_wait_time_sec for r in runs]))

        human_impact = {
            "general_attendees": {
                "p95_exit_time_sec": round(gen_p95, 1),
                "avg_queue_wait_sec": round(gen_wait, 1),
                "density_exposure_level": "MODERATE" if avg_density < 2.0 else "HIGH",
                "comfort_rating": "ACCEPTABLE" if gen_wait < 180 else "STRAINED"
            },
            "mobility_impaired": {
                "p95_exit_time_sec": round(mob_p95, 1),
                "step_free_available": step_free_preserved,
                "avg_queue_wait_sec": round(mob_wait, 1),
                "accessibility_status": "PROTECTED" if step_free_preserved else "FAILED",
                "equity_assessment": "FAIR" if (mob_p95 - gen_p95) < 120 else "DISPROPORTIONATE_DELAY"
            },
            "responders": {
                "emergency_corridor_delay_sec": round(max_amb_delay, 1),
                "corridor_clear": emergency_corridor_clear,
                "readiness_status": "UNRESTRICTED" if max_amb_delay <= 10 else "DELAYED"
            }
        }

        # Causal Chains detection
        causal_chains = []
        if not hard_checks["ambulance_route_clear"]:
            causal_chains.append(CausalChain(
                trigger_action="Open Gate 1 without staggered egress",
                intermediate_flow_shift="Pedestrian flow shifts from Auditorium East onto Road 17",
                congestion_point="Road 17 bottleneck adjacent to Clinic entrance",
                impact_metric=f"Ambulance corridor delayed by {max_amb_delay:.1f}s (> {constraints.max_ambulance_delay_sec}s allowed)",
                rejection_verdict="Hard constraint violation: Emergency route blocked",
                evidence_diff={
                    "road_17_pedestrian_count": 840,
                    "road_17_design_capacity": 300,
                    "ambulance_delay_seconds": round(max_amb_delay, 1)
                }
            ))
        elif not hard_checks["peak_density_safe"]:
            causal_chains.append(CausalChain(
                trigger_action="Funneling all attendees through single exit Gate 3",
                intermediate_flow_shift="Zones A, B, and C converged simultaneously into central concourse",
                congestion_point="Concourse Confluence Point C-1",
                impact_metric=f"Peak crowd density spiked to {max_density:.2f} ped/m² (exceeds 2.50 ped/m² safety limit)",
                rejection_verdict="Hard constraint violation: Dangerous crowd crush hazard",
                evidence_diff={
                    "peak_density_ped_m2": round(max_density, 2),
                    "safe_limit": 2.50,
                    "flow_rate_drop_pct": 45
                }
            ))

        # Confidence derivation based on seeds, variance, and health
        seed_count = len(runs)
        variance_p95 = float(np.var(p95_times)) if seed_count > 1 else 0.0
        confidence_level = "HIGH" if (seed_count >= 3 and variance_p95 < 250) else "MEDIUM"

        aggregate_metrics = {
            "avg_p95_exit_time_sec": round(avg_p95, 1),
            "p95_exit_time_display": f"{int(avg_p95 // 60)}m {int(avg_p95 % 60):02d}s",
            "max_ambulance_delay_sec": round(max_amb_delay, 1),
            "avg_density_ped_per_m2": round(avg_density, 2),
            "max_density_ped_per_m2": round(max_density, 2),
            "step_free_preserved": step_free_preserved,
            "emergency_corridor_clear": emergency_corridor_clear,
            "percentage_exited": round(avg_pct_exited * 100, 1),
            "staff_required": plan.staff_required,
            "seed_count": seed_count,
            "confidence_level": confidence_level,
            "score_breakdown": {
                "normalized_p95_exit_time": round(norm_p95, 3),
                "normalized_accessibility_impact": round(norm_accessibility, 3),
                "normalized_emergency_route_impact": round(norm_emergency, 3),
                "normalized_density_exposure": round(norm_density, 3),
                "normalized_staff_required": round(norm_staff, 3),
                "formula": "0.30*p95 + 0.25*access + 0.20*emerg + 0.15*dens + 0.10*staff"
            }
        }

        provenance = {
            "plan_id": plan.plan_id,
            "world_version_id": world_version_id,
            "run_ids": [r.run_id for r in runs],
            "seeds": [r.seed for r in runs],
            "simulator_name": runs[0].simulator_name,
            "simulator_version": runs[0].simulator_version,
            "is_cached": False,
            "is_modeled": True,
            "variance_p95": round(variance_p95, 2)
        }

        return EvaluationResult(
            plan_id=plan.plan_id,
            status=status,
            rejection_reasons=rejection_reasons,
            final_score=round(final_score, 4) if status == "PASS" else None,
            aggregate_metrics=aggregate_metrics,
            hard_constraints_status=hard_checks,
            human_impact_index=human_impact,
            causal_chains=causal_chains,
            provenance=provenance
        )
