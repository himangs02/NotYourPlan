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
    0.8, // Elevated above city street level
    wp.z + randomBetween(-spread, spread)
  );
}

function buildAgents(waypoints: THREE.Vector3[], count: number, spread = 3): AgentState[] {
  const agents: AgentState[] = [];
  for (let i = 0; i < count; i++) {
    const startIdx = Math.floor(Math.random() * (waypoints.length - 1));
    const nearWp = spreadNear(waypoints[startIdx], spread);
    agents.push({
      pos: nearWp,
      waypoints,
      waypointIdx: startIdx + 1,
      speed: randomBetween(0.04, 0.09),
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

  if (gate2Blocked) {
    _attendeeAgents = [
      ...buildAgents(CROWD_FLOW_GATE2_BLOCKED_G3, 180, 4),
      ...buildAgents(CROWD_FLOW_GATE2_BLOCKED_G4, 120, 4),
    ];
  } else {
    _attendeeAgents = buildAgents(CROWD_FLOW_NORMAL, 300, 5);
  }

  _wheelAgents = buildAgents(CROWD_FLOW_STEPFREE, 40, 2);

  // Staff stationed at gates and transit points
  _staffPositions = [
    new THREE.Vector3(0, 0.8, -11),
    new THREE.Vector3(2, 0.8, -11),
    new THREE.Vector3(0, 0.8, 23),
    new THREE.Vector3(2, 0.8, 23),
    new THREE.Vector3(-2, 0.8, 23),
    new THREE.Vector3(14, 0.8, 6),
    new THREE.Vector3(14, 0.8, 8),
    new THREE.Vector3(-14, 0.8, 6),
    new THREE.Vector3(-14, 0.8, 8),
    new THREE.Vector3(0, 0.8, 14),
    new THREE.Vector3(0, 0.8, 16),
    new THREE.Vector3(16, 0.8, -16),
    new THREE.Vector3(16, 0.8, -14),
  ];

  _responderPositions = ROAD_17_CORRIDOR.map((wp) => spreadNear(wp, 1.5));
}

export class TwinAssetLibrary {
  /**
   * Builds the 3D representation for a semantic world object.
   */
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
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 2.2, 5.2),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
    );
    body.position.y = 1.4;
    g.add(body);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.65, 0.45, 5.0),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    stripe.position.y = 1.4;
    g.add(stripe);

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.4, 8),
      new THREE.MeshBasicMaterial({ color: isSelected ? 0xfbbf24 : 0x38bdf8 })
    );
    beacon.position.set(0, 2.6, 0.8);
    g.add(beacon);

    const badge = createTextBadge("🚑 MEDIC-17", "rgba(15, 23, 42, 0.85)", "#ef4444", "#fee2e2");
    badge.position.set(0, 4.0, 0);
    g.add(badge);

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

    // Agents sized prominently (radius 0.55, height 2.0) elevated at y = 0.8
    const agentGeo = new THREE.CylinderGeometry(0.55, 0.55, 2.0, 8);
    agentGeo.translate(0, 1.0, 0);

    const attendeeCount = _attendeeAgents.length;
    const wheelCount = _wheelAgents.length;
    const staffCount = _staffPositions.length;
    const responderCount = _responderPositions.length;

    // 1. General Attendees: Vibrant Sky Blue
    const attendeeMesh = new THREE.InstancedMesh(
      agentGeo,
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
      attendeeCount
    );
    attendeeMesh.name = "crowd_attendees";

    // 2. Mobility-Impaired / Wheelchair: Vibrant Purple
    const wheelMesh = new THREE.InstancedMesh(
      agentGeo,
      new THREE.MeshBasicMaterial({ color: 0xc084fc }),
      wheelCount
    );
    wheelMesh.name = "crowd_wheelchair";

    // 3. Marshals: Safety Yellow
    const staffMesh = new THREE.InstancedMesh(
      agentGeo,
      new THREE.MeshBasicMaterial({ color: 0xfacc15 }),
      staffCount
    );
    staffMesh.name = "crowd_staff";

    // 4. Emergency Responders: Vibrant Green
    const responderMesh = new THREE.InstancedMesh(
      agentGeo,
      new THREE.MeshBasicMaterial({ color: 0x4ade80 }),
      responderCount
    );
    responderMesh.name = "crowd_responders";

    const dummy = new THREE.Object3D();

    _attendeeAgents.forEach((a, i) => {
      dummy.position.set(a.pos.x, 0.8, a.pos.z);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      attendeeMesh.setMatrixAt(i, dummy.matrix);
    });
    attendeeMesh.instanceMatrix.needsUpdate = true;

    _wheelAgents.forEach((a, i) => {
      dummy.position.set(a.pos.x, 0.8, a.pos.z);
      dummy.scale.set(1.3, 0.75, 1.3);
      dummy.updateMatrix();
      wheelMesh.setMatrixAt(i, dummy.matrix);
    });
    wheelMesh.instanceMatrix.needsUpdate = true;

    _staffPositions.forEach((p, i) => {
      dummy.position.set(p.x, 0.8, p.z);
      dummy.scale.set(1.15, 1.15, 1.15);
      dummy.updateMatrix();
      staffMesh.setMatrixAt(i, dummy.matrix);
    });
    staffMesh.instanceMatrix.needsUpdate = true;

    _responderPositions.forEach((p, i) => {
      dummy.position.set(p.x, 0.8, p.z);
      dummy.scale.set(1.15, 1.15, 1.15);
      dummy.updateMatrix();
      responderMesh.setMatrixAt(i, dummy.matrix);
    });
    responderMesh.instanceMatrix.needsUpdate = true;

    group.add(attendeeMesh, wheelMesh, staffMesh, responderMesh);

    return { group, attendeeMesh, wheelMesh, staffMesh, responderMesh };
  }

  public static updateCrowdAnimation(
    dt: number,
    attendeeMesh: THREE.InstancedMesh,
    wheelMesh: THREE.InstancedMesh
  ): void {
    const dummy = new THREE.Object3D();
    const dtSec = Math.min(dt / 1000, 0.05);

    _attendeeAgents.forEach((a, i) => {
      if (a.waypointIdx >= a.waypoints.length) a.waypointIdx = 0;
      const target = a.waypoints[a.waypointIdx];
      const dx = target.x - a.pos.x;
      const dz = target.z - a.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const step = a.speed * dtSec * 60;
      if (dist < step + 0.1) {
        a.waypointIdx++;
      } else {
        a.pos.x += (dx / dist) * step;
        a.pos.z += (dz / dist) * step;
      }
      dummy.position.set(a.pos.x, 0.8, a.pos.z);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      attendeeMesh.setMatrixAt(i, dummy.matrix);
    });
    attendeeMesh.instanceMatrix.needsUpdate = true;

    _wheelAgents.forEach((a, i) => {
      if (a.waypointIdx >= a.waypoints.length) a.waypointIdx = 0;
      const target = a.waypoints[a.waypointIdx];
      const dx = target.x - a.pos.x;
      const dz = target.z - a.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const step = a.speed * dtSec * 60 * 0.65;
      if (dist < step + 0.1) {
        a.waypointIdx++;
      } else {
        a.pos.x += (dx / dist) * step;
        a.pos.z += (dz / dist) * step;
      }
      dummy.position.set(a.pos.x, 0.8, a.pos.z);
      dummy.scale.set(1.3, 0.75, 1.3);
      dummy.updateMatrix();
      wheelMesh.setMatrixAt(i, dummy.matrix);
    });
    wheelMesh.instanceMatrix.needsUpdate = true;
  }

  public static resetAgents(): void {
    _agentsBuilt = false;
  }
}
