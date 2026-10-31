"use client";

import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import * as THREE from "three";
// @ts-ignore
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import {
  RotateCcw, Layers, AlertTriangle, Plus, MapPin, X, Loader2,
  Activity, Shield, Eye, Zap, Flame
} from "lucide-react";
import { SemanticWorldObject, CameraViewMode, SimViewMode, PlanMetrics3D } from "./types";
import { TwinAssetLibrary } from "./AssetLibrary";
import { ANCHORS } from "./worldAnchors";

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

// ─────────────────────────────────────────────────────────────────────────────
interface VenueTwinViewerProps {
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
}

export default function VenueTwinViewer({
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

  const [selectedObj, setSelectedObj] = useState<SemanticWorldObject | null>(null);
  const [simViewMode, setSimViewMode] = useState<SimViewMode>("3D");
  const [cameraViewMode, setCameraViewMode] = useState<CameraViewMode>("PERSPECTIVE");
  const [showAssetPalette, setShowAssetPalette] = useState(false);
  const [addedObjects, setAddedObjects] = useState<SemanticWorldObject[]>([]);

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
      id: ANCHORS.AMBULANCE.id,
      type: "ambulance",
      name: ANCHORS.AMBULANCE.label,
      position: { x: ANCHORS.AMBULANCE.position.x, y: ANCHORS.AMBULANCE.position.y, z: ANCHORS.AMBULANCE.position.z },
      properties: { vehicle_type: "BLS Ambulance", callsign: "MEDIC-17", status: "STANDBY" },
    },
  ], [blockedGate, road17Congested]);

  const allWorldObjects = useMemo(
    () => [...baseSemanticObjects, ...addedObjects],
    [baseSemanticObjects, addedObjects]
  );

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
    const onMouseDown = (e: MouseEvent) => { if (e.button === 0) { isDragging = true; prevMouseX = e.clientX; prevMouseY = e.clientY; } };
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

    // Raycasting — semantic objects only (not GLB)
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const onClick = (e: MouseEvent) => {
      const rect = domElem.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(objectsGroup.children, true);
      if (hits.length > 0) {
        let cur: THREE.Object3D | null = hits[0].object;
        while (cur && !cur.userData?.semanticObject && cur.parent) cur = cur.parent;
        if (cur?.userData?.semanticObject) {
          const obj = cur.userData.semanticObject as SemanticWorldObject;
          setSelectedObj(obj);
          onSelectObject?.(obj);
        }
      }
    };
    domElem.addEventListener("click", onClick);

    // Animation loop — also runs crowd animation
    let angle = 0;
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      angle += 0.02;

      // Drive moving ambulance along Road 17 emergency corridor
      const amb = scene.getObjectByName("ambulance_unit_1");
      if (amb) {
        TwinAssetLibrary.updateAmbulanceAnimation(dt, amb as THREE.Group);
      }

      // Animate fire particles & flame flickering
      if (fireGroupRef.current) {
        TwinAssetLibrary.updateFireEffect(dt, fireGroupRef.current);
      }

      // Animate crowd
      if (attendeeMeshRef.current && wheelMeshRef.current) {
        TwinAssetLibrary.updateCrowdAnimation(dt, attendeeMeshRef.current, wheelMeshRef.current);
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
      domElem.removeEventListener("wheel", onWheel);
      domElem.removeEventListener("click", onClick);
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

      {/* ── Semantic Inspector Card ──────────────────────────────────────── */}
      {selectedObj && (
        <div className="absolute bottom-10 right-2 z-20 w-60 bg-slate-900/97 border border-slate-700 rounded-lg p-3 shadow-2xl backdrop-blur flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <span className="font-bold text-slate-100 flex items-center gap-1.5 text-[11px]">
              <MapPin className="w-3 h-3 text-indigo-400" />{selectedObj.name}
            </span>
            <button onClick={() => setSelectedObj(null)} className="text-slate-400 hover:text-white"><X className="w-3 h-3" /></button>
          </div>

          <div className="space-y-1 text-[10px] text-slate-300">
            <Row label="Object ID" value={selectedObj.id} mono />
            <Row label="Type" value={selectedObj.type.toUpperCase()} mono color="cyan" />
            <Row
              label="Status"
              value={selectedObj.properties.status}
              mono
              color={
                selectedObj.properties.status === "BLOCKED" || selectedObj.properties.is_blocked ? "rose"
                : selectedObj.properties.status === "CONGESTED" ? "amber"
                : "emerald"
              }
            />
            {selectedObj.properties.width_m && <Row label="Width" value={`${selectedObj.properties.width_m} m`} />}
            {selectedObj.properties.flow_capacity_ped_per_sec && (
              <Row label="Flow" value={`${selectedObj.properties.flow_capacity_ped_per_sec} ped/sec`} />
            )}
            {selectedObj.properties.capacity && (
              <Row label="Capacity" value={selectedObj.properties.capacity.toLocaleString()} mono />
            )}
            {selectedObj.properties.is_step_free && <Row label="Access" value="STEP-FREE ✓" color="cyan" mono />}
            {selectedObj.properties.is_emergency_corridor && (
              <Row label="Corridor" value="EMERGENCY MEDICAL" color="rose" mono />
            )}
            {selectedObj.id === "road_17" && (
              <Row label="Constraint" value="≤30s Ambulance Delay" color="amber" mono />
            )}
            {selectedObj.id === "road_17" && planMetrics && (
              <Row
                label="Current Delay"
                value={`${planMetrics.ambDelaySec}s ${planMetrics.ambDelayOk ? "✓ PASS" : "✗ FAIL"}`}
                color={planMetrics.ambDelayOk ? "emerald" : "rose"}
                mono
              />
            )}
            {selectedObj.properties.callsign && (
              <Row label="Callsign" value={selectedObj.properties.callsign} mono />
            )}
          </div>

          {selectedObj.type === "gate" && (
            <button
              onClick={() => onToggleGateBlock(selectedObj.id)}
              className={`mt-1 w-full py-1.5 px-3 rounded text-xs font-bold transition flex items-center justify-center gap-1.5 shadow ${
                selectedObj.properties.is_blocked || selectedObj.properties.status === "BLOCKED"
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : "bg-rose-600 hover:bg-rose-500 text-white"
              }`}
            >
              {selectedObj.properties.is_blocked || selectedObj.properties.status === "BLOCKED" ? (
                <><RotateCcw className="w-3 h-3" />Unblock {selectedObj.name.split(" ")[0]}</>
              ) : (
                <><AlertTriangle className="w-3 h-3" />Block {selectedObj.name.split(" ")[0]} (What-If)</>
              )}
            </button>
          )}

          {/* What-If label for gates */}
          {selectedObj.type === "gate" && !(selectedObj.properties.is_blocked) && (
            <p className="text-[9px] text-slate-500 font-mono text-center">
              What-If Scenario → Creates World v2
            </p>
          )}
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
