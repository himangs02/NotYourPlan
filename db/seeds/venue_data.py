"""
Campus and Venue Seed Data for EventFlow.
Models the College Auditorium, Food Court Concourse, and Parking Plaza.
"""
import uuid

CAMPUS_VENUE_SNAPSHOT = {
    "venue_id": "venue_campus_auditorium_01",
    "venue_name": "Campus Convocation Complex & Grounds",
    "location": {
        "city": "Delhi",
        "coordinates": {"lat": 28.7495, "lon": 77.1180},
        "source": "OpenStreetMap node/way extract 2024 (cached snapshot)"
    },
    "zones": [
        {
            "zone_id": "zone_auditorium",
            "name": "Main Auditorium Hall",
            "capacity": 1800,
            "modeled_attendees": 1800,
            "default_exit": "gate_2",
            "step_free": True,
            "position": {"x": 0, "y": 2, "z": 0},
            "dimensions": {"width": 26, "height": 8, "depth": 18}
        },
        {
            "zone_id": "zone_food_court",
            "name": "Food Court Concourse",
            "capacity": 700,
            "modeled_attendees": 700,
            "default_exit": "gate_3",
            "step_free": True,
            "position": {"x": 0, "y": 1.5, "z": 16},
            "dimensions": {"width": 22, "height": 5, "depth": 12}
        },
        {
            "zone_id": "zone_parking",
            "name": "North Parking Plaza & Staging",
            "capacity": 500,
            "modeled_attendees": 500,
            "default_exit": "gate_1",
            "step_free": False,
            "has_staircase": True,
            "position": {"x": 20, "y": 0.2, "z": -4},
            "dimensions": {"width": 14, "height": 0.5, "depth": 22}
        }
    ],
    "gates": [
        {
            "gate_id": "gate_1",
            "name": "Gate 1 (North Concourse / Road 17)",
            "width_meters": 6.0,
            "flow_capacity_ped_per_sec": 8.0,
            "connects_to": "road_17",
            "status": "OPEN",
            "is_blocked": False,
            "position": {"x": 0, "y": 0, "z": -12},
            "rotation": {"y": 0}
        },
        {
            "gate_id": "gate_2",
            "name": "Gate 2 (Main South Plaza Gate)",
            "width_meters": 12.0,
            "flow_capacity_ped_per_sec": 18.0,
            "connects_to": "metro_boulevard",
            "status": "OPEN",
            "is_blocked": False,
            "position": {"x": 0, "y": 0, "z": 24},
            "rotation": {"y": 0}
        },
        {
            "gate_id": "gate_3",
            "name": "Gate 3 (East Arcade)",
            "width_meters": 5.0,
            "flow_capacity_ped_per_sec": 6.5,
            "connects_to": "concourse_main",
            "status": "OPEN",
            "is_blocked": False,
            "position": {"x": 15, "y": 0, "z": 6},
            "rotation": {"y": 1.57}
        },
        {
            "gate_id": "gate_4",
            "name": "Gate 4 (West Wheelchair Accessible Ramp)",
            "width_meters": 4.5,
            "flow_capacity_ped_per_sec": 5.0,
            "connects_to": "ramp_stepfree",
            "status": "OPEN",
            "is_step_free": True,
            "is_blocked": False,
            "position": {"x": -15, "y": 0, "z": 6},
            "rotation": {"y": -1.57}
        }
    ],
    "roads_and_corridors": [
        {
            "route_id": "road_17",
            "name": "Road 17 (Emergency Medical Route)",
            "length_meters": 240,
            "width_meters": 7.0,
            "is_emergency_corridor": True,
            "baseline_transit_time_sec": 30.0,
            "max_tolerated_pedestrian_density": 0.8,
            "position": {"x": 18, "y": 0.05, "z": -18},
            "dimensions": {"width": 7, "length": 36}
        },
        {
            "route_id": "concourse_main",
            "name": "Central Concourse Walkway",
            "length_meters": 180,
            "width_meters": 10.0,
            "is_emergency_corridor": False,
            "position": {"x": 0, "y": 0.05, "z": 8},
            "dimensions": {"width": 10, "length": 24}
        },
        {
            "route_id": "ramp_stepfree",
            "name": "West Step-Free Accessibility Ramp",
            "length_meters": 110,
            "width_meters": 4.0,
            "is_step_free": True,
            "gradient_percent": 4.5,
            "position": {"x": -22, "y": 0.3, "z": 6},
            "dimensions": {"width": 4.5, "length": 14}
        },
        {
            "route_id": "metro_boulevard",
            "name": "Metro Boulevard Exit Avenue",
            "length_meters": 320,
            "width_meters": 15.0,
            "is_emergency_corridor": False,
            "position": {"x": 0, "y": 0.05, "z": 36},
            "dimensions": {"width": 16, "length": 20}
        }
    ],
    "assembly_areas": [
        {
            "assembly_id": "assembly_central_plaza",
            "name": "Central Campus Evacuation & Assembly Area",
            "capacity": 3500,
            "safe_distance_meters": 150,
            "accessible_step_free": True,
            "connects_to": ["metro_boulevard", "ramp_stepfree"],
            "position": {"x": 0, "y": 0.1, "z": 50},
            "dimensions": {"width": 32, "length": 24}
        }
    ],
    "attendee_groups": {
        "general": {
            "count": 2700,
            "ratio": 0.90,
            "mean_walking_speed_mps": 1.34,
            "speed_std_mps": 0.26
        },
        "mobility_impaired": {
            "count": 240,
            "ratio": 0.08,
            "mean_walking_speed_mps": 0.85,
            "speed_std_mps": 0.15,
            "requires_step_free": True
        },
        "responders": {
            "count": 60,
            "ratio": 0.02,
            "mean_walking_speed_mps": 2.20,
            "vehicle_speed_mps": 8.33
        }
    },
    "explicit_assumptions": [
        "Modeled population: 3,000 attendees exiting synchronously upon show conclusion",
        "Walking speed follows Gaussian distribution (General: 1.34 m/s, Mobility-impaired: 0.85 m/s)",
        "Gate throughput modeled with Fruin Level-of-Service pedestrian bottleneck curves",
        "Ambulance emergency route (Road 17) requires zero-congestion clearance under 30s vehicle transit time",
        "Accessibility compliance mandates unobstructed continuous step-free grade <= 5% for all 240 mobility-impaired attendees",
        "Staff deployment: 1 marshal per active gate, 2 marshals per staggered zone entrance, 4 marshals for reserved corridors"
    ]
}

# The Core Candidate Plans
DEFAULT_CANDIDATE_PLANS = [
    {
        "plan_id": "plan_baseline",
        "name": "Baseline Plan",
        "description": "Standard unmanaged egress relying on single main gate Gate 2 with no zone staging.",
        "interventions": [
            {"type": "open_gate", "gate_id": "gate_2", "start_seconds": 0}
        ],
        "staff_required": 4,
        "source": "template"
    },
    {
        "plan_id": "plan_a",
        "name": "Open-All-Gates Plan",
        "description": "Simultaneous opening of Gate 1, Gate 2, Gate 3, Gate 4 with no crowd pacing.",
        "interventions": [
            {"type": "open_gate", "gate_id": "gate_1", "start_seconds": 0},
            {"type": "open_gate", "gate_id": "gate_2", "start_seconds": 0},
            {"type": "open_gate", "gate_id": "gate_3", "start_seconds": 0},
            {"type": "open_gate", "gate_id": "gate_4", "start_seconds": 0}
        ],
        "staff_required": 8,
        "source": "template"
    },
    {
        "plan_id": "plan_staggered",
        "name": "Staggered-Zone Plan",
        "description": "Stagger Auditorium release by 90s, release Food Court concourse attendees first.",
        "interventions": [
            {"type": "stagger_zone", "zone_id": "zone_auditorium", "delay_seconds": 90},
            {"type": "open_gate", "gate_id": "gate_2", "start_seconds": 0},
            {"type": "open_gate", "gate_id": "gate_3", "start_seconds": 0}
        ],
        "staff_required": 10,
        "source": "template"
    },
    {
        "plan_id": "plan_emergency_corridor",
        "name": "Emergency-Corridor Plan",
        "description": "Reserve Road 17 for emergency vehicles, open Gate 2 and Gate 4.",
        "interventions": [
            {"type": "reserve_emergency_route", "route_id": "road_17", "start_seconds": 0, "end_seconds": 900},
            {"type": "open_gate", "gate_id": "gate_2", "start_seconds": 0},
            {"type": "open_gate", "gate_id": "gate_4", "start_seconds": 0}
        ],
        "staff_required": 10,
        "source": "template"
    },
    {
        "plan_id": "plan_b",
        "name": "Stagger Zones and Reserve Emergency Route",
        "description": "Stagger Auditorium by 90s, reserve Road 17 for emergency vehicles, direct flow to Gate 2 & Gate 4.",
        "interventions": [
            {"type": "stagger_zone", "zone_id": "zone_auditorium", "delay_seconds": 90},
            {"type": "reserve_emergency_route", "route_id": "road_17", "start_seconds": 0, "end_seconds": 900},
            {"type": "open_gate", "gate_id": "gate_2", "start_seconds": 0},
            {"type": "open_gate", "gate_id": "gate_4", "start_seconds": 0}
        ],
        "staff_required": 12,
        "source": "template"
    },
    {
        "plan_id": "plan_c",
        "name": "Single Exit Funnel Plan",
        "description": "Funnel all exiting attendees through East Arcade Gate 3 to isolate perimeter.",
        "interventions": [
            {"type": "open_gate", "gate_id": "gate_3", "start_seconds": 0},
            {"type": "close_gate", "gate_id": "gate_1", "start_seconds": 0},
            {"type": "close_gate", "gate_id": "gate_2", "start_seconds": 0}
        ],
        "staff_required": 6,
        "source": "template"
    },
    {
        "plan_id": "plan_d",
        "name": "Accessible Priority Plan",
        "description": "Release mobility-impaired attendees first via Gate 4 ramp, stagger Parking Plaza by 120s, open South Plaza Gate 2.",
        "interventions": [
            {"type": "stagger_zone", "zone_id": "zone_parking", "delay_seconds": 120},
            {"type": "open_gate", "gate_id": "gate_4", "start_seconds": 0},
            {"type": "open_gate", "gate_id": "gate_2", "start_seconds": 60},
            {"type": "reserve_emergency_route", "route_id": "road_17", "start_seconds": 0, "end_seconds": 900}
        ],
        "staff_required": 16,
        "source": "template"
    },
    {
        "plan_id": "plan_f",
        "name": "General Flow on Accessible Ramp Plan",
        "description": "Route Zone A through Gate 4 ramp without designated accessibility priority corridor.",
        "interventions": [
            {"type": "assign_zone_to_exit", "zone_id": "zone_auditorium", "exit_id": "gate_4"},
            {"type": "open_gate", "gate_id": "gate_4", "start_seconds": 0},
            {"type": "open_gate", "gate_id": "gate_2", "start_seconds": 0}
        ],
        "staff_required": 10,
        "source": "template"
    }
]
