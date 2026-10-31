-- EventFlow YugabyteDB / PostgreSQL Migration
-- Initial Schema for Crowd Management Decision Support

CREATE TABLE IF NOT EXISTS events (
  event_id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  venue_name TEXT NOT NULL,
  attendee_count INT NOT NULL,
  staff_budget INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS world_versions (
  world_version_id UUID PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(event_id),
  version_number INT NOT NULL,
  parent_version_id UUID REFERENCES world_versions(world_version_id),
  change_reason TEXT NOT NULL,
  world_config JSONB NOT NULL,
  source_metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS goals (
  goal_id UUID PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(event_id),
  world_version_id UUID NOT NULL REFERENCES world_versions(world_version_id),
  raw_text TEXT NOT NULL,
  compiled_goal JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plans (
  plan_id UUID PRIMARY KEY,
  goal_id UUID NOT NULL REFERENCES goals(goal_id),
  world_version_id UUID NOT NULL REFERENCES world_versions(world_version_id),
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  intervention_dsl JSONB NOT NULL,
  status TEXT NOT NULL,
  rejection_reasons JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulation_runs (
  run_id UUID PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES plans(plan_id),
  seed INT NOT NULL,
  stage TEXT NOT NULL,
  simulator_name TEXT NOT NULL,
  simulator_version TEXT NOT NULL,
  status TEXT NOT NULL,
  metrics JSONB,
  health JSONB,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(plan_id, seed, stage)
);

CREATE TABLE IF NOT EXISTS evaluations (
  evaluation_id UUID PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES plans(plan_id),
  aggregate_metrics JSONB NOT NULL,
  hard_constraints JSONB NOT NULL,
  human_impact JSONB NOT NULL,
  causal_chains JSONB,
  final_score DOUBLE PRECISION,
  provenance JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS decisions (
  decision_id UUID PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(event_id),
  selected_plan_id UUID NOT NULL REFERENCES plans(plan_id),
  explanation TEXT,
  evidence_run_ids JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS action_plans (
  action_plan_id UUID PRIMARY KEY,
  decision_id UUID NOT NULL REFERENCES decisions(decision_id),
  steps JSONB NOT NULL,
  tripwires JSONB NOT NULL,
  fallback_steps JSONB NOT NULL,
  assumptions JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Meko Context Layer Table (for specialist planning roles and agent handoffs)
CREATE TABLE IF NOT EXISTS meko_context (
  context_id UUID PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(event_id),
  role TEXT NOT NULL, -- 'Goal Interpreter', 'Plan Strategist', 'Simulation Analyst', 'Operations Writer'
  handoff_from TEXT,
  context_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_world_versions_event ON world_versions(event_id);
CREATE INDEX IF NOT EXISTS idx_plans_goal ON plans(goal_id);
CREATE INDEX IF NOT EXISTS idx_plans_world ON plans(world_version_id);
CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
CREATE INDEX IF NOT EXISTS idx_sim_runs_plan ON simulation_runs(plan_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_plan ON evaluations(plan_id);
CREATE INDEX IF NOT EXISTS idx_decisions_event ON decisions(event_id);
CREATE INDEX IF NOT EXISTS idx_meko_event ON meko_context(event_id);
