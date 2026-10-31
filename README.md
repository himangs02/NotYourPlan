# EventFlow

> **"EventFlow lets organizers test how thousands of people will move through an event before the event happens. It uses SUMO to simulate crowd movement, deterministic rules to reject unsafe plans, Gemini to explain verified results, YugabyteDB to preserve the evidence, and Meko to carry planning context between specialist agents."**

---

## 1. What EventFlow Does

EventFlow is a simulation-backed crowd-management tool and **3D interactive semantic digital twin** designed for university campus fests, concerts, and public gatherings. It empowers venue directors and safety marshals to explore plausible crowd egress outcomes under stated assumptions before opening the gates.

```text
ORGANIZER GOAL
      ↓
CONSTRAINTS
      ↓
3D SEMANTIC DIGITAL TWIN
      ↓
SCENARIO / WHAT-IF (World v1 → World v2)
      ↓
SUMO / SIMULATION RUNNER (Multi-Seeds 42, 101, 777)
      ↓
DETERMINISTIC SAFETY EVALUATION
      ↓
PASS / FAIL DECISION & OPERATOR ACTION PLAN
```

---

## 2. 3D Interactive Semantic Digital Twin

EventFlow integrates a realistic 3D city environment (`city.glb`) with an independent, configurable semantic overlay layer:

- **Photorealistic Urban Environment:** Loaded asynchronously via Three.js `GLTFLoader` with automatic scale normalization and ground alignment.
- **Holographic Digital Twin Zones:** Semantic areas (Auditorium, Food Court, Parking, Central Assembly Area) render as translucent volumetric zones (`opacity: 0.15` with glowing perimeter wireframe edges), allowing the realistic city buildings and roads to remain 100% visible.
- **Floating 3D Semantic Badges:** In-scene depth-independent pins mark `🏢 Main Auditorium`, `🍔 Food Court`, `🅿 Parking Plaza`, `Gate 1–4`, `🚑 Road 17`, and `📍 Central Assembly Area`.
- **Animated Instanced Crowd:** 3,000 modeled attendees rendered as GPU-instanced agents with real-time waypoint navigation:
  - **Blue:** General crowd
  - **Purple:** Mobility-impaired / wheelchair users
  - **Yellow:** Marshals and event staff
  - **Green:** Emergency responders
  - **Red:** Ambulance Unit 1 (MEDIC-17 with pulsing beacon)
- **Centralized World Anchors (`worldAnchors.ts`):** All semantic coordinates and egress waypoints are defined in a single source of truth.
- **Simulation View Modes:**
  - `[3D]`: Orbital perspective view of the campus city.
  - `[Top]`: 2D top-down plan.
  - `[Sim]`: Crowd egress with real-time candidate plan performance badges.
  - `[Density]`: Heatmap congestion overlay when density exceeds 2.2 ped/m².
  - `[Emerg]`: Emergency medical corridor focus (Road 17 & ambulance).

---

## 3. Flagship Gate 2 What-If Workflow

1. Click **Gate 2** in the 3D twin to open the semantic object inspector.
2. Click **`[ Block Gate 2 (What-If) ]`**:
   - Spawns physical barricades with yellow hazard caution stripes.
   - Status indicator switches from **GREEN → RED**.
   - Modeled crowd immediately diverts toward Gate 3 and Gate 4.
   - Dispatches `POST /api/events/event-dtu-convocation-001/world/what-if`.
   - Immutable **World v2** (`world-v2-gate_2-blocked`) is registered in YugabyteDB.
   - Candidate plan rankings update: **Accessible Priority Plan** rises to #1.
   - Active **World v2 Delta** badge appears over the viewport.

---

## 4. Deterministic Causal Failure Chains

When an egress plan fails hard safety constraints, EventFlow extracts a deterministic causal failure chain:

```text
Open Gate 1 immediately
       ↓
Pedestrian flow shifts from Auditorium East onto Road 17
       ↓
Road 17 becomes congested (density > 2.8 ped/m²)
       ↓
Ambulance transit delayed by 41.2 seconds (> 30s hard limit)
       ↓
Hard Constraint Violated: Plan Rejected
```

**Interactive 3D Connection:** Clicking any step in the causal chain on the dashboard or in the Causal Failure Drawer directly rotates and zooms the 3D camera to the corresponding physical asset (Gate 1, Road 17, or Ambulance).

---

## 5. System Architecture

```text
+-----------------------------------------------------------------------------------+
|                                 GEMINI LAYER                                      |
|  - Compiles natural-language goal into structured JSON constraints               |
|  - Proposes candidate intervention plans conforming to strict schema              |
|  - Explains verified simulation results in plain language                         |
|  - Generates timed operator checklist & translates into English / Hindi           |
|  * Post-check: Every numeric claim is verified against deterministic metrics      |
|  * STRICT BOUNDARY: Never chooses winning plan, sets metrics, or overrides safety |
+-----------------------------------------------------------------------------------+
                                        |
                                        v
+-----------------------------------------------------------------------------------+
|                           DETERMINISTIC EVALUATION CODE                           |
|  - Feasibility validation of gates, roads, zones, and intervention DSL            |
|  - Multi-seed simulation dispatch & metric extraction (Seeds 42, 101, 777)        |
|  - Hard constraint verification (P95 <= 600s, ambulance delay <= 30s, etc.)       |
|  - Human Impact Index (HII) calculation by group (General, Mobility, Responders)   |
|  - Deterministic cost score: 0.30*p95 + 0.25*access + 0.20*emerg + 0.15*dens      |
|  - Deterministic causal failure chain extraction                                  |
|  - Provenance tracking with immutable audit trail                                 |
+-----------------------------------------------------------------------------------+
                                        |
                                        v
+-----------------------------------+       +---------------------------------------+
|            YUGABYTEDB             |       |                 MEKO                  |
|  - System of record (Postgres/YSQL)|       |  - Shared context & memory layer      |
|  - Immutable world versions (v1,v2)|       |  - Specialist planning roles:         |
|  - Events, plans, seeds, runs     |       |    * Goal Interpreter                 |
|  - Evaluations, decisions, steps  |       |    * Plan Strategist                  |
|                                   |       |    * Simulation Analyst               |
|                                   |       |    * Operations Writer                |
+-----------------------------------+       +---------------------------------------+
                                        |
                                        v
+-----------------------------------------------------------------------------------+
|                                   ECLIPSE SUMO                                    |
|  - Valid .net.xml network: Auditorium, Food Court, Parking Plaza, Assembly Area   |
|  - Valid .rou.xml pedestrian demand flows & .sumocfg run configuration            |
|  - Pedestrian striping dynamics, Fruin Level of Service bottleneck queuing        |
|  - Calibrated local physics fallback runner when SUMO binary is not on PATH       |
+-----------------------------------------------------------------------------------+
```

---

## 6. Technology Integration & Honest Claims

- **SUMO Physics:** Pedestrian dynamics run through Eclipse SUMO when installed, with an internal calibrated physics fallback (`EVENTFLOW_PHYSICS_FALLBACK`) when SUMO is not on PATH.
- **YugabyteDB:** Distributed SQL system of record preserving immutable world version lineages and simulation run seeds (`YUGABYTEDB_CONTEXT_TABLE_FALLBACK` when local cluster is offline).
- **Meko Context:** Cross-agent working memory for specialist planning roles.
- **Gemini:** Natural language goal compilation and timed bilingual action plan generation (English/Hindi).
- **Honest Claims Policy:**
  - *"EventFlow explores plausible outcomes under stated assumptions. Does not predict reality."*
  - Modeled crowd data is labeled as `SYNTHETIC_MODELED_CROWD`.
  - The 3D model is labeled as `MODELED DIGITAL TWIN — SYNTHETIC VENUE GEOMETRY`.

---

## 7. Core Candidate Plans & Results

All plans run across seeds `42, 101, 777`:

| Plan | Strategy | Status | Score | P95 Exit | Amb Delay | Marshals |
|---|---|:---:|:---:|:---:|:---:|:---:|
| **Stagger Zones & Reserve Emergency Route** | Releases Food Court first, holds Auditorium 90s, reserves Road 17 | **PASS (Winner)** | **0.284** | 7m 44s | 5.8s | 12 |
| **Accessible Priority Plan** | Priority step-free egress for wheelchair attendees via Gate 4 | **PASS** | 0.352 | 8m 22s | 6.2s | 16 |
| **Open-All-Gates Plan** | Opens all 4 gates immediately without staging | **FAIL** | — | 7m 32s | 41.2s *(Limit: 30s)* | 8 |
| **Baseline Plan** | Unmanaged single-gate egress via Gate 2 | **FAIL** | — | 11m 20s *(Limit: 10m)* | 6.0s | 4 |
| **Staggered-Zone Plan** | Zone staggering without Road 17 protection | **FAIL** | — | 8m 05s | 33.5s *(Limit: 30s)* | 10 |
| **Emergency-Corridor Plan** | Protects Road 17 but no zone staggering | **FAIL** | — | 10m 15s *(Limit: 10m)* | 5.2s | 10 |

---

## 8. How to Run

### Setup Environment
```bash
cp .env.example .env
```

### 1. Run Automated Tests (13/13 Pass)
```bash
python -m pytest tests/ -v
```

### 2. Run Next.js Production Build
```bash
npm run build --prefix apps/web
```

### 3. Start Development Server
```bash
npm run dev --prefix apps/web
```
Open **`http://localhost:3000`** in your browser.

### 4. Or Run via Docker Compose
```bash
docker compose up --build
```
- Frontend Web App: `http://localhost:3000`
- FastAPI Backend: `http://localhost:8000` (Swagger docs at `/docs`)
- YugabyteDB Console: `http://localhost:7000`

---

## 9. Asset Licenses

The 3D city environment model (`city.glb`) is used under the **Creative Commons Attribution 4.0 International (CC BY 4.0)** license. Full attribution and license terms are documented in [`docs/ASSET_LICENSES.md`](docs/ASSET_LICENSES.md).
