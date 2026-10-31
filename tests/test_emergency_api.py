"""
Test suite for Phase 1 Emergency Resource REST API endpoints.
Verifies all endpoints defined in Section 21:
- GET /api/emergency/resources
- GET /api/emergency/resources/{resource_id}
- POST /api/emergency/dispatch
- GET /api/emergency/incidents/{incident_id}/routes
- GET /api/emergency/incidents/{incident_id}/notifications
- POST /api/emergency/routes/recalculate
- POST /api/emergency/reset
- GET /api/emergency/provenance
"""

import pytest
from fastapi.testclient import TestClient
from apps.api.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_state_before_tests():
    """Ensure emergency resources start in clean standby state before tests."""
    client.post("/api/emergency/reset")


def test_get_emergency_resources_initial_standby():
    """Confirms ambulance is at Standby and extinguishers are available initially."""
    res = client.get("/api/emergency/resources")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 4

    amb = next((r for r in data if r["type"] == "AMBULANCE"), None)
    assert amb is not None
    assert amb["id"] == "AMB-001"
    assert amb["status"] in ["STANDBY", "AVAILABLE"]

    fe2 = next((r for r in data if r["id"] == "FE-002"), None)
    assert fe2 is not None
    assert fe2["type"] == "FIRE_EXTINGUISHER"


def test_get_single_resource():
    res = client.get("/api/emergency/resources/AMB-001")
    assert res.status_code == 200
    assert res.json()["id"] == "AMB-001"

    res_404 = client.get("/api/emergency/resources/UNKNOWN_XYZ")
    assert res_404.status_code == 404


def test_emergency_dispatch_flow():
    """Tests fire incident automatic dispatch calculation & persistence."""
    payload = {
        "incident_id": "EV-001",
        "location": "Building B / Floor 2",
        "world_version": 1,
        "blocked_gates": [],
        "blocked_segments": []
    }
    res = client.post("/api/emergency/dispatch", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "DISPATCH_ACTIVE"
    assert data["incident"]["id"] == "EV-001"

    # Nearest ambulance assigned
    amb = data["ambulance"]
    assert amb["id"] == "AMB-001"
    assert amb["status"] == "DISPATCHED"

    # Nearest extinguisher assigned (FE-002: 85m)
    fe = data["fire_extinguisher"]
    assert fe["id"] == "FE-002"
    assert fe["status"] == "ASSIGNED"

    # Verify routes endpoint
    routes_res = client.get("/api/emergency/incidents/EV-001/routes")
    assert routes_res.status_code == 200
    routes = routes_res.json()
    assert len(routes) >= 2
    amb_route = next((r for r in routes if r["resource_id"] == "AMB-001"), None)
    fe_route = next((r for r in routes if r["resource_id"] == "FE-002"), None)
    assert amb_route["safe"] is True
    assert fe_route["safe"] is True

    # Verify notifications endpoint
    notif_res = client.get("/api/emergency/incidents/EV-001/notifications")
    assert notif_res.status_code == 200
    notifs = notif_res.json()
    assert len(notifs) >= 2


def test_emergency_reroute_endpoint():
    """Tests Section 19: dynamic recalculation when emergency corridor is obstructed."""
    payload = {
        "resource_id": "AMB-001",
        "incident_id": "EV-001",
        "blocked_segment": "ROAD_17_MID__ROAD_17_SOUTH",
        "world_version": 1
    }
    res = client.post("/api/emergency/routes/recalculate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "REROUTED"
    assert data["new_route"]["safe"] is True
    assert "ROUTE UPDATE" in data["notification"]["title"]


def test_emergency_provenance():
    """Tests Section 24: transparent provenance labeling."""
    res = client.get("/api/emergency/provenance")
    assert res.status_code == 200
    data = res.json()
    assert "engine" in data
    assert "data_classification" in data
    assert data["data_classification"] == "SYNTHETIC_MODELED_DATA"


def test_emergency_reset():
    """Tests reset endpoint returns resources to standby."""
    res = client.post("/api/emergency/reset")
    assert res.status_code == 200
    assert res.json()["status"] == "RESET_COMPLETED"

    # Verify ambulance is in standby
    amb_res = client.get("/api/emergency/resources/AMB-001")
    assert amb_res.json()["status"] == "STANDBY"
