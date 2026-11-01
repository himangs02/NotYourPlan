/**
 * EventFlow World Anchors — Centralized Semantic Coordinate Configuration
 *
 * ALL semantic positions are defined here. Do NOT hard-code coordinates in
 * individual components. Adjust these when re-positioning semantic overlays
 * relative to the imported city.glb environment.
 *
 * Coordinate space: EventFlow world units (roughly 1 unit ≈ 1 metre at the
 * default camera scale).  Y = 0 is ground level.
 *
 * The city.glb is transformed by CITY_MODEL_TRANSFORM in VenueTwinViewer.tsx
 * to align with these coordinates.
 */

import * as THREE from "three";

// ─────────────────────────────────────────────────────────────────────────────
// VENUE BUILDINGS
// ─────────────────────────────────────────────────────────────────────────────
export const ANCHORS = {
  AUDITORIUM: {
    position: new THREE.Vector3(0, 4, 0),
    dimensions: { width: 26, height: 8, depth: 18 },
    label: "Main Auditorium Hall",
    id: "auditorium_hall",
  },
  FOOD_COURT: {
    position: new THREE.Vector3(0, 2.5, 16),
    dimensions: { width: 22, height: 5, depth: 12 },
    label: "Food Court Concourse",
    id: "food_court",
  },
  PARKING: {
    position: new THREE.Vector3(20, 0.2, -4),
    dimensions: { width: 14, height: 0.3, depth: 22 },
    label: "North Parking Plaza",
    id: "parking_plaza",
  },
  ASSEMBLY_AREA: {
    position: new THREE.Vector3(0, 0.08, 48),
    dimensions: { width: 30, height: 0.15, depth: 20 },
    label: "Central Evacuation & Assembly Area",
    id: "assembly_central_plaza",
  },

  // ── GATES ──────────────────────────────────────────────────────────────────
  GATE_1: {
    position: new THREE.Vector3(0, 0, -11),
    label: "Gate 1 (North / Road 17)",
    id: "gate_1",
    widthM: 6.0,
    flowCapacity: 8.0,
    cameraPos: new THREE.Vector3(0, 20, 10),
    cameraTarget: new THREE.Vector3(0, 0, -11),
  },
  GATE_2: {
    position: new THREE.Vector3(0, 0, 23),
    label: "Gate 2 (Main South Plaza — 12 m)",
    id: "gate_2",
    widthM: 12.0,
    flowCapacity: 18.0,
    cameraPos: new THREE.Vector3(0, 20, 48),
    cameraTarget: new THREE.Vector3(0, 0, 23),
  },
  GATE_3: {
    position: new THREE.Vector3(16.5, 1.95, 8.0),
    label: "Gate 3 (East Arcade & Road 17 Junction)",
    id: "gate_3",
    widthM: 5.0,
    flowCapacity: 6.5,
    cameraPos: new THREE.Vector3(36, 20, 8.0),
    cameraTarget: new THREE.Vector3(16.5, 1.95, 8.0),
  },
  GATE_4: {
    position: new THREE.Vector3(-15, 0, 10.8),
    label: "Gate 4 (West Wheelchair Ramp — Step-Free)",
    id: "gate_4",
    widthM: 4.5,
    flowCapacity: 5.0,
    isStepFree: true,
    cameraPos: new THREE.Vector3(-36, 20, 10.8),
    cameraTarget: new THREE.Vector3(-15, 0, 10.8),
  },

  // ── ROUTES ─────────────────────────────────────────────────────────────────
  ROAD_17: {
    position: new THREE.Vector3(16.5, 1.95, -10.0),
    dimensions: { width: 5.2, length: 44 },
    label: "Road 17 — Emergency Medical Corridor",
    id: "road_17",
    isEmergency: true,
    constraintMaxDelaySec: 30,
    cameraPos: new THREE.Vector3(32, 24, 0),
    cameraTarget: new THREE.Vector3(16.5, 1.95, -10.0),
  },
  STEP_FREE_RAMP: {
    position: new THREE.Vector3(-18, 0.2, 10.8),
    dimensions: { width: 4.5, length: 14 },
    label: "West Step-Free Accessibility Ramp",
    id: "ramp_stepfree",
    isStepFree: true,
    cameraPos: new THREE.Vector3(-38, 20, 10.8),
    cameraTarget: new THREE.Vector3(-18, 0, 10.8),
  },
  METRO_BOULEVARD: {
    position: new THREE.Vector3(0, 0.05, 34),
    dimensions: { width: 16, length: 18 },
    label: "Metro Boulevard Exit Avenue",
    id: "metro_boulevard",
  },

  // ── EMERGENCY RESOURCES (Phase 1 & Phase 1.1) ──────────────────────────────
  AMBULANCE: {
    position: new THREE.Vector3(16.5, 1.95, -28.0),
    label: "Ambulance 01 — MEDIC-17",
    id: "AMB-001",
  },
  FIRE_EXTINGUISHER_1: {
    position: new THREE.Vector3(16.5, 0.38, 10.8),
    label: "Fire Extinguisher FE-001 (East Arcade)",
    id: "FE-001",
    building: "Building B",
    floor: 1,
  },
  FIRE_EXTINGUISHER_2: {
    position: new THREE.Vector3(-14.5, 0.38, 10.8),
    label: "Fire Extinguisher FE-002 (West Concourse)",
    id: "FE-002",
    building: "Building B",
    floor: 2,
  },
  FIRE_EXTINGUISHER_3: {
    position: new THREE.Vector3(16.5, 0.38, -12.0),
    label: "Fire Extinguisher FE-003 (Road 17 Staging)",
    id: "FE-003",
    building: "Building A",
    floor: 1,
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// CROWD FLOW WAYPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/** Waypoints for general crowd (blue): Auditorium → Gate 2 → Assembly */
export const CROWD_FLOW_NORMAL = [
  new THREE.Vector3(0, 0, 0),    // Auditorium exit
  new THREE.Vector3(0, 0, 10),   // Food court area
  new THREE.Vector3(0, 0, 20),   // Approaching Gate 2
  new THREE.Vector3(0, 0, 34),   // Metro Boulevard
  new THREE.Vector3(0, 0, 48),   // Assembly area
];

/** Waypoints when Gate 2 is blocked: redirect to Gate 3 & Gate 4 */
export const CROWD_FLOW_GATE2_BLOCKED_G3 = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(6, 0, 6),
  new THREE.Vector3(14, 0, 6),   // Gate 3
  new THREE.Vector3(18, 0, 20),
  new THREE.Vector3(10, 0, 48),  // Assembly (east side)
];

export const CROWD_FLOW_GATE2_BLOCKED_G4 = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(-6, 0, 6),
  new THREE.Vector3(-14, 0, 6),  // Gate 4
  new THREE.Vector3(-18, 0, 20),
  new THREE.Vector3(-10, 0, 48), // Assembly (west side)
];

/** Mobility-impaired: always via Gate 4 step-free ramp */
export const CROWD_FLOW_STEPFREE = [
  new THREE.Vector3(-4, 0, 2),
  new THREE.Vector3(-10, 0, 6),
  new THREE.Vector3(-14, 0, 6),  // Gate 4
  new THREE.Vector3(-20, 0, 6),  // Step-free ramp
  new THREE.Vector3(-14, 0, 20),
  new THREE.Vector3(-10, 0, 48),
];

/** Emergency responders: Road 17 corridor */
export const ROAD_17_CORRIDOR = [
  new THREE.Vector3(16.5, 1.95, -28.0),
  new THREE.Vector3(16.5, 1.95, -18.0),
  new THREE.Vector3(16.5, 1.95, -8.0),
  new THREE.Vector3(16.5, 1.95, 0.0),
  new THREE.Vector3(16.5, 1.95, 8.0),
];

// ─────────────────────────────────────────────────────────────────────────────
// EMERGENCY RESPONSE & SAFE ROUTE WAYPOINTS (Phase 1 & Phase 1.1)
// ─────────────────────────────────────────────────────────────────────────────

/** Configurable emergency transit speeds (world units / second) */
export const EMERGENCY_VEHICLE_SPEED = 5.2;
export const EMERGENCY_RESPONDER_SPEED = 2.8;

/**
 * Primary protected ambulance safe route:
 * Follows the paved North-South street (x = 16.5) completely clear of buildings,
 * turns west at the open cross concourse avenue (z = 10.8),
 * and stages directly at the front of the Auditorium (x = 1.5, z = 10.8).
 */
export const AMBULANCE_SAFE_ROUTE = [
  new THREE.Vector3(16.5, 1.95, -28.0), // Standby on Road 17 North
  new THREE.Vector3(16.5, 1.95, -20.0), // Road 17 North
  new THREE.Vector3(16.5, 1.95, -12.0), // Road 17 Mid (Emergency Corridor)
  new THREE.Vector3(16.5, 1.95, -4.0),  // Road 17 Central
  new THREE.Vector3(16.5, 1.95, 2.0),   // Road 17 Incident Approach
  new THREE.Vector3(16.5, 1.95, 8.0),   // Road 17 Staging Area (Auditorium Incident Entry)
];

/** Recalculated bypass ambulance route when Road 17 mid-segment is obstructed */
export const AMBULANCE_REROUTE_PATH = [
  new THREE.Vector3(16.5, 1.95, -28.0), // Standby on Road 17 North
  new THREE.Vector3(16.5, 1.95, -20.0), // Road 17 North
  new THREE.Vector3(26.0, 1.95, -20.0), // Bypass East outer lane
  new THREE.Vector3(26.0, 1.95, -8.0),  // Bypass outer corridor
  new THREE.Vector3(26.0, 1.95, 2.0),   // Bypass outer corridor south
  new THREE.Vector3(16.5, 1.95, 8.0),   // Rejoin Road 17 Staging Area
];

/** Primary extinguisher response route: FE-002 -> West Concourse -> Auditorium Entry */
export const FE_002_SAFE_ROUTE = [
  new THREE.Vector3(-14.5, 1.95, 10.8),  // FE-002 station (West Concourse)
  new THREE.Vector3(-10.0, 1.95, 10.8),  // West Concourse Approach
  new THREE.Vector3(-5.0, 1.95, 10.8),   // Front Concourse Junction
  new THREE.Vector3(-1.5, 1.95, 10.8),   // Main Auditorium Access / Staging
];

// ─────────────────────────────────────────────────────────────────────────────
// SIMULATION VIEW MODE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
export type SimViewMode = "3D" | "TOP" | "SIMULATION" | "DENSITY" | "EMERGENCY";

export const SIM_VIEW_LABELS: Record<SimViewMode, string> = {
  "3D": "3D City",
  "TOP": "Top-Down",
  "SIMULATION": "Crowd Flow",
  "DENSITY": "Density",
  "EMERGENCY": "Emergency",
};
