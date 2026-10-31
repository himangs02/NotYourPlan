/**
 * 3D Asset Library for EventFlow Digital Twin.
 *
 * Designed specifically for a REAL 3D CITY ENVIRONMENT:
 * - Semantic objects are rendered as sleek, translucent digital twin holographic
 *   overlays and glowing edge boundaries, NOT opaque primitive toy blocks.
 * - This ensures the realistic 3D city buildings and streets from city.glb remain
 *   fully visible, while EventFlow's semantic intelligence is layered on top.
 * - Floating 3D semantic pins and badges clearly identify key campus zones.
 * - Routes and crowd agents are elevated above street level so they never clip.
 */
import * as THREE from "three";
import { SemanticWorldObject } from "./types";
import {
  CROWD_FLOW_NORMAL,
  CROWD_FLOW_GATE2_BLOCKED_G3,
  CROWD_FLOW_GATE2_BLOCKED_G4,
  CROWD_FLOW_STEPFREE,
  ROAD_17_CORRIDOR,
  ANCHORS,
  EMERGENCY_VEHICLE_SPEED,
  EMERGENCY_RESPONDER_SPEED,
} from "./worldAnchors";

// ─────────────────────────────────────────────────────────────────────────────
// Canvas Sprite Badge Creator for Floating 3D Semantic Labels
// ─────────────────────────────────────────────────────────────────────────────
let _showLabelsGlobal = false;

export function createTextBadge(
  text: string,
  bgColor: string = "rgba(15, 23, 42, 0.85)",
  borderColor: string = "#6366f1",
  textColor: string = "#ffffff"
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Sprite();

  // Background rounded pill
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(6, 6, 372, 84, 20);
  ctx.fill();

  // Border outline
  ctx.lineWidth = 4;
  ctx.strokeStyle = borderColor;
  ctx.stroke();

  // Text
  ctx.fillStyle = textColor;
  ctx.font = "bold 32px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 192, 48);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false, // Always visible floating over city buildings
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(12, 3, 1);
  sprite.renderOrder = 999;
  sprite.userData.isSemanticBadge = true;
  sprite.visible = _showLabelsGlobal;
  return sprite;
}

export function updateTextBadge(
  sprite: THREE.Sprite,
  text: string,
  bgColor: string = "rgba(15, 23, 42, 0.85)",
  borderColor: string = "#6366f1",
  textColor: string = "#ffffff"
): void {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(6, 6, 372, 84, 20);
  ctx.fill();

  ctx.lineWidth = 4;
  ctx.strokeStyle = borderColor;
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.font = "bold 32px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 192, 48);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  if (sprite.material && sprite.material.map) {
    sprite.material.map.dispose();
    sprite.material.map = texture;
    sprite.material.needsUpdate = true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Animated Agent Data
// ─────────────────────────────────────────────────────────────────────────────
interface AgentState {
  pos: THREE.Vector3;
  startDoor: THREE.Vector3;
  waypoints: THREE.Vector3[];
  waypointIdx: number;
  speed: number;
}

function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function spreadNear(wp: THREE.Vector3, spread = 3): THREE.Vector3 {
  return new THREE.Vector3(
    wp.x + randomBetween(-spread, spread),
    1.95,
    wp.z + randomBetween(-spread, spread)
  );
}

function buildHallAttendees(count: number, gate2Blocked: boolean): AgentState[] {
  const agents: AgentState[] = [];
  for (let i = 0; i < count; i++) {
    let startDoor: THREE.Vector3;
    let waypoints: THREE.Vector3[];

    if (gate2Blocked) {
      if (i % 2 === 0) {
        startDoor = new THREE.Vector3(-14.0, 0.22, 10.8); // West concourse exit
        waypoints = CROWD_FLOW_GATE2_BLOCKED_G4;
      } else {
        startDoor = new THREE.Vector3(14.0, 0.22, 10.8);  // East concourse exit
        waypoints = CROWD_FLOW_GATE2_BLOCKED_G3;
      }
    } else {
      // Main street exit onto Food Court Concourse / Plaza
      startDoor = new THREE.Vector3(randomBetween(-2.8, 2.8), 0.22, 11.0);
      waypoints = CROWD_FLOW_NORMAL;
    }

    // Populate attendees along the street evacuation stream
    const startIdx = Math.floor(Math.random() * (waypoints.length - 1));
    const p1 = waypoints[startIdx];
    const p2 = waypoints[startIdx + 1];
    const alpha = Math.random();
    const pos = new THREE.Vector3().lerpVectors(p1, p2, alpha);
    pos.x += randomBetween(-1.6, 1.6);
    pos.y = 0.22;

    agents.push({
      pos,
      startDoor: startDoor.clone(),
      waypoints,
      waypointIdx: startIdx + 1,
      speed: randomBetween(0.12, 0.22), // Active visible emergency egress run speed
    });
  }
  return agents;
}

function buildHallWheelchairs(count: number): AgentState[] {
  const agents: AgentState[] = [];
  const waypoints = CROWD_FLOW_STEPFREE;
  for (let i = 0; i < count; i++) {
    const startDoor = new THREE.Vector3(-14.0, 0.22, 10.8);
    const startIdx = Math.floor(Math.random() * (waypoints.length - 1));
    const p1 = waypoints[startIdx];
    const p2 = waypoints[startIdx + 1];
    const alpha = Math.random();
    const pos = new THREE.Vector3().lerpVectors(p1, p2, alpha);
    pos.x += randomBetween(-0.8, 0.8);
    pos.y = 0.22;

    agents.push({
      pos,
      startDoor: startDoor.clone(),
      waypoints,
      waypointIdx: startIdx + 1,
      speed: randomBetween(0.09, 0.16),
    });
  }
  return agents;
}

let _attendeeAgents: AgentState[] = [];
let _wheelAgents: AgentState[] = [];
let _staffPositions: THREE.Vector3[] = [];
let _responderPositions: THREE.Vector3[] = [];
let _agentsBuilt = false;
let _agentsGate2Blocked = false;

function ensureAgents(gate2Blocked: boolean) {
  if (_agentsBuilt && _agentsGate2Blocked === gate2Blocked) return;
  _agentsBuilt = true;
  _agentsGate2Blocked = gate2Blocked;

  _attendeeAgents = buildHallAttendees(300, gate2Blocked);
  _wheelAgents = buildHallWheelchairs(40);

  // Staff stationed at gates and transit points
  _staffPositions = [
    new THREE.Vector3(0, 1.95, -11),
    new THREE.Vector3(2, 1.95, -11),
    new THREE.Vector3(0, 1.95, 23),
    new THREE.Vector3(2, 1.95, 23),
    new THREE.Vector3(-2, 1.95, 23),
    new THREE.Vector3(14, 1.95, 6),
    new THREE.Vector3(14, 1.95, 8),
    new THREE.Vector3(-14, 1.95, 6),
    new THREE.Vector3(-14, 1.95, 8),
    new THREE.Vector3(0, 1.95, 14),
    new THREE.Vector3(0, 1.95, 16),
    new THREE.Vector3(16, 1.95, -16),
    new THREE.Vector3(16, 1.95, -14),
  ];

  _responderPositions = ROAD_17_CORRIDOR.map((wp) => spreadNear(wp, 1.5));
}

// ─────────────────────────────────────────────────────────────────────────────
// Humanoid & Wheelchair Geometry Builders for Realistic Crowd Simulation
// ─────────────────────────────────────────────────────────────────────────────
function mergeBufferGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = new THREE.BufferGeometry();
  let totalPositions = 0;
  let totalNormals = 0;
  let totalColors = 0;
  let totalIndices = 0;

  for (const g of geometries) {
    const pos = g.getAttribute("position");
    if (pos) totalPositions += pos.array.length;
    const norm = g.getAttribute("normal");
    if (norm) totalNormals += norm.array.length;
    const col = g.getAttribute("color");
    if (col) totalColors += col.array.length;
    if (g.index) totalIndices += g.index.array.length;
    else if (pos) totalIndices += pos.count;
  }

  const positions = new Float32Array(totalPositions);
  const normals = totalNormals > 0 ? new Float32Array(totalNormals) : null;
  const colors = totalColors > 0 ? new Float32Array(totalColors) : null;
  const indices: number[] = [];

  let posOffset = 0;
  let normOffset = 0;
  let colOffset = 0;
  let vertexOffset = 0;

  for (const g of geometries) {
    const pos = g.getAttribute("position");
    if (!pos) continue;
    const posArr = pos.array as Float32Array;
    positions.set(posArr, posOffset);
    posOffset += posArr.length;

    if (normals) {
      const norm = g.getAttribute("normal");
      if (norm) {
        normals.set(norm.array as Float32Array, normOffset);
        normOffset += norm.array.length;
      }
    }

    if (colors) {
      const col = g.getAttribute("color");
      if (col) {
        colors.set(col.array as Float32Array, colOffset);
        colOffset += col.array.length;
      } else {
        for (let i = 0; i < pos.count * 3; i++) {
          colors[colOffset++] = 1.0;
        }
      }
    }

    if (g.index) {
      const idxArr = g.index.array;
      for (let i = 0; i < idxArr.length; i++) {
        indices.push(idxArr[i] + vertexOffset);
      }
    } else {
      for (let i = 0; i < pos.count; i++) {
        indices.push(i + vertexOffset);
      }
    }
    vertexOffset += pos.count;
  }

  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  if (normals) merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  if (colors) merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  merged.setIndex(indices);
  return merged;
}

function addPart(
  parts: THREE.BufferGeometry[],
  geo: THREE.BufferGeometry,
  r: number,
  g: number,
  b: number
) {
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  parts.push(geo);
}

const _humanoidCache = new Map<string, THREE.BufferGeometry>();
function getHumanoidGeometry(r: number, g: number, b: number): THREE.BufferGeometry {
  const key = `${r.toFixed(2)}_${g.toFixed(2)}_${b.toFixed(2)}`;
  if (_humanoidCache.has(key)) return _humanoidCache.get(key)!;

  const parts: THREE.BufferGeometry[] = [];

  // 1. Hair / Headgear
  const hair = new THREE.SphereGeometry(0.30, 8, 6);
  hair.translate(0, 2.70, 0);
  addPart(parts, hair, 0.15, 0.12, 0.10);

  // 2. Head / Face (Warm Flesh Tone)
  const head = new THREE.SphereGeometry(0.28, 8, 8);
  head.translate(0, 2.45, 0);
  addPart(parts, head, 0.96, 0.78, 0.65);

  // 3. Torso / Jacket (Role Color)
  const torso = new THREE.CylinderGeometry(0.42, 0.32, 1.0, 8);
  torso.translate(0, 1.68, 0);
  addPart(parts, torso, r, g, b);

  // 4. Left Arm & Hand
  const leftArm = new THREE.CylinderGeometry(0.11, 0.09, 0.90, 6);
  leftArm.translate(-0.50, 1.62, -0.08);
  addPart(parts, leftArm, r, g, b);

  const leftHand = new THREE.SphereGeometry(0.09, 6, 6);
  leftHand.translate(-0.50, 1.15, -0.08);
  addPart(parts, leftHand, 0.96, 0.78, 0.65);

  // 5. Right Arm & Hand
  const rightArm = new THREE.CylinderGeometry(0.11, 0.09, 0.90, 6);
  rightArm.translate(0.50, 1.62, 0.08);
  addPart(parts, rightArm, r, g, b);

  const rightHand = new THREE.SphereGeometry(0.09, 6, 6);
  rightHand.translate(0.50, 1.15, 0.08);
  addPart(parts, rightHand, 0.96, 0.78, 0.65);

  // 6. Left Leg (Trousers - dark navy) in walking stride
  const leftLeg = new THREE.CylinderGeometry(0.14, 0.11, 1.05, 6);
  leftLeg.translate(-0.18, 0.58, 0.16);
  addPart(parts, leftLeg, 0.14, 0.18, 0.26);

  // 7. Right Leg (Trousers - dark navy) in walking stride
  const rightLeg = new THREE.CylinderGeometry(0.14, 0.11, 1.05, 6);
  rightLeg.translate(0.18, 0.58, -0.16);
  addPart(parts, rightLeg, 0.14, 0.18, 0.26);

  // 8. Shoes
  const leftShoe = new THREE.BoxGeometry(0.16, 0.12, 0.28);
  leftShoe.translate(-0.18, 0.06, 0.20);
  addPart(parts, leftShoe, 0.08, 0.08, 0.09);

  const rightShoe = new THREE.BoxGeometry(0.16, 0.12, 0.28);
  rightShoe.translate(0.18, 0.06, -0.12);
  addPart(parts, rightShoe, 0.08, 0.08, 0.09);

  const merged = mergeBufferGeometries(parts);
  merged.computeVertexNormals();
  _humanoidCache.set(key, merged);
  return merged;
}

const _wheelchairCache = new Map<string, THREE.BufferGeometry>();
function getWheelchairGeometry(r: number, g: number, b: number): THREE.BufferGeometry {
  const key = `${r.toFixed(2)}_${g.toFixed(2)}_${b.toFixed(2)}`;
  if (_wheelchairCache.has(key)) return _wheelchairCache.get(key)!;

  const parts: THREE.BufferGeometry[] = [];

  // 1. Head / Face (Warm Flesh Tone)
  const head = new THREE.SphereGeometry(0.26, 8, 8);
  head.translate(0, 2.15, -0.10);
  addPart(parts, head, 0.96, 0.78, 0.65);

  // 2. Seated Torso (Role Color)
  const torso = new THREE.CylinderGeometry(0.38, 0.30, 0.80, 8);
  torso.translate(0, 1.50, -0.10);
  addPart(parts, torso, r, g, b);

  // 3. Lap / Thighs (Dark Trousers)
  const lap = new THREE.BoxGeometry(0.44, 0.18, 0.55);
  lap.translate(0, 1.02, 0.18);
  addPart(parts, lap, 0.14, 0.18, 0.26);

  // 4. Lower Legs
  const legs = new THREE.BoxGeometry(0.38, 0.55, 0.18);
  legs.translate(0, 0.55, 0.44);
  addPart(parts, legs, 0.14, 0.18, 0.26);

  // 5. Dual Big Wheel Rims (Metallic Chrome)
  const leftWheelRim = new THREE.CylinderGeometry(0.55, 0.55, 0.08, 14);
  leftWheelRim.rotateZ(Math.PI / 2);
  leftWheelRim.translate(-0.42, 0.55, 0);
  addPart(parts, leftWheelRim, 0.78, 0.82, 0.88);

  const rightWheelRim = new THREE.CylinderGeometry(0.55, 0.55, 0.08, 14);
  rightWheelRim.rotateZ(Math.PI / 2);
  rightWheelRim.translate(0.42, 0.55, 0);
  addPart(parts, rightWheelRim, 0.78, 0.82, 0.88);

  // 6. Wheelchair Frame & Seat
  const seat = new THREE.BoxGeometry(0.65, 0.08, 0.58);
  seat.translate(0, 0.92, 0);
  addPart(parts, seat, 0.18, 0.20, 0.24);

  const backrest = new THREE.BoxGeometry(0.62, 0.65, 0.08);
  backrest.translate(0, 1.40, -0.32);
  addPart(parts, backrest, 0.18, 0.20, 0.24);

  const merged = mergeBufferGeometries(parts);
  merged.computeVertexNormals();
  _wheelchairCache.set(key, merged);
  return merged;
}

export class TwinAssetLibrary {
  public static get showLabels(): boolean {
    return _showLabelsGlobal;
  }
  public static set showLabels(val: boolean) {
    _showLabelsGlobal = val;
  }

  public static setShowLabels(show: boolean, rootGroup?: THREE.Object3D): void {
    _showLabelsGlobal = show;
    if (rootGroup) {
      rootGroup.traverse((child) => {
        if (child.userData?.isSemanticBadge !== undefined) {
          child.visible = show;
        }
      });
    }
  }

  public static isEvacuating = false;
  public static setEvacuationState(evacuating: boolean, gate2Blocked: boolean = false): void {
    this.isEvacuating = evacuating;
    ensureAgents(gate2Blocked);
  }

  public static createObjectMesh(obj: SemanticWorldObject, isSelected: boolean = false): THREE.Group {
    const group = new THREE.Group();
    group.name = obj.id;
    group.userData = { semanticObject: obj };

    switch (obj.type) {
      case "auditorium":
        group.add(this.createAuditorium(obj, isSelected));
        break;
      case "food_court":
        group.add(this.createFoodCourt(obj, isSelected));
        break;
      case "parking":
        group.add(this.createParking(obj, isSelected));
        break;
      case "assembly_area":
        group.add(this.createAssemblyArea(obj, isSelected));
        break;
      case "gate":
        group.add(this.createGate(obj, isSelected));
        break;
      case "road":
      case "emergency_route":
      case "accessible_route":
        group.add(this.createRoad(obj, isSelected));
        break;
      case "barricade":
        group.add(this.createBarricade(obj, isSelected));
        break;
      case "medical_tent":
        group.add(this.createMedicalTent(obj, isSelected));
        break;
      case "checkpoint":
        group.add(this.createCheckpoint(obj, isSelected));
        break;
      case "ambulance":
        group.add(this.createAmbulance(obj, isSelected));
        break;
      case "fire_extinguisher":
        group.add(this.createFireExtinguisher(obj, isSelected));
        break;
      default:
        group.add(this.createGenericBox(obj, isSelected));
        break;
    }

    group.position.set(obj.position.x, obj.position.y, obj.position.z);
    if (obj.rotation) {
      group.rotation.set(obj.rotation.x || 0, obj.rotation.y || 0, obj.rotation.z || 0);
    }
    return group;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Translucent Digital Twin Holographic Zones (Let city.glb show through!)
  // ─────────────────────────────────────────────────────────────────────────

  private static createAuditorium(obj: SemanticWorldObject, isSelected: boolean): THREE.Group {
    const g = new THREE.Group();
    const w = obj.dimensions?.width || 26;
    const h = obj.dimensions?.height || 8;
    const d = obj.dimensions?.depth || 18;

    // Translucent holographic zone
    const boxGeo = new THREE.BoxGeometry(w, h, d);
    const boxMat = new THREE.MeshBasicMaterial({
      color: isSelected ? 0x6366f1 : 0x4338ca,
      transparent: true,
      opacity: isSelected ? 0.35 : 0.15,
      depthWrite: false,
    });
    const zone = new THREE.Mesh(boxGeo, boxMat);
    g.add(zone);

    // Glowing edge boundary
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    const edgesMat = new THREE.LineBasicMaterial({
      color: isSelected ? 0xa5b4fc : 0x6366f1,
      linewidth: 2,
    });
    g.add(new THREE.LineSegments(edgesGeo, edgesMat));

    // Floating 3D Badge Pin
    const badge = createTextBadge(
      "🏢 Main Auditorium",
      "rgba(30, 27, 75, 0.85)",
      isSelected ? "#a5b4fc" : "#6366f1",
      "#e0e7ff"
    );
    badge.position.set(0, h / 2 + 3, 0);
    g.add(badge);

    return g;
  }

  private static createFoodCourt(obj: SemanticWorldObject, isSelected: boolean): THREE.Group {
    const g = new THREE.Group();
    const w = obj.dimensions?.width || 22;
    const h = obj.dimensions?.height || 5;
    const d = obj.dimensions?.depth || 12;

    const boxGeo = new THREE.BoxGeometry(w, h, d);
    const boxMat = new THREE.MeshBasicMaterial({
      color: isSelected ? 0x38bdf8 : 0x0284c7,
      transparent: true,
      opacity: isSelected ? 0.32 : 0.15,
      depthWrite: false,
    });
    g.add(new THREE.Mesh(boxGeo, boxMat));

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(boxGeo),
      new THREE.LineBasicMaterial({ color: isSelected ? 0xbae6fd : 0x38bdf8 })
    );
    g.add(edges);

    const badge = createTextBadge(
      "🍔 Food Court Concourse",
      "rgba(12, 74, 110, 0.85)",
      isSelected ? "#7dd3fc" : "#38bdf8",
      "#f0f9ff"
    );
    badge.position.set(0, h / 2 + 2.5, 0);
    g.add(badge);

    return g;
  }

  private static createParking(obj: SemanticWorldObject, isSelected: boolean): THREE.Group {
    const g = new THREE.Group();
    const w = obj.dimensions?.width || 14;
    const l = obj.dimensions?.depth || 22;

    const boxGeo = new THREE.BoxGeometry(w, 0.4, l);
    const boxMat = new THREE.MeshBasicMaterial({
      color: isSelected ? 0x64748b : 0x334155,
      transparent: true,
      opacity: isSelected ? 0.4 : 0.2,
      depthWrite: false,
    });
    g.add(new THREE.Mesh(boxGeo, boxMat));

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(boxGeo),
      new THREE.LineBasicMaterial({ color: 0x94a3b8 })
    );
    g.add(edges);

    const badge = createTextBadge(
      "🅿 North Parking Plaza",
      "rgba(30, 41, 59, 0.85)",
      "#94a3b8",
      "#f8fafc"
    );
    badge.position.set(0, 3, 0);
    g.add(badge);

    return g;
  }

  private static createAssemblyArea(obj: SemanticWorldObject, isSelected: boolean): THREE.Group {
    const g = new THREE.Group();
    const w = obj.dimensions?.width || 32;
    const l = obj.dimensions?.length || 24;

    // Glowing green perimeter ground footprint
    const groundGeo = new THREE.BoxGeometry(w, 0.25, l);
    const groundMat = new THREE.MeshBasicMaterial({
      color: isSelected ? 0x10b981 : 0x059669,
      transparent: true,
      opacity: isSelected ? 0.35 : 0.2,
      depthWrite: false,
    });
    g.add(new THREE.Mesh(groundGeo, groundMat));

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(groundGeo),
      new THREE.LineBasicMaterial({ color: 0x34d399, linewidth: 2 })
    );
    g.add(edges);

    // Beacons on 4 corners
    const cornerOffsets = [
      [-w / 2 + 1, -l / 2 + 1],
      [w / 2 - 1, -l / 2 + 1],
      [-w / 2 + 1, l / 2 - 1],
      [w / 2 - 1, l / 2 - 1],
    ];
    for (const [cx, cz] of cornerOffsets) {
      const p = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 3, 8),
        new THREE.MeshStandardMaterial({ color: 0x34d399 })
      );
      p.position.set(cx, 1.5, cz);
      g.add(p);

      const light = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x10b981 })
      );
      light.position.set(cx, 3.2, cz);
      g.add(light);
    }

    const badge = createTextBadge(
      "📍 Central Assembly Area",
      "rgba(6, 78, 59, 0.85)",
      "#34d399",
      "#ecfdf5"
    );
    badge.position.set(0, 4.5, 0);
    g.add(badge);

    return g;
  }

  public static createGate(obj: SemanticWorldObject, isSelected: boolean): THREE.Group {
    const g = new THREE.Group();
    const isBlocked = obj.properties.status === "BLOCKED" || obj.properties.is_blocked;
    const isStepFree = obj.properties.is_step_free;
    const width = obj.properties.width_m ? Math.min(10, Math.max(4, obj.properties.width_m * 0.5)) : 6;
    const height = 5.0;

    // Left & Right Cyber Pillars
    const pGeo = new THREE.BoxGeometry(0.9, height, 0.9);
    const pMat = new THREE.MeshStandardMaterial({ color: isBlocked ? 0x991b1b : 0x1e293b, metalness: 0.8 });
    const pL = new THREE.Mesh(pGeo, pMat);
    pL.position.set(-width / 2, height / 2 + 0.3, 0);
    g.add(pL);
    const pR = new THREE.Mesh(pGeo, pMat);
    pR.position.set(width / 2, height / 2 + 0.3, 0);
    g.add(pR);

    // Lintel beam across top
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(width + 1.4, 0.8, 1.0),
      new THREE.MeshStandardMaterial({ color: isBlocked ? 0x7f1d1d : 0x0f172a })
    );
    lintel.position.set(0, height + 0.6, 0);
    g.add(lintel);

    // Illuminated status banner
    const statusColor = isBlocked ? 0xef4444 : isStepFree ? 0x06b6d4 : 0x22c55e;
    const statusBanner = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.85, 0.45, 0.3),
      new THREE.MeshBasicMaterial({ color: statusColor })
    );
    statusBanner.position.set(0, height + 0.6, 0.55);
    g.add(statusBanner);

    if (isBlocked) {
      // Bold physical red barricade barrier
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(width, 1.8, 0.3),
        new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.5 })
      );
      bar.position.set(0, 1.2, 0);
      g.add(bar);

      // Warning hazard stripes
      const caution = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.9, 0.5, 0.35),
        new THREE.MeshBasicMaterial({ color: 0xfacc15 })
      );
      caution.position.set(0, 1.2, 0.08);
      g.add(caution);
    } else {
      // Open luminous threshold
      const thresh = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.15, 2.5),
        new THREE.MeshBasicMaterial({
          color: isStepFree ? 0x06b6d4 : 0x22c55e,
          transparent: true,
          opacity: 0.55,
        })
      );
      thresh.position.set(0, 0.4, 0);
      g.add(thresh);
    }

    if (isSelected) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(width * 0.6, width * 0.8, 24),
        new THREE.MeshBasicMaterial({ color: 0x6366f1, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.45;
      g.add(ring);
    }

    // Floating badge above gate
    const gateLabel = isBlocked
      ? `${obj.name.split(" ")[0]} [BLOCKED]`
      : isStepFree
      ? `${obj.name.split(" ")[0]} [♿ STEP-FREE]`
      : `${obj.name.split(" ")[0]} [OPEN]`;
    const gateBadge = createTextBadge(
      gateLabel,
      isBlocked ? "rgba(127, 29, 29, 0.9)" : "rgba(15, 23, 42, 0.85)",
      isBlocked ? "#ef4444" : isStepFree ? "#06b6d4" : "#22c55e",
      "#ffffff"
    );
    gateBadge.position.set(0, height + 2.5, 0);
    g.add(gateBadge);

    return g;
  }

  private static createRoad(obj: SemanticWorldObject, isSelected: boolean): THREE.Group {
    const g = new THREE.Group();
    const isEmerg = obj.type === "emergency_route" || obj.properties.is_emergency_corridor;
    const isStepFree = obj.type === "accessible_route" || obj.properties.is_step_free;
    const isCongested = obj.properties.status === "CONGESTED";
    const width = obj.dimensions?.width || (isEmerg ? 7 : isStepFree ? 4.5 : 12);
    const length = obj.dimensions?.length || 24;

    // Elevated slightly (y = 0.35) so it rests visibly on the 3D city street
    let baseColor = 0x1e293b;
    if (isEmerg) baseColor = isCongested ? 0x991b1b : 0x881337;
    if (isStepFree) baseColor = 0x0891b2;

    const road = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.25, length),
      new THREE.MeshStandardMaterial({
        color: isSelected ? 0x6366f1 : baseColor,
        roughness: 0.8,
        metalness: 0.2,
      })
    );
    road.position.y = 0.35;
    g.add(road);

    if (isEmerg) {
      // Center luminous emergency guide line
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.3, length * 0.95),
        new THREE.MeshBasicMaterial({ color: isCongested ? 0xf43f5e : 0xf43f5e })
      );
      line.position.y = 0.36;
      g.add(line);

      // Warning glow overlay when compromised
      if (isCongested) {
        const warn = new THREE.Mesh(
          new THREE.BoxGeometry(width * 0.95, 0.35, length * 0.95),
          new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.45 })
        );
        warn.position.y = 0.38;
        g.add(warn);
      }

      const badge = createTextBadge(
        isCongested ? "🚑 ROAD 17 [CONGESTED]" : "🚑 ROAD 17 [CLEAR]",
        isCongested ? "rgba(127, 29, 29, 0.95)" : "rgba(76, 5, 25, 0.85)",
        isCongested ? "#ef4444" : "#f43f5e",
        "#ffffff"
      );
      badge.position.set(0, 3.5, 0);
      g.add(badge);
    } else if (isStepFree) {
      // Glowing step-free tactile pathway
      const tac = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.5, 0.3, length * 0.95),
        new THREE.MeshBasicMaterial({ color: 0x22d3ee })
      );
      tac.position.y = 0.36;
      g.add(tac);

      const badge = createTextBadge(
        "♿ Step-Free Ramp",
        "rgba(8, 51, 68, 0.85)",
        "#06b6d4",
        "#ecfeff"
      );
      badge.position.set(0, 3.0, 0);
      g.add(badge);
    }

    return g;
  }

  private static createBarricade(obj: SemanticWorldObject, isSelected: boolean): THREE.Group {
    const g = new THREE.Group();
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 1.2, 0.3),
      new THREE.MeshStandardMaterial({ color: isSelected ? 0xf59e0b : 0xd97706, metalness: 0.6 })
    );
    bar.position.y = 0.9;
    g.add(bar);
    return g;
  }

  private static createMedicalTent(obj: SemanticWorldObject, isSelected: boolean): THREE.Group {
    const g = new THREE.Group();
    const tent = new THREE.Mesh(
      new THREE.BoxGeometry(4, 2.8, 4),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 })
    );
    tent.position.y = 1.8;
    g.add(tent);

    const c1 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.1), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    c1.position.set(0, 2.0, 2.05);
    g.add(c1);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, 0.1), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    c2.position.set(0, 2.0, 2.05);
    g.add(c2);
    return g;
  }

  private static createCheckpoint(obj: SemanticWorldObject, isSelected: boolean): THREE.Group {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 3.0, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7 })
    );
    frame.position.y = 1.8;
    g.add(frame);
    return g;
  }

    private static createAmbulance(obj: SemanticWorldObject, isSelected: boolean): THREE.Group {
    const g = new THREE.Group();

    // 1. Patient Cabin (White gloss box)
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 2.1, 4.4),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 })
    );
    cabin.position.set(0, 1.45, -0.6);
    cabin.castShadow = true;
    g.add(cabin);

    // 2. Driver Cab / Hood
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(2.45, 1.6, 2.0),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25 })
    );
    cab.position.set(0, 1.15, 1.8);
    cab.castShadow = true;
    g.add(cab);

    // 3. Dark Tinted Windshield & Windows
    const windshield = new THREE.Mesh(
      new THREE.BoxGeometry(2.48, 0.9, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.8 })
    );
    windshield.position.set(0, 1.55, 1.6);
    g.add(windshield);

    // 4. Red Emergency Side Stripes
    const stripeL = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.45, 5.8),
      new THREE.MeshBasicMaterial({ color: 0xdc2626 })
    );
    stripeL.position.set(-1.31, 1.35, 0.4);
    const stripeR = stripeL.clone();
    stripeR.position.x = 1.31;
    g.add(stripeL, stripeR);

    // 5. Red Medical Crosses on Sides
    const crossVL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.85, 0.26), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    crossVL.position.set(-1.32, 1.6, -0.6);
    const crossHL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.85), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    crossHL.position.set(-1.32, 1.6, -0.6);
    g.add(crossVL, crossHL);

    const crossVR = crossVL.clone(); crossVR.position.x = 1.32;
    const crossHR = crossHL.clone(); crossHR.position.x = 1.32;
    g.add(crossVR, crossHR);

    // 6. 4 Wheels (Rubber Tires with silver rims)
    const wheelGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.32, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });

    const wFL = new THREE.Mesh(wheelGeo, tireMat); wFL.position.set(-1.28, 0.48, 1.8);
    const wFR = new THREE.Mesh(wheelGeo, tireMat); wFR.position.set(1.28, 0.48, 1.8);
    const wRL = new THREE.Mesh(wheelGeo, tireMat); wRL.position.set(-1.28, 0.48, -1.5);
    const wRR = new THREE.Mesh(wheelGeo, tireMat); wRR.position.set(1.28, 0.48, -1.5);
    g.add(wFL, wFR, wRL, wRR);

    // 7. Headlights (Bright White)
    const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.08), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    hlL.position.set(-0.85, 0.95, 2.82);
    const hlR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.08), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    hlR.position.set(0.85, 0.95, 2.82);
    g.add(hlL, hlR);

    // 8. Emergency Lightbar Sirens on Roof (Flashing Red & Blue)
    const sirenRed = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.30, 0.35),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    sirenRed.name = "siren_red";
    sirenRed.position.set(-0.52, 2.65, 1.4);
    g.add(sirenRed);

    const sirenBlue = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.30, 0.35),
      new THREE.MeshBasicMaterial({ color: 0x0066ff })
    );
    sirenBlue.name = "siren_blue";
    sirenBlue.position.set(0.52, 2.65, 1.4);
    g.add(sirenBlue);

    // 9. Floating 3D Badge Pin reflecting Ambulance Status
    const ambStatus = obj.properties?.status || "STANDBY";
    const badgeText = ambStatus === "STANDBY"
      ? "🚑 MEDIC-17 [STANDBY]"
      : ambStatus === "AT_INCIDENT"
      ? "🏥 MEDIC-17 [AT INCIDENT]"
      : ambStatus === "EN_ROUTE"
      ? "🚑 MEDIC-17 [EN ROUTE]"
      : "🚨 MEDIC-17 [DISPATCHED]";
    const badgeBg = ambStatus === "STANDBY" ? "rgba(15, 23, 42, 0.90)" : "rgba(225, 29, 72, 0.95)";
    const badgeBorder = ambStatus === "STANDBY" ? "#38bdf8" : "#ef4444";
    const badge = createTextBadge(badgeText, badgeBg, badgeBorder, "#fee2e2");
    badge.name = "ambulance_status_badge";
    badge.position.set(0, 4.5, 0);
    g.add(badge);

    // g position is managed by the parent group at obj.position
    g.position.set(0, 0, 0);
    return g;
  }

  private static createFireExtinguisher(obj: SemanticWorldObject, isSelected: boolean): THREE.Group {
    const g = new THREE.Group();

    // 1. Red Main Pressure Tank Cylinder
    const tankGeo = new THREE.CylinderGeometry(0.35, 0.35, 1.35, 16);
    const tankMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.25,
      metalness: 0.35
    });
    const tank = new THREE.Mesh(tankGeo, tankMat);
    tank.position.set(0, 0.72, 0);
    tank.castShadow = true;
    g.add(tank);

    // 2. Rounded Tank Top Dome
    const domeGeo = new THREE.SphereGeometry(0.35, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeo, tankMat);
    dome.position.set(0, 1.395, 0);
    g.add(dome);

    // 3. Black Rubber Base Stand
    const baseGeo = new THREE.CylinderGeometry(0.39, 0.41, 0.16, 16);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(0, 0.08, 0);
    g.add(base);

    // 4. White / Yellow Instruction Label Band
    const bandGeo = new THREE.CylinderGeometry(0.355, 0.355, 0.55, 16);
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.position.set(0, 0.72, 0);
    g.add(band);

    // 5. Chrome / Brass Discharge Valve Neck
    const neckGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.32, 12);
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.85, roughness: 0.2 });
    const neck = new THREE.Mesh(neckGeo, metalMat);
    neck.position.set(0, 1.88, 0);
    g.add(neck);

    // 6. Squeeze Lever & Handle
    const handleGeo = new THREE.BoxGeometry(0.12, 0.08, 0.55);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.set(0, 2.05, 0.05);
    handle.rotation.x = -0.15;
    g.add(handle);

    // 7. Pressure Gauge
    const gaugeGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.06, 12);
    gaugeGeo.rotateZ(Math.PI / 2);
    const gaugeMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.3 });
    const gauge = new THREE.Mesh(gaugeGeo, gaugeMat);
    gauge.position.set(0.16, 1.95, 0.12);
    g.add(gauge);

    // 8. Discharge Hose & Nozzle
    const hoseGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8);
    const hoseMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.8 });
    const hose = new THREE.Mesh(hoseGeo, hoseMat);
    hose.position.set(-0.35, 1.05, 0.12);
    hose.rotation.z = 0.1;
    g.add(hose);

    // 9. Floating Badge Pin
    const isAssigned = obj.properties.status === "ASSIGNED" || obj.properties.status === "IN_TRANSIT";
    const badgeText = isAssigned
      ? `🧯 ${obj.id} [ASSIGNED]`
      : `🧯 ${obj.id} [AVAILABLE]`;
    const badgeBg = isAssigned ? "rgba(225, 29, 72, 0.95)" : "rgba(15, 23, 42, 0.90)";
    const badgeBorder = isAssigned ? "#f43f5e" : "#ef4444";
    const badge = createTextBadge(badgeText, badgeBg, badgeBorder, "#ffffff");
    badge.name = "extinguisher_status_badge";
    badge.position.set(0, 2.9, 0);
    g.add(badge);

    // 10. Selection / Ground Glow Ring Indicator
    const ringGeo = new THREE.RingGeometry(0.65, 0.85, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: isSelected ? 0x6366f1 : (isAssigned ? 0xf43f5e : 0xef4444),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: isSelected ? 0.9 : 0.65
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, 0.04, 0);
    g.add(ring);

    return g;
  }

  private static createGenericBox(obj: SemanticWorldObject, isSelected: boolean): THREE.Group {
    const g = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(3, 2, 3),
      new THREE.MeshStandardMaterial({ color: isSelected ? 0x6366f1 : 0x475569 })
    );
    box.position.y = 1.3;
    g.add(box);
    return g;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Animated Instanced Crowd
  // ─────────────────────────────────────────────────────────────────────────

  public static createInstancedCrowd(
    totalModeled: number = 300,
    gate2Blocked: boolean = false
  ): {
    group: THREE.Group;
    attendeeMesh: THREE.InstancedMesh;
    wheelMesh: THREE.InstancedMesh;
    staffMesh: THREE.InstancedMesh;
    responderMesh: THREE.InstancedMesh;
  } {
    ensureAgents(gate2Blocked);

    const group = new THREE.Group();
    group.name = "crowd_instanced_layer";

    // Realistic Humanoid & Wheelchair 3D Geometries with multi-tone vertex colors
    const attendeeGeo = getHumanoidGeometry(0.22, 0.74, 0.97); // Sky Blue (#38bdf8)
    const wheelGeo = getWheelchairGeometry(0.75, 0.52, 0.99);   // Purple (#c084fc)
    const staffGeo = getHumanoidGeometry(0.98, 0.80, 0.08);   // Safety Yellow (#facc15)
    const responderGeo = getHumanoidGeometry(0.29, 0.87, 0.50); // Medic Green (#4ade80)

    const crowdMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.12,
    });

    const attendeeCount = _attendeeAgents.length;
    const wheelCount = _wheelAgents.length;
    const staffCount = _staffPositions.length;
    const responderCount = _responderPositions.length;

    const attendeeMesh = new THREE.InstancedMesh(attendeeGeo, crowdMaterial, attendeeCount);
    attendeeMesh.name = "crowd_attendees";

    const wheelMesh = new THREE.InstancedMesh(wheelGeo, crowdMaterial, wheelCount);
    wheelMesh.name = "crowd_wheelchair";

    const staffMesh = new THREE.InstancedMesh(staffGeo, crowdMaterial, staffCount);
    staffMesh.name = "crowd_staff";

    const responderMesh = new THREE.InstancedMesh(responderGeo, crowdMaterial, responderCount);
    responderMesh.name = "crowd_responders";

    const dummy = new THREE.Object3D();

    _attendeeAgents.forEach((a, i) => {
      // HIDDEN PRE-FIRE: People are completely inside the building and not visible on rooftops/outside!
      dummy.position.set(0, -999, 0);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      attendeeMesh.setMatrixAt(i, dummy.matrix);
    });
    attendeeMesh.instanceMatrix.needsUpdate = true;

    _wheelAgents.forEach((a, i) => {
      // HIDDEN PRE-FIRE
      dummy.position.set(0, -999, 0);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      wheelMesh.setMatrixAt(i, dummy.matrix);
    });
    wheelMesh.instanceMatrix.needsUpdate = true;

    _staffPositions.forEach((p, i) => {
      dummy.position.set(p.x, 1.95, p.z);
      dummy.scale.setScalar(1.30);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      staffMesh.setMatrixAt(i, dummy.matrix);
    });
    staffMesh.instanceMatrix.needsUpdate = true;

    _responderPositions.forEach((p, i) => {
      dummy.position.set(p.x, 1.95, p.z);
      dummy.scale.setScalar(1.30);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      responderMesh.setMatrixAt(i, dummy.matrix);
    });
    responderMesh.instanceMatrix.needsUpdate = true;

    group.add(attendeeMesh, wheelMesh, staffMesh, responderMesh);

    return { group, attendeeMesh, wheelMesh, staffMesh, responderMesh };
  }

        private static _isFireActive = false;

  public static setFireState(isFireActive: boolean, gate2Blocked: boolean = false): void {
    this._isFireActive = isFireActive;
  }

  public static isFireActive(): boolean {
    return this._isFireActive;
  }

  /**
   * Compact 1/4th scale rooftop fire effect on the Main Auditorium.
   * Contained directly on the building roof (y = 13.0 to 15.5m), realistic and clear.
   */
  public static createFireEffect(pos: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.name = "fire_simulation_system";
    group.position.set(pos.x, 0, pos.z);

    // 1. Warm Flickering Fire PointLight (compact 4.5 intensity)
    const fireLight = new THREE.PointLight(0xff4500, 4.5, 32, 1.4);
    fireLight.position.set(0, 14.2, 0);
    fireLight.name = "fire_light";
    group.add(fireLight);

    // 2. Compact 1/4th Scale Rooftop Flame Cones
    const flameCount = 38;
    const flameGeo = new THREE.ConeGeometry(0.55, 1.9, 5);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xff4500,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const flameMesh = new THREE.InstancedMesh(flameGeo, flameMat, flameCount);
    flameMesh.name = "flame_mesh";
    flameMesh.renderOrder = 999;

    const flameData: { x: number; y: number; z: number; vy: number; baseScale: number; phase: number }[] = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < flameCount; i++) {
      const fd = {
        x: randomBetween(-5.0, 3.0),
        y: randomBetween(13.0, 14.6),
        z: randomBetween(-3.0, 2.0),
        vy: randomBetween(1.8, 3.8),
        baseScale: randomBetween(0.7, 1.2),
        phase: Math.random() * Math.PI * 2,
      };
      flameData.push(fd);
      dummy.position.set(fd.x, fd.y, fd.z);
      dummy.scale.setScalar(fd.baseScale);
      dummy.updateMatrix();
      flameMesh.setMatrixAt(i, dummy.matrix);
    }
    flameMesh.instanceMatrix.needsUpdate = true;
    (flameMesh as any).userData = { flameData };
    group.add(flameMesh);

    // 3. Compact Smoke Puffs
    const smokeCount = 18;
    const smokeGeo = new THREE.DodecahedronGeometry(1.0, 1);
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const smokeMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, smokeCount);
    smokeMesh.name = "smoke_mesh";
    smokeMesh.renderOrder = 998;

    const smokeData: { x: number; y: number; z: number; vy: number; scale: number; maxScale: number }[] = [];
    for (let i = 0; i < smokeCount; i++) {
      const sd = {
        x: randomBetween(-4.5, 2.5),
        y: randomBetween(14.0, 16.5),
        z: randomBetween(-2.5, 1.5),
        vy: randomBetween(1.2, 2.5),
        scale: randomBetween(0.8, 1.4),
        maxScale: randomBetween(2.0, 3.2),
      };
      smokeData.push(sd);
      dummy.position.set(sd.x, sd.y, sd.z);
      dummy.scale.setScalar(sd.scale);
      dummy.updateMatrix();
      smokeMesh.setMatrixAt(i, dummy.matrix);
    }
    smokeMesh.instanceMatrix.needsUpdate = true;
    (smokeMesh as any).userData = { smokeData };
    group.add(smokeMesh);

    // 4. Rooftop Emergency 3D Badge Pin (sitting neatly above the roof at y = 16.5)
    const badge = createTextBadge("🔥 AUDITORIUM FIRE • EVACUATION", "rgba(185, 28, 28, 0.95)", "#ffffff", "#fee2e2");
    badge.position.set(-1, 16.5, 0);
    badge.name = "fire_badge";
    group.add(badge);

    return group;
  }

  /**
   * Creates pressurized chemical foam / CO2 mist spray cone from extinguisher nozzle to fire.
   */
  public static createExtinguisherSpray(origin: THREE.Vector3, target: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.name = "fire_extinguisher_spray";
    group.position.copy(origin);

    const count = 48;
    const foamGeo = new THREE.SphereGeometry(0.24, 6, 6);
    const foamMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(foamGeo, foamMat, count);
    mesh.name = "foam_particles";
    mesh.renderOrder = 999;

    const dummy = new THREE.Object3D();
    const particles: { pos: THREE.Vector3; dir: THREE.Vector3; speed: number; scale: number; life: number }[] = [];

    const dir = new THREE.Vector3().subVectors(target, origin).normalize();
    for (let i = 0; i < count; i++) {
      const spreadDir = dir.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.45,
        (Math.random() - 0.2) * 0.45,
        (Math.random() - 0.5) * 0.45
      )).normalize();

      particles.push({
        pos: new THREE.Vector3(0, 1.8, 0),
        dir: spreadDir,
        speed: randomBetween(8.0, 16.0),
        scale: randomBetween(0.4, 1.2),
        life: Math.random(),
      });

      dummy.position.set(0, 1.8, 0);
      dummy.scale.setScalar(0.01);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    (mesh as any).userData = { particles, origin, target, dir };
    group.add(mesh);
    return group;
  }

  public static updateExtinguisherSpray(dt: number, sprayGroup: THREE.Group): void {
    const dtSec = Math.min(dt / 1000, 0.05);
    const mesh = sprayGroup.getObjectByName("foam_particles") as THREE.InstancedMesh;
    if (!mesh || !(mesh as any).userData?.particles) return;

    const dummy = new THREE.Object3D();
    const { particles } = (mesh as any).userData;

    particles.forEach((p: any, i: number) => {
      p.life += dtSec * 1.8;
      if (p.life > 1.0) {
        p.life = 0;
        p.pos.set(0, 1.8, 0);
      }
      p.pos.addScaledVector(p.dir, p.speed * dtSec);
      dummy.position.copy(p.pos);
      const scale = p.scale * (1.0 + p.life * 2.5);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Smoothly extinguishes fire when extinguisher discharge is active.
   * Returns true when fully extinguished.
   */
  public static extinguishFire(dt: number, fireGroup: THREE.Group): boolean {
    const dtSec = Math.min(dt / 1000, 0.05);
    const fireLight = fireGroup.getObjectByName("fire_light") as THREE.PointLight;
    if (fireLight) {
      fireLight.intensity = Math.max(0, fireLight.intensity - dtSec * 2.5);
    }
    const flameMesh = fireGroup.getObjectByName("flame_mesh") as THREE.InstancedMesh;
    if (flameMesh) {
      flameMesh.scale.multiplyScalar(Math.max(0, 1.0 - dtSec * 0.7));
      if (flameMesh.scale.x < 0.08) {
        flameMesh.visible = false;
        return true;
      }
    }
    return false;
  }

  public static updateFireEffect(dt: number, fireGroup: THREE.Group): void {
    const dtSec = Math.min(dt / 1000, 0.05);
    const now = performance.now();

    // 1. Flicker Fire Light
    const fireLight = fireGroup.getObjectByName("fire_light") as THREE.PointLight;
    if (fireLight) {
      fireLight.intensity = 4.2 + Math.sin(now * 0.02) * 1.5 + (Math.random() - 0.5) * 1.0;
    }

    const dummy = new THREE.Object3D();

    // 2. Animate Rooftop Flames
    const flameMesh = fireGroup.getObjectByName("flame_mesh") as THREE.InstancedMesh;
    if (flameMesh && (flameMesh as any).userData?.flameData) {
      const flameData = (flameMesh as any).userData.flameData as any[];
      flameData.forEach((fd, i) => {
        fd.y += fd.vy * dtSec;
        if (fd.y > 15.6) {
          fd.y = randomBetween(13.0, 13.8);
          fd.x = randomBetween(-5.0, 3.0);
          fd.z = randomBetween(-3.0, 2.0);
        }
        const flick = Math.sin(now * 0.02 + fd.phase) * 0.25;
        dummy.position.set(fd.x + flick * 0.2, fd.y, fd.z);
        dummy.scale.set(fd.baseScale * (1 + flick), fd.baseScale * (1.1 + flick), fd.baseScale * (1 + flick));
        dummy.updateMatrix();
        flameMesh.setMatrixAt(i, dummy.matrix);
      });
      flameMesh.instanceMatrix.needsUpdate = true;
    }

    // 3. Animate Smoke
    const smokeMesh = fireGroup.getObjectByName("smoke_mesh") as THREE.InstancedMesh;
    if (smokeMesh && (smokeMesh as any).userData?.smokeData) {
      const smokeData = (smokeMesh as any).userData.smokeData as any[];
      smokeData.forEach((sd, i) => {
        sd.y += sd.vy * dtSec;
        sd.z += 0.5 * dtSec;
        if (sd.y > 18.5) {
          sd.y = randomBetween(14.0, 15.0);
          sd.x = randomBetween(-4.5, 2.5);
          sd.z = randomBetween(-2.5, 1.5);
        }
        const growth = Math.min(sd.maxScale, sd.scale + (sd.y - 14.0) * 0.2);
        dummy.position.set(sd.x, sd.y, sd.z);
        dummy.scale.setScalar(growth);
        dummy.updateMatrix();
        smokeMesh.setMatrixAt(i, dummy.matrix);
      });
      smokeMesh.instanceMatrix.needsUpdate = true;
    }
  }

  public static updateCrowdAnimation(
    dt: number,
    attendeeMesh: THREE.InstancedMesh,
    wheelMesh: THREE.InstancedMesh
  ): void {
    const dummy = new THREE.Object3D();
    const dtSec = Math.min(dt / 1000, 0.05);

    if (!this._isFireActive && !this.isEvacuating) {
      // PRE-FIRE / PRE-EVACUATION: People are completely HIDDEN inside the building!
      // Streets and rooftops are completely clean.
      _attendeeAgents.forEach((a, i) => {
        dummy.position.set(0, -999, 0);
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        attendeeMesh.setMatrixAt(i, dummy.matrix);
      });
      attendeeMesh.instanceMatrix.needsUpdate = true;

      _wheelAgents.forEach((a, i) => {
        dummy.position.set(0, -999, 0);
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        wheelMesh.setMatrixAt(i, dummy.matrix);
      });
      wheelMesh.instanceMatrix.needsUpdate = true;
      return;
    }

    // ACTIVE EVACUATION: Attendees are FULLY VISIBLE and running out towards safety!
    _attendeeAgents.forEach((a, i) => {
      const target = a.waypoints[a.waypointIdx];
      const dx = target.x - a.pos.x;
      const dz = target.z - a.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const step = a.speed * dtSec * 60;

      if (dist < step + 0.3) {
        a.waypointIdx++;
        if (a.waypointIdx >= a.waypoints.length) {
          // Wrap back to street exit to maintain a continuous, vibrant evacuation stream
          a.waypointIdx = 0;
          a.pos.set(a.startDoor.x + randomBetween(-1.5, 1.5), 0.22, a.startDoor.z);
        }
      } else {
        a.pos.x += (dx / dist) * step;
        a.pos.z += (dz / dist) * step;
      }

      dummy.position.set(a.pos.x, 0.22, a.pos.z);
      dummy.scale.setScalar(1.25);
      if (dist > 0.01) {
        dummy.rotation.set(0, Math.atan2(dx, dz), 0);
      }
      dummy.updateMatrix();
      attendeeMesh.setMatrixAt(i, dummy.matrix);
    });
    attendeeMesh.instanceMatrix.needsUpdate = true;

    // Wheelchair users actively evacuating along Step-Free Ramp route
    _wheelAgents.forEach((a, i) => {
      const target = a.waypoints[a.waypointIdx];
      const dx = target.x - a.pos.x;
      const dz = target.z - a.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const step = a.speed * dtSec * 60;

      if (dist < step + 0.3) {
        a.waypointIdx++;
        if (a.waypointIdx >= a.waypoints.length) {
          a.waypointIdx = 0;
          a.pos.set(a.startDoor.x + randomBetween(-0.8, 0.8), 0.22, a.startDoor.z);
        }
      } else {
        a.pos.x += (dx / dist) * step;
        a.pos.z += (dz / dist) * step;
      }

      dummy.position.set(a.pos.x, 0.22, a.pos.z);
      dummy.scale.setScalar(1.25);
      if (dist > 0.01) {
        dummy.rotation.set(0, Math.atan2(dx, dz), 0);
      }
      dummy.updateMatrix();
      wheelMesh.setMatrixAt(i, dummy.matrix);
    });
    wheelMesh.instanceMatrix.needsUpdate = true;
  }


  /**
   * Holds the emergency ambulance in physical standby at AMBULANCE_STANDBY_01.
   * Zero translation, engine idling, sirens off/standby, vehicle facing forward down Road 17.
   */
  public static updateAmbulanceStandby(ambGroup: THREE.Object3D): void {
    ambGroup.position.set(ANCHORS.AMBULANCE.position.x, 0.38, ANCHORS.AMBULANCE.position.z);
    ambGroup.rotation.set(0, 0, 0); // Vehicle points +Z along Road 17

    const sirenRed = ambGroup.getObjectByName("siren_red") as THREE.Mesh;
    const sirenBlue = ambGroup.getObjectByName("siren_blue") as THREE.Mesh;
    if (sirenRed) {
      (sirenRed.material as THREE.MeshBasicMaterial).color.setHex(0x330000);
    }
    if (sirenBlue) {
      (sirenBlue.material as THREE.MeshBasicMaterial).color.setHex(0x001144);
    }
  }

  public static resetAgents(): void {
    _agentsBuilt = false;
  }

  /**
   * Creates 3D Progressive Route Visualization with direction arrows (chevrons),
   * traveled vs remaining paths, waypoint spheres, and start/end beacons.
   * Section 10 & 11: Progressively revealed as vehicle advances.
   */
  public static createEmergencyRouteVisual(
    waypoints: THREE.Vector3[],
    colorHex: number = 0x06b6d4, // Cyan for ambulance, Orange (0xf97316) for extinguisher
    routeLabel: string = "EMERGENCY ROUTE",
    isDashed: boolean = false
  ): THREE.Group & { updateProgress?: (progress: number, currentPos: THREE.Vector3) => void } {
    const group = new THREE.Group() as THREE.Group & {
      updateProgress?: (progress: number, currentPos: THREE.Vector3) => void;
    };
    group.name = "emergency_route_visual_" + routeLabel;
    if (!waypoints || waypoints.length < 2) return group;

    const totalWps = waypoints.length;

    // 1. Full baseline path curve for sampling and geometry
    const curve = new THREE.CatmullRomCurve3(waypoints, false, "catmullrom", 0.05);
    const fullPoints = curve.getPoints(Math.max(30, waypoints.length * 8));

    // 2. Traveled Route (starts empty, grows with vehicle movement)
    const traveledGeo = new THREE.BufferGeometry().setFromPoints([waypoints[0], waypoints[0]]);
    const traveledLineMat = new THREE.LineBasicMaterial({
      color: colorHex,
      linewidth: 5,
      transparent: true,
      opacity: 0.98,
    });
    const traveledLine = new THREE.Line(traveledGeo, traveledLineMat);
    traveledLine.name = "traveled_line";
    traveledLine.position.y += 0.04;
    group.add(traveledLine);

    // Glowing traveled tube
    const traveledTubeMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.85,
    });
    const initialTraveledTubeGeo = new THREE.TubeGeometry(
      new THREE.LineCurve3(waypoints[0], waypoints[0]),
      2,
      0.22,
      8,
      false
    );
    const traveledTube = new THREE.Mesh(initialTraveledTubeGeo, traveledTubeMat);
    traveledTube.name = "traveled_tube";
    traveledTube.position.y += 0.04;
    traveledTube.visible = false;
    group.add(traveledTube);

    // 3. Remaining Route (initially full, shrinks as vehicle advances)
    const remainingGeo = new THREE.BufferGeometry().setFromPoints(fullPoints);
    const remainingLineMat = new THREE.LineBasicMaterial({
      color: colorHex,
      linewidth: 3,
      transparent: true,
      opacity: isDashed ? 0.45 : 0.65,
    });
    const remainingLine = new THREE.Line(remainingGeo, remainingLineMat);
    remainingLine.name = "remaining_line";
    remainingLine.position.y += 0.04;
    group.add(remainingLine);

    // Translucent remaining tube guide
    const remainingTubeMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: isDashed ? 0.22 : 0.35,
      wireframe: isDashed,
    });
    const remainingTubeGeo = new THREE.TubeGeometry(curve, Math.max(30, waypoints.length * 6), 0.16, 8, false);
    const remainingTube = new THREE.Mesh(remainingTubeGeo, remainingTubeMat);
    remainingTube.name = "remaining_tube";
    remainingTube.position.y += 0.04;
    group.add(remainingTube);

    // 4. Direction Arrows / Chevrons (Section 11: point in travel direction along road)
    const arrowMeshes: { mesh: THREE.Mesh; dist: number }[] = [];
    const arrowGeo = new THREE.ConeGeometry(0.35, 0.9, 4);
    arrowGeo.rotateX(Math.PI / 2); // Cone tip faces +Z

    // Compute cumulative segment distances
    const cumDist: number[] = [0];
    let routeLength = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      routeLength += waypoints[i].distanceTo(waypoints[i + 1]);
      cumDist.push(routeLength);
    }

    // Place direction arrows every 4.0 - 5.5 units along the centerline
    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      const segVec = new THREE.Vector3().subVectors(p2, p1);
      const segLen = segVec.length();
      if (segLen < 1.2) continue;

      const numArrows = Math.max(1, Math.floor(segLen / 4.5));
      const stepDist = segLen / (numArrows + 1);

      for (let k = 1; k <= numArrows; k++) {
        const t = (k * stepDist) / segLen;
        const arrowPos = new THREE.Vector3().lerpVectors(p1, p2, t);
        arrowPos.y = 0.44; // Flush over road surface

        const arrowMat = new THREE.MeshBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: 0.75,
        });
        const arrow = new THREE.Mesh(arrowGeo, arrowMat);
        arrow.position.copy(arrowPos);
        arrow.lookAt(p2.x, 0.44, p2.z); // Points in direction of travel!
        group.add(arrow);

        const arrowDistance = cumDist[i] + k * stepDist;
        arrowMeshes.push({ mesh: arrow, dist: arrowDistance });
      }
    }

    // 5. Waypoint Node Spheres
    const wpGeo = new THREE.SphereGeometry(0.38, 12, 12);
    const wpMat = new THREE.MeshBasicMaterial({ color: colorHex });
    waypoints.forEach((wp) => {
      const wpMesh = new THREE.Mesh(wpGeo, wpMat);
      wpMesh.position.set(wp.x, 0.42, wp.z);
      group.add(wpMesh);
    });

    // 6. Start Marker Beacon Pin
    const startPin = createTextBadge(
      `📍 START: ${routeLabel}`,
      "rgba(15, 23, 42, 0.90)",
      "#38bdf8",
      "#ffffff"
    );
    startPin.position.set(waypoints[0].x, 3.8, waypoints[0].z);
    group.add(startPin);

    // 7. Destination Marker Beacon Pin
    const lastWp = waypoints[waypoints.length - 1];
    const destPin = createTextBadge(
      `🎯 INCIDENT TARGET`,
      "rgba(185, 28, 28, 0.95)",
      "#ef4444",
      "#fee2e2"
    );
    destPin.position.set(lastWp.x, 4.2, lastWp.z);
    group.add(destPin);

    // 8. Dynamic Progress Update Method
    group.updateProgress = (progress: number, currentPos: THREE.Vector3) => {
      const clampedProgress = Math.min(1.0, Math.max(0, progress));
      const currentDist = clampedProgress * (routeLength || 1);

      // A. Update direction arrows
      for (const item of arrowMeshes) {
        const mat = item.mesh.material as THREE.MeshBasicMaterial;
        if (item.dist <= currentDist + 0.3) {
          // Traversed arrow: bright illuminated emerald/cyan
          mat.color.setHex(0x10b981);
          mat.opacity = 1.0;
        } else {
          // Ahead arrow: pulsing route color
          mat.color.setHex(colorHex);
          mat.opacity = 0.55;
        }
      }

      // B. Update traveled & remaining route lines
      // Find waypoint index closest behind current position
      let passedIndex = 0;
      for (let i = 0; i < cumDist.length; i++) {
        if (cumDist[i] <= currentDist) passedIndex = i;
        else break;
      }

      // Construct traveled points
      const traveledPoints: THREE.Vector3[] = [];
      for (let i = 0; i <= passedIndex && i < waypoints.length; i++) {
        traveledPoints.push(waypoints[i].clone());
      }
      traveledPoints.push(new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z));

      if (traveledPoints.length >= 2) {
        traveledLine.geometry.dispose();
        traveledLine.geometry = new THREE.BufferGeometry().setFromPoints(traveledPoints);
        traveledLine.visible = true;

        try {
          const tCurve = new THREE.CatmullRomCurve3(traveledPoints, false, "catmullrom", 0.05);
          traveledTube.geometry.dispose();
          traveledTube.geometry = new THREE.TubeGeometry(
            tCurve,
            Math.max(4, traveledPoints.length * 4),
            0.20,
            8,
            false
          );
          traveledTube.visible = true;
        } catch {
          // Fallback if points coincident
        }
      }

      // Construct remaining points
      const remainingPoints: THREE.Vector3[] = [new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z)];
      for (let i = passedIndex + 1; i < waypoints.length; i++) {
        remainingPoints.push(waypoints[i].clone());
      }

      if (remainingPoints.length >= 2 && clampedProgress < 0.99) {
        remainingLine.geometry.dispose();
        remainingLine.geometry = new THREE.BufferGeometry().setFromPoints(remainingPoints);
        remainingLine.visible = true;

        try {
          const rCurve = new THREE.CatmullRomCurve3(remainingPoints, false, "catmullrom", 0.05);
          remainingTube.geometry.dispose();
          remainingTube.geometry = new THREE.TubeGeometry(
            rCurve,
            Math.max(4, remainingPoints.length * 4),
            0.15,
            8,
            false
          );
          remainingTube.visible = true;
        } catch {
          // Fallback
        }
      } else {
        remainingLine.visible = false;
        remainingTube.visible = false;
      }
    };

    return group;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AMBULANCE TIRE TRACEMARKS CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────

export class AmbulanceTireTracemarks {
  public group: THREE.Group;
  private _leftSegments: THREE.Vector3[] = [];
  private _rightSegments: THREE.Vector3[] = [];
  private _glowPoints: THREE.Vector3[] = [];
  private _leftLine: THREE.LineSegments;
  private _rightLine: THREE.LineSegments;
  private _glowLine: THREE.LineSegments;
  private _lastPos: THREE.Vector3 | null = null;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = "ambulance_tire_tracemarks";

    // Rubber skid marks (dark tire tread marks)
    const rubberMat = new THREE.LineBasicMaterial({
      color: 0x020617,
      linewidth: 4,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });

    // High-visibility cyan illuminated center tracemark trail
    const glowMat = new THREE.LineBasicMaterial({
      color: 0x06b6d4,
      linewidth: 3,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });

    this._leftLine = new THREE.LineSegments(new THREE.BufferGeometry(), rubberMat);
    this._rightLine = new THREE.LineSegments(new THREE.BufferGeometry(), rubberMat);
    this._glowLine = new THREE.LineSegments(new THREE.BufferGeometry(), glowMat);

    this._leftLine.renderOrder = 955;
    this._rightLine.renderOrder = 955;
    this._glowLine.renderOrder = 956;

    this.group.add(this._leftLine, this._rightLine, this._glowLine);

    // Static road tread marks aligned with paved Road 17 and Cross Concourse Avenue
    this._createRoadSurfaceTreads();
  }

  private _createRoadSurfaceTreads(): void {
    const treadGeo = new THREE.BufferGeometry();
    const pts: THREE.Vector3[] = [];
    // North-South paved Road 17 at x = 16.5
    for (let z = -30; z <= 10.8; z += 1.8) {
      pts.push(new THREE.Vector3(16.5 - 1.15, 0.22, z));
      pts.push(new THREE.Vector3(16.5 - 1.15, 0.22, z + 0.9));
      pts.push(new THREE.Vector3(16.5 + 1.15, 0.22, z));
      pts.push(new THREE.Vector3(16.5 + 1.15, 0.22, z + 0.9));
    }
    // Concourse turn into Auditorium access at z = 10.8
    for (let x = 16.5; x >= 1.5; x -= 1.8) {
      pts.push(new THREE.Vector3(x, 0.22, 10.8 - 1.15));
      pts.push(new THREE.Vector3(x - 0.9, 0.22, 10.8 - 1.15));
      pts.push(new THREE.Vector3(x, 0.22, 10.8 + 1.15));
      pts.push(new THREE.Vector3(x - 0.9, 0.22, 10.8 + 1.15));
    }
    treadGeo.setFromPoints(pts);
    const treadMat = new THREE.LineBasicMaterial({
      color: 0x334155,
      transparent: true,
      opacity: 0.65,
      depthTest: false,
    });
    const staticTracks = new THREE.LineSegments(treadGeo, treadMat);
    staticTracks.name = "static_road_treads";
    staticTracks.renderOrder = 954;
    this.group.add(staticTracks);
  }

  public addPoint(pos: THREE.Vector3, heading: number): void {
    if (this._lastPos && this._lastPos.distanceTo(pos) < 0.15) return;

    const perpX = Math.cos(heading);
    const perpZ = -Math.sin(heading);
    const halfWidth = 1.15;
    const y = 0.24; // Elevated directly onto road surface

    const curL = new THREE.Vector3(pos.x - perpX * halfWidth, y, pos.z - perpZ * halfWidth);
    const curR = new THREE.Vector3(pos.x + perpX * halfWidth, y, pos.z + perpZ * halfWidth);

    if (this._lastPos) {
      const prevHeading = Math.atan2(pos.x - this._lastPos.x, pos.z - this._lastPos.z);
      const pPerpX = Math.cos(prevHeading);
      const pPerpZ = -Math.sin(prevHeading);
      const prevL = new THREE.Vector3(this._lastPos.x - pPerpX * halfWidth, y, this._lastPos.z - pPerpZ * halfWidth);
      const prevR = new THREE.Vector3(this._lastPos.x + pPerpX * halfWidth, y, this._lastPos.z + pPerpZ * halfWidth);

      this._leftSegments.push(prevL, curL);
      this._rightSegments.push(prevR, curR);

      this._leftLine.geometry.dispose();
      this._leftLine.geometry = new THREE.BufferGeometry().setFromPoints(this._leftSegments);

      this._rightLine.geometry.dispose();
      this._rightLine.geometry = new THREE.BufferGeometry().setFromPoints(this._rightSegments);

      const prevC = new THREE.Vector3(this._lastPos.x, y + 0.02, this._lastPos.z);
      const curC = new THREE.Vector3(pos.x, y + 0.02, pos.z);
      this._glowPoints.push(prevC, curC);
      this._glowLine.geometry.dispose();
      this._glowLine.geometry = new THREE.BufferGeometry().setFromPoints(this._glowPoints);
    }

    this._lastPos = pos.clone();
  }

  public clear(): void {
    this._leftSegments = [];
    this._rightSegments = [];
    this._glowPoints = [];
    this._lastPos = null;
    this._leftLine.geometry.dispose();
    this._leftLine.geometry = new THREE.BufferGeometry();
    this._rightLine.geometry.dispose();
    this._rightLine.geometry = new THREE.BufferGeometry();
    this._glowLine.geometry.dispose();
    this._glowLine.geometry = new THREE.BufferGeometry();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EMERGENCY VEHICLE CONTROLLER (Phase 1.1)
// ─────────────────────────────────────────────────────────────────────────────

export type EmergencyVehicleStatus = "STANDBY" | "DISPATCHED" | "EN_ROUTE" | "AT_INCIDENT";

export interface EmergencyVehicleControllerOptions {
  speed?: number;
  baseY?: number;
  tireTracemarks?: AmbulanceTireTracemarks;
  onWaypointReached?: (index: number, waypoint: THREE.Vector3) => void;
  onRouteComplete?: () => void;
  onRouteBlocked?: (blockedSegment: string) => void;
  onStatusChange?: (status: EmergencyVehicleStatus) => void;
  onProgress?: (progress: number, currentPos: THREE.Vector3) => void;
}

/**
 * Reusable Movement Controller for Emergency Vehicles & Responders on the 3D Road Network.
 * Conforms to Phase 1.1 architecture:
 * - Standby at initial post
 * - Waypoint-to-waypoint centerline navigation
 * - Smooth rotational heading interpolation (no instant snaps, backwards driving, or sliding)
 * - Progressive route tracing and arrow synchronization
 * - Synchronized status transitions: STANDBY -> DISPATCHED -> EN_ROUTE -> AT_INCIDENT
 */
export class EmergencyVehicleController {
  public vehicle: THREE.Object3D;
  public waypoints: THREE.Vector3[];
  public speed: number; // world units / sec
  public status: EmergencyVehicleStatus = "STANDBY";
  public progress: number = 0; // 0.0 to 1.0
  public currentWaypointIndex: number = 0;
  public tireTracemarks?: AmbulanceTireTracemarks;

  private _totalDist: number = 0;
  private _cumulativeDist: number[] = [];
  private _targetHeading: number = 0;
  private _baseY: number = 0.38;
  private _sirenTimer: number = 0;
  private _routeVisualGroup?: THREE.Group & {
    updateProgress?: (progress: number, currentPos: THREE.Vector3) => void;
  };

  public onWaypointReached?: (index: number, waypoint: THREE.Vector3) => void;
  public onRouteComplete?: () => void;
  public onRouteBlocked?: (blockedSegment: string) => void;
  public onStatusChange?: (status: EmergencyVehicleStatus) => void;
  public onProgress?: (progress: number, currentPos: THREE.Vector3) => void;

  constructor(
    vehicle: THREE.Object3D,
    waypoints: THREE.Vector3[],
    speed: number = EMERGENCY_VEHICLE_SPEED,
    options?: EmergencyVehicleControllerOptions
  ) {
    this.vehicle = vehicle;
    this.waypoints = waypoints;
    this.speed = options?.speed ?? speed;
    this._baseY = options?.baseY ?? (waypoints[0]?.y ?? 0.38);
    this.tireTracemarks = options?.tireTracemarks;

    this.onWaypointReached = options?.onWaypointReached;
    this.onRouteComplete = options?.onRouteComplete;
    this.onRouteBlocked = options?.onRouteBlocked;
    this.onStatusChange = options?.onStatusChange;
    this.onProgress = options?.onProgress;

    this._computeDistances();

    // Place vehicle at initial standby position
    if (this.waypoints.length > 0) {
      this.vehicle.position.set(this.waypoints[0].x, this._baseY, this.waypoints[0].z);
      if (this.waypoints.length > 1) {
        const dx = this.waypoints[1].x - this.waypoints[0].x;
        const dz = this.waypoints[1].z - this.waypoints[0].z;
        this.vehicle.rotation.y = Math.atan2(dx, dz);
        this._targetHeading = this.vehicle.rotation.y;
      }
    }
  }

  private _computeDistances() {
    this._totalDist = 0;
    this._cumulativeDist = [0];
    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const p1 = this.waypoints[i];
      const p2 = this.waypoints[i + 1];
      const d = p1.distanceTo(p2);
      this._totalDist += d;
      this._cumulativeDist.push(this._totalDist);
    }
  }

  public setRouteVisual(
    routeVisual: THREE.Group & { updateProgress?: (progress: number, currentPos: THREE.Vector3) => void }
  ) {
    this._routeVisualGroup = routeVisual;
    this._routeVisualGroup.updateProgress?.(this.progress, this.vehicle.position);
  }

  public setWaypoints(newWaypoints: THREE.Vector3[]) {
    this.waypoints = newWaypoints;
    this._computeDistances();
    this.currentWaypointIndex = 0;
    this.progress = 0;
    this.updateStatusBadge();
  }

  /**
   * Dispatches the vehicle: STANDBY -> DISPATCHED -> EN_ROUTE.
   */
  public dispatch() {
    this.status = "DISPATCHED";
    this.updateStatusBadge();
    this.onStatusChange?.("DISPATCHED");
  }

  /**
   * Dynamic reroute when an obstruction occurs along the route.
   */
  public reroute(newWaypoints: THREE.Vector3[]) {
    // Splice current vehicle position as starting waypoint
    const currentPos = this.vehicle.position.clone();
    this.waypoints = [currentPos, ...newWaypoints.slice(1)];
    this._computeDistances();
    this.currentWaypointIndex = 0;
    this.progress = 0;
    this.status = "EN_ROUTE";
    this.updateStatusBadge();
    this.onStatusChange?.("EN_ROUTE");
  }

  public pause() {
    if (this.status === "EN_ROUTE") this.status = "DISPATCHED";
  }

  public resume() {
    if (this.status === "DISPATCHED") this.status = "EN_ROUTE";
  }

  public complete() {
    this.status = "AT_INCIDENT";
    this.progress = 1.0;
    if (this.waypoints.length > 0) {
      const dest = this.waypoints[this.waypoints.length - 1];
      this.vehicle.position.set(dest.x, this._baseY, dest.z);
    }
    this.updateStatusBadge();
    this._routeVisualGroup?.updateProgress?.(1.0, this.vehicle.position);
    this.onStatusChange?.("AT_INCIDENT");
    this.onRouteComplete?.();
  }

  public reset(standbyPos?: THREE.Vector3) {
    this.status = "STANDBY";
    this.progress = 0;
    this.currentWaypointIndex = 0;

    const resetPos = standbyPos || (this.waypoints.length > 0 ? this.waypoints[0] : ANCHORS.AMBULANCE.position);
    this.vehicle.position.set(resetPos.x, this._baseY, resetPos.z);
    this.vehicle.rotation.set(0, 0, 0); // Reset rotation to forward
    this._targetHeading = 0;

    // Sirens off
    const sirenRed = this.vehicle.getObjectByName("siren_red") as THREE.Mesh;
    const sirenBlue = this.vehicle.getObjectByName("siren_blue") as THREE.Mesh;
    if (sirenRed) (sirenRed.material as THREE.MeshBasicMaterial).color.setHex(0x330000);
    if (sirenBlue) (sirenBlue.material as THREE.MeshBasicMaterial).color.setHex(0x001144);

    this.tireTracemarks?.clear();

    this.updateStatusBadge();
    this.onStatusChange?.("STANDBY");
  }

  /**
   * Updates vehicle status badge pin texture in real time.
   */
  public updateStatusBadge(): void {
    const isAmbulance = this.vehicle.name === "AMB-001" || this.vehicle.getObjectByName("siren_red") !== undefined;
    const badgeName = isAmbulance ? "ambulance_status_badge" : "extinguisher_status_badge";
    const badge = this.vehicle.getObjectByName(badgeName) as THREE.Sprite;
    if (!badge) return;

    if (isAmbulance) {
      let text = "🚑 MEDIC-17 [STANDBY]";
      let bg = "rgba(15, 23, 42, 0.90)";
      let border = "#38bdf8";

      if (this.status === "DISPATCHED") {
        text = "🚨 MEDIC-17 [DISPATCHED]";
        bg = "rgba(225, 29, 72, 0.95)";
        border = "#f43f5e";
      } else if (this.status === "EN_ROUTE") {
        text = "🚑 MEDIC-17 [EN ROUTE]";
        bg = "rgba(190, 18, 60, 0.95)";
        border = "#ef4444";
      } else if (this.status === "AT_INCIDENT") {
        text = "🏥 MEDIC-17 [AT INCIDENT]";
        bg = "rgba(6, 78, 59, 0.95)";
        border = "#10b981";
      }
      updateTextBadge(badge, text, bg, border, "#ffffff");
    } else {
      let text = `🧯 ${this.vehicle.name} [AVAILABLE]`;
      let bg = "rgba(15, 23, 42, 0.90)";
      let border = "#ef4444";

      if (this.status === "DISPATCHED" || this.status === "EN_ROUTE") {
        text = `🧯 ${this.vehicle.name} [ASSIGNED]`;
        bg = "rgba(225, 29, 72, 0.95)";
        border = "#f43f5e";
      } else if (this.status === "AT_INCIDENT") {
        text = `🧯 ${this.vehicle.name} [AT INCIDENT]`;
        bg = "rgba(6, 78, 59, 0.95)";
        border = "#10b981";
      }
      updateTextBadge(badge, text, bg, border, "#ffffff");
    }
  }

  /**
   * Per-frame animation update loop:
   * - Smooth rotation facing the travel direction
   * - Waypoint-to-waypoint progress along road centerline
   * - Suspension vibration & siren flashing
   * - Progressive route tracing updates
   */
  public update(dtSec: number): void {
    if (this.status === "STANDBY") {
      // Vehicle remains at standby point
      TwinAssetLibrary.updateAmbulanceStandby(this.vehicle);
      return;
    }

    if (this.status === "AT_INCIDENT") {
      // Vehicle reached destination; subtle emergency strobe
      this.vehicle.position.y = this._baseY;
      this._sirenTimer += dtSec * 4;
      const sirenRed = this.vehicle.getObjectByName("siren_red") as THREE.Mesh;
      const sirenBlue = this.vehicle.getObjectByName("siren_blue") as THREE.Mesh;
      if (sirenRed) (sirenRed.material as THREE.MeshBasicMaterial).color.setHex(0xff0000);
      if (sirenBlue) (sirenBlue.material as THREE.MeshBasicMaterial).color.setHex(0x0066ff);
      return;
    }

    if (this.status === "DISPATCHED") {
      // Auto transition to active EN_ROUTE as vehicle departs standby
      this.status = "EN_ROUTE";
      this.updateStatusBadge();
      this.onStatusChange?.("EN_ROUTE");
    }

    if (this.waypoints.length < 2) return;

    if (this.currentWaypointIndex >= this.waypoints.length - 1) {
      this.complete();
      return;
    }

    const currentTarget = this.waypoints[this.currentWaypointIndex + 1];
    const pos = this.vehicle.position;
    const dx = currentTarget.x - pos.x;
    const dz = currentTarget.z - pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // 1. Calculate Target Heading & Smooth Angular Rotation Interpolation
    if (dist > 0.01) {
      this._targetHeading = Math.atan2(dx, dz);
    }
    let diff = this._targetHeading - this.vehicle.rotation.y;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    const turnRate = Math.min(1.0, 9.5 * dtSec); // Smooth responsive vehicle turn
    this.vehicle.rotation.y += diff * turnRate;

    // 2. Centerline Translation
    const step = this.speed * dtSec;
    if (dist <= step + 0.18) {
      pos.x = currentTarget.x;
      pos.z = currentTarget.z;
      this.currentWaypointIndex++;
      this.onWaypointReached?.(this.currentWaypointIndex, currentTarget);

      if (this.currentWaypointIndex >= this.waypoints.length - 1) {
        this.complete();
        return;
      }
    } else {
      pos.x += (dx / dist) * step;
      pos.z += (dz / dist) * step;
    }

    if (this.tireTracemarks) {
      this.tireTracemarks.addPoint(pos, this.vehicle.rotation.y);
    }

    // 3. Realistic road suspension micro-vibration
    pos.y = this._baseY + Math.sin(performance.now() * 0.02) * 0.018;

    // 4. Emergency siren strobe flashing
    this._sirenTimer += dtSec * 16;
    const sirenRed = this.vehicle.getObjectByName("siren_red") as THREE.Mesh;
    const sirenBlue = this.vehicle.getObjectByName("siren_blue") as THREE.Mesh;
    const isRedFlash = Math.sin(this._sirenTimer * 3.5) > 0;
    if (sirenRed) {
      (sirenRed.material as THREE.MeshBasicMaterial).color.setHex(isRedFlash ? 0xff1111 : 0x330000);
    }
    if (sirenBlue) {
      (sirenBlue.material as THREE.MeshBasicMaterial).color.setHex(!isRedFlash ? 0x0099ff : 0x001144);
    }

    // 5. Update route progress ratio
    if (this._totalDist > 0) {
      const covered =
        (this._cumulativeDist[this.currentWaypointIndex] || 0) +
        pos.distanceTo(this.waypoints[this.currentWaypointIndex]);
      this.progress = Math.min(1.0, Math.max(0, covered / this._totalDist));
    }

    // 6. Progressive Route Visual Update (Traveled line vs remaining line & arrows)
    this._routeVisualGroup?.updateProgress?.(this.progress, pos);
    this.onProgress?.(this.progress, pos);
  }
}

/** Backward compatibility alias */
export { EmergencyVehicleController as RouteTracingController };

