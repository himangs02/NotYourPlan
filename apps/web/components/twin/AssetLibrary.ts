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
} from "./worldAnchors";

// ─────────────────────────────────────────────────────────────────────────────
// Canvas Sprite Badge Creator for Floating 3D Semantic Labels
// ─────────────────────────────────────────────────────────────────────────────
function createTextBadge(
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
  return sprite;
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
        startDoor = new THREE.Vector3(-12.0, 1.95, 4.0); // West street exit
        waypoints = CROWD_FLOW_GATE2_BLOCKED_G4;
      } else {
        startDoor = new THREE.Vector3(12.0, 1.95, 4.0);  // East street exit
        waypoints = CROWD_FLOW_GATE2_BLOCKED_G3;
      }
    } else {
      // Main street exit onto Food Court Concourse / Plaza
      startDoor = new THREE.Vector3(randomBetween(-2.8, 2.8), 1.95, 12.0);
      waypoints = CROWD_FLOW_NORMAL;
    }

    // Populate attendees along the street evacuation stream
    const startIdx = Math.floor(Math.random() * (waypoints.length - 1));
    const p1 = waypoints[startIdx];
    const p2 = waypoints[startIdx + 1];
    const alpha = Math.random();
    const pos = new THREE.Vector3().lerpVectors(p1, p2, alpha);
    pos.x += randomBetween(-1.6, 1.6);
    pos.y = 1.95;

    agents.push({
      pos,
      startDoor: startDoor.clone(),
      waypoints,
      waypointIdx: startIdx + 1,
      speed: randomBetween(0.09, 0.15), // Visible, active emergency run speed
    });
  }
  return agents;
}

function buildHallWheelchairs(count: number): AgentState[] {
  const agents: AgentState[] = [];
  const waypoints = CROWD_FLOW_STEPFREE;
  for (let i = 0; i < count; i++) {
    const startDoor = new THREE.Vector3(-12.0, 1.95, 4.0);
    const startIdx = Math.floor(Math.random() * (waypoints.length - 1));
    const p1 = waypoints[startIdx];
    const p2 = waypoints[startIdx + 1];
    const alpha = Math.random();
    const pos = new THREE.Vector3().lerpVectors(p1, p2, alpha);
    pos.x += randomBetween(-0.8, 0.8);
    pos.y = 1.95;

    agents.push({
      pos,
      startDoor: startDoor.clone(),
      waypoints,
      waypointIdx: startIdx + 1,
      speed: randomBetween(0.07, 0.11),
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

    // 9. Floating 3D Badge Pin
    const badge = createTextBadge("🚑 MEDIC-17 (ACTIVE)", "rgba(15, 23, 42, 0.90)", "#ef4444", "#fee2e2");
    badge.position.set(0, 4.5, 0);
    g.add(badge);

    // g position is managed by the parent group at obj.position
    g.position.set(0, 0, 0);
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

    if (!this._isFireActive) {
      // PRE-FIRE STATE: People are completely HIDDEN inside the building!
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

    // FIRE ACTIVE: Attendees are FULLY VISIBLE and running out on the road towards safety!
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
          a.pos.set(a.startDoor.x + randomBetween(-1.5, 1.5), 1.95, a.startDoor.z);
        }
      } else {
        a.pos.x += (dx / dist) * step;
        a.pos.z += (dz / dist) * step;
      }

      dummy.position.set(a.pos.x, 1.95, a.pos.z);
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
          a.pos.set(a.startDoor.x + randomBetween(-0.8, 0.8), 1.95, a.startDoor.z);
        }
      } else {
        a.pos.x += (dx / dist) * step;
        a.pos.z += (dz / dist) * step;
      }

      dummy.position.set(a.pos.x, 1.95, a.pos.z);
      dummy.scale.setScalar(1.25);
      if (dist > 0.01) {
        dummy.rotation.set(0, Math.atan2(dx, dz), 0);
      }
      dummy.updateMatrix();
      wheelMesh.setMatrixAt(i, dummy.matrix);
    });
    wheelMesh.instanceMatrix.needsUpdate = true;
  }


  private static _ambWpIdx = 0;
  private static _ambDir = 1;
  private static _ambTimer = 0;

  /**
   * Drives the emergency ambulance dynamically along the Road 17 Medical Corridor.
   */
  public static updateAmbulanceAnimation(dt: number, ambGroup: THREE.Object3D): void {
    const dtSec = Math.min(dt / 1000, 0.05);
    const speed = 8.5; // Fast emergency transit speed (m/s)

    const waypoints = ROAD_17_CORRIDOR;
    if (!waypoints || waypoints.length === 0) return;

    const currentPos = ambGroup.position;
    const targetWp = waypoints[this._ambWpIdx];

    const dx = targetWp.x - currentPos.x;
    const dz = targetWp.z - currentPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    const step = speed * dtSec;
    if (dist < step + 0.25) {
      this._ambWpIdx += this._ambDir;
      if (this._ambWpIdx >= waypoints.length) {
        this._ambWpIdx = waypoints.length - 2;
        this._ambDir = -1; // Reverse back toward medical post
      } else if (this._ambWpIdx < 0) {
        this._ambWpIdx = 1;
        this._ambDir = 1; // Drive toward Gate 1 again
      }
    } else {
      currentPos.x += (dx / dist) * step;
      currentPos.z += (dz / dist) * step;
      // Rotate vehicle heading directly forward
      ambGroup.rotation.y = Math.atan2(dx, dz);
    }

    // Gentle vehicle suspension vibration
    ambGroup.position.y = 1.95 + Math.sin(performance.now() * 0.015) * 0.02;

    // Siren strobe flashing (alternating high-intensity red & blue pulses)
    this._ambTimer += dtSec * 12;
    const sirenRed = ambGroup.getObjectByName("siren_red") as THREE.Mesh;
    const sirenBlue = ambGroup.getObjectByName("siren_blue") as THREE.Mesh;
    const isRedFlash = Math.sin(this._ambTimer * 3.5) > 0;

    if (sirenRed) {
      (sirenRed.material as THREE.MeshBasicMaterial).color.setHex(isRedFlash ? 0xff1111 : 0x440000);
    }
    if (sirenBlue) {
      (sirenBlue.material as THREE.MeshBasicMaterial).color.setHex(!isRedFlash ? 0x00aaff : 0x001155);
    }
  }

  public static resetAgents(): void {
    _agentsBuilt = false;
  }
}
