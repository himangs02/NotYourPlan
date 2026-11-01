"use client";

import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import * as THREE from "three";
// @ts-ignore
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import {
  RotateCcw, Layers, AlertTriangle, Plus, MapPin, X, Loader2,
  Activity, Shield, Eye, Zap, Flame, Siren, Navigation
} from "lucide-react";
import { SemanticWorldObject, CameraViewMode, SimViewMode, PlanMetrics3D } from "./types";
import {
  TwinAssetLibrary,
  EmergencyVehicleController,
  RouteTracingController,
  AmbulanceTireTracemarks,
} from "./AssetLibrary";
import type { OccupancyAssessment } from "./OccupancyAssessmentPanel";
import {
  ANCHORS,
  AMBULANCE_SAFE_ROUTE,
  AMBULANCE_REROUTE_PATH,
  FE_002_SAFE_ROUTE,
  EMERGENCY_VEHICLE_SPEED,
  EMERGENCY_RESPONDER_SPEED
} from "./worldAnchors";


// ─────────────────────────────────────────────────────────────────────────────
// CITY MODEL TRANSFORM — tune to align city.glb with EventFlow world coords.
// Auto-fit scales the model so longest XZ ≈ 100 units; .scale multiplies that.
// ─────────────────────────────────────────────────────────────────────────────
export const CITY_MODEL_TRANSFORM = {
  position: new THREE.Vector3(0, 0, 14),
  rotation: new THREE.Euler(0, 0, 0),
  scale: 1.0,
};

const CITY_GLB_PATHS = ["/models/city.optimized.glb", "/models/city.glb"];

export interface HoveredBlockInfo {
  id: string;
  name: string;
  blockCode: string;
  icon: string;
  description: string;
  statusText: string;
  statusColor: string;
  capacity?: number;
  accessible?: boolean;
  x: number;
  y: number;
  isGate?: boolean;
  isBlocked?: boolean;
  cameraPreset?: CameraViewMode;
  obj?: SemanticWorldObject;
}

// ─────────────────────────────────────────────────────────────────────────────
interface VenueTwinViewerProps {
  occupancyAssessment?: OccupancyAssessment | null;
  worldVersion: string;
  worldVersionId: string;
  blockedGate: string | null;
  highlightedElementId?: string | null;
  onToggleGateBlock: (gateId: string) => void;
  onSelectObject?: (obj: SemanticWorldObject | null) => void;
  onFocusElement?: (elementId: string) => void; // called when camera focuses via causal chain
  isSimulating?: boolean;
  planMetrics?: PlanMetrics3D | null;
  selectedPlanId?: string;
  isFireActive?: boolean;
  onToggleFire?: () => void;
  ambRerouted?: boolean;
  selectedResourceId?: string | null;
  onEmergencyStatusChange?: (resourceId: string, status: string, etaSeconds: number) => void;
  isEvacuating?: boolean;
  onToggleEvacuation?: () => void;
  onDeployExtinguisher?: () => void;
  isSystematicEvacuation?: boolean;
}

export default function VenueTwinViewer({
  occupancyAssessment = null,
  worldVersion,
  worldVersionId,
  blockedGate,
  highlightedElementId,
  onToggleGateBlock,
  onSelectObject,
  onFocusElement,
  isSimulating = false,
  planMetrics = null,
  selectedPlanId = "",
  isFireActive = false,
  onToggleFire,
  ambRerouted = false,
  selectedResourceId = null,
  onEmergencyStatusChange,
  isEvacuating: externalIsEvacuating = false,
  onToggleEvacuation,
  onDeployExtinguisher,
  isSystematicEvacuation = false,
}: VenueTwinViewerProps) {

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const objectsGroupRef = useRef<THREE.Group | null>(null);
  const crowdGroupRef = useRef<THREE.Group | null>(null);
  const fireGroupRef = useRef<THREE.Group | null>(null);
  const cityGroupRef = useRef<THREE.Group | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(performance.now());

  // Animated crowd mesh refs (so we can update them each frame)
  const attendeeMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const wheelMeshRef = useRef<THREE.InstancedMesh | null>(null);

  // Phase 1 & 1.1: Emergency route and resource tracking refs
  const ambRouteGroupRef = useRef<THREE.Group | null>(null);
  const feRouteGroupRef = useRef<THREE.Group | null>(null);
  const ambControllerRef = useRef<EmergencyVehicleController | null>(null);
  const feControllerRef = useRef<EmergencyVehicleController | null>(null);

  // Ambulance tire tracemarks, extinguisher spray & building hover outline
  const tireTracksRef = useRef<AmbulanceTireTracemarks | null>(null);
  const extinguisherSprayRef = useRef<THREE.Group | null>(null);
  const hoverOutlineRef = useRef<THREE.BoxHelper | null>(null);

  const [selectedObj, setSelectedObj] = useState<SemanticWorldObject | null>(null);
  const [simViewMode, setSimViewMode] = useState<SimViewMode>("3D");
  const [cameraViewMode, setCameraViewMode] = useState<CameraViewMode>("PERSPECTIVE");
  const [showAssetPalette, setShowAssetPalette] = useState(false);
  const [addedObjects, setAddedObjects] = useState<SemanticWorldObject[]>([]);

  // Features: Hide marks by default, hover/click block menu, fire extinguisher, crowd evacuation
  const [showLabels, setShowLabels] = useState(false);
  const [isEvacuating, setIsEvacuating] = useState(externalIsEvacuating);
  const [isExtinguishing, setIsExtinguishing] = useState(false);
  const [hoveredInfo, setHoveredInfo] = useState<HoveredBlockInfo | null>(null);
  const [pinnedBlock, setPinnedBlock] = useState<HoveredBlockInfo | null>(null);
  const [showInspectorDetails, setShowInspectorDetails] = useState(false);
  const pinnedBlockRef = useRef<HoveredBlockInfo | null>(null);

  // Sync external evacuation prop if provided
  useEffect(() => {
    setIsEvacuating(externalIsEvacuating);
  }, [externalIsEvacuating]);

  useEffect(() => {
    TwinAssetLibrary.setSystematicMode(Boolean(isSystematicEvacuation));
  }, [isSystematicEvacuation]);

  // GLB state
  const [cityLoading, setCityLoading] = useState(true);
  const [cityLoadError, setCityLoadError] = useState(false);
  const [cityLoadInfo, setCityLoadInfo] = useState("");

  // ── Derived state from planMetrics ────────────────────────────────────────
  const road17Congested = useMemo(
    () => highlightedElementId === "road_17" || (planMetrics?.road17Congested ?? false),
    [highlightedElementId, planMetrics]
  );
  const stepFreeOk = useMemo(
    () => (planMetrics?.stepFreeOk ?? true) && blockedGate !== "gate_4",
    [planMetrics, blockedGate]
  );
  const densityHigh = planMetrics?.densityHigh ?? false;
  const ambDelayFail = !(planMetrics?.ambDelayOk ?? true);

  // ── Base semantic objects (Anchored centrally in worldAnchors.ts) ────────
  const baseSemanticObjects = useMemo<SemanticWorldObject[]>(() => [
    {
      id: ANCHORS.AUDITORIUM.id,
      type: "auditorium",
      name: ANCHORS.AUDITORIUM.label,
      position: { x: ANCHORS.AUDITORIUM.position.x, y: ANCHORS.AUDITORIUM.position.y, z: ANCHORS.AUDITORIUM.position.z },
      dimensions: ANCHORS.AUDITORIUM.dimensions,
      properties: { capacity: 1800, modeled_attendees: 1800, status: "OPEN", accessible: true },
    },
    {
      id: ANCHORS.FOOD_COURT.id,
      type: "food_court",
      name: ANCHORS.FOOD_COURT.label,
      position: { x: ANCHORS.FOOD_COURT.position.x, y: ANCHORS.FOOD_COURT.position.y, z: ANCHORS.FOOD_COURT.position.z },
      dimensions: ANCHORS.FOOD_COURT.dimensions,
      properties: { capacity: 700, status: "OPEN", accessible: true },
    },
    {
      id: ANCHORS.PARKING.id,
      type: "parking",
      name: ANCHORS.PARKING.label,
      position: { x: ANCHORS.PARKING.position.x, y: ANCHORS.PARKING.position.y, z: ANCHORS.PARKING.position.z },
      dimensions: ANCHORS.PARKING.dimensions,
      properties: { capacity: 500, status: "OPEN", accessible: false },
    },
    {
      id: ANCHORS.GATE_1.id,
      type: "gate",
      name: ANCHORS.GATE_1.label,
      position: { x: ANCHORS.GATE_1.position.x, y: ANCHORS.GATE_1.position.y, z: ANCHORS.GATE_1.position.z },
      properties: {
        width_m: ANCHORS.GATE_1.widthM, flow_capacity_ped_per_sec: ANCHORS.GATE_1.flowCapacity,
        status: blockedGate === "gate_1" ? "BLOCKED" : "OPEN",
        is_blocked: blockedGate === "gate_1",
        connects_to: "road_17",
      },
    },
    {
      id: ANCHORS.GATE_2.id,
      type: "gate",
      name: ANCHORS.GATE_2.label,
      position: { x: ANCHORS.GATE_2.position.x, y: ANCHORS.GATE_2.position.y, z: ANCHORS.GATE_2.position.z },
      properties: {
        width_m: ANCHORS.GATE_2.widthM, flow_capacity_ped_per_sec: ANCHORS.GATE_2.flowCapacity,
        status: blockedGate === "gate_2" ? "BLOCKED" : "OPEN",
        is_blocked: blockedGate === "gate_2",
        connects_to: "metro_boulevard",
      },
    },
    {
      id: ANCHORS.GATE_3.id,
      type: "gate",
      name: ANCHORS.GATE_3.label,
      position: { x: ANCHORS.GATE_3.position.x, y: ANCHORS.GATE_3.position.y, z: ANCHORS.GATE_3.position.z },
      rotation: { x: 0, y: Math.PI / 2, z: 0 },
      properties: {
        width_m: ANCHORS.GATE_3.widthM, flow_capacity_ped_per_sec: ANCHORS.GATE_3.flowCapacity,
        status: blockedGate === "gate_3" ? "BLOCKED" : "OPEN",
        is_blocked: blockedGate === "gate_3",
        connects_to: "concourse_main",
      },
    },
    {
      id: ANCHORS.GATE_4.id,
      type: "gate",
      name: ANCHORS.GATE_4.label,
      position: { x: ANCHORS.GATE_4.position.x, y: ANCHORS.GATE_4.position.y, z: ANCHORS.GATE_4.position.z },
      rotation: { x: 0, y: -Math.PI / 2, z: 0 },
      properties: {
        width_m: ANCHORS.GATE_4.widthM, flow_capacity_ped_per_sec: ANCHORS.GATE_4.flowCapacity,
        status: blockedGate === "gate_4" ? "BLOCKED" : "OPEN",
        is_blocked: blockedGate === "gate_4",
        is_step_free: true, connects_to: "ramp_stepfree",
      },
    },
    {
      id: ANCHORS.ROAD_17.id,
      type: "emergency_route",
      name: ANCHORS.ROAD_17.label,
      position: { x: ANCHORS.ROAD_17.position.x, y: ANCHORS.ROAD_17.position.y, z: ANCHORS.ROAD_17.position.z },
      dimensions: ANCHORS.ROAD_17.dimensions,
      properties: {
        width_m: ANCHORS.ROAD_17.dimensions.width, is_emergency_corridor: true, reserved: true,
        status: road17Congested ? "CONGESTED" : "CLEAR",
      },
    },
    {
      id: ANCHORS.STEP_FREE_RAMP.id,
      type: "accessible_route",
      name: ANCHORS.STEP_FREE_RAMP.label,
      position: { x: ANCHORS.STEP_FREE_RAMP.position.x, y: ANCHORS.STEP_FREE_RAMP.position.y, z: ANCHORS.STEP_FREE_RAMP.position.z },
      dimensions: ANCHORS.STEP_FREE_RAMP.dimensions,
      properties: { width_m: ANCHORS.STEP_FREE_RAMP.dimensions.width, is_step_free: true, gradient_percent: 4.5, status: "OPEN" },
    },
    {
      id: ANCHORS.METRO_BOULEVARD.id,
      type: "road",
      name: ANCHORS.METRO_BOULEVARD.label,
      position: { x: ANCHORS.METRO_BOULEVARD.position.x, y: ANCHORS.METRO_BOULEVARD.position.y, z: ANCHORS.METRO_BOULEVARD.position.z },
      dimensions: ANCHORS.METRO_BOULEVARD.dimensions,
      properties: { width_m: ANCHORS.METRO_BOULEVARD.dimensions.width, status: "CLEAR" },
    },
    {
      id: ANCHORS.ASSEMBLY_AREA.id,
      type: "assembly_area",
      name: ANCHORS.ASSEMBLY_AREA.label,
      position: { x: ANCHORS.ASSEMBLY_AREA.position.x, y: ANCHORS.ASSEMBLY_AREA.position.y, z: ANCHORS.ASSEMBLY_AREA.position.z },
      dimensions: ANCHORS.ASSEMBLY_AREA.dimensions,
      properties: { capacity: 3500, safe_distance_m: 150, status: "CLEAR" },
    },
    {
      id: "AMB-001",
      type: "ambulance",
      name: "Ambulance 01 (MEDIC-17)",
      position: { x: ANCHORS.AMBULANCE.position.x, y: ANCHORS.AMBULANCE.position.y, z: ANCHORS.AMBULANCE.position.z },
      properties: {
        vehicle_type: "BLS Ambulance",
        callsign: "MEDIC-17",
        status: !isFireActive ? "STANDBY" : (ambRerouted ? "EN_ROUTE" : "DISPATCHED"),
        availability: !isFireActive ? "AVAILABLE" : "DISPATCHED",
        incident_id: isFireActive ? "EV-001" : undefined,
        eta: isFireActive ? (ambRerouted ? 91 : 72) : undefined,
        distance_m: isFireActive ? (ambRerouted ? 230 : 184) : undefined,
        route_type: ambRerouted ? "Emergency Safe Route (Bypass)" : "Emergency Safe Route",
        is_emergency_corridor: true,
        rejection_reason: isFireActive
          ? (ambRerouted
              ? "Emergency corridor obstruction on Road 17. Ambulance rerouted via East Arcade bypass."
              : "Shortest route blocked by fire hazard. Ambulance redirected through protected emergency corridor.")
          : undefined,
      },
    },
    {
      id: "FE-001",
      type: "fire_extinguisher",
      name: "Fire Extinguisher FE-001",
      position: { x: ANCHORS.FIRE_EXTINGUISHER_1.position.x, y: ANCHORS.FIRE_EXTINGUISHER_1.position.y, z: ANCHORS.FIRE_EXTINGUISHER_1.position.z },
      properties: {
        status: "AVAILABLE",
        availability: "AVAILABLE",
        building: "Building B",
        floor: 1,
        capacity: 10,
        distance_m: 210,
        route_type: "Safe Response Route",
      },
    },
    {
      id: "FE-002",
      type: "fire_extinguisher",
      name: "Fire Extinguisher FE-002 (Assigned)",
      position: { x: ANCHORS.FIRE_EXTINGUISHER_2.position.x, y: ANCHORS.FIRE_EXTINGUISHER_2.position.y, z: ANCHORS.FIRE_EXTINGUISHER_2.position.z },
      properties: {
        status: isFireActive ? "ASSIGNED" : "AVAILABLE",
        availability: isFireActive ? "ASSIGNED" : "AVAILABLE",
        building: "Building B",
        floor: 2,
        capacity: 10,
        incident_id: isFireActive ? "EV-001" : undefined,
        eta: isFireActive ? 34 : undefined,
        distance_m: 85,
        route_type: "Safe Response Route",
        selection_rationale: "Selected nearest safe extinguisher (85m vs FE-003: 142m, FE-001: 210m)",
      },
    },
    {
      id: "FE-003",
      type: "fire_extinguisher",
      name: "Fire Extinguisher FE-003",
      position: { x: ANCHORS.FIRE_EXTINGUISHER_3.position.x, y: ANCHORS.FIRE_EXTINGUISHER_3.position.y, z: ANCHORS.FIRE_EXTINGUISHER_3.position.z },
      properties: {
        status: "AVAILABLE",
        availability: "AVAILABLE",
        building: "Building A",
        floor: 1,
        capacity: 10,
        distance_m: 142,
        route_type: "Safe Response Route",
      },
    },
  ], [blockedGate, road17Congested, isFireActive, ambRerouted]);


  const allWorldObjects = useMemo(
    () => [...baseSemanticObjects, ...addedObjects],
    [baseSemanticObjects, addedObjects]
  );

  const getBlockInfoFromSemantic = useCallback((obj: SemanticWorldObject, x: number, y: number): HoveredBlockInfo => {
    let icon = "🏢";
    let blockCode = "Block";
    let description = "EventFlow campus zone";
    let statusText = "OPERATIONAL";
    let statusColor = "bg-emerald-950 text-emerald-300 border-emerald-700";
    let cameraPreset: CameraViewMode | undefined = undefined;

    if (obj.type === "auditorium") {
      icon = "🏛️";
      blockCode = "Block A · Auditorium Sector";
      description = "Primary venue gathering arena. Capacity: 1,800 occupants. Direct link to Road 17 and West Ramp.";
      cameraPreset = "FOCUS_AUDITORIUM";
      if (isFireActive) {
        statusText = "🔥 ACTIVE FIRE HAZARD";
        statusColor = "bg-rose-950 text-rose-300 border-rose-700 animate-pulse";
      } else if (isEvacuating) {
        statusText = "🏃 EVACUATION ACTIVE";
        statusColor = "bg-amber-950 text-amber-300 border-amber-700";
      }
    } else if (obj.type === "food_court") {
      icon = "🍽️";
      blockCode = "Block B · Concourse Dining";
      description = "Concourse dining and hospitality pavilion connecting directly to Gate 2 Main South Plaza.";
      if (isEvacuating) {
        statusText = "🏃 EVACUATING CROWD";
        statusColor = "bg-amber-950 text-amber-300 border-amber-700";
      }
    } else if (obj.type === "parking") {
      icon = "🅿️";
      blockCode = "Block C · North Parking Logistics";
      description = "Vehicle parking plaza and bypass transit corridor for emergency responders.";
    } else if (obj.type === "assembly_area") {
      icon = "🛡️";
      blockCode = "Sector Safe · Assembly Plaza";
      description = "Designated central evacuation zone. 3,500 capacity, 150m safe buffer distance.";
      cameraPreset = "FOCUS_ASSEMBLY";
      statusText = "SAFE ASSEMBLED ZONE";
      statusColor = "bg-emerald-950 text-emerald-300 border-emerald-700";
    } else if (obj.type === "gate") {
      icon = "🚪";
      blockCode = `Gate Sector · ${obj.id.toUpperCase()}`;
      description = `Access threshold with ${obj.properties.width_m ?? 6}m egress width and ${obj.properties.flow_capacity_ped_per_sec ?? 8} ped/sec flow capacity.`;
      cameraPreset = obj.id === "gate_2" ? "FOCUS_GATE2" : undefined;
      const isBlocked = obj.properties.is_blocked || obj.properties.status === "BLOCKED";
      statusText = isBlocked ? "⛔ BLOCKED" : "🟢 OPEN";
      statusColor = isBlocked ? "bg-rose-950 text-rose-300 border-rose-700" : "bg-emerald-950 text-emerald-300 border-emerald-700";
    } else if (obj.type === "emergency_route" || obj.id === "road_17") {
      icon = "🛣️";
      blockCode = "Corridor R-17 · Medical Express";
      description = "Protected emergency vehicle corridor with priority right-of-way for MEDIC-17 on the paved road.";
      cameraPreset = "FOCUS_ROAD17";
      statusText = road17Congested ? "⚠️ CONGESTED" : "CLEAR";
      statusColor = road17Congested ? "bg-rose-950 text-rose-300 border-rose-700" : "bg-cyan-950 text-cyan-300 border-cyan-700";
    } else if (obj.type === "accessible_route" || obj.id === "ramp_stepfree") {
      icon = "♿";
      blockCode = "Ramp W-01 · Step-Free Access";
      description = "Universal accessibility ramp (4.5% gradient) directly connecting Auditorium to Gate 4.";
      statusText = "ACCESSIBLE PASS";
      statusColor = "bg-cyan-950 text-cyan-300 border-cyan-700";
    } else if (obj.type === "ambulance" || obj.id === "AMB-001") {
      icon = "🚑";
      blockCode = "Emergency Unit · MEDIC-17";
      description = "BLS Ambulance deployed for rapid emergency response. Drives strictly along paved Road 17.";
      statusText = ambControllerRef.current?.status ?? (isFireActive ? "EN_ROUTE" : "STANDBY");
      statusColor = statusText === "STANDBY" ? "bg-slate-800 text-cyan-300 border-slate-700" : "bg-rose-950 text-rose-300 border-rose-700 animate-pulse";
    } else if (obj.type === "fire_extinguisher" || obj.id.startsWith("FE-")) {
      icon = "🧯";
      blockCode = `Station ${obj.id} · Rapid Suppression`;
      description = `Class ABC chemical fire suppression station stationed in ${obj.properties.building ?? "Building B"}.`;
      statusText = obj.properties.status ?? "AVAILABLE";
      statusColor = statusText === "AVAILABLE" ? "bg-emerald-950 text-emerald-300 border-emerald-700" : "bg-amber-950 text-amber-300 border-amber-700";
    }

    return {
      id: obj.id,
      name: obj.name,
      blockCode,
      icon,
      description,
      statusText,
      statusColor,
      capacity: obj.properties.capacity ?? (obj.dimensions?.width ? obj.properties.capacity as number | undefined : undefined),
      accessible: obj.properties.accessible ?? obj.properties.is_step_free,
      x,
      y,
      isGate: obj.type === "gate",
      isBlocked: obj.properties.is_blocked || obj.properties.status === "BLOCKED",
      cameraPreset,
      obj,
    };
  }, [isFireActive, isEvacuating, road17Congested]);

  const getBlockInfoFromPoint = useCallback((pt: THREE.Vector3, x: number, y: number): HoveredBlockInfo | null => {
    // Auditorium Hall
    if (Math.abs(pt.x) <= 13 && pt.z >= -9 && pt.z <= 9) {
      const match = allWorldObjects.find((o) => o.id === "auditorium_hall");
      if (match) return getBlockInfoFromSemantic(match, x, y);
    }
    // Food Court Concourse
    if (Math.abs(pt.x) <= 13 && pt.z >= 11 && pt.z <= 23) {
      const match = allWorldObjects.find((o) => o.id === "food_court");
      if (match) return getBlockInfoFromSemantic(match, x, y);
    }
    // North-South Road 17 Emergency Medical Corridor (x: 14 to 19, z: -32 to 12)
    if (pt.x >= 14 && pt.x <= 19 && pt.z >= -32 && pt.z <= 12) {
      const match = allWorldObjects.find((o) => o.id === "road_17");
      if (match) return getBlockInfoFromSemantic(match, x, y);
    }
    // North Parking Plaza (east of Road 17)
    if (pt.x >= 19 && pt.z <= 10 && pt.z >= -26) {
      const match = allWorldObjects.find((o) => o.id === "parking_plaza");
      if (match) return getBlockInfoFromSemantic(match, x, y);
    }
    // Central Assembly Plaza (south sector)
    if (Math.abs(pt.x) <= 22 && pt.z >= 26) {
      const match = allWorldObjects.find((o) => o.id === "assembly_central_plaza");
      if (match) return getBlockInfoFromSemantic(match, x, y);
    }
    // Step-Free Accessibility Ramp (west sector)
    if (pt.x <= -14 && pt.z >= 6 && pt.z <= 16) {
      const match = allWorldObjects.find((o) => o.id === "ramp_stepfree");
      if (match) return getBlockInfoFromSemantic(match, x, y);
    }

    // Surrounding campus blocks
    let name = "Campus Commercial Sector";
    let blockCode = "Block E · Commercial Arcade";
    let desc = "Auxiliary campus commercial facilities and services.";
    let icon = "🏢";
    if (pt.x < -12) {
      name = "West Academic Wing";
      blockCode = "Block W · Academic Complex";
      desc = "Multilevel academic department complex with step-free concourse access.";
      icon = "🏫";
    } else if (pt.z < -14) {
      name = "North Logistics Plaza";
      blockCode = "Block N · Logistics Annex";
      desc = "Service infrastructure and vehicle maintenance staging.";
      icon = "🏭";
    }

    return {
      id: "city_block_" + Math.round(pt.x) + "_" + Math.round(pt.z),
      name,
      blockCode,
      icon,
      description: desc,
      statusText: "OPERATIONAL",
      statusColor: "bg-slate-800 text-slate-300 border-slate-700",
      x,
      y,
    };
  }, [allWorldObjects, getBlockInfoFromSemantic]);

  const handleToggleLabels = useCallback(() => {
    setShowLabels((prev) => {
      const next = !prev;
      TwinAssetLibrary.setShowLabels(next, sceneRef.current ?? undefined);
      return next;
    });
  }, []);

  const handleTriggerEvacuate = useCallback(() => {
    setIsEvacuating((prev) => {
      const next = !prev;
      TwinAssetLibrary.setEvacuationState(next, blockedGate === "gate_2");
      return next;
    });
    onToggleEvacuation?.();
  }, [blockedGate, onToggleEvacuation]);

  const handleDeployExtinguisher = useCallback(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    // Dispatch FE-002 controller if active
    if (feControllerRef.current) {
      feControllerRef.current.dispatch();
    }

    const fe2 = scene.getObjectByName("FE-002");
    const sprayOrigin = fe2
      ? fe2.position.clone().add(new THREE.Vector3(0, 1.2, 0))
      : new THREE.Vector3(-1.5, 1.2, 10.8);

    if (extinguisherSprayRef.current) {
      extinguisherSprayRef.current.removeFromParent();
    }

    // Target rooftop fire at y = 14.0
    const fireTarget = new THREE.Vector3(0, 14.0, 0);
    const spray = TwinAssetLibrary.createExtinguisherSpray(
      sprayOrigin,
      fireTarget
    );
    scene.add(spray);
    extinguisherSprayRef.current = spray;
    setIsExtinguishing(true);
    onEmergencyStatusChange?.("FE-002", "IN_TRANSIT", 0);
    onDeployExtinguisher?.();
  }, [onEmergencyStatusChange, onDeployExtinguisher]);

  // ── Scene initialisation (runs once) ─────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x030712);

    const grid = new THREE.GridHelper(150, 75, 0x1e293b, 0x0f172a);
    grid.position.y = -0.02;
    scene.add(grid);

    // Ambulance Tire Tracemarks ground layer
    const tireTracks = new AmbulanceTireTracemarks();
    scene.add(tireTracks.group);
    tireTracksRef.current = tireTracks;

    // Building Hover Outline Highlight Box
    const hoverBox = new THREE.BoxHelper(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)), 0x38bdf8);
    hoverBox.visible = false;
    scene.add(hoverBox);
    hoverOutlineRef.current = hoverBox;

    // City GLB group — added BEFORE semantic objects so it renders beneath
    const cityGroup = new THREE.Group();
    cityGroup.name = "city_glb_environment";
    scene.add(cityGroup);
    cityGroupRef.current = cityGroup;

    // Semantic objects group
    const objectsGroup = new THREE.Group();
    objectsGroup.name = "world_objects_root";
    scene.add(objectsGroup);
    objectsGroupRef.current = objectsGroup;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(30, 60, 40);
    dir.castShadow = true;
    scene.add(dir);
    const accent = new THREE.PointLight(0x6366f1, 2, 80);
    accent.position.set(-20, 25, -20);
    scene.add(accent);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 600);
    camera.position.set(0, 55, 65);
    camera.lookAt(0, 0, 10);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    containerRef.current.replaceChildren(renderer.domElement);

    // Orbit controls
    let isDragging = false;
    let prevMouseX = 0, prevMouseY = 0;
    let spherical = { radius: 85, theta: 0, phi: Math.PI / 4 };
    const updateCam = () => {
      const x = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
      const y = spherical.radius * Math.cos(spherical.phi);
      const z = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta) + 10;
      camera.position.set(x, Math.max(8, y), z);
      camera.lookAt(0, 0, 10);
    };
    let mouseDownPos = { x: 0, y: 0 };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        isDragging = true;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
        mouseDownPos = { x: e.clientX, y: e.clientY };
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      spherical.theta -= (e.clientX - prevMouseX) * 0.007;
      spherical.phi = Math.max(0.1, Math.min(Math.PI / 2.1, spherical.phi - (e.clientY - prevMouseY) * 0.007));
      prevMouseX = e.clientX; prevMouseY = e.clientY;
      updateCam();
    };
    const onMouseUp = () => { isDragging = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      spherical.radius = Math.max(20, Math.min(220, spherical.radius + e.deltaY * 0.06));
      updateCam();
    };

    const domElem = renderer.domElement;
    domElem.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    domElem.addEventListener("wheel", onWheel, { passive: false });

    // Raycasting — interactive semantic objects & GLB building inspection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerMove = (e: MouseEvent) => {
      if (isDragging) {
        if (!pinnedBlockRef.current) {
          setHoveredInfo(null);
          if (hoverOutlineRef.current) hoverOutlineRef.current.visible = false;
        }
        return;
      }
      const rect = domElem.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // 1. Check semantic objects
      const semHits = raycaster.intersectObjects(objectsGroup.children, true);
      if (semHits.length > 0) {
        let cur: THREE.Object3D | null = semHits[0].object;
        while (cur && !cur.userData?.semanticObject && cur.parent && cur !== objectsGroup) {
          cur = cur.parent;
        }
        if (cur?.userData?.semanticObject) {
          const obj = cur.userData.semanticObject as SemanticWorldObject;
          if (!pinnedBlockRef.current && hoverOutlineRef.current) {
            hoverOutlineRef.current.setFromObject(cur);
            hoverOutlineRef.current.visible = true;
          }
          const info = getBlockInfoFromSemantic(obj, e.clientX - rect.left, e.clientY - rect.top);
          setHoveredInfo(info);
          return;
        }
      }

      // 2. Check GLB city environment buildings
      const cityHits = raycaster.intersectObjects(cityGroup.children, true);
      if (cityHits.length > 0 && cityHits[0].point.y > 0.4) {
        const pt = cityHits[0].point;
        if (!pinnedBlockRef.current && hoverOutlineRef.current && cityHits[0].object) {
          hoverOutlineRef.current.setFromObject(cityHits[0].object);
          hoverOutlineRef.current.visible = true;
        }
        const info = getBlockInfoFromPoint(pt, e.clientX - rect.left, e.clientY - rect.top);
        if (info) {
          setHoveredInfo(info);
          return;
        }
      }

      if (!pinnedBlockRef.current) {
        if (hoverOutlineRef.current) hoverOutlineRef.current.visible = false;
        setHoveredInfo(null);
      }
    };

    const onPointerLeave = () => {
      if (!pinnedBlockRef.current) {
        setHoveredInfo(null);
        if (hoverOutlineRef.current) hoverOutlineRef.current.visible = false;
      }
    };

    domElem.addEventListener("mousemove", onPointerMove);
    domElem.addEventListener("mouseleave", onPointerLeave);

    const onClick = (e: MouseEvent) => {
      // Ignore click if user was dragging/orbiting the camera
      const dragDist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
      if (dragDist > 6) return;

      const rect = domElem.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // 1. Check semantic objects
      const semHits = raycaster.intersectObjects(objectsGroup.children, true);
      if (semHits.length > 0) {
        let cur: THREE.Object3D | null = semHits[0].object;
        while (cur && !cur.userData?.semanticObject && cur.parent && cur !== objectsGroup) {
          cur = cur.parent;
        }
        if (cur?.userData?.semanticObject) {
          const obj = cur.userData.semanticObject as SemanticWorldObject;
          if (hoverOutlineRef.current) {
            hoverOutlineRef.current.setFromObject(cur);
            hoverOutlineRef.current.visible = true;
          }
          const info = getBlockInfoFromSemantic(obj, e.clientX - rect.left, e.clientY - rect.top);
          setPinnedBlock(info);
          pinnedBlockRef.current = info;
          setSelectedObj(obj);
          onSelectObject?.(obj);
          return;
        }
      }

      // 2. Check GLB city environment buildings
      const cityHits = raycaster.intersectObjects(cityGroup.children, true);
      if (cityHits.length > 0 && cityHits[0].point.y > 0.4) {
        const pt = cityHits[0].point;
        if (hoverOutlineRef.current && cityHits[0].object) {
          hoverOutlineRef.current.setFromObject(cityHits[0].object);
          hoverOutlineRef.current.visible = true;
        }
        const info = getBlockInfoFromPoint(pt, e.clientX - rect.left, e.clientY - rect.top);
        if (info) {
          setPinnedBlock(info);
          pinnedBlockRef.current = info;
          if (info.obj) {
            setSelectedObj(info.obj);
            onSelectObject?.(info.obj);
          } else {
            setSelectedObj(null);
          }
          return;
        }
      }

      // Clicked on ground / empty space: unpin block
      setPinnedBlock(null);
      pinnedBlockRef.current = null;
      setSelectedObj(null);
      if (hoverOutlineRef.current) hoverOutlineRef.current.visible = false;
    };
    domElem.addEventListener("click", onClick);

    // Animation loop — also runs crowd animation & fire suppression
    let angle = 0;
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      angle += 0.02;

      // Drive moving ambulance along Road 17 emergency corridor
      const amb = scene.getObjectByName("AMB-001");
      if (amb) {
        if (ambControllerRef.current) {
          ambControllerRef.current.update(Math.min(dt / 1000, 0.05));
        } else {
          TwinAssetLibrary.updateAmbulanceStandby(amb);
        }
      }

      // Drive fire response FE-002 marker
      const fe2 = scene.getObjectByName("FE-002");
      if (fe2) {
        if (feControllerRef.current) {
          feControllerRef.current.update(Math.min(dt / 1000, 0.05));
        }
      }

      // Update active fire extinguisher spray & suppression action
      if (isExtinguishing && extinguisherSprayRef.current) {
        if (fe2) {
          extinguisherSprayRef.current.position.set(fe2.position.x, fe2.position.y + 1.2, fe2.position.z);
        }
        TwinAssetLibrary.updateExtinguisherSpray(dt, extinguisherSprayRef.current);
        if (fireGroupRef.current) {
          const fullyExtinguished = TwinAssetLibrary.extinguishFire(dt, fireGroupRef.current);
          if (fullyExtinguished) {
            setIsExtinguishing(false);
            if (extinguisherSprayRef.current) {
              extinguisherSprayRef.current.removeFromParent();
              extinguisherSprayRef.current = null;
            }
            if (fireGroupRef.current) {
              fireGroupRef.current.removeFromParent();
              fireGroupRef.current = null;
            }
            onToggleFire?.();
            onEmergencyStatusChange?.("FE-002", "AVAILABLE", 0);
          }
        }
      } else if (fireGroupRef.current) {
        TwinAssetLibrary.updateFireEffect(dt, fireGroupRef.current);
      }

      // Animate crowd evacuation stream along verified safe corridors
      if (attendeeMeshRef.current && wheelMeshRef.current) {
        TwinAssetLibrary.updateCrowdAnimation(
          dt,
          attendeeMeshRef.current,
          wheelMeshRef.current
        );
      }

      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const onResize = () => {
      if (!containerRef.current) return;
      const nw = containerRef.current.clientWidth;
      const nh = containerRef.current.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", onResize);

    // ── Load city.glb ────────────────────────────────────────────────────
    let glbCancelled = false;
    (async () => {
      const loader = new GLTFLoader();
      for (const path of CITY_GLB_PATHS) {
        if (glbCancelled) break;
        try {
          const gltf: any = await new Promise((res, rej) =>
            loader.load(path, res, undefined, rej)
          );
          if (glbCancelled) break;
          const model = gltf.scene as THREE.Group;

          // Auto-fit
          const rawBox = new THREE.Box3().setFromObject(model);
          const rawSize = rawBox.getSize(new THREE.Vector3());
          const maxXZ = Math.max(rawSize.x, rawSize.z);
          const autoScale = maxXZ > 0.001
            ? (100 / maxXZ) * CITY_MODEL_TRANSFORM.scale
            : CITY_MODEL_TRANSFORM.scale;
          model.scale.setScalar(autoScale);

          const scaledBox = new THREE.Box3().setFromObject(model);
          const groundY = scaledBox.min.y;
          const scaledCenter = scaledBox.getCenter(new THREE.Vector3());

          model.position.set(
            CITY_MODEL_TRANSFORM.position.x - scaledCenter.x,
            CITY_MODEL_TRANSFORM.position.y - groundY,
            CITY_MODEL_TRANSFORM.position.z - scaledCenter.z
          );
          model.rotation.copy(CITY_MODEL_TRANSFORM.rotation);

          model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              (child as THREE.Mesh).receiveShadow = true;
              const mesh = child as THREE.Mesh;
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              mats.forEach((m) => {
                if (m instanceof THREE.MeshStandardMaterial) m.metalness = Math.min(m.metalness, 0.4);
              });
            }
          });

          cityGroup.add(model);
          const info = `city.glb ✓ | ${rawSize.x.toFixed(1)}×${rawSize.y.toFixed(1)}×${rawSize.z.toFixed(1)} | scale ${autoScale.toFixed(4)} | ${path}`;
          setCityLoadInfo(info);
          setCityLoading(false);
          setCityLoadError(false);
          console.info("[EventFlow CityGLB]", info);
          return;
        } catch (err) {
          console.warn(`[EventFlow CityGLB] Failed "${path}":`, err);
        }
      }
      if (!glbCancelled) {
        setCityLoading(false);
        setCityLoadError(true);
      }
    })();

    return () => {
      glbCancelled = true;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      domElem.removeEventListener("mousedown", onMouseDown);
      domElem.removeEventListener("mousemove", onPointerMove);
      domElem.removeEventListener("mouseleave", onPointerLeave);
      domElem.removeEventListener("wheel", onWheel);
      domElem.removeEventListener("click", onClick);
      if (tireTracksRef.current) {
        tireTracksRef.current.clear();
        scene.remove(tireTracksRef.current.group);
        tireTracksRef.current = null;
      }
      if (extinguisherSprayRef.current) {
        scene.remove(extinguisherSprayRef.current);
        extinguisherSprayRef.current = null;
      }
      if (hoverOutlineRef.current) {
        scene.remove(hoverOutlineRef.current);
        hoverOutlineRef.current.dispose();
        hoverOutlineRef.current = null;
      }
      cityGroup.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          const m = c as THREE.Mesh;
          m.geometry?.dispose();
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat: THREE.Material) => mat?.dispose());
        }
      });
      renderer.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync semantic objects with 3D scene ───────────────────────────────────
  useEffect(() => {
    if (!objectsGroupRef.current) return;
    const root = objectsGroupRef.current;
    root.clear();
    attendeeMeshRef.current = null;
    wheelMeshRef.current = null;

    for (const obj of allWorldObjects) {
      const isHighlighted = selectedObj?.id === obj.id || highlightedElementId === obj.id;
      root.add(TwinAssetLibrary.createObjectMesh(obj, isHighlighted));
    }
    // Enforce label visibility (hidden by default)
    TwinAssetLibrary.setShowLabels(showLabels, root);

    // Reconnect active emergency vehicle controllers to new meshes if scene rebuilt
    const newAmb = root.getObjectByName("AMB-001");
    if (newAmb) {
      if (ambControllerRef.current) {
        newAmb.position.copy(ambControllerRef.current.vehicle.position);
        newAmb.rotation.copy(ambControllerRef.current.vehicle.rotation);
        ambControllerRef.current.vehicle = newAmb;
        ambControllerRef.current.updateStatusBadge();
      } else {
        TwinAssetLibrary.updateAmbulanceStandby(newAmb);
      }
    }
    const newFe2 = root.getObjectByName("FE-002");
    if (newFe2 && feControllerRef.current) {
      newFe2.position.copy(feControllerRef.current.vehicle.position);
      newFe2.rotation.copy(feControllerRef.current.vehicle.rotation);
      feControllerRef.current.vehicle = newFe2;
      feControllerRef.current.updateStatusBadge();
    }

    // Reset agents when gate state changes so waypoints are recalculated
    TwinAssetLibrary.resetAgents();

    const { group, attendeeMesh, wheelMesh } = TwinAssetLibrary.createInstancedCrowd(
      350,
      blockedGate === "gate_2"
    );
    crowdGroupRef.current = group;
    attendeeMeshRef.current = attendeeMesh;
    wheelMeshRef.current = wheelMesh;
    root.add(group);
  }, [allWorldObjects, selectedObj, highlightedElementId, blockedGate]);

  // Schematic occupancy sectors, positioned from the backend world footprint.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !occupancyAssessment || !isFireActive) return;
    const group = new THREE.Group();
    group.name = "occupancy_assessment_zones";
    const colors = [0xfbbf24, 0xfb923c, 0xa78bfa];
    occupancyAssessment.zones.forEach((zone, i) => {
      const b = zone.bounds;
      const geometry = new THREE.PlaneGeometry(b.width - 0.15, b.depth);
      const material = new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true,
        opacity: 0.3, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(b.x, 0.2, b.z);
      mesh.renderOrder = 950;
      group.add(mesh);
      const canvas = document.createElement("canvas");
      canvas.width = 384; canvas.height = 96;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, 384, 96);
        ctx.fillStyle = "#fef3c7"; ctx.font = "bold 30px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(`Z${i + 1} · ${zone.occupant_count} modeled`, 192, 42);
        ctx.font = "23px sans-serif"; ctx.fillText("Schematic sector", 192, 77);
        const texture = new THREE.CanvasTexture(canvas);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false }));
        sprite.position.set(b.x, 10, b.z); sprite.scale.set(8, 2, 1); sprite.renderOrder = 951;
        sprite.userData = { isSemanticBadge: true };
        sprite.visible = showLabels;
        group.add(sprite);
      }
    });
    scene.add(group);
    return () => {
      scene.remove(group);
      group.traverse(object => {
        if (object instanceof THREE.Mesh) { object.geometry.dispose(); object.material.dispose(); }
        if (object instanceof THREE.Sprite) { object.material.map?.dispose(); object.material.dispose(); }
      });
    };
  }, [occupancyAssessment, isFireActive, showLabels]);

  // Synchronize 3D Fire Simulation in Main Auditorium
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    const existingFire = scene.getObjectByName("fire_simulation_system");
    if (existingFire) {
      existingFire.removeFromParent();
      fireGroupRef.current = null;
    }

    if (isFireActive) {
      const fire = TwinAssetLibrary.createFireEffect(ANCHORS.AUDITORIUM.position);
      fire.name = "fire_simulation_system";
      fireGroupRef.current = fire;
      scene.add(fire);
      TwinAssetLibrary.setFireState(true, blockedGate === "gate_2");
    } else {
      TwinAssetLibrary.setFireState(false, blockedGate === "gate_2");
    }
  }, [isFireActive, blockedGate]);

  // Synchronize 3D Emergency Routes (Ambulance + Fire Extinguisher)
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    // Remove old route visuals
    const oldAmb1 = scene.getObjectByName("emergency_route_visual_Ambulance Safe Route");
    if (oldAmb1) oldAmb1.removeFromParent();
    const oldAmb2 = scene.getObjectByName("emergency_route_visual_Ambulance Reroute (Bypass)");
    if (oldAmb2) oldAmb2.removeFromParent();
    const oldFe = scene.getObjectByName("emergency_route_visual_FE-002 Response Route");
    if (oldFe) oldFe.removeFromParent();

    if (isFireActive) {
      // 1. Ambulance Safe Route
      const ambWps = ambRerouted ? AMBULANCE_REROUTE_PATH : AMBULANCE_SAFE_ROUTE;
      const ambRoute = TwinAssetLibrary.createEmergencyRouteVisual(
        ambWps,
        0x06b6d4, // Glowing Cyan
        ambRerouted ? "Ambulance Reroute (Bypass)" : "Ambulance Safe Route",
        false
      );
      ambRouteGroupRef.current = ambRoute;
      scene.add(ambRoute);

      const amb = scene.getObjectByName("AMB-001");
      if (amb) {
        if (!ambControllerRef.current) {
          const ambCtrl = new EmergencyVehicleController(
            amb,
            ambWps,
            EMERGENCY_VEHICLE_SPEED,
            {
              tireTracemarks: tireTracksRef.current ?? undefined,
              onStatusChange: (status) => {
                onEmergencyStatusChange?.("AMB-001", status, status === "AT_INCIDENT" ? 0 : (ambRerouted ? 91 : 72));
              },
              onRouteComplete: () => {
                onEmergencyStatusChange?.("AMB-001", "AT_INCIDENT", 0);
              },
            }
          );
          ambCtrl.setRouteVisual(ambRoute);
          ambCtrl.dispatch();
          ambControllerRef.current = ambCtrl;
          onEmergencyStatusChange?.("AMB-001", "DISPATCHED", ambRerouted ? 91 : 72);
        } else if (ambRerouted) {
          ambControllerRef.current.tireTracemarks = tireTracksRef.current ?? undefined;
          ambControllerRef.current.reroute(ambWps);
          ambControllerRef.current.setRouteVisual(ambRoute);
          onEmergencyStatusChange?.("AMB-001", "EN_ROUTE", 91);
        }
      }

      // 2. Fire Extinguisher FE-002 Safe Route
      const feRoute = TwinAssetLibrary.createEmergencyRouteVisual(
        FE_002_SAFE_ROUTE,
        0xf97316, // Glowing Orange
        "FE-002 Response Route",
        true
      );
      feRouteGroupRef.current = feRoute;
      scene.add(feRoute);

      const fe2 = scene.getObjectByName("FE-002");
      if (fe2) {
        if (!feControllerRef.current) {
          const feCtrl = new EmergencyVehicleController(
            fe2,
            FE_002_SAFE_ROUTE,
            EMERGENCY_RESPONDER_SPEED,
            {
              onStatusChange: (status) => {
                onEmergencyStatusChange?.("FE-002", status === "AT_INCIDENT" ? "AT_INCIDENT" : "IN_TRANSIT", 0);
              },
              onRouteComplete: () => {
                onEmergencyStatusChange?.("FE-002", "AT_INCIDENT", 0);
              },
            }
          );
          feCtrl.setRouteVisual(feRoute);
          feCtrl.dispatch();
          feControllerRef.current = feCtrl;
          onEmergencyStatusChange?.("FE-002", "IN_TRANSIT", 34);
        }
      }
    } else {
      // Standby / reset
      tireTracksRef.current?.clear();
      if (ambControllerRef.current) {
        ambControllerRef.current.reset(ANCHORS.AMBULANCE.position);
        ambControllerRef.current = null;
      } else {
        const amb = scene.getObjectByName("AMB-001");
        if (amb) {
          amb.position.set(ANCHORS.AMBULANCE.position.x, 1.95, ANCHORS.AMBULANCE.position.z);
          amb.rotation.set(0, 0, 0);
          TwinAssetLibrary.updateAmbulanceStandby(amb);
        }
      }

      if (feControllerRef.current) {
        feControllerRef.current.reset(ANCHORS.FIRE_EXTINGUISHER_2.position);
        feControllerRef.current = null;
      } else {
        const fe2 = scene.getObjectByName("FE-002");
        if (fe2) {
          fe2.position.set(ANCHORS.FIRE_EXTINGUISHER_2.position.x, 1.95, ANCHORS.FIRE_EXTINGUISHER_2.position.z);
          fe2.rotation.set(0, 0, 0);
        }
      }

      onEmergencyStatusChange?.("AMB-001", "STANDBY", 0);
      onEmergencyStatusChange?.("FE-002", "AVAILABLE", 0);
    }
  }, [isFireActive, ambRerouted, onEmergencyStatusChange]);

  // Focus resource when selected via Command Center
  useEffect(() => {
    if (!selectedResourceId) return;
    const match = allWorldObjects.find((o) => o.id === selectedResourceId);
    if (match) {
      setSelectedObj(match);
      if (cameraRef.current) {
        cameraRef.current.position.set(match.position.x + 12, match.position.y + 14, match.position.z + 12);
        cameraRef.current.lookAt(match.position.x, match.position.y, match.position.z);
      }
    }
  }, [selectedResourceId, allWorldObjects]);


  // ── Apply simulation view mode to scene ──────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    // Density overlay mesh (named so we can remove/re-add)
    scene.getObjectByName("density_overlay")?.removeFromParent();

    if (simViewMode === "DENSITY" && densityHigh) {
      // Subtle red density fog plane over the concourse area
      const overlay = new THREE.Mesh(
        new THREE.BoxGeometry(30, 0.3, 22),
        new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.18 })
      );
      overlay.name = "density_overlay";
      overlay.position.set(0, 1, 10);
      scene.add(overlay);
    }

    if (simViewMode === "EMERGENCY") {
      // Focus camera on Road 17
      focusCamera("FOCUS_ROAD17");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simViewMode, densityHigh]);

  // ── Camera helpers ────────────────────────────────────────────────────────
  const focusCamera = useCallback((mode: CameraViewMode) => {
    setCameraViewMode(mode);
    const cam = cameraRef.current;
    if (!cam) return;
    switch (mode) {
      case "TOP_DOWN":
        cam.position.set(0, 120, 14); cam.lookAt(0, 0, 14); break;
      case "FOCUS_GATE2":
        cam.position.set(0, 20, 48); cam.lookAt(0, 0, 23);
        setSelectedObj(allWorldObjects.find((o) => o.id === "gate_2") ?? null);
        break;
      case "FOCUS_ROAD17":
        cam.position.set(32, 24, -2); cam.lookAt(16, 0, -16);
        setSelectedObj(allWorldObjects.find((o) => o.id === "road_17") ?? null);
        onFocusElement?.("road_17");
        break;
      case "FOCUS_AUDITORIUM":
        cam.position.set(0, 30, 32); cam.lookAt(0, 4, 0);
        setSelectedObj(allWorldObjects.find((o) => o.id === "auditorium_hall") ?? null);
        break;
      case "FOCUS_ASSEMBLY":
        cam.position.set(0, 30, 78); cam.lookAt(0, 0, 48);
        setSelectedObj(allWorldObjects.find((o) => o.id === "assembly_central_plaza") ?? null);
        break;
      default:
        cam.position.set(0, 55, 65); cam.lookAt(0, 0, 10); break;
    }
  }, [allWorldObjects, onFocusElement]);

  // Expose imperative focus so page.tsx causal chain buttons can call it
  // via the onFocusElement callback — we handle highlightedElementId changes:
  useEffect(() => {
    if (!highlightedElementId) return;
    if (highlightedElementId === "road_17") {
      focusCamera("FOCUS_ROAD17");
    } else if (highlightedElementId === "gate_1") {
      const cam = cameraRef.current;
      if (cam) { cam.position.set(0, 18, 8); cam.lookAt(0, 0, -11); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedElementId]);

  // ── Add infrastructure ────────────────────────────────────────────────────
  const handleAddInfrastructure = (type: "barricade" | "medical_tent" | "checkpoint") => {
    const id = `${type}_${Date.now().toString().slice(-4)}`;
    setAddedObjects((prev) => [
      ...prev,
      {
        id, type,
        name: type === "barricade" ? "Crowd Barricade Barrier"
          : type === "medical_tent" ? "Medical First Aid Station"
          : "Security Checkpoint Arch",
        position: { x: (Math.random() - 0.5) * 16, y: 0, z: 8 + Math.random() * 8 },
        properties: { status: "OPEN" },
      },
    ]);
  };

  // ─────────────────────────────────────────────────────────────────────────
  const SIM_MODES: { key: SimViewMode; icon: React.ReactNode; label: string; color: string }[] = [
    { key: "3D",         icon: <Eye className="w-3 h-3" />,      label: "3D",       color: "indigo" },
    { key: "TOP",        icon: <Layers className="w-3 h-3" />,   label: "Top",      color: "indigo" },
    { key: "SIMULATION", icon: <Activity className="w-3 h-3" />, label: "Sim",      color: "cyan"   },
    { key: "DENSITY",    icon: <Zap className="w-3 h-3" />,      label: "Density",  color: "amber"  },
    { key: "EMERGENCY",  icon: <Shield className="w-3 h-3" />,   label: "Emerg",    color: "rose"   },
  ];

  const simModeActive = (k: SimViewMode) =>
    k === simViewMode
      ? `bg-${SIM_MODES.find((m) => m.key === k)?.color ?? "indigo"}-600 text-white`
      : "bg-slate-800 text-slate-400 hover:text-white";

  return (
    <div className="relative w-full aspect-square lg:aspect-[16/10] bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col select-none">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-10 px-3 py-2 bg-slate-900/90 backdrop-blur border-b border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-xs font-bold text-white tracking-wide uppercase whitespace-nowrap">
            3D Digital Twin
          </span>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 whitespace-nowrap">
            {worldVersion.split(":")[0]}
          </span>
          {cityLoading ? (
            <span className="flex items-center gap-1 text-[9px] font-mono text-slate-400 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 whitespace-nowrap">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />Loading city…
            </span>
          ) : cityLoadError ? (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 whitespace-nowrap">⚠ Procedural</span>
          ) : (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800 whitespace-nowrap">✓ city.glb</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center rounded bg-slate-950 border border-slate-800 p-0.5 gap-0.5">
            {SIM_MODES.map(({ key, icon, label }) => (
              <button
                key={key}
                onClick={() => {
                  setSimViewMode(key);
                  if (key === "TOP") focusCamera("TOP_DOWN");
                  else if (key === "3D") focusCamera("PERSPECTIVE");
                  else if (key === "EMERGENCY") focusCamera("FOCUS_ROAD17");
                }}
                title={label}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium transition ${
                  simViewMode === key
                    ? key === "EMERGENCY" ? "bg-rose-600 text-white"
                      : key === "DENSITY" ? "bg-amber-600 text-white"
                      : key === "SIMULATION" ? "bg-cyan-700 text-white"
                      : "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {icon}
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Toggle Labels */}
          <button
            onClick={handleToggleLabels}
            title={showLabels ? "Hide 3D Floating Badges (hover still works)" : "Show 3D Floating Badges"}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition ${
              showLabels
                ? "bg-cyan-600 text-white border-cyan-500 shadow-sm shadow-cyan-500/20"
                : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white"
            }`}
          >
            <Eye className="w-3 h-3" />
            <span className="hidden sm:inline">Labels: {showLabels ? "ON" : "OFF"}</span>
          </button>

          {/* Evacuate People */}
          <button
            onClick={handleTriggerEvacuate}
            title="Trigger active crowd evacuation stream towards Central Assembly Area"
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition ${
              isEvacuating
                ? "bg-amber-600 text-white border-amber-500 animate-pulse shadow-sm shadow-amber-500/20"
                : "bg-emerald-950/80 text-emerald-300 border-emerald-700 hover:bg-emerald-900"
            }`}
          >
            <Navigation className="w-3 h-3" />
            <span className="hidden sm:inline">{isEvacuating ? "Evacuating..." : "Evacuate"}</span>
          </button>

          {/* Deploy Fire Extinguisher */}
          {isFireActive && (
            <button
              onClick={handleDeployExtinguisher}
              title="Deploy chemical foam extinguisher from FE-002"
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition ${
                isExtinguishing
                  ? "bg-rose-600 text-white border-rose-500 animate-pulse shadow-sm shadow-rose-500/20"
                  : "bg-rose-950/90 text-rose-300 border-rose-700 hover:bg-rose-900"
              }`}
            >
              <Flame className="w-3 h-3" />
              <span className="hidden sm:inline">{isExtinguishing ? "Spraying..." : "Extinguisher"}</span>
            </button>
          )}

          <button
            onClick={() => setShowAssetPalette((p) => !p)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition ${
              showAssetPalette
                ? "bg-indigo-600 text-white border-indigo-500"
                : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
            }`}
          >
            <Plus className="w-3 h-3" />Palette
          </button>
        </div>
      </div>

      {/* ── GLB Loading overlay ──────────────────────────────────────────── */}
      {cityLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
            <p className="text-sm text-slate-200 font-semibold">Loading 3D City Model…</p>
            <p className="text-xs text-slate-500 font-mono">city.glb — EventFlow Digital Twin</p>
          </div>
        </div>
      )}

      {/* ── Fallback notice ──────────────────────────────────────────────── */}
      {cityLoadError && !cityLoading && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-lg bg-amber-950/90 border border-amber-700 text-[9px] font-mono text-amber-300 pointer-events-none whitespace-nowrap">
          3D Asset unavailable — using procedural fallback
        </div>
      )}

      {/* ── Road 17 congestion alert ─────────────────────────────────────── */}
      {road17Congested && !cityLoading && (
        <div className="absolute top-10 right-2 z-10 px-2 py-1 rounded bg-rose-950/95 border border-rose-700 text-[9px] font-mono text-rose-300 pointer-events-none animate-pulse">
          🚑 ROAD 17 CONGESTED — Amb delay &gt;30s
        </div>
      )}

      {/* ── Step-free badge ──────────────────────────────────────────────── */}
      {!cityLoading && (
        <div className={`absolute top-12 left-2 z-10 px-2 py-0.5 rounded font-mono text-[9px] pointer-events-none ${
          stepFreeOk
            ? "bg-cyan-950/90 border border-cyan-800 text-cyan-300"
            : "bg-rose-950/90 border border-rose-700 text-rose-300 animate-pulse"
        }`}>
          {stepFreeOk ? "♿ STEP-FREE ✓" : "⚠ ACCESSIBILITY VIOLATION"}
        </div>
      )}

      {/* ── Density overlay label ────────────────────────────────────────── */}
      {simViewMode === "DENSITY" && !cityLoading && (
        <div className="absolute top-18 left-1/2 -translate-x-1/2 z-10 px-2 py-0.5 rounded bg-amber-950/90 border border-amber-700 text-[9px] font-mono text-amber-300 pointer-events-none whitespace-nowrap">
          DENSITY VIEW — {densityHigh ? "⚠ HIGH CONGESTION" : "Normal"} — SYNTHETIC_MODELED_CROWD
        </div>
      )}

      {/* ── Plan indicator strip ─────────────────────────────────────────── */}
      {planMetrics && !cityLoading && simViewMode === "SIMULATION" && (
        <div className="absolute top-18 left-2 z-10 flex flex-col gap-0.5 pointer-events-none">
          <div className={`px-2 py-0.5 rounded text-[9px] font-mono border ${
            planMetrics.isPass
              ? "bg-emerald-950/90 border-emerald-800 text-emerald-300"
              : "bg-rose-950/90 border-rose-800 text-rose-300"
          }`}>
            {planMetrics.isPass ? "✓" : "✗"} {planMetrics.planName.slice(0, 20)}…
          </div>
          <div className="px-2 py-0.5 rounded text-[9px] font-mono bg-slate-900/90 border border-slate-700 text-slate-300">
            P95: {planMetrics.p95ExitDisplay} | Amb: {planMetrics.ambDelaySec}s
          </div>
        </div>
      )}

      {/* ── World v2 delta badge ─────────────────────────────────────────── */}
      {blockedGate && !cityLoading && (
        <div className="absolute top-18 right-2 z-10 pointer-events-none">
          <div className="bg-slate-900/95 border border-amber-700/60 rounded p-2 text-[9px] font-mono text-slate-300 space-y-0.5 max-w-[140px]">
            <div className="text-amber-400 font-bold">World v2 Delta</div>
            <div>Gate 2 <span className="text-red-400">BLOCKED</span></div>
            <div>Crowd <span className="text-amber-400">REROUTED</span></div>
            {road17Congested && <div>Road 17 <span className="text-red-400">CONGESTED</span></div>}
          </div>
        </div>
      )}

      {/* ── Main canvas ──────────────────────────────────────────────────── */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* ── Asset Palette ────────────────────────────────────────────────── */}
      {showAssetPalette && (
        <div className="absolute top-10 right-2 z-20 w-44 bg-slate-900/97 border border-slate-800 rounded-lg p-2.5 shadow-2xl flex flex-col gap-2 backdrop-blur text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1">
            <span className="font-bold text-slate-200 text-[11px]">3D Asset Palette</span>
            <button onClick={() => setShowAssetPalette(false)} className="text-slate-400 hover:text-white"><X className="w-3 h-3" /></button>
          </div>
          {(["barricade", "checkpoint", "medical_tent"] as const).map((t) => (
            <button
              key={t}
              onClick={() => handleAddInfrastructure(t)}
              className="w-full text-left px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-between text-[10px]"
            >
              <span>+ {t === "barricade" ? "Barricade" : t === "checkpoint" ? "Security Arch" : "First Aid Tent"}</span>
              <span className={`font-mono ${t === "medical_tent" ? "text-rose-400" : t === "checkpoint" ? "text-indigo-400" : "text-amber-400"}`}>
                {t === "barricade" ? "Infra" : t === "checkpoint" ? "Control" : "Emerg"}
              </span>
            </button>
          ))}
          {cityLoadInfo && (
            <div className="border-t border-slate-800 pt-1 text-[8px] font-mono text-slate-600 leading-tight break-all">{cityLoadInfo}</div>
          )}
        </div>
      )}

      {/* ── Building / Block Options Menu Card (Click to Pin or Hover to Preview) ── */}
      {(pinnedBlock || hoveredInfo) && (
        <div
          style={{
            left: Math.max(12, Math.min((pinnedBlock || hoveredInfo)!.x + 14, (containerRef.current?.clientWidth ?? 700) - 290)),
            top: Math.max(45, Math.min((pinnedBlock || hoveredInfo)!.y + 14, (containerRef.current?.clientHeight ?? 500) - 290)),
          }}
          className={`absolute z-30 w-72 bg-slate-900/98 border shadow-2xl rounded-xl p-3.5 backdrop-blur pointer-events-auto transition-all ${
            pinnedBlock
              ? "border-cyan-400 shadow-cyan-500/20 ring-1 ring-cyan-500/30"
              : "border-slate-700/80 shadow-black/60"
          }`}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-1.5 border-b border-slate-800 pb-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xl shrink-0">{(pinnedBlock || hoveredInfo)!.icon}</span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">
                  {(pinnedBlock || hoveredInfo)!.name}
                </div>
                <div className="text-[10px] font-mono text-cyan-400 truncate">{(pinnedBlock || hoveredInfo)!.blockCode}</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {pinnedBlock && (
                <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700">
                  📌 PINNED
                </span>
              )}
              {pinnedBlock ? (
                <button
                  onClick={() => {
                    setPinnedBlock(null);
                    pinnedBlockRef.current = null;
                    setSelectedObj(null);
                    if (hoverOutlineRef.current) hoverOutlineRef.current.visible = false;
                  }}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  title="Close / Unpin Card"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border ${(pinnedBlock || hoveredInfo)!.statusColor}`}>
                  {(pinnedBlock || hoveredInfo)!.statusText}
                </span>
              )}
            </div>
          </div>

          <p className="text-[10px] text-slate-300 leading-relaxed mb-2.5">
            {(pinnedBlock || hoveredInfo)!.description}
          </p>

          {(pinnedBlock || hoveredInfo)!.capacity !== undefined && (
            <div className="flex justify-between items-center text-[10px] text-slate-400 mb-2 border-t border-slate-800/80 pt-1.5">
              <span>Capacity:</span>
              <span className="font-mono text-slate-200 font-semibold">{(pinnedBlock || hoveredInfo)!.capacity!.toLocaleString()} occupants</span>
            </div>
          )}

          {/* Interactive Options Menu */}
          <div className="flex flex-col gap-1.5 pt-1.5 border-t border-slate-800">
            <div className="text-[9px] font-mono text-slate-400 font-semibold uppercase tracking-wider flex items-center justify-between">
              <span>Options &amp; Actions</span>
              {!pinnedBlock && (
                <span className="text-[8px] text-cyan-400 font-sans normal-case">Click block to pin options</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {(pinnedBlock || hoveredInfo)!.cameraPreset && (
                <button
                  onClick={() => focusCamera((pinnedBlock || hoveredInfo)!.cameraPreset!)}
                  className="px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-medium flex items-center justify-center gap-1 border border-slate-700 transition shadow-sm"
                >
                  🎯 Focus View
                </button>
              )}

              <button
                onClick={handleTriggerEvacuate}
                className={`px-2 py-1.5 rounded text-[10px] font-medium flex items-center justify-center gap-1 border transition shadow-sm ${
                  isEvacuating
                    ? "bg-amber-900/90 hover:bg-amber-800 text-amber-200 border-amber-600 font-bold animate-pulse"
                    : "bg-emerald-950/90 hover:bg-emerald-900 text-emerald-300 border-emerald-700"
                }`}
              >
                🏃 {isEvacuating ? "Evacuating..." : "Evacuate"}
              </button>

              {isFireActive && (
                <button
                  onClick={handleDeployExtinguisher}
                  className="px-2 py-1.5 rounded bg-rose-900/90 hover:bg-rose-800 text-rose-200 text-[10px] font-medium flex items-center justify-center gap-1 border border-rose-600 transition shadow-sm"
                >
                  🧯 Extinguish
                </button>
              )}

              {(pinnedBlock || hoveredInfo)!.isGate && (pinnedBlock || hoveredInfo)!.id && (
                <button
                  onClick={() => onToggleGateBlock((pinnedBlock || hoveredInfo)!.id)}
                  className={`px-2 py-1.5 rounded text-[10px] font-medium flex items-center justify-center gap-1 border transition shadow-sm ${
                    (pinnedBlock || hoveredInfo)!.isBlocked
                      ? "bg-emerald-950/90 hover:bg-emerald-900 text-emerald-300 border-emerald-700"
                      : "bg-rose-950/90 hover:bg-rose-900 text-rose-300 border-rose-700"
                  }`}
                >
                  {(pinnedBlock || hoveredInfo)!.isBlocked ? "🟢 Open Gate" : "⛔ Block Gate"}
                </button>
              )}

              {(pinnedBlock || hoveredInfo)!.obj && (
                <button
                  onClick={() => setShowInspectorDetails((p) => !p)}
                  className="px-2 py-1.5 rounded bg-indigo-950/90 hover:bg-indigo-900 text-indigo-300 text-[10px] font-medium flex items-center justify-center gap-1 border border-indigo-700 col-span-2 transition shadow-sm"
                >
                  {showInspectorDetails ? "▲ Hide Technical Specs" : "🔍 Inspect Technical Specs"}
                </button>
              )}
            </div>

            {/* Expanded Detailed Properties when Inspect Technical Specs is clicked */}
            {showInspectorDetails && (pinnedBlock || hoveredInfo)!.obj && (
              <div className="mt-2 pt-2 border-t border-slate-800 text-[9px] space-y-1 text-slate-300 font-mono">
                <Row label="ID" value={(pinnedBlock || hoveredInfo)!.obj!.id} mono />
                <Row label="Type" value={(pinnedBlock || hoveredInfo)!.obj!.type.toUpperCase()} mono color="cyan" />
                <Row label="Status" value={(pinnedBlock || hoveredInfo)!.statusText} mono />
                {(pinnedBlock || hoveredInfo)!.obj!.properties.width_m && (
                  <Row label="Width" value={`${(pinnedBlock || hoveredInfo)!.obj!.properties.width_m} m`} />
                )}
                {(pinnedBlock || hoveredInfo)!.obj!.properties.flow_capacity_ped_per_sec && (
                  <Row label="Flow" value={`${(pinnedBlock || hoveredInfo)!.obj!.properties.flow_capacity_ped_per_sec} ped/sec`} />
                )}
                {(pinnedBlock || hoveredInfo)!.obj!.properties.is_step_free && (
                  <Row label="Access" value="STEP-FREE ✓" color="cyan" mono />
                )}
                {(pinnedBlock || hoveredInfo)!.obj!.properties.is_emergency_corridor && (
                  <Row label="Corridor" value="EMERGENCY ROUTE" color="rose" mono />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bottom toolbar ───────────────────────────────────────────────── */}
      <div className="absolute bottom-1 left-1 right-1 z-10 px-2 py-1 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-lg flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 text-[9px] flex-wrap">
          <span className="text-slate-600">Cam:</span>
          {([
            { mode: "PERSPECTIVE" as CameraViewMode, label: "Orbit" },
            { mode: "TOP_DOWN" as CameraViewMode, label: "Top↓" },
            { mode: "FOCUS_AUDITORIUM" as CameraViewMode, label: "🏢 Hall" },
            { mode: "FOCUS_GATE2" as CameraViewMode, label: "G2" },
            { mode: "FOCUS_ROAD17" as CameraViewMode, label: "🚑 R17" },
            { mode: "FOCUS_ASSEMBLY" as CameraViewMode, label: "Assembly" },
          ] as const).map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => focusCamera(mode)}
              className={`px-1.5 py-0.5 rounded transition ${
                cameraViewMode === mode
                  ? mode === "FOCUS_ROAD17" ? "bg-rose-600 text-white"
                    : mode === "FOCUS_ASSEMBLY" ? "bg-emerald-600 text-white"
                    : "bg-indigo-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
          {blockedGate ? (
            <button
              onClick={() => onToggleGateBlock(blockedGate)}
              className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />Unblock {blockedGate.toUpperCase()}
            </button>
          ) : (
            <button
              onClick={() => onToggleGateBlock("gate_2")}
              className="text-indigo-400 hover:text-indigo-300 font-bold"
            >
              Block Gate 2
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helper component ─────────────────────────────────────────────────────────
function Row({
  label, value, mono = false,
  color,
}: { label: string; value: string; mono?: boolean; color?: string }) {
  const colorClass =
    color === "cyan" ? "text-cyan-400"
    : color === "rose" ? "text-rose-400"
    : color === "amber" ? "text-amber-400"
    : color === "emerald" ? "text-emerald-400"
    : "text-slate-200";
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-500">{label}:</span>
      <span className={`${mono ? "font-mono" : ""} ${colorClass} font-bold`}>{value}</span>
    </div>
  );
}
