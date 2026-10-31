import copy

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from apps.api.main import app
from db.database import Base, EventModel, WorldVersionModel, get_db
from db.seeds.venue_data import CAMPUS_VENUE_SNAPSHOT
from services.evacuation.assessment import OccupancyAssessmentRequest, assess_occupancy


def request(**changes):
    return OccupancyAssessmentRequest(event_id="event-test", world_version_id="world-test", incident_id="fire-test", **changes)


def test_inventory_conserves_counts_and_does_not_authorize_movement():
    result = assess_occupancy(request(), CAMPUS_VENUE_SNAPSHOT)
    assert result.affected_occupants == 1800
    assert result.elsewhere_occupants == 1200
    assert result.step_free_required == 144
    assert sum(z.occupant_count for z in result.zones) == 1800
    assert sum(z.step_free_required for z in result.zones) == 144
    assert result.movement_authorized is False
    assert all(not e["route_verified"] for e in result.exit_inventory)


def test_legacy_persisted_tiers_preserve_original_inventory():
    world = copy.deepcopy(CAMPUS_VENUE_SNAPSHOT)
    world["zones"] = [{"zone_id": f"zone_{letter}", "name": f"Tier {letter}", "modeled_attendees": count}
                      for letter, count in zip("abc", [1000, 1200, 800])]
    result = assess_occupancy(request(), world)
    assert result.affected_occupants == 3000
    assert result.elsewhere_occupants == 0
    assert [z.occupant_count for z in result.zones] == [1000, 1200, 800]
    assert sum(z.step_free_required for z in result.zones) == 240
    assert any("Legacy" in w for w in result.warnings)


@pytest.mark.parametrize("count", [0, 1, 2, 7, 1801])
def test_small_and_uneven_populations(count):
    world = copy.deepcopy(CAMPUS_VENUE_SNAPSHOT)
    world["zones"][0]["modeled_attendees"] = count
    result = assess_occupancy(request(), world)
    assert sum(z.occupant_count for z in result.zones) == count
    assert all(0 <= z.step_free_required <= z.occupant_count for z in result.zones)


def test_blocked_accessible_exit_and_all_exits_are_unresolved():
    result = assess_occupancy(request(blocked_gate_ids=["gate_4"]), CAMPUS_VENUE_SNAPSHOT)
    assert any("No open step-free" in w for w in result.warnings)
    result = assess_occupancy(request(blocked_gate_ids=[f"gate_{i}" for i in range(1, 5)]), CAMPUS_VENUE_SNAPSHOT)
    assert any("All campus gates" in w for w in result.warnings)
    assert not result.movement_authorized


def test_fingerprint_changes_with_world_or_obstruction_and_inputs_are_unchanged():
    world = copy.deepcopy(CAMPUS_VENUE_SNAPSHOT)
    baseline = assess_occupancy(request(), world)
    assert baseline == assess_occupancy(request(), world)
    assert baseline.assessment_id != assess_occupancy(request(blocked_gate_ids=["gate_2"]), world).assessment_id
    world["zones"][0]["modeled_attendees"] += 1
    assert baseline.assessment_id != assess_occupancy(request(), world).assessment_id
    assert CAMPUS_VENUE_SNAPSHOT["zones"][0]["modeled_attendees"] == 1800


@pytest.mark.parametrize("changes", [{"building_zone_id": "missing"}, {"blocked_gate_ids": ["missing"]}])
def test_reject_unknown_semantic_ids(changes):
    with pytest.raises(ValueError):
        assess_occupancy(request(**changes), CAMPUS_VENUE_SNAPSHOT)


def test_api_uses_requested_event_world_and_rejects_mismatches():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as db:
        db.add(EventModel(event_id="event-test", name="Test", venue_name="Test", attendee_count=3000, staff_budget=20))
        db.add(WorldVersionModel(world_version_id="world-test", event_id="event-test", version_number=1,
                                 world_config=CAMPUS_VENUE_SNAPSHOT, change_reason="Test fixture", source_metadata={}))
        db.commit()
    def session():
        with factory() as db:
            yield db
    previous = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = session
    try:
        client = TestClient(app)
        payload = request().model_dump()
        assert client.post("/api/evacuation/assess", json=payload).json()["affected_occupants"] == 1800
        payload["event_id"] = "another-event"
        assert client.post("/api/evacuation/assess", json=payload).status_code == 404
        payload = request(building_zone_id="missing").model_dump()
        assert client.post("/api/evacuation/assess", json=payload).status_code == 422
    finally:
        if previous is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous
        engine.dispose()
