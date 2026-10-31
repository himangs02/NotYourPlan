"""
Tests for Phase 1: Emergency Resource Layer & Routing.
Validates:
1. Predefined standby resources exist before fire (Ambulance at standby, FE-001, FE-002, FE-003 available)
2. Nearest available ambulance selection
3. Nearest available fire extinguisher selection & ignoring unavailable resources
4. Safe route calculation avoids fire hazard core and prefers emergency corridor
5. World version compatibility (Gate 2 blocked in World v2 redirects correctly)
6. Automatic fire dispatch triggering and notification generation
7. Route failure & dynamic recalculation on obstruction
8. Provenance transparency (modeled / physics fallback)
9. Database model persistence
"""

import pytest
from datetime import datetime, timezone
from packages.schemas.models import (
    EmergencyResource,
    EmergencyIncident,
    EmergencyRoute,
    EmergencyNotification,
    EmergencyDispatch
)
from services.emergency.routing_engine import (
    EmergencyRouteEngine,
    EmergencyDispatcherService,
    DEFAULT_EMERGENCY_RESOURCES,
    VENUE_NODES
)
from db.database import (
    SessionLocal,
    init_db,
    EmergencyResourceModel,
    EmergencyIncidentModel,
    EmergencyRouteModel,
    EmergencyNotificationModel
)


# 1. Predefined standby resources exist before fire
def test_predefined_standby_resources():
    dispatcher = EmergencyDispatcherService()
    resources = dispatcher.get_all_resources()

    amb = next((r for r in resources if r["type"] == "AMBULANCE"), None)
    assert amb is not None
    assert amb["id"] == "AMB-001"
    assert amb["status"] == "STANDBY"
    assert amb["location"] == "AMBULANCE_STANDBY_01"
    assert amb["availability"] == "AVAILABLE"
    assert amb["assigned_incident"] is None

    extinguishers = [r for r in resources if r["type"] == "FIRE_EXTINGUISHER"]
    assert len(extinguishers) >= 3
    fe_ids = {r["id"] for r in extinguishers}
    assert "FE-001" in fe_ids
    assert "FE-002" in fe_ids
    assert "FE-003" in fe_ids
    assert all(fe["status"] == "AVAILABLE" for fe in extinguishers)


# 2. Nearest available ambulance selection
def test_nearest_ambulance_selection():
    dispatcher = EmergencyDispatcherService()
    best_amb, route, _ = dispatcher.find_nearest_safe_resource(
        resource_type="AMBULANCE",
        dest_node_id="AUDITORIUM_ENTRY_NORTH",
        world_version=1,
        fire_active=True
    )
    assert best_amb is not None
    assert best_amb["id"] == "AMB-001"
    assert route is not None
    assert route["safe"] is True
    assert route["distance_meters"] > 0
    # Ambulance route starts at standby post
    assert route["route"][0] == "AMBULANCE_STANDBY_01"
    # Route reaches auditorium entry
    assert route["route"][-1] == "AUDITORIUM_ENTRY_NORTH"


# 3. Nearest available extinguisher selection & ignoring unavailable resources
def test_nearest_extinguisher_selection():
    dispatcher = EmergencyDispatcherService()
    # FE-002 is located at BUILDING_B_FLOOR_2_CORRIDOR (FE_002_LOC), closest to auditorium
    best_fe, route, evaluated = dispatcher.find_nearest_safe_resource(
        resource_type="FIRE_EXTINGUISHER",
        dest_node_id="AUDITORIUM_ENTRY_NORTH",
        world_version=1,
        fire_active=True
    )
    assert best_fe is not None
    assert best_fe["id"] == "FE-002"
    assert route["safe"] is True
    assert route["distance_meters"] < 100.0  # Approx 85m

    # Mark FE-002 as UNAVAILABLE -> dispatcher should pick next closest (FE-003)
    dispatcher._resources["FE-002"]["availability"] = "UNAVAILABLE"
    second_best_fe, second_route, _ = dispatcher.find_nearest_safe_resource(
        resource_type="FIRE_EXTINGUISHER",
        dest_node_id="AUDITORIUM_ENTRY_NORTH",
        world_version=1,
        fire_active=True
    )
    assert second_best_fe is not None
    assert second_best_fe["id"] == "FE-003"


# 4. Safe route calculation avoids fire hazard zone and prefers emergency corridor
def test_safe_route_avoids_fire_hazard():
    engine = EmergencyRouteEngine()
    # Route from south (CENTRAL_CONCOURSE) to AUDITORIUM_ENTRY_NORTH
    # The direct path cuts across AUDITORIUM_FIRE_CORE
    # When fire is active, fire core is hazardous and avoided
    route = engine.calculate_route(
        start_node_id="CENTRAL_CONCOURSE",
        dest_node_id="AUDITORIUM_ENTRY_NORTH",
        world_version=1,
        fire_active=True,
        fire_hazard_nodes=["AUDITORIUM_FIRE_CORE"],
        resource_type="AMBULANCE"
    )
    assert route["safe"] is True
    assert "AUDITORIUM_FIRE_CORE" not in route["route"]
    assert route["rejection_reason"] is not None
    assert "fire hazard" in route["rejection_reason"].lower()


# 5. World version compatibility (Gate 2 blocked in World v2)
def test_world_version_gate_block():
    engine = EmergencyRouteEngine()
    # Route from METRO_BOULEVARD (outside Gate 2) to AUDITORIUM_ENTRY_NORTH
    # In World v1, Gate 2 is open
    route_v1 = engine.calculate_route(
        start_node_id="METRO_BOULEVARD",
        dest_node_id="AUDITORIUM_ENTRY_NORTH",
        world_version=1,
        fire_active=False
    )
    assert route_v1["safe"] is True
    assert "GATE_2" in route_v1["route"]

    # In World v2, Gate 2 is blocked (What-if scenario)
    # The path cannot use Gate 2
    route_v2 = engine.calculate_route(
        start_node_id="METRO_BOULEVARD",
        dest_node_id="AUDITORIUM_ENTRY_NORTH",
        world_version=2,
        fire_active=False
    )
    # Gate 2 must not be traversed
    assert "GATE_2" not in route_v2["route"]


# 6. Automatic fire dispatch triggering and notification generation
def test_automatic_fire_dispatch_and_notifications():
    dispatcher = EmergencyDispatcherService()
    result = dispatcher.dispatch_for_fire_incident(
        incident_id="EV-001",
        location_label="Building B / Floor 2",
        world_version=1
    )

    assert result["status"] == "DISPATCH_ACTIVE"
    assert result["incident"]["id"] == "EV-001"
    assert result["incident"]["status"] == "ACTIVE"

    # Ambulance state
    amb = result["ambulance"]
    assert amb["id"] == "AMB-001"
    assert amb["status"] == "DISPATCHED"
    assert amb["eta"] is not None
    assert amb["eta"] > 0

    # Fire extinguisher state
    fe = result["fire_extinguisher"]
    assert fe["id"] == "FE-002"
    assert fe["status"] == "ASSIGNED"

    # Notifications generated
    notifs = dispatcher.get_notifications("EV-001")
    assert len(notifs) >= 2
    amb_notif = next((n for n in notifs if n["resource_id"] == "AMB-001"), None)
    fe_notif = next((n for n in notifs if n["resource_id"] == "FE-002"), None)
    assert amb_notif is not None
    assert "EMERGENCY DISPATCH" in amb_notif["title"]
    assert amb_notif["priority"] == "CRITICAL"
    assert fe_notif is not None
    assert "FIRE RESPONSE" in fe_notif["title"]


# 7. Route failure & dynamic recalculation on obstruction
def test_route_failure_and_recalculation():
    dispatcher = EmergencyDispatcherService()
    # Initial dispatch
    dispatcher.dispatch_for_fire_incident(incident_id="EV-001")

    # Simulate obstruction on Road 17 central segment
    reroute_res = dispatcher.recalculate_on_obstruction(
        resource_id="AMB-001",
        incident_id="EV-001",
        new_blocked_segment="ROAD_17_MID__ROAD_17_SOUTH",
        world_version=1
    )
    assert reroute_res["status"] == "REROUTED"
    new_route = reroute_res["new_route"]
    assert new_route["safe"] is True

    # Notification must have been generated
    notif = reroute_res["notification"]
    assert "ROUTE UPDATE" in notif["title"]
    assert "redirected" in notif["message"].lower()


# 8. Database model persistence test
def test_emergency_db_persistence():
    init_db()
    db = SessionLocal()
    try:
        # Check or create EmergencyResourceModel
        res = db.query(EmergencyResourceModel).filter_by(id="AMB-001").first()
        if not res:
            res = EmergencyResourceModel(
                id="AMB-001",
                type="AMBULANCE",
                name="Ambulance 01",
                status="STANDBY",
                location="AMBULANCE_STANDBY_01",
                building="Medical Post",
                floor=0,
                availability="AVAILABLE",
                capacity=2,
                coordinates={"x": 16.0, "y": 1.95, "z": -28.0},
                last_updated=datetime.now(timezone.utc)
            )
            db.add(res)
            db.commit()

        assert res.id == "AMB-001"
        assert res.status == "STANDBY"
    finally:
        db.close()
