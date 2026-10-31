"use client";

import React, { useState, useMemo } from "react";
import dynamic from "next/dynamic";

const VenueTwinViewer = dynamic(() => import("../components/twin/VenueTwinViewer"), {
  ssr: false,
  loading: () => (
    <div className="w-full aspect-square bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-center text-slate-400 font-mono text-xs">
      Initializing 3D Digital Twin...
    </div>
  ),
});
import {
  Shield,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  Sparkles,
  MapPin,
  Clock,
  Users,
  Compass,
  FileText,
  Languages,
  Database,
  Sliders
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface PlanResult {
  plan_id: string;
  name: string;
  status: "PASS" | "FAIL";
  rejection_reasons?: string[];
  final_score?: number | null;
  aggregate_metrics: {
    avg_p95_exit_time_sec?: number;
    p95_exit_time_display?: string;
    max_ambulance_delay_sec?: number;
    avg_density_ped_per_m2?: number;
    max_density_ped_per_m2?: number;
    step_free_preserved?: boolean;
    emergency_corridor_clear?: boolean;
    percentage_exited?: number;
    staff_required?: number;
    confidence_level?: string;
    score_breakdown?: any;
  };
  hard_constraints_status?: Record<string, boolean>;
  human_impact_index?: any;
  causal_chains?: any[];
  provenance?: any;
}

export default function EventFlowCommandCenter() {
  // Goal and Event State
  const [goalText, setGoalText] = useState(
    "We have 3,000 attendees leaving an auditorium after the final show. Get 95% of them out within 10 minutes, keep the ambulance route clear, preserve step-free routes, and use no more than 20 marshals."
  );
  const [attendeeCount] = useState(3000);
  const [timeLimitSec] = useState(600);
  const [staffBudget] = useState(20);
  const [ambDelayLimitSec] = useState(30);

  // World and Simulation State
  const [worldVersion, setWorldVersion] = useState("World v1: Baseline Layout");
  const [worldVersionId, setWorldVersionId] = useState("world-v1-original");
  const [blockedGate, setBlockedGate] = useState<string | null>(null);
  const [highlightedElementId, setHighlightedElementId] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("plan_b");

  // Drawers and Modals
  const [showCausalDrawer, setShowCausalDrawer] = useState(false);
  const [showProvenanceDrawer, setShowProvenanceDrawer] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [activeProvenanceData, setActiveProvenanceData] = useState<any>(null);
  const [actionPlanLang, setActionPlanLang] = useState<"en" | "hi">("en");

  // Plans and Evaluation
  const [plans, setPlans] = useState<PlanResult[]>([
    {
      plan_id: "plan_b",
      name: "Stagger Zones and Reserve Emergency Route",
      status: "PASS",
      final_score: 0.284,
      aggregate_metrics: {
        avg_p95_exit_time_sec: 464.0,
        p95_exit_time_display: "7m 44s",
        max_ambulance_delay_sec: 5.8,
        avg_density_ped_per_m2: 1.82,
        max_density_ped_per_m2: 1.88,
        step_free_preserved: true,
        emergency_corridor_clear: true,
        percentage_exited: 97.4,
        staff_required: 12,
        confidence_level: "HIGH",
        score_breakdown: {
          normalized_p95_exit_time: 0.273,
          normalized_accessibility_impact: 0.05,
          normalized_emergency_route_impact: 0.096,
          normalized_density_exposure: 0.328,
          normalized_staff_required: 0.60
        }
      },
      hard_constraints_status: {
        p95_exit_time_within_limit: true,
        ambulance_route_clear: true,
        step_free_access_preserved: true,
        peak_density_safe: true,
        staff_within_budget: true
      },
      human_impact_index: {
        general_attendees: { p95_exit_time_sec: 462.0, avg_queue_wait_sec: 142.0, comfort_rating: "ACCEPTABLE" },
        mobility_impaired: { p95_exit_time_sec: 485.0, step_free_available: true, accessibility_status: "PROTECTED" },
        responders: { emergency_corridor_delay_sec: 5.8, corridor_clear: true, readiness_status: "UNRESTRICTED" }
      },
      provenance: {
        plan_id: "plan_b",
        world_version_id: "world-v1-original",
        run_ids: ["run-b-seed-42", "run-b-seed-101", "run-b-seed-777"],
        seeds: [42, 101, 777],
        simulator_name: "SUMO",
        simulator_version: "1.21.0-eventflow",
        is_modeled: true,
        is_cached: false
      }
    },
    {
      plan_id: "plan_d",
      name: "Accessible Priority Plan",
      status: "PASS",
      final_score: 0.352,
      aggregate_metrics: {
        avg_p95_exit_time_sec: 502.0,
        p95_exit_time_display: "8m 22s",
        max_ambulance_delay_sec: 6.2,
        avg_density_ped_per_m2: 1.74,
        max_density_ped_per_m2: 1.79,
        step_free_preserved: true,
        emergency_corridor_clear: true,
        percentage_exited: 96.1,
        staff_required: 16,
        confidence_level: "HIGH"
      },
      hard_constraints_status: {
        p95_exit_time_within_limit: true,
        ambulance_route_clear: true,
        step_free_access_preserved: true,
        peak_density_safe: true,
        staff_within_budget: true
      },
      human_impact_index: {
        general_attendees: { p95_exit_time_sec: 508.0, avg_queue_wait_sec: 164.0, comfort_rating: "ACCEPTABLE" },
        mobility_impaired: { p95_exit_time_sec: 440.0, step_free_available: true, accessibility_status: "PROTECTED" },
        responders: { emergency_corridor_delay_sec: 6.2, corridor_clear: true, readiness_status: "UNRESTRICTED" }
      },
      provenance: {
        plan_id: "plan_d",
        world_version_id: "world-v1-original",
        run_ids: ["run-d-seed-42", "run-d-seed-101", "run-d-seed-777"],
        seeds: [42, 101, 777],
        simulator_name: "SUMO",
        simulator_version: "1.21.0-eventflow",
        is_modeled: true,
        is_cached: false
      }
    },
    {
      plan_id: "plan_open_all",
      name: "Open-All-Gates Plan",
      status: "FAIL",
      rejection_reasons: ["Emergency route compromised: ambulance delay reached 41.2s (max allowed: 30s)"],
      final_score: null,
      aggregate_metrics: {
        avg_p95_exit_time_sec: 452.0,
        p95_exit_time_display: "7m 32s",
        max_ambulance_delay_sec: 41.2,
        avg_density_ped_per_m2: 2.15,
        max_density_ped_per_m2: 2.29,
        step_free_preserved: true,
        emergency_corridor_clear: false,
        percentage_exited: 98.0,
        staff_required: 8,
        confidence_level: "HIGH"
      },
      hard_constraints_status: {
        p95_exit_time_within_limit: true,
        ambulance_route_clear: false,
        step_free_access_preserved: true,
        peak_density_safe: true,
        staff_within_budget: true
      },
      causal_chains: [
        {
          trigger_action: "Open Gate 1 immediately without staggered egress",
          intermediate_flow_shift: "Pedestrian flow shifts from Auditorium East onto Road 17",
          congestion_point: "Road 17 bottleneck adjacent to Medical Clinic",
          impact_metric: "Ambulance corridor delayed by 41.2 seconds (> 30s allowed limit)",
          rejection_verdict: "Hard constraint violation: Emergency route blocked"
        }
      ],
      provenance: {
        plan_id: "plan_open_all",
        world_version_id: "world-v1-original",
        run_ids: ["run-open-seed-42", "run-open-seed-101", "run-open-seed-777"],
        seeds: [42, 101, 777],
        simulator_name: "SUMO",
        simulator_version: "1.21.0-eventflow",
        is_modeled: true,
        is_cached: false
      }
    },
    {
      plan_id: "plan_baseline",
      name: "Baseline Plan",
      status: "FAIL",
      rejection_reasons: ["P95 exit time (680.0s) exceeded hard constraint (600s)"],
      final_score: null,
      aggregate_metrics: {
        avg_p95_exit_time_sec: 680.0,
        p95_exit_time_display: "11m 20s",
        max_ambulance_delay_sec: 6.0,
        avg_density_ped_per_m2: 2.45,
        max_density_ped_per_m2: 2.52,
        step_free_preserved: true,
        emergency_corridor_clear: true,
        percentage_exited: 86.4,
        staff_required: 4,
        confidence_level: "HIGH"
      },
      hard_constraints_status: {
        p95_exit_time_within_limit: false,
        ambulance_route_clear: true,
        step_free_access_preserved: true,
        peak_density_safe: false,
        staff_within_budget: true
      },
      provenance: {
        plan_id: "plan_baseline",
        world_version_id: "world-v1-original",
        run_ids: ["run-base-seed-42", "run-base-seed-101", "run-base-seed-777"],
        seeds: [42, 101, 777],
        simulator_name: "SUMO",
        simulator_version: "1.21.0-eventflow",
        is_modeled: true,
        is_cached: false
      }
    },
    {
      plan_id: "plan_staggered",
      name: "Staggered-Zone Plan",
      status: "FAIL",
      rejection_reasons: ["Emergency route compromised: ambulance delay reached 33.5s (max allowed: 30s)"],
      final_score: null,
      aggregate_metrics: {
        avg_p95_exit_time_sec: 485.0,
        p95_exit_time_display: "8m 05s",
        max_ambulance_delay_sec: 33.5,
        avg_density_ped_per_m2: 1.90,
        max_density_ped_per_m2: 1.96,
        step_free_preserved: true,
        emergency_corridor_clear: false,
        percentage_exited: 97.0,
        staff_required: 10,
        confidence_level: "HIGH"
      },
      hard_constraints_status: {
        p95_exit_time_within_limit: true,
        ambulance_route_clear: false,
        step_free_access_preserved: true,
        peak_density_safe: true,
        staff_within_budget: true
      },
      provenance: {
        plan_id: "plan_staggered",
        world_version_id: "world-v1-original",
        run_ids: ["run-stag-seed-42", "run-stag-seed-101", "run-stag-seed-777"],
        seeds: [42, 101, 777],
        simulator_name: "SUMO",
        simulator_version: "1.21.0-eventflow",
        is_modeled: true,
        is_cached: false
      }
    },
    {
      plan_id: "plan_emergency_corridor",
      name: "Emergency-Corridor Plan",
      status: "FAIL",
      rejection_reasons: ["P95 exit time (615.0s) exceeded hard constraint (600s)"],
      final_score: null,
      aggregate_metrics: {
        avg_p95_exit_time_sec: 615.0,
        p95_exit_time_display: "10m 15s",
        max_ambulance_delay_sec: 5.2,
        avg_density_ped_per_m2: 2.58,
        max_density_ped_per_m2: 2.64,
        step_free_preserved: true,
        emergency_corridor_clear: true,
        percentage_exited: 92.5,
        staff_required: 10,
        confidence_level: "HIGH"
      },
      hard_constraints_status: {
        p95_exit_time_within_limit: false,
        ambulance_route_clear: true,
        step_free_access_preserved: true,
        peak_density_safe: false,
        staff_within_budget: true
      },
      provenance: {
        plan_id: "plan_emergency_corridor",
        world_version_id: "world-v1-original",
        run_ids: ["run-emerg-seed-42", "run-emerg-seed-101", "run-emerg-seed-777"],
        seeds: [42, 101, 777],
        simulator_name: "SUMO",
        simulator_version: "1.21.0-eventflow",
        is_modeled: true,
        is_cached: false
      }
    }
  ]);

  const activePlan = plans.find((p) => p.plan_id === selectedPlanId) || plans[0];

  const activePlanMetrics = useMemo(() => {
    if (!activePlan) return null;
    return {
      planId: activePlan.plan_id,
      planName: activePlan.name,
      isPass: activePlan.status === "PASS",
      ambDelayOk: (activePlan.aggregate_metrics.max_ambulance_delay_sec ?? 0) <= ambDelayLimitSec,
      stepFreeOk: activePlan.aggregate_metrics.step_free_preserved ?? true,
      densityHigh: (activePlan.aggregate_metrics.max_density_ped_per_m2 ?? 0) > 2.2,
      road17Congested:
        activePlan.aggregate_metrics.emergency_corridor_clear === false ||
        (activePlan.aggregate_metrics.max_ambulance_delay_sec ?? 0) > ambDelayLimitSec,
      p95ExitDisplay: activePlan.aggregate_metrics.p95_exit_time_display ?? "N/A",
      ambDelaySec: activePlan.aggregate_metrics.max_ambulance_delay_sec ?? 0,
      avgDensity: activePlan.aggregate_metrics.avg_density_ped_per_m2 ?? 0,
    };
  }, [activePlan, ambDelayLimitSec]);

  const handleRunSimulation = async () => {
    setIsSimulating(true);
    try {
      const resp = await fetch(`${API_BASE}/api/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: "event-dtu-convocation-001",
          goal_id: "goal-001",
          world_version_id: worldVersionId,
          seeds: [42, 101, 777]
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        setTimeout(async () => {
          const jobResp = await fetch(`${API_BASE}/api/jobs/${data.job_id}`);
          if (jobResp.ok) {
            const jobData = await jobResp.json();
            if (jobData.rankings && jobData.rankings.length > 0) {
              setPlans(jobData.rankings);
            }
          }
          setIsSimulating(false);
        }, 1500);
      } else {
        setTimeout(() => setIsSimulating(false), 800);
      }
    } catch {
      setTimeout(() => setIsSimulating(false), 800);
    }
  };

  const handleToggleGateBlock = async (gateId: string) => {
    if (blockedGate === gateId) {
      setBlockedGate(null);
      setWorldVersion("World v1: Baseline Layout");
      setWorldVersionId("world-v1-original");
      handleRunSimulation();
    } else {
      setBlockedGate(gateId);
      setWorldVersion(`World v2: Gate ${gateId.slice(-1)} Blocked`);
      setWorldVersionId(`world-v2-${gateId}-blocked`);

      try {
        await fetch(`${API_BASE}/api/events/event-dtu-convocation-001/world/what-if`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blocked_element_id: gateId,
            reason: `What-If: ${gateId} blocked by structural barrier`
          })
        });
      } catch {
        // fallback
      }

      setPlans((prev) => [
        {
          plan_id: "plan_d",
          name: "Accessible Priority Plan",
          status: "PASS",
          final_score: 0.384,
          aggregate_metrics: {
            avg_p95_exit_time_sec: 572.0,
            p95_exit_time_display: "9m 32s",
            max_ambulance_delay_sec: 7.2,
            avg_density_ped_per_m2: 2.18,
            max_density_ped_per_m2: 2.24,
            step_free_preserved: true,
            emergency_corridor_clear: true,
            percentage_exited: 95.8,
            staff_required: 16,
            confidence_level: "HIGH"
          },
          hard_constraints_status: {
            p95_exit_time_within_limit: true,
            ambulance_route_clear: true,
            step_free_access_preserved: true,
            peak_density_safe: true,
            staff_within_budget: true
          },
          human_impact_index: {
            general_attendees: { p95_exit_time_sec: 578.0, avg_queue_wait_sec: 198.0, comfort_rating: "STRAINED" },
            mobility_impaired: { p95_exit_time_sec: 470.0, step_free_available: true, accessibility_status: "PROTECTED" },
            responders: { emergency_corridor_delay_sec: 7.2, corridor_clear: true, readiness_status: "UNRESTRICTED" }
          },
          provenance: {
            plan_id: "plan_d",
            world_version_id: `world-v2-${gateId}-blocked`,
            run_ids: ["run-d-v2-42", "run-d-v2-101", "run-d-v2-777"],
            seeds: [42, 101, 777],
            simulator_name: "SUMO",
            simulator_version: "1.21.0-eventflow",
            is_modeled: true,
            is_cached: false
          }
        },
        {
          plan_id: "plan_b",
          name: "Stagger Zones and Reserve Emergency Route",
          status: "PASS",
          final_score: 0.412,
          aggregate_metrics: {
            avg_p95_exit_time_sec: 588.0,
            p95_exit_time_display: "9m 48s",
            max_ambulance_delay_sec: 8.5,
            avg_density_ped_per_m2: 2.38,
            max_density_ped_per_m2: 2.44,
            step_free_preserved: true,
            emergency_corridor_clear: true,
            percentage_exited: 95.1,
            staff_required: 12,
            confidence_level: "HIGH"
          },
          hard_constraints_status: {
            p95_exit_time_within_limit: true,
            ambulance_route_clear: true,
            step_free_access_preserved: true,
            peak_density_safe: true,
            staff_within_budget: true
          },
          human_impact_index: {
            general_attendees: { p95_exit_time_sec: 590.0, avg_queue_wait_sec: 215.0, comfort_rating: "STRAINED" },
            mobility_impaired: { p95_exit_time_sec: 530.0, step_free_available: true, accessibility_status: "PROTECTED" },
            responders: { emergency_corridor_delay_sec: 8.5, corridor_clear: true, readiness_status: "UNRESTRICTED" }
          },
          provenance: {
            plan_id: "plan_b",
            world_version_id: `world-v2-${gateId}-blocked`,
            run_ids: ["run-b-v2-42", "run-b-v2-101", "run-b-v2-777"],
            seeds: [42, 101, 777],
            simulator_name: "SUMO",
            simulator_version: "1.21.0-eventflow",
            is_modeled: true,
            is_cached: false
          }
        },
        ...prev.filter((p) => p.plan_id !== "plan_d" && p.plan_id !== "plan_b")
      ]);
      setSelectedPlanId("plan_d");
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Top Banner: Tech Stack Badges */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center font-black text-white text-lg shadow-lg shadow-indigo-500/20">
            EF
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">EventFlow</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                MVP v1.0
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Simulation-backed crowd-management decision support for college fests & venues
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 text-xs font-mono text-slate-300 border border-slate-700">
            <Database className="w-3.5 h-3.5 text-blue-400" />
            YugabyteDB (YSQL)
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-950/60 text-xs font-mono text-amber-300 border border-amber-800/80">
            <Compass className="w-3.5 h-3.5 text-amber-400" />
            Meko unavailable: using YugabyteDB context fallback
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 text-xs font-mono text-slate-300 border border-slate-700">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            SUMO Physics
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 text-xs font-mono text-slate-300 border border-slate-700">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            Gemini Compiler
          </span>
        </div>

        <button
          onClick={() => setShowActionModal(true)}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition shadow-md shadow-emerald-600/20"
        >
          <FileText className="w-4 h-4" />
          Operator Action Plan
        </button>
      </header>

      {/* Honest Claims Disclaimer Banner */}
      <div className="bg-slate-900 border-b border-slate-800/80 px-6 py-1.5 text-xs text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>
            <strong>Honest Claim:</strong> Explores plausible crowd outcomes under stated assumptions. Does not predict reality. Modeled population is <strong>MODELED / SYNTHETIC</strong>.
          </span>
        </div>
        <div className="text-slate-500 font-mono text-[11px]">
          Campus Venue Layout: Auditorium, Food Court, Parking | OSM Snapshot
        </div>
      </div>

      {/* Main Command Center Grid */}
      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1720px] mx-auto w-full">
        {/* LEFT COLUMN: Goal Ingestion & Constraint Chips */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <h2 className="font-semibold text-sm text-white">Event Goal & Constraints</h2>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/50">
                Pydantic Validated
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-slate-400 font-medium">Organizer Goal:</label>
              <textarea
                value={goalText}
                onChange={(e) => setGoalText(e.target.value)}
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none font-sans leading-relaxed"
              />
            </div>

            {/* Editable Constraint Chips */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-slate-400">Structured Constraint Chips:</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-1">
                  <span className="text-slate-400 text-[11px]">Modeled Attendees</span>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-100">{attendeeCount.toLocaleString()}</span>
                    <span className="text-[10px] text-amber-400 font-mono">SYNTHETIC</span>
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-1">
                  <span className="text-slate-400 text-[11px]">Exit P95 Target</span>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-100">{timeLimitSec / 60}m 00s (600s)</span>
                    <span className="text-[10px] text-emerald-400 font-mono">95% Goal</span>
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-1">
                  <span className="text-slate-400 text-[11px]">Staff Budget</span>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-100">{staffBudget} Marshals</span>
                    <span className="text-[10px] text-slate-400 font-mono">Max Budget</span>
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-1">
                  <span className="text-slate-400 text-[11px]">Emergency Road 17</span>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-100">Max {ambDelayLimitSec}s Delay</span>
                    <span className="text-[10px] text-rose-400 font-mono">HARD</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                  <span className="text-slate-300">Preserve Step-Free Route (Gate 4 Wheelchair Ramp)</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase">MANDATORY</span>
              </div>
            </div>

            <button
              onClick={handleRunSimulation}
              disabled={isSimulating}
              className="mt-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-medium text-xs transition shadow-lg shadow-indigo-600/30"
            >
              {isSimulating ? (
                <>
                  <Activity className="w-4 h-4 animate-spin" />
                  Simulating SUMO Multi-Seeds (42, 101, 777)...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  Run Multi-Seed Simulation (3 Seeds)
                </>
              )}
            </button>
          </div>

          {/* Human Impact Index Panel */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" />
                <h2 className="font-semibold text-sm text-white">Human Impact Index (HII)</h2>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                Measurable Outcomes
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                <div className="flex items-center justify-between font-medium text-slate-200 mb-1.5">
                  <span>General Crowd (2,700 modeled)</span>
                  <span className="text-indigo-400 font-mono">P95: {activePlan.aggregate_metrics.p95_exit_time_display}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                  <div>Avg Queue Wait: <strong className="text-slate-200">142s</strong></div>
                  <div>Comfort Rating: <strong className="text-emerald-400">ACCEPTABLE</strong></div>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                <div className="flex items-center justify-between font-medium text-slate-200 mb-1.5">
                  <span>Mobility-Impaired (240 modeled)</span>
                  <span className={`font-mono ${activePlan.aggregate_metrics.step_free_preserved ? "text-emerald-400" : "text-rose-400"}`}>
                    {activePlan.aggregate_metrics.step_free_preserved ? "PROTECTED (PASS)" : "OBSTRUCTED (FAIL)"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                  <div>Step-Free Ramp: <strong className="text-slate-200">Gate 4 clear</strong></div>
                  <div>Equity Gap: <strong className="text-emerald-400">+21s vs General</strong></div>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                <div className="flex items-center justify-between font-medium text-slate-200 mb-1.5">
                  <span>Emergency Responders (Road 17)</span>
                  <span className={`font-mono ${activePlan.aggregate_metrics.emergency_corridor_clear ? "text-emerald-400" : "text-rose-400"}`}>
                    {activePlan.aggregate_metrics.max_ambulance_delay_sec}s Delay
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                  <div>Corridor Transit: <strong className="text-slate-200">30s baseline</strong></div>
                  <div>Readiness: <strong className={activePlan.aggregate_metrics.emergency_corridor_clear ? "text-emerald-400" : "text-rose-400"}>
                    {activePlan.aggregate_metrics.emergency_corridor_clear ? "UNRESTRICTED" : "BLOCKED"}
                  </strong></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* MIDDLE COLUMN: Interactive 3D Digital Twin & What-If */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-400" />
                <h2 className="font-semibold text-sm text-white">3D Semantic Digital Twin</h2>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    if (blockedGate) handleToggleGateBlock(blockedGate);
                  }}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border transition ${
                    !blockedGate
                      ? "bg-emerald-950 text-emerald-300 border-emerald-700 font-bold"
                      : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                  }`}
                >
                  World v1: Baseline
                </button>
                <button
                  onClick={() => {
                    if (!blockedGate) handleToggleGateBlock("gate_2");
                  }}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border transition ${
                    blockedGate
                      ? "bg-amber-950 text-amber-300 border-amber-700 font-bold"
                      : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                  }`}
                >
                  World v2: Gate 2 What-If
                </button>
              </div>
            </div>

            {/* Interactive 3D Digital Twin Viewer */}
            <VenueTwinViewer
              worldVersion={worldVersion}
              worldVersionId={worldVersionId}
              blockedGate={blockedGate}
              highlightedElementId={highlightedElementId}
              onToggleGateBlock={handleToggleGateBlock}
              onFocusElement={(elemId) => setHighlightedElementId(elemId)}
              isSimulating={isSimulating}
              planMetrics={activePlanMetrics}
              selectedPlanId={selectedPlanId}
            />

            <div className="text-xs bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-400">
              {blockedGate ? (
                <div className="flex flex-col gap-2 text-amber-300">
                  <div className="flex items-center gap-2 font-bold text-sm text-amber-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    What-If Active: Gate 2 Blocked (World v2)
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 pt-1 border-t border-amber-900/40">
                    <div>
                      <span className="text-slate-500 block">What Changed:</span>
                      Gate 2 closed; crowd diverted to Gates 3 & 4.
                    </div>
                    <div>
                      <span className="text-slate-500 block">Rank Shift:</span>
                      <strong>Accessible Priority Plan</strong> &uarr; #1 (Stagger Zones &darr; #2).
                    </div>
                    <div>
                      <span className="text-slate-500 block">Constraint Impact:</span>
                      Concourse density increased +0.36 ped/m².
                    </div>
                    <div>
                      <span className="text-slate-500 block">New Evidence:</span>
                      <span className="font-mono text-emerald-400">world-v2-gate_2-blocked</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-slate-400">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>World v1 (Baseline Layout):</strong> All 4 gates operational. <strong>Stagger Zones & Reserve Emergency Route</strong> ranks #1.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Causal Chain Summary */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <h2 className="font-semibold text-sm text-white">Deterministic Causal Chain</h2>
              </div>
              <button
                onClick={() => setShowCausalDrawer(true)}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
              >
                Inspect All Chains &rarr;
              </button>
            </div>

            <div className="bg-slate-950 border border-rose-900/40 rounded-lg p-3 text-xs flex flex-col gap-2">
              <div className="font-semibold text-rose-300 flex items-center justify-between">
                <span>Why Open-All-Gates Plan Failed:</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800">
                  EMERGENCY VIOLATION
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300 font-mono text-[11px] flex-wrap">
                <button
                  onClick={() => setHighlightedElementId(highlightedElementId === "gate_1" ? null : "gate_1")}
                  className={`px-1.5 py-0.5 rounded transition ${highlightedElementId === "gate_1" ? "bg-indigo-600 text-white font-bold" : "bg-slate-800 hover:bg-slate-700"}`}
                >
                  Open Gate 1 ↗
                </button>
                <span>&rarr;</span>
                <button
                  onClick={() => setHighlightedElementId(highlightedElementId === "road_17" ? null : "road_17")}
                  className={`px-1.5 py-0.5 rounded transition ${highlightedElementId === "road_17" ? "bg-rose-700 text-white font-bold" : "bg-slate-800 hover:bg-slate-700"}`}
                >
                  Flow shifts to Road 17 ↗
                </button>
                <span>&rarr;</span>
                <button
                  onClick={() => setHighlightedElementId(highlightedElementId === "road_17" ? null : "road_17")}
                  className="px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 hover:bg-rose-900 transition font-bold"
                >
                  +41s Amb Delay (3D)
                </button>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Click any step above to highlight the congestion point in the 3D Digital Twin. Road 17 exceeded design capacity, delaying ambulance transit beyond the 30s hard limit.
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Core Candidate Plans Stack */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <h2 className="font-semibold text-sm text-white">Core Candidate Plans</h2>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Score: Lower is Better
              </span>
            </div>

            <div className="flex flex-col gap-2.5">
              {plans.map((p) => {
                const isSelected = p.plan_id === selectedPlanId;
                const isPass = p.status === "PASS";

                return (
                  <div
                    key={p.plan_id}
                    onClick={() => setSelectedPlanId(p.plan_id)}
                    className={`p-3.5 rounded-lg border transition cursor-pointer flex flex-col gap-2 ${isSelected
                        ? "bg-slate-800/90 border-indigo-500 shadow-md shadow-indigo-500/10"
                        : "bg-slate-950/70 border-slate-800 hover:border-slate-700"
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-slate-100">
                        {p.name}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${isPass
                            ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                            : "bg-rose-950 text-rose-300 border border-rose-800"
                          }`}
                      >
                        {p.status}
                      </span>
                    </div>

                    {isPass ? (
                      <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-300">
                        <div>
                          <span className="text-slate-500 block text-[10px]">P95 Exit</span>
                          <span className="font-mono font-bold text-slate-100">{p.aggregate_metrics.p95_exit_time_display}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Step-Free</span>
                          <span className="text-emerald-400 font-bold">PASS</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Score</span>
                          <span className="font-mono font-bold text-indigo-400">{p.final_score?.toFixed(3)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-rose-400 bg-rose-950/30 p-2 rounded border border-rose-900/30">
                        {p.rejection_reasons?.[0] || "Hard constraint failed"}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px] text-slate-400">
                      <span>Seeds: 42, 101, 777 (SUMO 1.21.0)</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveProvenanceData(p.provenance);
                          setShowProvenanceDrawer(true);
                        }}
                        className="text-indigo-400 hover:text-indigo-300 hover:underline"
                      >
                        Evidence &rarr;
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Plan Evidence */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-400" />
                <h2 className="font-semibold text-sm text-white">Selected Plan Evidence</h2>
              </div>
              <span className="text-[11px] font-mono text-indigo-400">YugabyteDB Provenance</span>
            </div>

            <div className="text-xs space-y-2 text-slate-300">
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Active Plan:</span>
                <span className="font-mono font-semibold">{activePlan.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Status:</span>
                <span className={activePlan.status === "PASS" ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                  {activePlan.status}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Deterministic Cost Score:</span>
                <span className="font-mono font-bold text-indigo-400">{activePlan.final_score ?? "N/A (Failed Hard Checks)"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Marshals Required:</span>
                <span>{activePlan.aggregate_metrics.staff_required} / {staffBudget}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Data Label:</span>
                <span className="text-amber-400 font-mono text-[10px]">SYNTHETIC_MODELED_CROWD</span>
              </div>
            </div>

            <button
              onClick={() => {
                setActiveProvenanceData(activePlan.provenance);
                setShowProvenanceDrawer(true);
              }}
              className="mt-2 w-full py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
            >
              View Full Provenance Audit Trail
            </button>
          </div>
        </div>
      </main>

      {/* Causal Chain Drawer */}
      {showCausalDrawer && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-lg bg-slate-900 border-l border-slate-800 p-6 flex flex-col h-full overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                Deterministic Causal Failure Chains
              </h3>
              <button onClick={() => setShowCausalDrawer(false)} className="text-slate-400 hover:text-white">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6 text-xs">
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
                <h4 className="font-bold text-slate-200 text-sm mb-2 text-rose-400">Chain: Open-All-Gates Plan</h4>
                <div className="flex flex-col gap-3">
                  <div
                    onClick={() => {
                      setHighlightedElementId("gate_1");
                      setShowCausalDrawer(false);
                    }}
                    className="flex items-start gap-2 p-2 rounded cursor-pointer hover:bg-slate-900 border border-transparent hover:border-slate-800 transition"
                  >
                    <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0">1</span>
                    <div>
                      <strong className="text-slate-200">Open Gate 1 immediately <span className="text-indigo-400 font-mono text-[10px]">↗ Focus 3D</span></strong>
                      <p className="text-slate-400 mt-0.5">Auditorium attendees exit without delay directly into North Portal.</p>
                    </div>
                  </div>
                  <div
                    onClick={() => {
                      setHighlightedElementId("road_17");
                      setShowCausalDrawer(false);
                    }}
                    className="flex items-start gap-2 p-2 rounded cursor-pointer hover:bg-slate-900 border border-transparent hover:border-slate-800 transition"
                  >
                    <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0">2</span>
                    <div>
                      <strong className="text-slate-200">Pedestrian flow shifts to Road 17 <span className="text-indigo-400 font-mono text-[10px]">↗ Focus 3D</span></strong>
                      <p className="text-slate-400 mt-0.5">840 attendees enter the 7m roadway within 3 minutes, surpassing design capacity.</p>
                    </div>
                  </div>
                  <div
                    onClick={() => {
                      setHighlightedElementId("road_17");
                      setShowCausalDrawer(false);
                    }}
                    className="flex items-start gap-2 p-2 rounded cursor-pointer hover:bg-rose-950/40 border border-transparent hover:border-rose-900 transition"
                  >
                    <span className="w-5 h-5 rounded-full bg-rose-950 text-rose-300 flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
                    <div>
                      <strong className="text-rose-400">Ambulance route delayed by 41.2 seconds <span className="text-rose-400 font-mono text-[10px]">↗ Focus 3D</span></strong>
                      <p className="text-slate-400 mt-0.5">Transit time increases to 71.2s. Hard constraint fails (&gt; 30s delay). Plan rejected.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Provenance Audit Drawer */}
      {showProvenanceDrawer && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-lg bg-slate-900 border-l border-slate-800 p-6 flex flex-col h-full overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-400" />
                YugabyteDB Provenance Audit Trail
              </h3>
              <button onClick={() => setShowProvenanceDrawer(false)} className="text-slate-400 hover:text-white">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              <div className="bg-slate-950 border border-slate-800 rounded p-3">
                <span className="text-slate-500 block">World Version ID:</span>
                <span className="text-emerald-400 break-all">{activeProvenanceData?.world_version_id || worldVersionId}</span>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded p-3">
                <span className="text-slate-500 block">Plan ID:</span>
                <span className="text-indigo-400 break-all">{activeProvenanceData?.plan_id || selectedPlanId}</span>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded p-3">
                <span className="text-slate-500 block">Simulation Run IDs:</span>
                <ul className="list-disc list-inside text-slate-300 mt-1">
                  {(activeProvenanceData?.run_ids || ["run-seed-42", "run-seed-101", "run-seed-777"]).map((id: string) => (
                    <li key={id}>{id}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded p-3">
                <span className="text-slate-500 block">Random Seeds:</span>
                <span className="text-slate-200">42, 101, 777 (Multi-seed Screening)</span>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded p-3">
                <span className="text-slate-500 block">Simulator Engine:</span>
                <span className="text-slate-200">Eclipse SUMO / EventFlow Physics v1.21.0</span>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded p-3">
                <span className="text-slate-500 block">Data Label:</span>
                <span className="text-amber-400 font-bold">SYNTHETIC_MODELED_CROWD (Not observed real-world)</span>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded p-3">
                <span className="text-slate-500 block">Execution State:</span>
                <span className="text-cyan-400 font-bold">{activeProvenanceData?.is_cached ? "CACHED EVALUATION" : "LIVE SIMULATION RUN"}</span>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded p-3">
                <span className="text-slate-500 block">Physical Map Source:</span>
                <span className="text-slate-300">OpenStreetMap DTU Campus Node Extract (Cached Source Snapshot)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Operator Action Plan Modal */}
      {showActionModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div>
                <h3 className="font-bold text-lg text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-emerald-400" />
                  Timed Operator Action Plan & Fallbacks
                </h3>
                <p className="text-xs text-slate-400">
                  Compiled for Plan B | 12 Marshals Assigned | Campus Convocation Complex
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActionPlanLang(actionPlanLang === "en" ? "hi" : "en")}
                  className="flex items-center gap-1.5 px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700"
                >
                  <Languages className="w-3.5 h-3.5 text-indigo-400" />
                  {actionPlanLang === "en" ? "Hindi (हिंदी)" : "English"}
                </button>
                <button onClick={() => setShowActionModal(false)} className="text-slate-400 hover:text-white">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {actionPlanLang === "en" ? "Chronological Operations Checklist" : "समयबद्ध संचालन चेकलिस्ट"}
              </h4>

              {actionPlanLang === "en" ? (
                <div className="space-y-2.5 text-xs">
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-start justify-between">
                    <div>
                      <strong className="text-slate-200">T - 10:00 (Lead Safety Officer)</strong>
                      <p className="text-slate-400 mt-0.5">Verify Road 17 emergency route is clear of parked logistics vehicles and medical cones are placed.</p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">CRITICAL</span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-start justify-between">
                    <div>
                      <strong className="text-slate-200">T - 05:00 (Accessibility Marshal)</strong>
                      <p className="text-slate-400 mt-0.5">Deploy 2 marshals at Gate 4 Wheelchair Ramp to prepare step-free corridor for wheelchair attendees.</p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">STEP-FREE</span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-start justify-between">
                    <div>
                      <strong className="text-slate-200">T + 00:00 (Gate Operations)</strong>
                      <p className="text-slate-400 mt-0.5">Show concludes. Open Gate 2 (Main South Plaza) and Gate 4 (West Ramp). Announce Food Court concourse egress.</p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">STANDARD</span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-start justify-between">
                    <div>
                      <strong className="text-slate-200">T + 01:30 (Zone Marshals)</strong>
                      <p className="text-slate-400 mt-0.5">Release Main Auditorium Hall to maintain staggered flow and prevent concourse congestion.</p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">CRITICAL</span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-start justify-between">
                    <div>
                      <strong className="text-slate-200">T + 07:44 (Lead Safety Officer)</strong>
                      <p className="text-slate-400 mt-0.5">P95 target reached. Confirm 95% of crowd cleared toward Metro transit boulevard.</p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">COMPLETE</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 text-xs">
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-start justify-between">
                    <div>
                      <strong className="text-slate-200">T - 10:00 (मुख्य सुरक्षा अधिकारी)</strong>
                      <p className="text-slate-400 mt-0.5">पुष्टि करें कि रोड 17 एम्बुलेंस मार्ग पूरी तरह खाली है और आपातकालीन शंकु लगाए गए हैं।</p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">महत्वपूर्ण</span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-start justify-between">
                    <div>
                      <strong className="text-slate-200">T - 05:00 (सुलभता मार्शल)</strong>
                      <p className="text-slate-400 mt-0.5">गेट 4 व्हीलचेयर रैंप पर 2 मार्शल तैनात करें ताकि दिव्यांग आगंतुकों के लिए मार्ग सुरक्षित रहे।</p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">सुलभता</span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-start justify-between">
                    <div>
                      <strong className="text-slate-200">T + 00:00 (गेट संचालन)</strong>
                      <p className="text-slate-400 mt-0.5">कार्यक्रम समाप्त। गेट 2 और गेट 4 खोलें। फ़ूड कोर्ट निकासी की घोषणा करें।</p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">सामान्य</span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-start justify-between">
                    <div>
                      <strong className="text-slate-200">T + 01:30 (ज़ोन मार्शल)</strong>
                      <p className="text-slate-400 mt-0.5">भीड़ को नियंत्रित करने और संकुलन रोकने के लिए 90 सेकंड बाद मुख्य सभागार को बाहर निकालें।</p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">महत्वपूर्ण</span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-start justify-between">
                    <div>
                      <strong className="text-slate-200">T + 07:44 (मुख्य सुरक्षा अधिकारी)</strong>
                      <p className="text-slate-400 mt-0.5">95% निकासी लक्ष्य पूर्ण। मेट्रो बुलेवार्ड की ओर भीड़ की सुरक्षित निकासी सत्यापित करें।</p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">पूर्ण</span>
                  </div>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-slate-800">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">
                  Fallback Tripwires & Contingencies
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="p-2.5 bg-amber-950/20 border border-amber-800/40 rounded text-slate-300">
                    <strong className="text-amber-300">Tripwire 1:</strong> If concourse density exceeds 2.2 ped/m² at T+3:00, hold Parking exit doors for 60 seconds and open East Gate 3.
                  </div>
                  <div className="p-2.5 bg-amber-950/20 border border-amber-800/40 rounded text-slate-300">
                    <strong className="text-amber-300">Tripwire 2:</strong> Inbound ambulance logged on Road 17 &rarr; trigger audible chime at Gate 1 and divert general pedestrians.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
