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
    // Camera focus
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
    position: new THREE.Vector3(14, 0, 6),
    label: "Gate 3 (East Arcade)",
    id: "gate_3",
    widthM: 5.0,
    flowCapacity: 6.5,
    cameraPos: new THREE.Vector3(36, 20, 6),
    cameraTarget: new THREE.Vector3(14, 0, 6),
  },
  GATE_4: {
    position: new THREE.Vector3(-14, 0, 6),
    label: "Gate 4 (West Wheelchair Ramp — Step-Free)",
    id: "gate_4",
    widthM: 4.5,
    flowCapacity: 5.0,
    isStepFree: true,
    cameraPos: new THREE.Vector3(-36, 20, 6),
    cameraTarget: new THREE.Vector3(-14, 0, 6),
  },

  // ── ROUTES ─────────────────────────────────────────────────────────────────
  ROAD_17: {
    position: new THREE.Vector3(16, 0.05, -16),
    dimensions: { width: 7, length: 28 },
    label: "Road 17 — Emergency Medical Corridor",
    id: "road_17",
    isEmergency: true,
    constraintMaxDelaySec: 30,
    cameraPos: new THREE.Vector3(32, 24, -2),
    cameraTarget: new THREE.Vector3(16, 0, -16),
  },
  STEP_FREE_RAMP: {
    position: new THREE.Vector3(-20, 0.3, 6),
    dimensions: { width: 4.5, length: 14 },
    label: "West Step-Free Accessibility Ramp",
    id: "ramp_stepfree",
    isStepFree: true,
    cameraPos: new THREE.Vector3(-38, 20, 6),
    cameraTarget: new THREE.Vector3(-20, 0, 6),
  },
  METRO_BOULEVARD: {
    position: new THREE.Vector3(0, 0.05, 34),
    dimensions: { width: 16, length: 18 },
    label: "Metro Boulevard Exit Avenue",
    id: "metro_boulevard",
  },

  // ── EMERGENCY ──────────────────────────────────────────────────────────────
  AMBULANCE: {
    position: new THREE.Vector3(26, 0, -16),
    label: "Campus Medical Unit 1 — MEDIC-17",
    id: "ambulance_unit_1",
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// CROWD FLOW WAYPOINTS
// These define where each crowd group flows through the world.
// Used by the animated crowd system in AssetLibrary.ts.
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
  new THREE.Vector3(16, 0, -28),
  new THREE.Vector3(16, 0, -16),
  new THREE.Vector3(16, 0, -4),
  new THREE.Vector3(0, 0, -11),  // Gate 1
];

// ─────────────────────────────────────────────────────────────────────────────
// SIMULATION VIEW MODE DEFINITIONS
// Maps each simulation view mode to what should be highlighted in the 3D world.
// ─────────────────────────────────────────────────────────────────────────────
export type SimViewMode = "3D" | "TOP" | "SIMULATION" | "DENSITY" | "EMERGENCY";

export const SIM_VIEW_LABELS: Record<SimViewMode, string> = {
  "3D": "3D City",
  "TOP": "Top-Down",
  "SIMULATION": "Crowd Flow",
  "DENSITY": "Density",
  "EMERGENCY": "Emergency",
};

