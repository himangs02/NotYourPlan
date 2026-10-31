/**
 * Semantic 3D World Object types for EventFlow Digital Twin.
 * Bridges 3D visual assets with YugabyteDB world version states.
 */

export type WorldObjectType =
  | "auditorium"
  | "gate"
  | "road"
  | "emergency_route"
  | "accessible_route"
  | "assembly_area"
  | "food_court"
  | "parking"
  | "barricade"
  | "checkpoint"
  | "ambulance"
  | "medical_tent"
  | "fire_extinguisher";

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface SemanticWorldObject {
  id: string;
  type: WorldObjectType;
  name: string;
  position: Vector3D;
  rotation?: Vector3D;
  scale?: Vector3D;
  dimensions?: {
    width?: number;
    height?: number;
    depth?: number;
    length?: number;
  };
  properties: {
    width_m?: number;
    capacity_per_sec?: number;
    flow_capacity_ped_per_sec?: number;
    status:
      | "OPEN"
      | "BLOCKED"
      | "CLEAR"
      | "CONGESTED"
      | "STANDBY"
      | "AVAILABLE"
      | "ASSIGNED"
      | "DISPATCHED"
      | "EN_ROUTE"
      | "IN_TRANSIT"
      | "AT_INCIDENT"
      | "UNAVAILABLE";
    is_blocked?: boolean;
    is_step_free?: boolean;
    is_emergency_corridor?: boolean;
    connects_to?: string | string[];
    incident_id?: string;
    eta?: number;
    distance_m?: number;
    route_type?: string;
    building?: string;
    floor?: number;
    [key: string]: any;
  };
}

export type CameraViewMode =
  | "PERSPECTIVE"
  | "TOP_DOWN"
  | "FOCUS_GATE2"
  | "FOCUS_ROAD17"
  | "FOCUS_AUDITORIUM"
  | "FOCUS_ASSEMBLY";

/** Simulation overlay view modes */
export type SimViewMode = "3D" | "TOP" | "SIMULATION" | "DENSITY" | "EMERGENCY";

/** Metrics from the active candidate plan, used to drive 3D overlays */
export interface PlanMetrics3D {
  planId: string;
  planName: string;
  isPass: boolean;
  ambDelayOk: boolean;
  stepFreeOk: boolean;
  densityHigh: boolean;
  road17Congested: boolean;
  p95ExitDisplay: string;
  ambDelaySec: number;
  avgDensity: number;
}
