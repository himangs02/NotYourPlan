

"use client";

import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import * as THREE from "three";
// @ts-ignore
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import {
  RotateCcw, Layers, AlertTriangle, Plus, MapPin, X, Loader2,
  Activity, Shield, Eye, Zap, Flame, Siren, Navigation, Maximize2,
  Building2, Coffee, Car, ShieldCheck, DoorOpen, Accessibility,
  CheckCircle2, XCircle, Sliders, LocateFixed
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

function renderBlockIcon(iconKey: string) {
  switch (iconKey) {
    case "auditorium":
      return <Building2 className="w-4 h-4 text-purple-600" />;
    case "food_court":
      return <Coffee className="w-4 h-4 text-amber-600" />;
    case "parking":
      return <Car className="w-4 h-4 text-slate-600" />;
    case "assembly_area":
      return <ShieldCheck className="w-4 h-4 text-emerald-600" />;
    case "gate":
      return <DoorOpen className="w-4 h-4 text-indigo-600" />;
    case "emergency_route":
      return <Navigation className="w-4 h-4 text-rose-600" />;
    case "accessible_route":
      return <Accessibility className="w-4 h-4 text-cyan-600" />;
    case "ambulance":
      return <Siren className="w-4 h-4 text-rose-600" />;
    case "fire_extinguisher":
      return <Flame className="w-4 h-4 text-amber-600" />;
    default:
      return <Layers className="w-4 h-4 text-purple-600" />;
  }
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
  onAmbulanceEtaChange?: (remainingSec: number, remainingDistMeters: number, status: string) => void;
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
  onAmbulanceEtaChange,
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

  // Live real-time ambulance ETA to destination HUD
  const [liveAmbEta, setLiveAmbEta] = useState<{
    status: string;
    remainingSec: number;
    remainingDist: number;
  } | null>(null);

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
    let icon = "building";
    let blockCode = "Block";
    let description = "EventFlow campus zone";
    let statusText = "OPERATIONAL";
    let statusColor = "bg-emerald-950 text-emerald-300 border-emerald-700";
    let cameraPreset: CameraViewMode | undefined = undefined;

    if (obj.type === "auditorium") {
      icon = "auditorium";
      blockCode = "Block A · Auditorium Sector";
      description = "Primary venue gathering arena. Capacity: 1,800 occupants. Direct link to Road 17 and West Ramp.";
      cameraPreset = "FOCUS_AUDITORIUM";
      if (isFireActive) {
        statusText = "ACTIVE FIRE HAZARD";
        statusColor = "bg-rose-950 text-rose-300 border-rose-700 animate-pulse";
      } else if (isEvacuating) {
        statusText = "EVACUATION ACTIVE";
        statusColor = "bg-amber-950 text-amber-300 border-amber-700";
      }
    } else if (obj.type === "food_court") {
      icon = "food_court";
      blockCode = "Block B · Concourse Dining";
      description = "Concourse dining and hospitality pavilion connecting directly to Gate 2 Main South Plaza.";
      if (isEvacuating) {
        statusText = "EVACUATING CROWD";
        statusColor = "bg-amber-950 text-amber-300 border-amber-700";
      }
    } else if (obj.type === "parking") {
      icon = "parking";
      blockCode = "Block C · North Parking Logistics";
      description = "Vehicle parking plaza and bypass transit corridor for emergency responders.";
    } else if (obj.type === "assembly_area") {
      icon = "assembly_area";
      blockCode = "Sector Safe · Assembly Plaza";
      description = "Designated central evacuation zone. 3,500 capacity, 150m safe buffer distance.";
      cameraPreset = "FOCUS_ASSEMBLY";
      statusText = "SAFE ASSEMBLED ZONE";
      statusColor = "bg-emerald-950 text-emerald-300 border-emerald-700";
    } else if (obj.type === "gate") {
      icon = "gate";
      blockCode = `Gate Sector · ${obj.id.toUpperCase()}`;
      description = `Access threshold with ${obj.properties.width_m ?? 6}m egress width and ${obj.properties.flow_capacity_ped_per_sec ?? 8} ped/sec flow capacity.`;
      cameraPreset = obj.id === "gate_2" ? "FOCUS_GATE2" : undefined;
      const isBlocked = obj.properties.is_blocked || obj.properties.status === "BLOCKED";
      statusText = isBlocked ? "BLOCKED" : "OPEN";
      statusColor = isBlocked ? "bg-rose-950 text-rose-300 border-rose-700" : "bg-emerald-950 text-emerald-300 border-emerald-700";
    } else if (obj.type === "emergency_route" || obj.id === "road_17") {
      icon = "emergency_route";
      blockCode = "Corridor R-17 · Medical Express";
      description = "Protected emergency vehicle corridor with priority right-of-way for MEDIC-17 on the paved road.";
      cameraPreset = "FOCUS_ROAD17";
      statusText = road17Congested ? "CONGESTED" : "CLEAR";
      statusColor = road17Congested ? "bg-rose-950 text-rose-300 border-rose-700" : "bg-cyan-950 text-cyan-300 border-cyan-700";
    } else if (obj.type === "accessible_route" || obj.id === "ramp_stepfree") {
      icon = "accessible_route";
      blockCode = "Ramp W-01 · Step-Free Access";
      description = "Universal accessibility ramp (4.5% gradient) directly connecting Auditorium to Gate 4.";
      statusText = "ACCESSIBLE PASS";
      statusColor = "bg-cyan-950 text-cyan-300 border-cyan-700";
    } else if (obj.type === "ambulance" || obj.id === "AMB-001") {
      icon = "ambulance";
      blockCode = "Emergency Unit · MEDIC-17";
      description = "BLS Ambulance deployed for rapid emergency response. Drives strictly along paved Road 17.";
      statusText = ambControllerRef.current?.status ?? (isFireActive ? "EN_ROUTE" : "STANDBY");
      statusColor = statusText === "STANDBY" ? "bg-slate-800 text-cyan-300 border-slate-700" : "bg-rose-950 text-rose-300 border-rose-700 animate-pulse";
    } else if (obj.type === "fire_extinguisher" || obj.id.startsWith("FE-")) {
      icon = "fire_extinguisher";
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
    // North-South Road 17 Emergency Medical Corridor (x: 7.6 to 11.4, z: -34 to 12)
    if (pt.x >= 7.6 && pt.x <= 11.4 && pt.z >= -34 && pt.z <= 12) {
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
    let icon = "building";
    if (pt.x < -12) {
      name = "West Academic Wing";
      blockCode = "Block W · Academic Complex";
      desc = "Multilevel academic department complex with step-free concourse access.";
      icon = "building";
    } else if (pt.z < -14) {
      name = "North Logistics Plaza";
      blockCode = "Block N · Logistics Annex";
      desc = "Service infrastructure and vehicle maintenance staging.";
      icon = "parking";
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
    scene.background = new THREE.Color(0xdbeafe);

    const grid = new THREE.GridHelper(150, 75, 0x94a3b8, 0xcbd5e1);
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
    scene.add(new THREE.AmbientLight(0xffffff, 1.25));
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(30, 60, 40);
    dir.castShadow = true;
    scene.add(dir);
    const accent = new THREE.PointLight(0xdbeafe, 1.5, 80);
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
      const material = new THREE.MeshBasicMaterial({
        color: colors[i % colors.length], transparent: true,
        opacity: 0.3, side: THREE.DoubleSide, depthTest: false, depthWrite: false
      });
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
                const remSec = ambCtrl.getRemainingTimeSec();
                onEmergencyStatusChange?.("AMB-001", status, status === "AT_INCIDENT" ? 0 : remSec);
              },
              onEtaUpdate: (remainingSec, remainingDist) => {
                setLiveAmbEta({
                  status: ambCtrl.status,
                  remainingSec,
                  remainingDist,
                });
                onAmbulanceEtaChange?.(remainingSec, Math.round(remainingDist * 5), ambCtrl.status);
              },
              onRouteComplete: () => {
                setLiveAmbEta({
                  status: "AT_INCIDENT",
                  remainingSec: 0,
                  remainingDist: 0,
                });
                onEmergencyStatusChange?.("AMB-001", "AT_INCIDENT", 0);
                onAmbulanceEtaChange?.(0, 0, "AT_INCIDENT");
              },
            }
          );
          ambCtrl.setRouteVisual(ambRoute);
          ambCtrl.dispatch();
          ambControllerRef.current = ambCtrl;
          const initialEta = ambCtrl.getRemainingTimeSec();
          setLiveAmbEta({
            status: "DISPATCHED",
            remainingSec: initialEta,
            remainingDist: ambCtrl.getRemainingDistance(),
          });
          onEmergencyStatusChange?.("AMB-001", "DISPATCHED", initialEta);
          onAmbulanceEtaChange?.(initialEta, Math.round(ambCtrl.getRemainingDistance() * 5), "DISPATCHED");
        } else if (ambRerouted) {
          ambControllerRef.current.tireTracemarks = tireTracksRef.current ?? undefined;
          ambControllerRef.current.reroute(ambWps);
          ambControllerRef.current.setRouteVisual(ambRoute);
          const rerouteEta = ambControllerRef.current.getRemainingTimeSec();
          setLiveAmbEta({
            status: "EN_ROUTE",
            remainingSec: rerouteEta,
            remainingDist: ambControllerRef.current.getRemainingDistance(),
          });
          onEmergencyStatusChange?.("AMB-001", "EN_ROUTE", rerouteEta);
          onAmbulanceEtaChange?.(rerouteEta, Math.round(ambControllerRef.current.getRemainingDistance() * 5), "EN_ROUTE");
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
      setLiveAmbEta(null);
      if (ambControllerRef.current) {
        ambControllerRef.current.reset(ANCHORS.AMBULANCE.position);
        ambControllerRef.current = null;
      } else {
        const amb = scene.getObjectByName("AMB-001");
        if (amb) {
          amb.position.set(ANCHORS.AMBULANCE.position.x, ANCHORS.AMBULANCE.position.y, ANCHORS.AMBULANCE.position.z);
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
        cam.position.set(22, 10, -18); cam.lookAt(10.0, 2.00, -26);
        setSelectedObj(allWorldObjects.find((o) => o.id === "AMB-001") ?? allWorldObjects.find((o) => o.id === "road_17") ?? null);
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
    { key: "3D", icon: <Eye className="w-3 h-3" />, label: "3D", color: "indigo" },
    { key: "TOP", icon: <Layers className="w-3 h-3" />, label: "Top", color: "indigo" },
    { key: "SIMULATION", icon: <Activity className="w-3 h-3" />, label: "Sim", color: "cyan" },
    { key: "DENSITY", icon: <Zap className="w-3 h-3" />, label: "Density", color: "amber" },
    { key: "EMERGENCY", icon: <Shield className="w-3 h-3" />, label: "Emerg", color: "rose" },
  ];

  const simModeActive = (k: SimViewMode) =>
    k === simViewMode
      ? `bg-${SIM_MODES.find((m) => m.key === k)?.color ?? "indigo"}-600 text-white`
      : "bg-slate-800 text-slate-400 hover:text-white";

  return (
    <div className="relative w-full aspect-square lg:aspect-[16/10] bg-slate-100 border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm flex flex-col select-none">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-10 px-3.5 py-2 bg-white/95 backdrop-blur-xl border border-slate-200/90 rounded-xl shadow-sm flex items-center justify-between gap-3 text-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          <span className="text-xs font-semibold text-slate-800 tracking-tight whitespace-nowrap">
            3D Digital Twin
          </span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
            {worldVersion.split(":")[0]} ▾
          </span>
          {cityLoading ? (
            <span className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 whitespace-nowrap">
              <Loader2 className="w-2.5 h-2.5 animate-spin text-slate-500" />Loading model…
            </span>
          ) : cityLoadError ? (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap">Procedural</span>
          ) : (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 whitespace-nowrap">✓ city.glb</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Segmented View Controller */}
          <div className="flex items-center rounded-full bg-slate-100 p-0.5 border border-slate-200 gap-0.5 shadow-inner">
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
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${simViewMode === key
                    ? "bg-[#7c3aed] text-white shadow-sm font-semibold"
                    : "text-slate-600 hover:text-slate-900"
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
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all ${showLabels
                ? "bg-[#7c3aed] text-white font-semibold border-[#7c3aed] shadow-xs"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
          >
            <Eye className="w-3 h-3" />
            <span className="hidden sm:inline">Labels: {showLabels ? "ON" : "OFF"}</span>
          </button>

          {/* Evacuate People */}
          <button
            onClick={handleTriggerEvacuate}
            title="Trigger active crowd evacuation stream towards Central Assembly Area"
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold border transition-all ${isEvacuating
                ? "bg-amber-100 text-amber-800 border-amber-300 animate-pulse shadow-sm"
                : "bg-[#7c3aed] text-white border-[#7c3aed] hover:bg-[#6d28d9] shadow-xs"
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
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold border transition-all ${isExtinguishing
                  ? "bg-rose-600 text-white border-rose-500 animate-pulse shadow-sm"
                  : "bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200"
                }`}
            >
              <Flame className="w-3 h-3" />
              <span className="hidden sm:inline">{isExtinguishing ? "Spraying..." : "Extinguisher"}</span>
            </button>
          )}

          <button
            onClick={() => setShowAssetPalette((p) => !p)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all ${showAssetPalette
                ? "bg-slate-200 text-slate-900 border-slate-300"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-xs"
              }`}
          >
            <Plus className="w-3 h-3" />Palette
          </button>
        </div>
      </div>

      {/* ── GLB Loading overlay ──────────────────────────────────────────── */}
      {cityLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950/75 backdrop-blur-md pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-zinc-400 animate-spin" />
            <p className="text-xs text-zinc-200 font-semibold tracking-tight">Loading 3D Spatial Geometry…</p>
            <p className="text-[10px] text-zinc-500 font-mono">city.glb &bull; EventFlow Digital Twin</p>
          </div>
        </div>
      )}

      {/* ── Real-Time Ambulance HUD (Corner Widget - Non-blocking) ────────────── */}
      {isFireActive && (
        <div className="absolute top-14 right-3 z-20 pointer-events-none flex flex-col items-end animate-in fade-in slide-in-from-right-2 duration-300">
          <div className={`px-3.5 py-1.5 rounded-2xl border shadow-xl backdrop-blur-xl flex items-center gap-2.5 transition-all duration-300 ${liveAmbEta?.status === "AT_INCIDENT"
              ? "bg-zinc-950/90 border-emerald-500/40 text-emerald-200 shadow-[0_0_16px_rgba(16,185,129,0.2)]"
              : "bg-zinc-950/90 border-white/[0.12] text-white shadow-lg"
            }`}>
            <div className="relative flex items-center justify-center shrink-0 w-6 h-6 rounded-full bg-white/10 text-white">
              <Siren className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              {liveAmbEta?.status !== "AT_INCIDENT" && (
                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
              )}
            </div>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold tracking-tight text-zinc-200 truncate">
                  Ambulance 01 <span className="text-zinc-500 font-mono text-[9px]">MEDIC-17</span>
                </span>
                <span className={`text-[8px] font-mono font-medium px-1.5 py-0.2 rounded-full border whitespace-nowrap ${liveAmbEta?.status === "AT_INCIDENT"
                    ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-300 border-amber-500/20"
                  }`}>
                  {liveAmbEta?.status === "AT_INCIDENT" ? "ARRIVED" : "EN ROUTE"}
                </span>
              </div>

              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[9px] text-zinc-400 font-medium">ETA:</span>
                <span className={`font-mono font-bold text-xs tracking-tight ${liveAmbEta?.status === "AT_INCIDENT"
                    ? "text-emerald-400"
                    : "text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.4)]"
                  }`}>
                  {liveAmbEta?.status === "AT_INCIDENT"
                    ? "00:00 (ARRIVED)"
                    : `${Math.floor((liveAmbEta?.remainingSec ?? 29) / 60).toString().padStart(2, "0")}:${((liveAmbEta?.remainingSec ?? 29) % 60).toString().padStart(2, "0")}`}
                </span>
                <span className="text-[8px] text-zinc-500 font-mono">
                  ({Math.round((liveAmbEta?.remainingDist ?? 36) * 5)}m &bull; {ambRerouted ? "Bypass" : "Road 17"})
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Fallback notice ──────────────────────────────────────────────── */}
      {cityLoadError && !cityLoading && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-zinc-900/90 border border-white/[0.08] text-[9px] font-mono text-zinc-400 pointer-events-none whitespace-nowrap">
          3D Asset unavailable &bull; procedural fallback
        </div>
      )}

      {/* ── Road 17 congestion alert ─────────────────────────────────────── */}
      {road17Congested && !cityLoading && (
        <div className="absolute top-28 right-3 z-10 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-[10px] font-semibold text-rose-700 pointer-events-none flex items-center gap-1.5 shadow-sm">
          <Siren className="w-3 h-3 text-rose-600" />
          <span>Road 17 Congestion &gt;30s</span>
        </div>
      )}

      {/* ── Step-free badge ──────────────────────────────────────────────── */}
      {!cityLoading && (
        <div className={`absolute top-14 left-3 z-10 px-3 py-1 rounded-full text-xs font-semibold pointer-events-none border shadow-sm flex items-center gap-1.5 ${stepFreeOk
            ? "bg-[#f3e8ff] border-purple-200 text-[#7c3aed]"
            : "bg-rose-100 border-rose-300 text-rose-700 animate-pulse"
          }`}>
          {stepFreeOk ? (
            <>
              <Accessibility className="w-3.5 h-3.5 text-[#7c3aed]" />
              <span>Step-Free Route Active</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span>Accessibility Violation</span>
            </>
          )}
        </div>
      )}

      {/* ── Density overlay label ────────────────────────────────────────── */}
      {simViewMode === "DENSITY" && !cityLoading && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-white/95 border border-slate-200 text-[10px] font-medium text-slate-700 shadow-sm pointer-events-none whitespace-nowrap flex items-center gap-1.5">
          <span>DENSITY VIEW</span>
          <span>&bull;</span>
          {densityHigh ? (
            <span className="text-amber-700 font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-600" /> High Congestion
            </span>
          ) : (
            <span className="text-emerald-700 font-semibold">Nominal</span>
          )}
          <span>&bull;</span>
          <span className="text-slate-400">Synthetic</span>
        </div>
      )}

      {/* ── Plan indicator strip ─────────────────────────────────────────── */}
      {planMetrics && !cityLoading && simViewMode === "SIMULATION" && (
        <div className="absolute top-20 left-3 z-10 flex flex-col gap-1 pointer-events-none">
          <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium border shadow-xs ${planMetrics.isPass
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-rose-50 border-rose-200 text-rose-700"
            }`}>
            {planMetrics.isPass ? "✓" : "✗"} {planMetrics.planName.slice(0, 22)}…
          </div>
          <div className="px-2.5 py-0.5 rounded-full text-[9px] font-mono bg-white/95 border border-slate-200 text-slate-600 shadow-xs">
            P95: {planMetrics.p95ExitDisplay} | Amb: {planMetrics.ambDelaySec}s
          </div>
        </div>
      )}

      {/* ── World v2 delta badge ─────────────────────────────────────────── */}
      {blockedGate && !cityLoading && (
        <div className="absolute top-20 right-3 z-10 pointer-events-none">
          <div className="bg-white/95 border border-slate-200 rounded-xl p-2.5 text-[10px] text-slate-700 space-y-0.5 max-w-[150px] shadow-md">
            <div className="text-amber-600 font-bold">World v2 Delta</div>
            <div>Gate 2 <span className="text-rose-600 font-semibold">BLOCKED</span></div>
            <div>Crowd <span className="text-amber-600 font-semibold">REROUTED</span></div>
            {road17Congested && <div>Road 17 <span className="text-rose-600 font-semibold">CONGESTED</span></div>}
          </div>
        </div>
      )}

      {/* ── Main canvas ──────────────────────────────────────────────────── */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* ── Asset Palette ────────────────────────────────────────────────── */}
      {showAssetPalette && (
        <div className="absolute top-14 right-3 z-20 w-48 bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-xl flex flex-col gap-2 text-xs text-slate-800">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="font-semibold text-slate-800 text-xs">3D Palette</span>
            <button onClick={() => setShowAssetPalette(false)} className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
          </div>
          {(["barricade", "checkpoint", "medical_tent"] as const).map((t) => (
            <button
              key={t}
              onClick={() => handleAddInfrastructure(t)}
              className="w-full text-left px-2.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/60 text-slate-700 flex items-center justify-between text-xs transition"
            >
              <span className="font-medium flex items-center gap-1.5">
                {t === "barricade" ? "Barricade" : t === "checkpoint" ? "Security Arch" : "First Aid Tent"}
              </span>
              <span className={`font-semibold text-[10px] px-2 py-0.5 rounded-full ${
                t === "medical_tent"
                  ? "bg-rose-100 text-rose-700"
                  : t === "checkpoint"
                  ? "bg-purple-100 text-purple-700"
                  : "bg-amber-100 text-amber-700"
              }`}>
                {t === "barricade" ? "Infra" : t === "checkpoint" ? "Control" : "Emerg"}
              </span>
            </button>
          ))}
          {cityLoadInfo && (
            <div className="border-t border-slate-100 pt-1.5 text-[8px] font-mono text-slate-400 leading-tight break-all">{cityLoadInfo}</div>
          )}
        </div>
      )}

      {/* ── Building / Block Options Menu Card (Light SaaS Pinned Inspection Card) ── */}
      {(pinnedBlock || hoveredInfo) && (
        <div
          style={{
            left: Math.max(12, Math.min((pinnedBlock || hoveredInfo)!.x + 14, (containerRef.current?.clientWidth ?? 700) - 300)),
            top: Math.max(50, Math.min((pinnedBlock || hoveredInfo)!.y + 14, (containerRef.current?.clientHeight ?? 500) - 300)),
          }}
          className={`absolute z-30 w-80 bg-white/95 backdrop-blur-xl rounded-2xl p-4 shadow-xl border pointer-events-auto transition-all text-slate-800 ${pinnedBlock
              ? "border-slate-300 ring-2 ring-purple-500/20 shadow-2xl"
              : "border-slate-200"
            }`}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5 mb-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center shrink-0">
                {renderBlockIcon((pinnedBlock || hoveredInfo)!.icon)}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate tracking-tight">
                  {(pinnedBlock || hoveredInfo)!.name}
                </div>
                <div className="text-[10px] text-slate-500 truncate">{(pinnedBlock || hoveredInfo)!.blockCode}</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                Planned
              </span>
              <button
                onClick={() => {
                  setPinnedBlock(null);
                  pinnedBlockRef.current = null;
                  setSelectedObj(null);
                  if (hoverOutlineRef.current) hoverOutlineRef.current.visible = false;
                }}
                className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                title="Close / Unpin Card"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed mb-3">
            {(pinnedBlock || hoveredInfo)!.description}
          </p>

          {(pinnedBlock || hoveredInfo)!.capacity !== undefined && (
            <div className="flex justify-between items-center text-xs text-slate-500 mb-3 border-t border-slate-100 pt-2">
              <span>Capacity Target:</span>
              <span className="font-semibold text-slate-800">{(pinnedBlock || hoveredInfo)!.capacity!.toLocaleString()} occupants</span>
            </div>
          )}

          {/* Interactive Options Menu */}
          <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              ACTIONS
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleTriggerEvacuate}
                className={`col-span-2 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition shadow-xs ${isEvacuating
                    ? "bg-amber-100 text-amber-800 border-amber-300 animate-pulse"
                    : "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                  }`}
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>{isEvacuating ? "Evacuating..." : "Evacuate Campus"}</span>
              </button>

              {(pinnedBlock || hoveredInfo)!.cameraPreset && (
                <button
                  onClick={() => focusCamera((pinnedBlock || hoveredInfo)!.cameraPreset!)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center justify-center gap-1 border border-slate-200 transition"
                >
                  <LocateFixed className="w-3 h-3 text-purple-600" />
                  <span>Focus</span>
                </button>
              )}

              {isFireActive && (
                <button
                  onClick={handleDeployExtinguisher}
                  className="px-2.5 py-1.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 text-xs font-medium flex items-center justify-center gap-1 transition"
                >
                  <Flame className="w-3 h-3 text-rose-600" />
                  <span>Extinguish</span>
                </button>
              )}

              {(pinnedBlock || hoveredInfo)!.isGate && (pinnedBlock || hoveredInfo)!.id && (
                <button
                  onClick={() => onToggleGateBlock((pinnedBlock || hoveredInfo)!.id)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1 border transition ${(pinnedBlock || hoveredInfo)!.isBlocked
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                      : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                    }`}
                >
                  {(pinnedBlock || hoveredInfo)!.isBlocked ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>Open Gate</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3 h-3 text-rose-600" />
                      <span>Block Gate</span>
                    </>
                  )}
                </button>
              )}

              {(pinnedBlock || hoveredInfo)!.obj && (
                <button
                  onClick={() => setShowInspectorDetails((p) => !p)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium flex items-center justify-center gap-1 border border-slate-200 col-span-2 transition"
                >
                  <Sliders className="w-3 h-3" />
                  <span>{showInspectorDetails ? "Hide Specs" : "Inspect Technical Specs"}</span>
                </button>
              )}
            </div>

            {/* Expanded Detailed Properties when Inspect Technical Specs is clicked */}
            {showInspectorDetails && (pinnedBlock || hoveredInfo)!.obj && (
              <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] space-y-1 text-slate-600 font-mono bg-slate-50 p-2.5 rounded-xl border border-slate-200">
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

      {/* ── Apple Floating Pill Bottom Toolbar ───────────────────────────────────────────────── */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 px-3.5 py-1.5 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-full flex items-center gap-2 shadow-lg max-w-[95%] overflow-x-auto text-slate-700">
        <div className="flex items-center gap-1 text-xs whitespace-nowrap">
          <span className="text-slate-400 mr-1 font-medium">Cam:</span>
          {([
            { mode: "PERSPECTIVE" as CameraViewMode, label: "Orbit" },
            { mode: "TOP_DOWN" as CameraViewMode, label: "Top" },
            { mode: "FOCUS_AUDITORIUM" as CameraViewMode, label: "Auditorium" },
            { mode: "FOCUS_GATE2" as CameraViewMode, label: "Gate 2" },
            { mode: "FOCUS_ROAD17" as CameraViewMode, label: "Road 17" },
            { mode: "FOCUS_ASSEMBLY" as CameraViewMode, label: "Assembly" },
          ] as const).map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => focusCamera(mode)}
              className={`px-3 py-1 rounded-full text-xs transition-all ${cameraViewMode === mode
                  ? "bg-[#f3e8ff] text-[#7c3aed] font-bold shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-slate-200 shrink-0" />

        <div className="flex items-center gap-1.5 shrink-0 text-xs">
          {blockedGate ? (
            <button
              onClick={() => onToggleGateBlock(blockedGate)}
              className="text-amber-800 hover:text-amber-900 font-semibold flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 border border-amber-300 shadow-xs"
            >
              <RotateCcw className="w-3 h-3" />Unblock {blockedGate.toUpperCase()}
            </button>
          ) : (
            <button
              onClick={() => onToggleGateBlock("gate_2")}
              className="text-slate-600 hover:text-slate-900 font-medium px-3 py-1 rounded-full hover:bg-slate-100 transition"
            >
              Block Gate 2
            </button>
          )}

          <button
            onClick={() => {
              if (!document.fullscreenElement) {
                containerRef.current?.parentElement?.requestFullscreen();
              } else {
                document.exitFullscreen();
              }
            }}
            className="p-1 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition ml-1"
            title="Toggle Fullscreen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
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
