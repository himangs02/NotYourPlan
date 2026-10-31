"""
EventFlow Emergency Routing & Dispatch Engine (Phase 1).
Calculates safe emergency routes for ambulances and fire response assets using
the venue navigable road/path graph, accounting for fire hazards, world versions (blocked gates),
emergency corridors, and pedestrian congestion.
"""

import math
import heapq
import uuid
import datetime
from typing import Dict, Any, List, Optional, Tuple

from packages.schemas.models import (
    EmergencyResource,
    EmergencyIncident,
    EmergencyRoute,
    EmergencyNotification,
    EmergencyDispatch,
)

# ─────────────────────────────────────────────────────────────────────────────
# VENUE NAVIGATION GRAPH DEFINITION
# ─────────────────────────────────────────────────────────────────────────────

# Coordinate space matching worldAnchors.ts: 1 unit ≈ 1 metre
VENUE_NODES: Dict[str, Dict[str, Any]] = {
    "AMBULANCE_STANDBY_01": {
        "id": "AMBULANCE_STANDBY_01",
        "name": "Ambulance Standby Post 01",
        "road_id": "ROAD_17",
        "x": 10.0, "y": 1.95, "z": -28.0,
        "is_emergency_corridor": True
    },
    "ROAD_17_NORTH": {
        "id": "ROAD_17_NORTH",
        "name": "Road 17 North Sector",
        "road_id": "ROAD_17",
        "x": 10.0, "y": 1.95, "z": -22.0,
        "is_emergency_corridor": True
    },
    "ROAD_17_MID": {
        "id": "ROAD_17_MID",
        "name": "Road 17 Central Emergency Corridor",
        "road_id": "ROAD_17",
        "x": 10.0, "y": 1.95, "z": -16.0,
        "is_emergency_corridor": True
    },
    "ROAD_17_SOUTH": {
        "id": "ROAD_17_SOUTH",
        "name": "Road 17 South Sector",
        "road_id": "ROAD_17",
        "x": 10.0, "y": 1.95, "z": -4.0,
        "is_emergency_corridor": True
    },
    "INTERSECTION_ROAD17_GATE1": {
        "id": "INTERSECTION_ROAD17_GATE1",
        "name": "Gate 1 / Road 17 Junction",
        "road_id": "GATE_1_APPROACH",
        "x": 8.0, "y": 0.5, "z": -11.0,
        "is_emergency_corridor": True
    },
    "GATE_1": {
        "id": "GATE_1",
        "name": "Gate 1 (North Concourse)",
        "road_id": "GATE_1",
        "gate_id": "gate_1",
        "x": 0.0, "y": 0.0, "z": -11.0,
        "is_gate": True
    },
    "NORTH_CONCOURSE": {
        "id": "NORTH_CONCOURSE",
        "name": "North Staging Concourse",
        "road_id": "NORTH_CONCOURSE",
        "x": 0.0, "y": 0.0, "z": -7.0
    },
    "AUDITORIUM_ENTRY_NORTH": {
        "id": "AUDITORIUM_ENTRY_NORTH",
        "name": "Main Auditorium North Emergency Entry",
        "road_id": "AUDITORIUM_NORTH_ENTRY",
        "x": 0.0, "y": 0.0, "z": -4.0
    },
    "AUDITORIUM_FIRE_CORE": {
        "id": "AUDITORIUM_FIRE_CORE",
        "name": "Auditorium Hall Interior (Fire Hazard Core)",
        "road_id": "AUDITORIUM_FIRE_CORE",
        "x": 0.0, "y": 2.0, "z": 0.0,
        "is_hazard_core": True
    },
    "AUDITORIUM_ENTRY_WEST": {
        "id": "AUDITORIUM_ENTRY_WEST",
        "name": "Auditorium West Access Door",
        "road_id": "AUDITORIUM_WEST_ENTRY",
        "x": -6.0, "y": 0.8, "z": -1.0
    },
    "FE_002_LOC": {
        "id": "FE_002_LOC",
        "name": "Building B Floor 2 West Corridor (FE-002)",
        "road_id": "WEST_WING_CORRIDOR",
        "x": -6.0, "y": 0.8, "z": 2.0
    },
    "AUDITORIUM_ENTRY_EAST": {
        "id": "AUDITORIUM_ENTRY_EAST",
        "name": "Auditorium East Access Door",
        "road_id": "AUDITORIUM_EAST_ENTRY",
        "x": 6.0, "y": 0.8, "z": -1.0
    },
    "FE_001_LOC": {
        "id": "FE_001_LOC",
        "name": "East Arcade Corridor (FE-001)",
        "road_id": "EAST_ARCADE_CORRIDOR",
        "x": 14.0, "y": 0.8, "z": 6.0
    },
    "FE_003_LOC": {
        "id": "FE_003_LOC",
        "name": "North Parking Staging Post (FE-003)",
        "road_id": "PARKING_STAGING",
        "x": 12.0, "y": 0.8, "z": -8.0
    },
    "GATE_3": {
        "id": "GATE_3",
        "name": "Gate 3 (East Arcade)",
        "road_id": "GATE_3",
        "gate_id": "gate_3",
        "x": 14.0, "y": 0.0, "z": 6.0,
        "is_gate": True
    },
    "GATE_4": {
        "id": "GATE_4",
        "name": "Gate 4 (West Wheelchair Ramp)",
        "road_id": "GATE_4",
        "gate_id": "gate_4",
        "x": -14.0, "y": 0.0, "z": 6.0,
        "is_gate": True
    },
    "CENTRAL_CONCOURSE": {
        "id": "CENTRAL_CONCOURSE",
        "name": "Central Concourse Walkway",
        "road_id": "CENTRAL_CONCOURSE",
        "x": 0.0, "y": 0.0, "z": 10.0
    },
    "FOOD_COURT": {
        "id": "FOOD_COURT",
        "name": "Food Court Concourse",
        "road_id": "FOOD_COURT_CONCOURSE",
        "x": 0.0, "y": 1.5, "z": 16.0
    },
    "GATE_2": {
        "id": "GATE_2",
        "name": "Gate 2 (Main South Plaza Gate)",
        "road_id": "GATE_2",
        "gate_id": "gate_2",
        "x": 0.0, "y": 0.0, "z": 23.0,
        "is_gate": True
    },
    "METRO_BOULEVARD": {
        "id": "METRO_BOULEVARD",
        "name": "Metro Boulevard Exit Avenue",
        "road_id": "METRO_BOULEVARD",
        "x": 0.0, "y": 0.0, "z": 34.0
    },
    "CENTRAL_ASSEMBLY": {
        "id": "CENTRAL_ASSEMBLY",
        "name": "Central Evacuation & Assembly Area",
        "road_id": "ASSEMBLY_AREA",
        "x": 0.0, "y": 0.08, "z": 48.0
    },
    "PARKING_PLAZA": {
        "id": "PARKING_PLAZA",
        "name": "North Parking Plaza",
        "road_id": "PARKING_PLAZA",
        "x": 20.0, "y": 0.2, "z": -4.0
    }
}

# Undirected graph edges with base lengths and corridor designations
# Calibrated so actual scaled distance matches venue specifications:
# AMB-001 -> Incident = 184m (ETA ~72s)
# FE-002 -> Incident = 85m (ETA ~34s)
# FE-003 -> Incident = 142m (ETA ~57s)
# FE-001 -> Incident = 210m (ETA ~84s)
VENUE_EDGES: List[Tuple[str, str, float, bool]] = [
    # (u, v, length_units, is_emergency_corridor)
    # Emergency corridor (Road 17 -> Gate 1 -> Auditorium North Entry)
    ("AMBULANCE_STANDBY_01", "ROAD_17_NORTH", 6.0, True),
    ("ROAD_17_NORTH", "ROAD_17_MID", 8.0, True),
    ("ROAD_17_MID", "ROAD_17_SOUTH", 10.0, True),
    ("ROAD_17_MID", "INTERSECTION_ROAD17_GATE1", 11.8, True),
    ("INTERSECTION_ROAD17_GATE1", "GATE_1", 6.0, True),
    ("GATE_1", "NORTH_CONCOURSE", 3.0, True),
    ("NORTH_CONCOURSE", "AUDITORIUM_ENTRY_NORTH", 2.0, True),

    # Parking bypass / East perimeter route (alternative route if Road 17 is blocked)
    ("ROAD_17_NORTH", "PARKING_PLAZA", 8.0, False),
    ("ROAD_17_SOUTH", "PARKING_PLAZA", 7.0, False),
    ("PARKING_PLAZA", "GATE_3", 14.0, False),

    # FE-003 station (North Parking Staging) -> 28.4 units total (142m)
    ("FE_003_LOC", "INTERSECTION_ROAD17_GATE1", 17.4, False),
    ("FE_003_LOC", "ROAD_17_SOUTH", 12.0, False),

    # FE-002 station (West Corridor Floor 2) -> 17.0 units total (85m)
    ("FE_002_LOC", "AUDITORIUM_ENTRY_WEST", 4.0, False),
    ("AUDITORIUM_ENTRY_WEST", "AUDITORIUM_ENTRY_NORTH", 13.0, False),
    ("FE_002_LOC", "GATE_4", 12.0, False),

    # FE-001 station (East Arcade Concourse) -> 42.0 units total (210m)
    ("FE_001_LOC", "GATE_3", 2.0, False),
    ("GATE_3", "AUDITORIUM_ENTRY_EAST", 25.0, False),
    ("AUDITORIUM_ENTRY_EAST", "AUDITORIUM_ENTRY_NORTH", 15.0, False),

    # South routes
    ("FE_002_LOC", "CENTRAL_CONCOURSE", 15.0, False),
    ("FE_001_LOC", "CENTRAL_CONCOURSE", 18.0, False),
    ("CENTRAL_CONCOURSE", "FOOD_COURT", 8.0, False),
    ("FOOD_COURT", "GATE_2", 8.0, False),
    ("GATE_2", "METRO_BOULEVARD", 11.0, False),
    ("METRO_BOULEVARD", "CENTRAL_ASSEMBLY", 14.0, False),

    # Direct central route (crosses fire hazard zone if active)
    ("AUDITORIUM_ENTRY_NORTH", "AUDITORIUM_FIRE_CORE", 4.5, False),
    ("AUDITORIUM_FIRE_CORE", "CENTRAL_CONCOURSE", 10.0, False),
    ("AUDITORIUM_ENTRY_WEST", "AUDITORIUM_FIRE_CORE", 6.3, False),
    ("AUDITORIUM_ENTRY_EAST", "AUDITORIUM_FIRE_CORE", 6.3, False),
]


# Baseline Emergency Resources
DEFAULT_EMERGENCY_RESOURCES = [
    {
        "id": "AMB-001",
        "type": "AMBULANCE",
        "name": "Ambulance 01",
        "status": "STANDBY",
        "location": "AMBULANCE_STANDBY_01",
        "building": "Campus Ground Medical Post",
        "floor": 0,
        "availability": "AVAILABLE",
        "capacity": 2,
        "assigned_incident": None,
        "coordinates": {"x": 16.0, "y": 1.95, "z": -28.0}
    },
    {
        "id": "FE-001",
        "type": "FIRE_EXTINGUISHER",
        "name": "Extinguisher FE-001 (East Concourse)",
        "status": "AVAILABLE",
        "location": "FE_001_LOC",
        "building": "Building B",
        "floor": 1,
        "availability": "AVAILABLE",
        "capacity": 10,
        "assigned_incident": None,
        "coordinates": {"x": 14.0, "y": 0.8, "z": 6.0}
    },
    {
        "id": "FE-002",
        "type": "FIRE_EXTINGUISHER",
        "name": "Extinguisher FE-002 (West Auditorium Wing)",
        "status": "AVAILABLE",
        "location": "FE_002_LOC",
        "building": "Building B",
        "floor": 2,
        "availability": "AVAILABLE",
        "capacity": 10,
        "assigned_incident": None,
        "coordinates": {"x": -6.0, "y": 0.8, "z": 2.0}
    },
    {
        "id": "FE-003",
        "type": "FIRE_EXTINGUISHER",
        "name": "Extinguisher FE-003 (North Parking Staging)",
        "status": "AVAILABLE",
        "location": "FE_003_LOC",
        "building": "Building A",
        "floor": 1,
        "availability": "AVAILABLE",
        "capacity": 10,
        "assigned_incident": None,
        "coordinates": {"x": 12.0, "y": 0.8, "z": -8.0}
    }
]


class EmergencyRouteEngine:
    """
    Graph-based Safe Route Calculation Engine.
    Implements Dijkstra's algorithm with emergency corridor priority weighting,
    fire hazard zone avoidance, and blocked segment / gate handling.
    """

    def __init__(self):
        self.nodes = VENUE_NODES
        self.edges = VENUE_EDGES

    def _build_adjacency(
        self,
        world_version: int,
        blocked_gates: List[str],
        blocked_segments: List[str],
        fire_active: bool,
        fire_hazard_nodes: List[str],
        is_emergency_vehicle: bool = False
    ) -> Dict[str, List[Tuple[str, float, bool]]]:
        """
        Builds adjacency list with dynamic weights based on safety conditions.
        """
        adj: Dict[str, List[Tuple[str, float, bool]]] = {nid: [] for nid in self.nodes}

        # Gate blockages (e.g., Gate 2 in World v2, or Gate 1 if blocked)
        impassable_gates = set(blocked_gates)
        if world_version >= 2:
            impassable_gates.add("gate_2")

        hazard_nodes_set = set(fire_hazard_nodes) if fire_active else set()

        for u, v, length, is_corridor in self.edges:
            # Check if edge contains blocked segment
            edge_id_1 = f"{u}__{v}"
            edge_id_2 = f"{v}__{u}"
            if edge_id_1 in blocked_segments or edge_id_2 in blocked_segments:
                continue

            # Check if either node is an impassable gate
            u_gate = self.nodes.get(u, {}).get("gate_id")
            v_gate = self.nodes.get(v, {}).get("gate_id")
            if (u_gate and u_gate in impassable_gates) or (v_gate and v_gate in impassable_gates):
                continue

            # Check fire hazard: do not allow path through fire core when fire is active
            if u in hazard_nodes_set or v in hazard_nodes_set:
                # Hazardous edge! Exclude from safe emergency routing
                continue

            # Compute effective cost
            # Emergency corridors get high priority (cost reduced by 50% for emergency vehicles)
            cost = length
            if is_emergency_vehicle:
                if is_corridor:
                    cost *= 0.5  # Protected emergency route speed advantage
                else:
                    cost *= 1.4  # Slightly penalized compared to clear emergency corridor

            adj[u].append((v, cost, length, is_corridor))
            adj[v].append((u, cost, length, is_corridor))

        return adj

    def calculate_route(
        self,
        start_node_id: str,
        dest_node_id: str,
        world_version: int = 1,
        blocked_gates: Optional[List[str]] = None,
        blocked_segments: Optional[List[str]] = None,
        fire_active: bool = True,
        fire_hazard_nodes: Optional[List[str]] = None,
        resource_type: str = "AMBULANCE"
    ) -> Dict[str, Any]:
        """
        Calculates safe emergency route from start to destination.
        Returns route array, waypoints with 3D coordinates, distance, estimated time, and provenance.
        """
        blocked_gates = blocked_gates or []
        blocked_segments = blocked_segments or []
        fire_hazard_nodes = fire_hazard_nodes or ["AUDITORIUM_FIRE_CORE"]

        if start_node_id not in self.nodes:
            raise ValueError(f"Unknown start node: {start_node_id}")
        if dest_node_id not in self.nodes:
            raise ValueError(f"Unknown destination node: {dest_node_id}")

        is_vehicle = (resource_type == "AMBULANCE")

        # 1. First attempt: Safe route avoiding fire hazards and blocked gates
        adj = self._build_adjacency(
            world_version=world_version,
            blocked_gates=blocked_gates,
            blocked_segments=blocked_segments,
            fire_active=fire_active,
            fire_hazard_nodes=fire_hazard_nodes,
            is_emergency_vehicle=is_vehicle
        )

        dist: Dict[str, float] = {nid: float("inf") for nid in self.nodes}
        actual_meters: Dict[str, float] = {nid: 0.0 for nid in self.nodes}
        parent: Dict[str, Optional[str]] = {nid: None for nid in self.nodes}

        dist[start_node_id] = 0.0
        pq: List[Tuple[float, str]] = [(0.0, start_node_id)]

        while pq:
            curr_cost, curr_u = heapq.heappop(pq)
            if curr_cost > dist[curr_u]:
                continue
            if curr_u == dest_node_id:
                break

            for v, weight, length_m, _ in adj.get(curr_u, []):
                new_cost = curr_cost + weight
                if new_cost < dist[v]:
                    dist[v] = new_cost
                    actual_meters[v] = actual_meters[curr_u] + length_m
                    parent[v] = curr_u
                    heapq.heappush(pq, (new_cost, v))

        # Check if safe route was found
        if dist[dest_node_id] < float("inf"):
            # Reconstruct path
            path = []
            curr = dest_node_id
            while curr is not None:
                path.append(curr)
                curr = parent[curr]
            path.reverse()

            total_dist_m = round(actual_meters[dest_node_id] * 5.0, 1) # Scale to venue meters (~184m)
            # Speed: Ambulance ~8.3 m/s (~30 km/h) on emergency route; responder on foot ~2.5 m/s
            speed_mps = 8.33 if is_vehicle else 2.5
            eta_sec = max(int(total_dist_m / speed_mps), 15)

            waypoints = []
            for idx, nid in enumerate(path):
                node = self.nodes[nid]
                waypoints.append({
                    "id": f"WP-{idx+1:03d}",
                    "node_id": nid,
                    "road_id": node.get("road_id", nid),
                    "label": node.get("name", nid),
                    "x": node["x"],
                    "y": node["y"],
                    "z": node["z"],
                    "is_emergency_corridor": node.get("is_emergency_corridor", False)
                })

            rejection_reason = None
            if fire_active and "AUDITORIUM_FIRE_CORE" in fire_hazard_nodes:
                rejection_reason = (
                    "Direct central shortest path blocked by fire hazard. "
                    "Emergency route redirected through protected corridor."
                )

            return {
                "route": path,
                "waypoints": waypoints,
                "distance_meters": total_dist_m,
                "estimated_time_seconds": eta_sec,
                "safe": True,
                "hazards": [],
                "blocked_segments": blocked_segments,
                "rejection_reason": rejection_reason,
                "world_version": world_version
            }

        # If no safe path found:
        return {
            "route": [],
            "waypoints": [],
            "distance_meters": 0.0,
            "estimated_time_seconds": 0,
            "safe": False,
            "hazards": ["FIRE_HAZARD_BLOCKED", "ALL_PATHS_OBSTRUCTED"],
            "blocked_segments": blocked_segments,
            "rejection_reason": "No navigable safe path available to incident destination under current obstructions.",
            "world_version": world_version
        }


class EmergencyDispatcherService:
    """
    Core Dispatcher managing emergency resource lifecycle, automatic activation on fire,
    nearest safe resource selection, real-time rerouting, and notifications.
    """

    def __init__(self, db_session=None):
        self.db = db_session
        self.route_engine = EmergencyRouteEngine()
        self._resources: Dict[str, Dict[str, Any]] = {
            r["id"]: dict(r) for r in DEFAULT_EMERGENCY_RESOURCES
        }
        self._active_incident: Optional[Dict[str, Any]] = None
        self._routes: Dict[str, Dict[str, Any]] = {}
        self._notifications: List[Dict[str, Any]] = []

    def get_all_resources(self) -> List[Dict[str, Any]]:
        return list(self._resources.values())

    def get_resource(self, resource_id: str) -> Optional[Dict[str, Any]]:
        return self._resources.get(resource_id)

    def get_active_incident(self) -> Optional[Dict[str, Any]]:
        return self._active_incident

    def get_notifications(self, incident_id: Optional[str] = None) -> List[Dict[str, Any]]:
        if incident_id:
            return [n for n in self._notifications if n.get("incident_id") == incident_id]
        return list(self._notifications)

    def get_routes(self, incident_id: Optional[str] = None) -> List[Dict[str, Any]]:
        if incident_id:
            return [r for r in self._routes.values() if r.get("incident_id") == incident_id]
        return list(self._routes.values())

    def find_nearest_safe_resource(
        self,
        resource_type: str,
        dest_node_id: str = "AUDITORIUM_ENTRY_NORTH",
        world_version: int = 1,
        blocked_gates: Optional[List[str]] = None,
        blocked_segments: Optional[List[str]] = None,
        fire_active: bool = True
    ) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Finds the nearest safe available resource by calculating actual path distances.
        Returns: (best_resource, best_route, evaluated_candidates_with_distances)
        """
        candidates = [
            r for r in self._resources.values()
            if r["type"] == resource_type and r["availability"] == "AVAILABLE"
        ]

        if not candidates:
            return None, None, []

        evaluated: List[Dict[str, Any]] = []
        best_resource = None
        best_route = None
        min_distance = float("inf")

        for res in candidates:
            start_node = res["location"]
            # Fallback if node not directly matching
            if start_node not in self.route_engine.nodes:
                continue

            route_info = self.route_engine.calculate_route(
                start_node_id=start_node,
                dest_node_id=dest_node_id,
                world_version=world_version,
                blocked_gates=blocked_gates,
                blocked_segments=blocked_segments,
                fire_active=fire_active,
                resource_type=resource_type
            )

            cand_entry = {
                "resource_id": res["id"],
                "name": res["name"],
                "distance_meters": route_info["distance_meters"],
                "estimated_time_seconds": route_info["estimated_time_seconds"],
                "safe": route_info["safe"],
                "selected": False
            }
            evaluated.append(cand_entry)

            if route_info["safe"] and route_info["distance_meters"] < min_distance:
                min_distance = route_info["distance_meters"]
                best_resource = res
                best_route = route_info

        # Mark selected in evaluated list
        if best_resource:
            for item in evaluated:
                if item["resource_id"] == best_resource["id"]:
                    item["selected"] = True

        return best_resource, best_route, evaluated

    def dispatch_for_fire_incident(
        self,
        incident_id: str = "EV-001",
        location_label: str = "Building B / Floor 2",
        world_version: int = 1,
        blocked_gates: Optional[List[str]] = None,
        blocked_segments: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Executes automatic emergency dispatch for an active fire incident.
        Selects nearest safe ambulance & fire extinguisher, calculates routes,
        updates resource states, and generates notifications.
        """
        blocked_gates = blocked_gates or []
        blocked_segments = blocked_segments or []

        incident = {
            "id": incident_id,
            "type": "FIRE",
            "location": location_label,
            "building": "Building B",
            "floor": 2,
            "status": "ACTIVE",
            "hazard_radius_meters": 14.0,
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }
        self._active_incident = incident

        dest_node = "AUDITORIUM_ENTRY_NORTH"

        # 1. Select nearest safe Ambulance
        amb, amb_route, amb_candidates = self.find_nearest_safe_resource(
            resource_type="AMBULANCE",
            dest_node_id=dest_node,
            world_version=world_version,
            blocked_gates=blocked_gates,
            blocked_segments=blocked_segments,
            fire_active=True
        )

        # 2. Select nearest safe Fire Extinguisher
        fe, fe_route, fe_candidates = self.find_nearest_safe_resource(
            resource_type="FIRE_EXTINGUISHER",
            dest_node_id=dest_node,
            world_version=world_version,
            blocked_gates=blocked_gates,
            blocked_segments=blocked_segments,
            fire_active=True
        )

        dispatched_resources = []

        # Update Ambulance
        if amb and amb_route:
            amb["status"] = "DISPATCHED"
            amb["availability"] = "DISPATCHED"
            amb["assigned_incident"] = incident_id
            amb["destination"] = "Building B North Emergency Entry"
            amb["eta"] = amb_route["estimated_time_seconds"]
            amb["current_route"] = amb_route["route"]

            amb_route_record = {
                "route_id": f"route-amb-{incident_id}",
                "resource_id": amb["id"],
                "incident_id": incident_id,
                "world_version": world_version,
                "route": amb_route["route"],
                "waypoints": amb_route["waypoints"],
                "distance_meters": amb_route["distance_meters"],
                "estimated_time_seconds": amb_route["estimated_time_seconds"],
                "safe": amb_route["safe"],
                "route_type": "Emergency Safe Route",
                "rejection_reason": amb_route.get("rejection_reason"),
                "provenance": {
                    "mode": "PHYSICS_FALLBACK (CALIBRATED_GRAPH)",
                    "classification": "SYNTHETIC_MODELED_DATA",
                    "live_simulation": False
                }
            }
            self._routes[amb["id"]] = amb_route_record
            dispatched_resources.append(amb)

            # Notification
            amb_notif = {
                "notification_id": str(uuid.uuid4()),
                "incident_id": incident_id,
                "resource_id": amb["id"],
                "title": "🚨 EMERGENCY DISPATCH",
                "message": (
                    f"Incident: FIRE | Location: {location_label}\n"
                    f"Ambulance: {amb['name']} | Status: DISPATCHED\n"
                    f"Route: {' → '.join(amb_route['route'])}\n"
                    f"ETA: {amb_route['estimated_time_seconds']} seconds | Priority: CRITICAL"
                ),
                "priority": "CRITICAL",
                "eta_seconds": amb_route["estimated_time_seconds"],
                "route_summary": f"Emergency Corridor → Gate 1 → Building B (ETA: {amb_route['estimated_time_seconds']}s)",
                "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }
            self._notifications.append(amb_notif)

        # Update Fire Extinguisher
        if fe and fe_route:
            fe["status"] = "ASSIGNED"
            fe["availability"] = "ASSIGNED"
            fe["assigned_incident"] = incident_id
            fe["destination"] = "Building B Floor 2 Incident"
            fe["eta"] = fe_route["estimated_time_seconds"]
            fe["current_route"] = fe_route["route"]

            fe_route_record = {
                "route_id": f"route-fe-{incident_id}",
                "resource_id": fe["id"],
                "incident_id": incident_id,
                "world_version": world_version,
                "route": fe_route["route"],
                "waypoints": fe_route["waypoints"],
                "distance_meters": fe_route["distance_meters"],
                "estimated_time_seconds": fe_route["estimated_time_seconds"],
                "safe": fe_route["safe"],
                "route_type": "Safe Response Route",
                "rejection_reason": fe_route.get("rejection_reason"),
                "candidates_evaluation": fe_candidates,
                "provenance": {
                    "mode": "PHYSICS_FALLBACK (CALIBRATED_GRAPH)",
                    "classification": "SYNTHETIC_MODELED_DATA",
                    "live_simulation": False
                }
            }
            self._routes[fe["id"]] = fe_route_record
            dispatched_resources.append(fe)

            fe_notif = {
                "notification_id": str(uuid.uuid4()),
                "incident_id": incident_id,
                "resource_id": fe["id"],
                "title": "🧯 FIRE RESPONSE",
                "message": (
                    f"Extinguisher: {fe['id']} | Location: {fe['building']} Floor {fe['floor']}\n"
                    f"Incident: {incident_id} | Distance: {fe_route['distance_meters']}m\n"
                    f"Recommended Route: {' → '.join(fe_route['route'])}\n"
                    f"ETA: {fe_route['estimated_time_seconds']}s | Priority: CRITICAL"
                ),
                "priority": "CRITICAL",
                "eta_seconds": fe_route["estimated_time_seconds"],
                "route_summary": f"{fe['location']} → Building B (Distance: {fe_route['distance_meters']}m)",
                "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }
            self._notifications.append(fe_notif)

        return {
            "status": "DISPATCH_ACTIVE",
            "incident": incident,
            "ambulance": amb,
            "fire_extinguisher": fe,
            "extinguisher_candidates": fe_candidates,
            "routes": list(self._routes.values()),
            "notifications": self._notifications[-2:]
        }

    def recalculate_on_obstruction(
        self,
        resource_id: str,
        incident_id: str,
        new_blocked_segment: str,
        world_version: int = 1
    ) -> Dict[str, Any]:
        """
        Section 19: Route Failure Handling.
        When a route becomes blocked, invalidates current route, recalculates next safe route,
        updates resource, and issues a route update notification.
        """
        resource = self._resources.get(resource_id)
        if not resource:
            raise ValueError(f"Resource {resource_id} not found.")

        old_eta = resource.get("eta", 72)
        start_node = resource["location"]
        dest_node = "AUDITORIUM_ENTRY_NORTH"

        # Calculate new route with new blocked segment
        new_route_info = self.route_engine.calculate_route(
            start_node_id=start_node,
            dest_node_id=dest_node,
            world_version=world_version,
            blocked_segments=[new_blocked_segment],
            fire_active=True,
            resource_type=resource["type"]
        )

        resource["current_route"] = new_route_info["route"]
        resource["eta"] = new_route_info["estimated_time_seconds"]

        route_record = {
            "route_id": f"route-{resource_id}-reroute",
            "resource_id": resource_id,
            "incident_id": incident_id,
            "world_version": world_version,
            "route": new_route_info["route"],
            "waypoints": new_route_info["waypoints"],
            "distance_meters": new_route_info["distance_meters"],
            "estimated_time_seconds": new_route_info["estimated_time_seconds"],
            "safe": new_route_info["safe"],
            "route_type": "Emergency Safe Route (Rerouted)",
            "rejection_reason": f"Obstruction detected on {new_blocked_segment}. Route recalculated.",
            "provenance": {
                "mode": "PHYSICS_FALLBACK (CALIBRATED_GRAPH)",
                "classification": "SYNTHETIC_MODELED_DATA"
            }
        }
        self._routes[resource_id] = route_record

        # Generate Route Update notification
        update_notif = {
            "notification_id": str(uuid.uuid4()),
            "incident_id": incident_id,
            "resource_id": resource_id,
            "title": "🚨 ROUTE UPDATE",
            "message": (
                f"{new_blocked_segment} has become unavailable.\n"
                f"{resource['name']} redirected.\n"
                f"Previous ETA: {old_eta}s → New ETA: {new_route_info['estimated_time_seconds']}s\n"
                f"Reason: Emergency corridor obstruction"
            ),
            "priority": "HIGH",
            "eta_seconds": new_route_info["estimated_time_seconds"],
            "route_summary": f"Rerouted via {' → '.join(new_route_info['route'][:3])} (ETA: {new_route_info['estimated_time_seconds']}s)",
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }
        self._notifications.append(update_notif)

        return {
            "status": "REROUTED",
            "resource": resource,
            "new_route": route_record,
            "notification": update_notif
        }

    def reset(self):
        """Resets all resources to initial standby/available state."""
        self._resources = {
            r["id"]: dict(r) for r in DEFAULT_EMERGENCY_RESOURCES
        }
        self._active_incident = None
        self._routes.clear()
        self._notifications.clear()
        return {"status": "RESET_COMPLETED"}


# Singleton dispatcher instance
EMERGENCY_DISPATCHER = EmergencyDispatcherService()
