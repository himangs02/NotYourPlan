-- EventFlow YugabyteDB / PostgreSQL Migration
-- Migration 002: Emergency Resources, Dispatches, Routes, and Notifications (Phase 1)

CREATE TABLE IF NOT EXISTS emergency_resources (
  id VARCHAR(64) PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  location TEXT NOT NULL,
  building TEXT,
  floor INT,
  availability TEXT NOT NULL DEFAULT 'AVAILABLE',
  capacity INT,
  assigned_incident TEXT,
  current_route JSONB,
  destination TEXT,
  eta INT,
  coordinates JSONB,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emergency_incidents (
  incident_id VARCHAR(64) PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'FIRE',
  location TEXT NOT NULL,
  building TEXT NOT NULL,
  floor INT NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  coordinates JSONB NOT NULL,
  hazard_radius_meters DOUBLE PRECISION NOT NULL DEFAULT 14.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emergency_dispatches (
  dispatch_id VARCHAR(64) PRIMARY KEY,
  resource_id VARCHAR(64) NOT NULL REFERENCES emergency_resources(id),
  incident_id VARCHAR(64) NOT NULL REFERENCES emergency_incidents(incident_id),
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'DISPATCHED',
  route_id VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS emergency_routes (
  route_id VARCHAR(64) PRIMARY KEY,
  resource_id VARCHAR(64) NOT NULL REFERENCES emergency_resources(id),
  incident_id VARCHAR(64) NOT NULL REFERENCES emergency_incidents(incident_id),
  world_version INT NOT NULL DEFAULT 1,
  route JSONB NOT NULL,
  waypoints JSONB NOT NULL,
  distance_meters DOUBLE PRECISION NOT NULL,
  estimated_time_seconds INT NOT NULL,
  safe INT NOT NULL DEFAULT 1,
  hazards JSONB,
  blocked_segments JSONB,
  rejection_reason TEXT,
  provenance JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emergency_notifications (
  notification_id VARCHAR(64) PRIMARY KEY,
  incident_id VARCHAR(64) NOT NULL REFERENCES emergency_incidents(incident_id),
  resource_id VARCHAR(64) NOT NULL REFERENCES emergency_resources(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'CRITICAL',
  eta_seconds INT NOT NULL,
  route_summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emerg_res_status ON emergency_resources(status);
CREATE INDEX IF NOT EXISTS idx_emerg_dispatches_inc ON emergency_dispatches(incident_id);
CREATE INDEX IF NOT EXISTS idx_emerg_routes_inc ON emergency_routes(incident_id);
CREATE INDEX IF NOT EXISTS idx_emerg_notif_inc ON emergency_notifications(incident_id);
