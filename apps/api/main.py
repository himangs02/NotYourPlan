"""
EventFlow FastAPI Backend.
Integrates YugabyteDB, Meko Context Layer, SUMO Simulation Runner, Deterministic Scoring, and Gemini.
"""
import uuid
import copy
import asyncio
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, HTTPException, Depends, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db.database import (
    init_db,
    get_db,
    EventModel,
    WorldVersionModel,
    GoalModel,
    PlanModel,
    SimulationRunModel,
    EvaluationModel,
    DecisionModel,
    ActionPlanModel,
    MekoContextModel,
    EmergencyResourceModel,
    EmergencyIncidentModel,
    EmergencyDispatchModel,
    EmergencyRouteModel,
    EmergencyNotificationModel
)
from services.emergency.routing_engine import (
    EMERGENCY_DISPATCHER,
    DEFAULT_EMERGENCY_RESOURCES
)

from db.seeds.venue_data import CAMPUS_VENUE_SNAPSHOT, DEFAULT_CANDIDATE_PLANS
from packages.schemas.models import (
    CandidatePlan,
    HardConstraintConfig,
    CompiledGoal,
    EvaluationResult,
    SimulationRunResult,
    ActionPlan
)
from services.simulation.runner import SumoSimulationRunner
from services.evaluation.engine import EvaluationEngine
from services.goal_compiler.compiler import GeminiGoalCompiler
from services.meko_context.service import MekoContextService
from packages.provenance.tracker import ProvenanceTracker

app = FastAPI(
    title="EventFlow API",
    description="Crowd-management simulation and decision-support engine using SUMO, YugabyteDB, Meko, and Gemini.",
    version="1.0.0"
)

from services.evacuation.assessment import (
    OccupancyAssessmentRequest, OccupancyAssessment, assess_occupancy,
)


@app.post("/api/evacuation/assess", response_model=OccupancyAssessment)
def assess_building_occupancy(req: OccupancyAssessmentRequest, db: Session = Depends(get_db)):
    world = db.query(WorldVersionModel).filter_by(
        world_version_id=req.world_version_id, event_id=req.event_id,
    ).first()
    if world is None:
        raise HTTPException(status_code=404, detail="World version not found for this event")
    try:
        return assess_occupancy(req, world.world_config)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# In-memory job state store for real-time SSE progress
JOBS_STORE: Dict[str, Dict[str, Any]] = {}

# Services
simulator = SumoSimulationRunner()
eval_engine = EvaluationEngine(simulator=simulator)
goal_compiler = GeminiGoalCompiler()

@app.on_event("startup")
def on_startup():
    init_db()
    # Seed default event and world version if empty
    db = next(get_db())
    try:
        existing = db.query(EventModel).first()
        if not existing:
            default_event_id = "event-dtu-convocation-001"
            event = EventModel(
                event_id=default_event_id,
                name="College Auditorium Final Show",
                venue_name="DTU Convocation Hall & Campus Concourse",
                attendee_count=3000,
                staff_budget=20,
                created_at=datetime.utcnow()
            )
            db.add(event)

            v1_id = "world-v1-original"
            world_v1 = WorldVersionModel(
                world_version_id=v1_id,
                event_id=default_event_id,
                version_number=1,
                parent_version_id=None,
                change_reason="Original Baseline Campus Venue Layout",
                world_config=CAMPUS_VENUE_SNAPSHOT,
                source_metadata={
                    "source": "OpenStreetMap 2024 Cached Snapshot",
                    "classification": "SYNTHETIC_MODELED_CROWD",
                    "is_cached": True
                },
                created_at=datetime.utcnow()
            )
            db.add(world_v1)

            # Add default goal
            default_goal_id = "goal-001"
            raw_goal_text = "We have 3,000 attendees leaving an auditorium after the final show. Get 95% of them out within 10 minutes, keep the ambulance route clear, and preserve step-free routes for wheelchair users."
            compiled_goal = goal_compiler.compile_goal(raw_goal_text, default_event_id, v1_id)

            goal_record = GoalModel(
                goal_id=default_goal_id,
                event_id=default_event_id,
                world_version_id=v1_id,
                raw_text=raw_goal_text,
                compiled_goal=compiled_goal.dict(),
                created_at=datetime.utcnow()
            )
            db.add(goal_record)

            # Store default plans
            for p in DEFAULT_CANDIDATE_PLANS:
                plan_record = PlanModel(
                    plan_id=p["plan_id"],
                    goal_id=default_goal_id,
                    world_version_id=v1_id,
                    name=p["name"],
                    source=p.get("source", "template"),
                    intervention_dsl=p,
                    status="PENDING",
                    created_at=datetime.utcnow()
                )
                db.add(plan_record)

            # Initial Meko Context initialization
            meko_svc = MekoContextService(db)
            meko_svc.save_context(
                event_id=default_event_id,
                role="Goal Interpreter",
                context_payload={
                    "stage": "Goal Ingestion",
                    "raw_text": raw_goal_text,
                    "compiled_constraints": compiled_goal.constraints.dict(),
                    "assumptions": compiled_goal.assumptions_summary
                }
            )

            db.commit()

        # Seed default emergency resources if empty
        existing_res = db.query(EmergencyResourceModel).first()
        if not existing_res:
            for r in DEFAULT_EMERGENCY_RESOURCES:
                db_res = EmergencyResourceModel(
                    id=r["id"],
                    type=r["type"],
                    name=r["name"],
                    status=r["status"],
                    location=r["location"],
                    building=r.get("building"),
                    floor=r.get("floor"),
                    availability=r.get("availability", "AVAILABLE"),
                    capacity=r.get("capacity"),
                    coordinates=r.get("coordinates"),
                    last_updated=datetime.utcnow()
                )
                db.add(db_res)
            db.commit()
    finally:
        db.close()

# Request Models
class EmergencyDispatchRequest(BaseModel):
    incident_id: str = "EV-001"
    location: str = "Building B / Floor 2"
    world_version: int = 1
    blocked_gates: Optional[List[str]] = Field(default_factory=list)
    blocked_segments: Optional[List[str]] = Field(default_factory=list)

class EmergencyRerouteRequest(BaseModel):
    resource_id: str
    incident_id: str = "EV-001"
    blocked_segment: str
    world_version: int = 1

class CreateEventRequest(BaseModel):
    name: str = "College Auditorium Final Show"
    venue_name: str = "DTU Convocation Hall"
    attendee_count: int = 3000
    staff_budget: int = 20

class CompileGoalRequest(BaseModel):
    event_id: str = "event-dtu-convocation-001"
    world_version_id: Optional[str] = "world-v1-original"
    raw_text: str

class WhatIfRequest(BaseModel):
    blocked_element_id: str = "gate_2"
    reason: str = "Gate 2 jammed / structural barrier blocked"

class OptimizeRequest(BaseModel):
    event_id: str
    goal_id: str
    world_version_id: Optional[str] = None
    seeds: List[int] = Field(default_factory=lambda: [42, 101, 777])

class SelectDecisionRequest(BaseModel):
    plan_id: str
    explanation: Optional[str] = None

class CompileDecisionRequest(BaseModel):
    language: str = "en"

class MekoContextRequest(BaseModel):
    event_id: str
    role: str
    context_payload: Dict[str, Any]
    handoff_from: Optional[str] = None

class MekoHandoffRequest(BaseModel):
    event_id: str
    from_role: str
    to_role: str
    artifacts_passed: Dict[str, Any]
    notes: Optional[str] = ""

# API Endpoints

@app.post("/api/events")
def create_event(req: CreateEventRequest, db: Session = Depends(get_db)):
    event_id = str(uuid.uuid4())
    event = EventModel(
        event_id=event_id,
        name=req.name,
        venue_name=req.venue_name,
        attendee_count=req.attendee_count,
        staff_budget=req.staff_budget,
        created_at=datetime.utcnow()
    )
    db.add(event)

    # Create baseline world version v1
    v1_id = str(uuid.uuid4())
    world_v1 = WorldVersionModel(
        world_version_id=v1_id,
        event_id=event_id,
        version_number=1,
        parent_version_id=None,
        change_reason="Original Venue Layout",
        world_config=CAMPUS_VENUE_SNAPSHOT,
        source_metadata={"source": "OpenStreetMap snapshot", "is_modeled": True},
        created_at=datetime.utcnow()
    )
    db.add(world_v1)
    db.commit()

    return {"event_id": event_id, "world_version_id": v1_id, "message": "Event created"}

@app.get("/api/events/{event_id}")
def get_event(event_id: str, db: Session = Depends(get_db)):
    event = db.query(EventModel).filter(EventModel.event_id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return {
        "event_id": event.event_id,
        "name": event.name,
        "venue_name": event.venue_name,
        "attendee_count": event.attendee_count,
        "staff_budget": event.staff_budget,
        "created_at": event.created_at.isoformat()
    }

@app.get("/api/events/{event_id}/world")
def get_event_world(event_id: str, version_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(WorldVersionModel).filter(WorldVersionModel.event_id == event_id)
    if version_id:
        wv = query.filter(WorldVersionModel.world_version_id == version_id).first()
    else:
        wv = query.order_by(WorldVersionModel.version_number.desc()).first()

    if not wv:
        raise HTTPException(status_code=404, detail="World version not found")

    return {
        "world_version_id": wv.world_version_id,
        "event_id": wv.event_id,
        "version_number": wv.version_number,
        "parent_version_id": wv.parent_version_id,
        "change_reason": wv.change_reason,
        "world_config": wv.world_config,
        "source_metadata": wv.source_metadata,
        "created_at": wv.created_at.isoformat()
    }

@app.post("/api/events/{event_id}/world/what-if")
def create_what_if_world(event_id: str, req: WhatIfRequest, db: Session = Depends(get_db)):
    # Retrieve current active world version
    current_wv = db.query(WorldVersionModel).filter(
        WorldVersionModel.event_id == event_id
    ).order_by(WorldVersionModel.version_number.desc()).first()

    if not current_wv:
        raise HTTPException(status_code=404, detail="Current world version not found")

    new_config = copy.deepcopy(current_wv.world_config)
    # Block specified gate or road
    blocked = False
    for gate in new_config.get("gates", []):
        if gate.get("gate_id") == req.blocked_element_id:
            gate["is_blocked"] = True
            gate["status"] = "BLOCKED"
            blocked = True

    for road in new_config.get("roads_and_corridors", []):
        if road.get("route_id") == req.blocked_element_id:
            road["is_blocked"] = True
            blocked = True

    new_version_id = f"world-v{current_wv.version_number + 1}-{req.blocked_element_id}-blocked"
    new_wv = WorldVersionModel(
        world_version_id=new_version_id,
        event_id=event_id,
        version_number=current_wv.version_number + 1,
        parent_version_id=current_wv.world_version_id,
        change_reason=f"What-If: {req.reason}",
        world_config=new_config,
        source_metadata={
            "parent_version": current_wv.world_version_id,
            "blocked_element": req.blocked_element_id,
            "is_modeled": True
        },
        created_at=datetime.utcnow()
    )
    db.add(new_wv)
    db.commit()

    return {
        "world_version_id": new_version_id,
        "version_number": new_wv.version_number,
        "parent_version_id": current_wv.world_version_id,
        "change_reason": new_wv.change_reason,
        "message": f"Created new immutable world version {new_wv.version_number} with {req.blocked_element_id} blocked."
    }

@app.post("/api/goals/compile")
def compile_goal(req: CompileGoalRequest, db: Session = Depends(get_db)):
    compiled = goal_compiler.compile_goal(
        raw_text=req.raw_text,
        event_id=req.event_id,
        world_version_id=req.world_version_id
    )

    goal_id = str(uuid.uuid4())
    goal_record = GoalModel(
        goal_id=goal_id,
        event_id=req.event_id,
        world_version_id=req.world_version_id,
        raw_text=req.raw_text,
        compiled_goal=compiled.dict(),
        created_at=datetime.utcnow()
    )
    db.add(goal_record)

    # Record in Meko
    meko_svc = MekoContextService(db)
    meko_svc.save_context(
        event_id=req.event_id,
        role="Goal Interpreter",
        context_payload={
            "goal_id": goal_id,
            "raw_text": req.raw_text,
            "compiled_constraints": compiled.constraints.dict(),
            "assumptions": compiled.assumptions_summary
        }
    )
    db.commit()

    return {
        "goal_id": goal_id,
        "compiled_goal": compiled.dict()
    }

@app.post("/api/goals/{goal_id}/confirm")
def confirm_goal(goal_id: str, updated_constraints: Dict[str, Any], db: Session = Depends(get_db)):
    goal = db.query(GoalModel).filter(GoalModel.goal_id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    compiled = goal.compiled_goal
    compiled["constraints"].update(updated_constraints)
    goal.compiled_goal = compiled
    db.commit()

    return {"goal_id": goal_id, "status": "CONFIRMED", "compiled_goal": goal.compiled_goal}

@app.get("/api/goals/{goal_id}")
def get_goal(goal_id: str, db: Session = Depends(get_db)):
    goal = db.query(GoalModel).filter(GoalModel.goal_id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return {
        "goal_id": goal.goal_id,
        "event_id": goal.event_id,
        "world_version_id": goal.world_version_id,
        "raw_text": goal.raw_text,
        "compiled_goal": goal.compiled_goal,
        "created_at": goal.created_at.isoformat()
    }

# Optimization and Simulation execution
@app.post("/api/optimize")
def run_optimization(req: OptimizeRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    job_id = f"job-{uuid.uuid4().hex[:8]}"

    # Fetch world version
    if req.world_version_id:
        wv = db.query(WorldVersionModel).filter(WorldVersionModel.world_version_id == req.world_version_id).first()
    else:
        wv = db.query(WorldVersionModel).filter(WorldVersionModel.event_id == req.event_id).order_by(WorldVersionModel.version_number.desc()).first()

    if not wv:
        raise HTTPException(status_code=404, detail="World version not found")

    # Fetch goal
    goal = db.query(GoalModel).filter(GoalModel.goal_id == req.goal_id).first()
    constraints_dict = goal.compiled_goal.get("constraints", {}) if goal else {}
    constraints = HardConstraintConfig(**constraints_dict) if constraints_dict else HardConstraintConfig()

    event = db.query(EventModel).filter(EventModel.event_id == req.event_id).first()
    staff_budget = event.staff_budget if event else 20

    # Plans to evaluate
    plans = [CandidatePlan(**p) for p in DEFAULT_CANDIDATE_PLANS]

    JOBS_STORE[job_id] = {
        "job_id": job_id,
        "event_id": req.event_id,
        "world_version_id": wv.world_version_id,
        "status": "RUNNING",
        "progress_pct": 10,
        "current_step": "Initializing SUMO physics engine",
        "events": [],
        "completed_runs": 0,
        "total_runs": len(plans) * len(req.seeds),
        "rankings": []
    }

    def execute_simulation_job(jid: str, w_cfg: Dict[str, Any], w_vid: str):
        job = JOBS_STORE[jid]
        job["events"].append({"time": datetime.utcnow().isoformat(), "message": "Dispatched SUMO workers across seeds"})
        job["progress_pct"] = 25

        # Execute multi-seed simulation and evaluation
        ranked_results, plan_runs = eval_engine.evaluate_candidates(
            plans=plans,
            constraints=constraints,
            seeds=req.seeds,
            world_config=w_cfg,
            world_version_id=w_vid,
            staff_budget=staff_budget
        )

        job["progress_pct"] = 80
        job["current_step"] = "Applying deterministic hard constraints and scoring"
        job["events"].append({"time": datetime.utcnow().isoformat(), "message": "Simulation runs finished, compiling evaluation"})

        # Persist to database
        local_db = SessionLocal()
        try:
            for pid, runs in plan_runs.items():
                for r in runs:
                    sim_run = SimulationRunModel(
                        run_id=r.run_id,
                        plan_id=pid,
                        seed=r.seed,
                        stage=r.stage,
                        simulator_name=r.simulator_name,
                        simulator_version=r.simulator_version,
                        status=r.status,
                        metrics=r.metrics.dict(),
                        health=r.health,
                        duration_ms=r.duration_ms,
                        created_at=datetime.utcnow()
                    )
                    local_db.merge(sim_run)

            for eval_res in ranked_results:
                eval_model = EvaluationModel(
                    evaluation_id=eval_res.evaluation_id,
                    plan_id=eval_res.plan_id,
                    aggregate_metrics=eval_res.aggregate_metrics,
                    hard_constraints=eval_res.hard_constraints_status,
                    human_impact=eval_res.human_impact_index,
                    causal_chains=[c.dict() for c in eval_res.causal_chains] if eval_res.causal_chains else [],
                    final_score=eval_res.final_score,
                    provenance=eval_res.provenance,
                    created_at=datetime.utcnow()
                )
                local_db.merge(eval_model)

            # Record in Meko
            meko_svc = MekoContextService(local_db)
            passed = [r for r in ranked_results if r.status == "PASS"]
            winning_id = passed[0].plan_id if passed else None
            meko_svc.save_context(
                event_id=req.event_id,
                role="Simulation Analyst",
                context_payload={
                    "job_id": jid,
                    "evaluated_plans_count": len(plans),
                    "passed_plans_count": len(passed),
                    "winning_plan": winning_id,
                    "rejection_summary": {r.plan_id: r.rejection_reasons for r in ranked_results if r.status == "FAIL"}
                },
                handoff_from="Plan Strategist"
            )

            local_db.commit()
        finally:
            local_db.close()

        job["rankings"] = [r.dict() for r in ranked_results]
        job["progress_pct"] = 100
        job["status"] = "COMPLETED"
        job["current_step"] = "Evaluation complete"
        job["events"].append({"time": datetime.utcnow().isoformat(), "message": "All plans verified and ranked deterministically"})

    # Run in background task
    background_tasks.add_task(execute_simulation_job, job_id, wv.world_config, wv.world_version_id)

    return {"job_id": job_id, "status": "ACCEPTED", "message": "Simulation optimization started"}

@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    job = JOBS_STORE.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@app.get("/api/jobs/{job_id}/events")
async def stream_job_events(job_id: str):
    """Server-Sent Events endpoint for simulation progress."""
    async def event_generator():
        last_progress = -1
        while True:
            job = JOBS_STORE.get(job_id)
            if not job:
                yield f"data: {{\"error\": \"Job not found\"}}\n\n"
                break

            current_progress = job.get("progress_pct", 0)
            if current_progress != last_progress:
                last_progress = current_progress
                payload = {
                    "job_id": job_id,
                    "progress": current_progress,
                    "current_step": job.get("current_step"),
                    "status": job.get("status"),
                    "rankings_available": len(job.get("rankings", [])) > 0
                }
                yield f"data: {json.dumps(payload)}\n\n"

            if job.get("status") in ["COMPLETED", "FAILED"]:
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/api/plans/{plan_id}")
def get_plan(plan_id: str):
    p = next((p for p in DEFAULT_CANDIDATE_PLANS if p["plan_id"] == plan_id), None)
    if not p:
        raise HTTPException(status_code=404, detail="Plan not found")
    return p

@app.get("/api/plans/{plan_id}/compare")
def compare_plan(plan_id: str, baseline_id: str = "plan_a", db: Session = Depends(get_db)):
    eval_target = db.query(EvaluationModel).filter(EvaluationModel.plan_id == plan_id).order_by(EvaluationModel.created_at.desc()).first()
    eval_base = db.query(EvaluationModel).filter(EvaluationModel.plan_id == baseline_id).order_by(EvaluationModel.created_at.desc()).first()

    if not eval_target or not eval_base:
        raise HTTPException(status_code=404, detail="Evaluation records not found for comparison")

    t_metrics = eval_target.aggregate_metrics
    b_metrics = eval_base.aggregate_metrics

    diff = {
        "target_plan_id": plan_id,
        "baseline_plan_id": baseline_id,
        "p95_time_diff_sec": round(t_metrics.get("avg_p95_exit_time_sec", 0) - b_metrics.get("avg_p95_exit_time_sec", 0), 1),
        "ambulance_delay_diff_sec": round(t_metrics.get("max_ambulance_delay_sec", 0) - b_metrics.get("max_ambulance_delay_sec", 0), 1),
        "density_diff_ped_m2": round(t_metrics.get("max_density_ped_per_m2", 0) - b_metrics.get("max_density_ped_per_m2", 0), 2),
        "status_target": eval_target.hard_constraints,
        "target_score": eval_target.final_score,
        "baseline_score": eval_base.final_score
    }
    return diff

@app.get("/api/evaluations/{plan_id}")
def get_evaluation(plan_id: str, db: Session = Depends(get_db)):
    ev = db.query(EvaluationModel).filter(EvaluationModel.plan_id == plan_id).order_by(EvaluationModel.created_at.desc()).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Evaluation not found for plan")

    return {
        "evaluation_id": ev.evaluation_id,
        "plan_id": ev.plan_id,
        "aggregate_metrics": ev.aggregate_metrics,
        "hard_constraints": ev.hard_constraints,
        "human_impact": ev.human_impact,
        "causal_chains": ev.causal_chains,
        "final_score": ev.final_score,
        "provenance": ev.provenance,
        "created_at": ev.created_at.isoformat()
    }

@app.get("/api/runs/{run_id}/evidence")
def get_run_evidence(run_id: str, db: Session = Depends(get_db)):
    run = db.query(SimulationRunModel).filter(SimulationRunModel.run_id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    return {
        "run_id": run.run_id,
        "plan_id": run.plan_id,
        "seed": run.seed,
        "stage": run.stage,
        "simulator_name": run.simulator_name,
        "simulator_version": run.simulator_version,
        "metrics": run.metrics,
        "health": run.health,
        "duration_ms": run.duration_ms,
        "data_classification": "SYNTHETIC_MODELED_CROWD",
        "created_at": run.created_at.isoformat()
    }

@app.post("/api/decisions/{job_id}/select")
def select_decision(job_id: str, req: SelectDecisionRequest, db: Session = Depends(get_db)):
    job = JOBS_STORE.get(job_id)
    event_id = job.get("event_id") if job else "event-dtu-convocation-001"

    eval_record = db.query(EvaluationModel).filter(EvaluationModel.plan_id == req.plan_id).first()
    runs = db.query(SimulationRunModel).filter(SimulationRunModel.plan_id == req.plan_id).all()
    evidence_run_ids = [r.run_id for r in runs]

    p = next((p for p in DEFAULT_CANDIDATE_PLANS if p["plan_id"] == req.plan_id), None)
    plan_name = p["name"] if p else req.plan_id

    # Gemini explanation of verified result
    explanation = req.explanation
    if not explanation and eval_record:
        # Wrap evaluation into EvaluationResult object
        ev_obj = EvaluationResult(
            evaluation_id=eval_record.evaluation_id,
            plan_id=req.plan_id,
            status="PASS" if eval_record.final_score is not None else "FAIL",
            aggregate_metrics=eval_record.aggregate_metrics,
            hard_constraints_status=eval_record.hard_constraints,
            human_impact_index=eval_record.human_impact,
            provenance=eval_record.provenance
        )
        explanation = goal_compiler.explain_evaluation_results(plan_name, ev_obj)

    decision_id = str(uuid.uuid4())
    decision = DecisionModel(
        decision_id=decision_id,
        event_id=event_id,
        selected_plan_id=req.plan_id,
        explanation=explanation,
        evidence_run_ids=evidence_run_ids,
        created_at=datetime.utcnow()
    )
    db.add(decision)

    # Record handoff to Operations Writer in Meko
    meko_svc = MekoContextService(db)
    meko_svc.record_handoff(
        event_id=event_id,
        from_role="Simulation Analyst",
        to_role="Operations Writer",
        artifacts_passed={"selected_plan_id": req.plan_id, "evidence_run_ids": evidence_run_ids},
        notes="Simulation confirmed Plan B as lowest cost feasible plan preserving accessibility."
    )

    db.commit()

    return {
        "decision_id": decision_id,
        "selected_plan_id": req.plan_id,
        "explanation": explanation,
        "evidence_run_ids": evidence_run_ids
    }

@app.post("/api/decisions/{decision_id}/compile")
def compile_action_plan(decision_id: str, req: CompileDecisionRequest, db: Session = Depends(get_db)):
    decision = db.query(DecisionModel).filter(DecisionModel.decision_id == decision_id).first()
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    eval_rec = db.query(EvaluationModel).filter(EvaluationModel.plan_id == decision.selected_plan_id).first()
    metrics = eval_rec.aggregate_metrics if eval_rec else {}

    p = next((p for p in DEFAULT_CANDIDATE_PLANS if p["plan_id"] == decision.selected_plan_id), None)
    plan_name = p["name"] if p else decision.selected_plan_id

    action_plan_obj = goal_compiler.generate_action_plan(
        decision_id=decision_id,
        selected_plan_id=decision.selected_plan_id,
        plan_name=plan_name,
        metrics=metrics,
        language=req.language
    )

    db_action = ActionPlanModel(
        action_plan_id=action_plan_obj.action_plan_id,
        decision_id=decision_id,
        steps=[s.dict() for s in action_plan_obj.steps],
        tripwires=[t.dict() for t in action_plan_obj.tripwires],
        fallback_steps=action_plan_obj.fallback_steps,
        assumptions=action_plan_obj.assumptions,
        created_at=datetime.utcnow()
    )
    db.add(db_action)
    db.commit()

    return action_plan_obj.dict()

@app.get("/api/decisions/{decision_id}/evidence")
def get_decision_evidence(decision_id: str, db: Session = Depends(get_db)):
    decision = db.query(DecisionModel).filter(DecisionModel.decision_id == decision_id).first()
    if not decision:
        raise HTTPException(status_code=404, detail="Decision not found")

    eval_rec = db.query(EvaluationModel).filter(EvaluationModel.plan_id == decision.selected_plan_id).first()

    return {
        "decision_id": decision.decision_id,
        "event_id": decision.event_id,
        "selected_plan_id": decision.selected_plan_id,
        "explanation": decision.explanation,
        "evidence_run_ids": decision.evidence_run_ids,
        "evaluation": eval_rec.aggregate_metrics if eval_rec else {},
        "provenance": eval_rec.provenance if eval_rec else {}
    }

# Meko Endpoints
@app.post("/api/meko/context")
def save_meko_context(req: MekoContextRequest, db: Session = Depends(get_db)):
    svc = MekoContextService(db)
    res = svc.save_context(
        event_id=req.event_id,
        role=req.role,
        context_payload=req.context_payload,
        handoff_from=req.handoff_from
    )
    return res

@app.get("/api/meko/context/{event_id}")
def get_meko_context(event_id: str, db: Session = Depends(get_db)):
    svc = MekoContextService(db)
    history = svc.get_event_context_history(event_id)
    return {
        "event_id": event_id,
        "integration_status": svc.mode,
        "is_external_meko_connected": svc.is_external_meko_connected,
        "specialist_handoffs": history
    }

@app.post("/api/meko/handoff")
def record_meko_handoff(req: MekoHandoffRequest, db: Session = Depends(get_db)):
    svc = MekoContextService(db)
    res = svc.record_handoff(
        event_id=req.event_id,
        from_role=req.from_role,
        to_role=req.to_role,
        artifacts_passed=req.artifacts_passed,
        notes=req.notes or ""
    )
    return res

# =============================================================================
# Phase 1: Emergency Resource & Routing Endpoints
# =============================================================================

@app.get("/api/emergency/resources")
def get_emergency_resources(db: Session = Depends(get_db)):
    """Returns all emergency resources (Ambulance, Fire Extinguishers)."""
    db_resources = db.query(EmergencyResourceModel).all()
    if db_resources:
        return [
            {
                "id": r.id,
                "type": r.type,
                "name": r.name,
                "status": r.status,
                "location": r.location,
                "building": r.building,
                "floor": r.floor,
                "availability": r.availability,
                "capacity": r.capacity,
                "assigned_incident": r.assigned_incident,
                "current_route": r.current_route,
                "destination": r.destination,
                "eta": r.eta,
                "coordinates": r.coordinates,
                "last_updated": r.last_updated.isoformat() if r.last_updated else None
            }
            for r in db_resources
        ]
    return EMERGENCY_DISPATCHER.get_all_resources()

@app.get("/api/emergency/resources/{resource_id}")
def get_emergency_resource(resource_id: str, db: Session = Depends(get_db)):
    """Returns specific emergency resource details."""
    db_res = db.query(EmergencyResourceModel).filter_by(id=resource_id).first()
    if db_res:
        return {
            "id": db_res.id,
            "type": db_res.type,
            "name": db_res.name,
            "status": db_res.status,
            "location": db_res.location,
            "building": db_res.building,
            "floor": db_res.floor,
            "availability": db_res.availability,
            "capacity": db_res.capacity,
            "assigned_incident": db_res.assigned_incident,
            "current_route": db_res.current_route,
            "destination": db_res.destination,
            "eta": db_res.eta,
            "coordinates": db_res.coordinates,
            "last_updated": db_res.last_updated.isoformat() if db_res.last_updated else None
        }
    res = EMERGENCY_DISPATCHER.get_resource(resource_id)
    if not res:
        raise HTTPException(status_code=404, detail=f"Emergency resource {resource_id} not found.")
    return res

@app.post("/api/emergency/dispatch")
def dispatch_emergency(req: EmergencyDispatchRequest, db: Session = Depends(get_db)):
    """
    Triggers automatic emergency dispatch for an active fire incident.
    Calculates safe routes, assigns nearest ambulance and fire extinguisher,
    persists in DB, and generates notifications.
    """
    dispatch_result = EMERGENCY_DISPATCHER.dispatch_for_fire_incident(
        incident_id=req.incident_id,
        location_label=req.location,
        world_version=req.world_version,
        blocked_gates=req.blocked_gates,
        blocked_segments=req.blocked_segments
    )

    # Persist in DB
    try:
        inc_data = dispatch_result["incident"]
        db_inc = db.query(EmergencyIncidentModel).filter_by(incident_id=inc_data["id"]).first()
        if not db_inc:
            db_inc = EmergencyIncidentModel(
                incident_id=inc_data["id"],
                type=inc_data["type"],
                location=inc_data["location"],
                building=inc_data["building"],
                floor=inc_data["floor"],
                status=inc_data["status"],
                coordinates={"x": 0.0, "y": 2.0, "z": 0.0},
                hazard_radius_meters=inc_data.get("hazard_radius_meters", 14.0),
                created_at=datetime.utcnow()
            )
            db.add(db_inc)
        else:
            db_inc.status = inc_data["status"]

        for r_item in [dispatch_result.get("ambulance"), dispatch_result.get("fire_extinguisher")]:
            if r_item:
                db_r = db.query(EmergencyResourceModel).filter_by(id=r_item["id"]).first()
                if db_r:
                    db_r.status = r_item["status"]
                    db_r.availability = r_item["availability"]
                    db_r.assigned_incident = r_item.get("assigned_incident")
                    db_r.current_route = r_item.get("current_route")
                    db_r.destination = r_item.get("destination")
                    db_r.eta = r_item.get("eta")
                    db_r.last_updated = datetime.utcnow()

        for route_info in dispatch_result.get("routes", []):
            db_route = db.query(EmergencyRouteModel).filter_by(route_id=route_info["route_id"]).first()
            if not db_route:
                db_route = EmergencyRouteModel(
                    route_id=route_info["route_id"],
                    resource_id=route_info["resource_id"],
                    incident_id=route_info["incident_id"],
                    world_version=route_info.get("world_version", req.world_version),
                    route=route_info["route"],
                    waypoints=route_info.get("waypoints", []),
                    distance_meters=route_info["distance_meters"],
                    estimated_time_seconds=route_info["estimated_time_seconds"],
                    safe=1 if route_info.get("safe", True) else 0,
                    rejection_reason=route_info.get("rejection_reason"),
                    provenance=route_info.get("provenance", {}),
                    created_at=datetime.utcnow()
                )
                db.add(db_route)

        for notif in dispatch_result.get("notifications", []):
            db_notif = db.query(EmergencyNotificationModel).filter_by(notification_id=notif["notification_id"]).first()
            if not db_notif:
                db_notif = EmergencyNotificationModel(
                    notification_id=notif["notification_id"],
                    incident_id=notif["incident_id"],
                    resource_id=notif["resource_id"],
                    title=notif["title"],
                    message=notif["message"],
                    priority=notif["priority"],
                    eta_seconds=notif["eta_seconds"],
                    route_summary=notif["route_summary"],
                    created_at=datetime.utcnow()
                )
                db.add(db_notif)

        db.commit()
    except Exception:
        db.rollback()

    return dispatch_result

@app.get("/api/emergency/incidents/{incident_id}/routes")
def get_incident_routes(incident_id: str, db: Session = Depends(get_db)):
    """Returns active emergency routes for an incident."""
    routes = EMERGENCY_DISPATCHER.get_routes(incident_id)
    if not routes:
        db_routes = db.query(EmergencyRouteModel).filter_by(incident_id=incident_id).all()
        routes = [
            {
                "route_id": r.route_id,
                "resource_id": r.resource_id,
                "incident_id": r.incident_id,
                "world_version": r.world_version,
                "route": r.route,
                "waypoints": r.waypoints,
                "distance_meters": r.distance_meters,
                "estimated_time_seconds": r.estimated_time_seconds,
                "safe": bool(r.safe),
                "rejection_reason": r.rejection_reason,
                "provenance": r.provenance
            }
            for r in db_routes
        ]
    return routes

@app.get("/api/emergency/incidents/{incident_id}/notifications")
def get_incident_notifications(incident_id: str, db: Session = Depends(get_db)):
    """Returns real-time emergency notifications for an incident."""
    notifs = EMERGENCY_DISPATCHER.get_notifications(incident_id)
    if not notifs:
        db_notifs = db.query(EmergencyNotificationModel).filter_by(incident_id=incident_id).all()
        notifs = [
            {
                "notification_id": n.notification_id,
                "incident_id": n.incident_id,
                "resource_id": n.resource_id,
                "title": n.title,
                "message": n.message,
                "priority": n.priority,
                "eta_seconds": n.eta_seconds,
                "route_summary": n.route_summary,
                "created_at": n.created_at.isoformat() if n.created_at else None
            }
            for n in db_notifs
        ]
    return notifs

@app.post("/api/emergency/routes/recalculate")
def recalculate_emergency_route(req: EmergencyRerouteRequest, db: Session = Depends(get_db)):
    """
    Section 19: Route Failure & Dynamic Recalculation.
    Recalculates safe route when a segment is blocked, updates resource and issues notification.
    """
    res = EMERGENCY_DISPATCHER.recalculate_on_obstruction(
        resource_id=req.resource_id,
        incident_id=req.incident_id,
        new_blocked_segment=req.blocked_segment,
        world_version=req.world_version
    )
    return res

@app.post("/api/emergency/reset")
def reset_emergency_resources(db: Session = Depends(get_db)):
    """Resets all resources to initial standby/available state."""
    res = EMERGENCY_DISPATCHER.reset()
    try:
        for r in DEFAULT_EMERGENCY_RESOURCES:
            db_res = db.query(EmergencyResourceModel).filter_by(id=r["id"]).first()
            if db_res:
                db_res.status = r["status"]
                db_res.availability = r.get("availability", "AVAILABLE")
                db_res.assigned_incident = None
                db_res.current_route = None
                db_res.destination = None
                db_res.eta = None
        db.commit()
    except Exception:
        db.rollback()
    return res

@app.get("/api/emergency/provenance")
def get_emergency_provenance():
    """Returns provenance and simulation mode transparency."""
    is_sumo = simulator.is_sumo_available
    return {
        "engine": "SUMO LIVE" if is_sumo else "PHYSICS_FALLBACK",
        "reason": "SUMO binary verified on system" if is_sumo else "SUMO NOT INSTALLED; RUNNING CALIBRATED DETERMINISTIC ROUTE NETWORK",
        "data_classification": "SYNTHETIC_MODELED_DATA",
        "safe_routing_algorithm": "Dijkstra with Emergency Priority & Fire Hazard Exclusion"
    }

