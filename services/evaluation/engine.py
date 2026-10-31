"""
Evaluation Engine for EventFlow.
Coordinates simulation runs, constraint evaluation, ranking, causal chains, and what-if version diffs.
"""
from typing import List, Dict, Any, Tuple, Optional
from packages.schemas.models import (
    CandidatePlan,
    HardConstraintConfig,
    EvaluationResult,
    SimulationRunResult,
    CausalChain
)
from packages.scoring.calculator import DeterministicEvaluator
from services.simulation.runner import SumoSimulationRunner

class EvaluationEngine:
    def __init__(self, simulator: Optional[SumoSimulationRunner] = None):
        self.simulator = simulator or SumoSimulationRunner()
        self.evaluator = DeterministicEvaluator()

    def evaluate_candidates(
        self,
        plans: List[CandidatePlan],
        constraints: HardConstraintConfig,
        seeds: List[int] = [42, 101, 777],
        world_config: Optional[Dict[str, Any]] = None,
        world_version_id: str = "v1",
        staff_budget: int = 20
    ) -> Tuple[List[EvaluationResult], Dict[str, List[SimulationRunResult]]]:
        """
        Runs multi-seed simulations for all candidate plans, evaluates hard constraints,
        and returns deterministically ranked evaluation results.
        """
        plan_runs: Dict[str, List[SimulationRunResult]] = {}
        eval_results: List[EvaluationResult] = []

        # Run simulations
        for plan in plans:
            runs = self.simulator.run_multi_seed(
                plan=plan,
                seeds=seeds,
                world_config=world_config,
                stage="screening"
            )
            plan_runs[plan.plan_id] = runs

            # Evaluate against hard constraints & compute deterministic cost score
            eval_res = self.evaluator.evaluate_plan_runs(
                plan=plan,
                runs=runs,
                constraints=constraints,
                staff_budget=staff_budget,
                world_version_id=world_version_id
            )
            eval_results.append(eval_res)

        # Deterministic Ranking:
        # 1. PASS plans ranked by final_score (ascending, lower cost is better)
        # 2. FAIL plans ranked afterwards
        pass_plans = [r for r in eval_results if r.status == "PASS"]
        fail_plans = [r for r in eval_results if r.status == "FAIL"]

        pass_plans.sort(key=lambda r: r.final_score if r.final_score is not None else 999.0)

        # Fail plans sorted by count of failed constraints (ascending)
        fail_plans.sort(key=lambda r: len(r.rejection_reasons))

        ranked_results = pass_plans + fail_plans
        return ranked_results, plan_runs

    def compute_what_if_diff(
        self,
        original_rankings: List[EvaluationResult],
        what_if_rankings: List[EvaluationResult],
        blocked_element_id: str
    ) -> Dict[str, Any]:
        """
        Calculates ranking shifts, score deltas, and causal reasons when an element is blocked.
        """
        orig_order = {r.plan_id: idx + 1 for idx, r in enumerate(original_rankings)}
        new_order = {r.plan_id: idx + 1 for idx, r in enumerate(what_if_rankings)}

        orig_top = original_rankings[0].plan_id if original_rankings else None
        new_top = what_if_rankings[0].plan_id if what_if_rankings else None

        shifts = []
        for pid, new_rank in new_order.items():
            old_rank = orig_order.get(pid, 99)
            orig_eval = next((r for r in original_rankings if r.plan_id == pid), None)
            new_eval = next((r for r in what_if_rankings if r.plan_id == pid), None)

            shifts.append({
                "plan_id": pid,
                "previous_rank": old_rank,
                "new_rank": new_rank,
                "rank_shift": old_rank - new_rank, # positive means improved
                "previous_status": orig_eval.status if orig_eval else "UNKNOWN",
                "new_status": new_eval.status if new_eval else "UNKNOWN",
                "previous_score": orig_eval.final_score if orig_eval else None,
                "new_score": new_eval.final_score if new_eval else None
            })

        return {
            "blocked_element": blocked_element_id,
            "previous_winner": orig_top,
            "new_winner": new_top,
            "ranking_shifts": shifts,
            "summary": f"Blocking {blocked_element_id} triggered rerouting. Top plan changed from {orig_top} to {new_top}."
        }
