"""
EventFlow Database models and connector.
Compatible with YugabyteDB (YSQL / PostgreSQL) and SQLite fallback for local test execution.
"""
import os
import json
import uuid
from datetime import datetime
from sqlalchemy import (
    create_engine,
    Column,
    String,
    Integer,
    Float,
    DateTime,
    ForeignKey,
    Text,
    UniqueConstraint
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from sqlalchemy.types import TypeDecorator

Base = declarative_base()

class JSONType(TypeDecorator):
    """Platform-independent JSON type: JSONB on Postgres/Yugabyte, Text with JSON serializer on SQLite."""
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return json.dumps(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, (dict, list)):
            return value
        return json.loads(value)

class EventModel(Base):
    __tablename__ = "events"

    event_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(Text, nullable=False)
    venue_name = Column(Text, nullable=False)
    attendee_count = Column(Integer, nullable=False)
    staff_budget = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class WorldVersionModel(Base):
    __tablename__ = "world_versions"

    world_version_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_id = Column(String(36), ForeignKey("events.event_id"), nullable=False)
    version_number = Column(Integer, nullable=False)
    parent_version_id = Column(String(36), ForeignKey("world_versions.world_version_id"), nullable=True)
    change_reason = Column(Text, nullable=False)
    world_config = Column(JSONType, nullable=False)
    source_metadata = Column(JSONType, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class GoalModel(Base):
    __tablename__ = "goals"

    goal_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_id = Column(String(36), ForeignKey("events.event_id"), nullable=False)
    world_version_id = Column(String(36), ForeignKey("world_versions.world_version_id"), nullable=False)
    raw_text = Column(Text, nullable=False)
    compiled_goal = Column(JSONType, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class PlanModel(Base):
    __tablename__ = "plans"

    plan_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    goal_id = Column(String(36), ForeignKey("goals.goal_id"), nullable=False)
    world_version_id = Column(String(36), ForeignKey("world_versions.world_version_id"), nullable=False)
    name = Column(Text, nullable=False)
    source = Column(Text, nullable=False)
    intervention_dsl = Column(JSONType, nullable=False)
    status = Column(Text, nullable=False)
    rejection_reasons = Column(JSONType, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class SimulationRunModel(Base):
    __tablename__ = "simulation_runs"

    run_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    plan_id = Column(String(36), ForeignKey("plans.plan_id"), nullable=False)
    seed = Column(Integer, nullable=False)
    stage = Column(Text, nullable=False)
    simulator_name = Column(Text, nullable=False)
    simulator_version = Column(Text, nullable=False)
    status = Column(Text, nullable=False)
    metrics = Column(JSONType, nullable=True)
    health = Column(JSONType, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("plan_id", "seed", "stage", name="uq_plan_seed_stage"),
    )

class EvaluationModel(Base):
    __tablename__ = "evaluations"

    evaluation_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    plan_id = Column(String(36), ForeignKey("plans.plan_id"), nullable=False)
    aggregate_metrics = Column(JSONType, nullable=False)
    hard_constraints = Column(JSONType, nullable=False)
    human_impact = Column(JSONType, nullable=False)
    causal_chains = Column(JSONType, nullable=True)
    final_score = Column(Float, nullable=True)
    provenance = Column(JSONType, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class DecisionModel(Base):
    __tablename__ = "decisions"

    decision_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_id = Column(String(36), ForeignKey("events.event_id"), nullable=False)
    selected_plan_id = Column(String(36), ForeignKey("plans.plan_id"), nullable=False)
    explanation = Column(Text, nullable=True)
    evidence_run_ids = Column(JSONType, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class ActionPlanModel(Base):
    __tablename__ = "action_plans"

    action_plan_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    decision_id = Column(String(36), ForeignKey("decisions.decision_id"), nullable=False)
    steps = Column(JSONType, nullable=False)
    tripwires = Column(JSONType, nullable=False)
    fallback_steps = Column(JSONType, nullable=False)
    assumptions = Column(JSONType, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class MekoContextModel(Base):
    __tablename__ = "meko_context"

    context_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    event_id = Column(String(36), ForeignKey("events.event_id"), nullable=False)
    role = Column(Text, nullable=False)
    handoff_from = Column(Text, nullable=True)
    context_payload = Column(JSONType, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

# Database Engine setup
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    # Default to sqlite file in local app directory for immediate zero-config execution
    DATABASE_URL = "sqlite:///eventflow.db"

# YugabyteDB/Postgres driver config
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
