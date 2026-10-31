"use client";

export interface OccupancyAssessment {
  assessment_id: string;
  world_version_id: string;
  building_name: string;
  affected_occupants: number;
  elsewhere_occupants: number;
  step_free_required: number;
  movement_authorized: false;
  zones: {
    zone_id: string; label: string; occupant_count: number; step_free_required: number;
    bounds: { x: number; z: number; width: number; depth: number };
  }[];
  exit_inventory: { gate_id: string; name: string; blocked: boolean; step_free: boolean; capacity_per_sec: number | null }[];
  warnings: string[];
  assumptions: string[];
}

export default function OccupancyAssessmentPanel({ active, assessment, error }: {
  active: boolean; assessment: OccupancyAssessment | null; error: string | null;
}) {
  return <section className="bg-slate-900/80 border border-slate-700 rounded-xl p-5 space-y-4" aria-label="Building occupancy assessment" aria-live="polite">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-bold text-white">People at risk · Evacuation zones</h3>
      <span className="text-xs text-amber-300">Phase 2.1 · Modeled inventory</span>
    </div>
    {!active ? <p className="text-sm text-slate-400">Activate the fire scenario to assess the affected building. No live occupant detection is connected.</p>
      : error ? <p role="alert" className="text-sm text-rose-300">Assessment unavailable: {error}. No occupant count or movement authorization is inferred.</p>
      : !assessment ? <p className="text-sm text-slate-400">Assessing the current world… Previous results are withheld.</p>
      : <>
        <p className="text-sm text-slate-300">{assessment.building_name} · <span className="font-mono">{assessment.world_version_id}</span></p>
        <div className="grid grid-cols-3 gap-3">
          {[["Inside affected building", assessment.affected_occupants], ["Step-free needs (subset)", assessment.step_free_required], ["Elsewhere in venue", assessment.elsewhere_occupants]].map(([label, value]) =>
            <div key={label} className="bg-slate-950 rounded-lg p-3"><div className="text-xl font-bold text-white">{Number(value).toLocaleString()}</div><div className="text-xs text-slate-400">{label}</div></div>)}
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          {assessment.zones.map((zone, i) => <div key={zone.zone_id} className="border border-amber-800/60 rounded-lg p-3">
            <div className="text-sm font-semibold text-amber-200">Z{i + 1} · {zone.label}</div>
            <div className="text-sm mt-2">{zone.occupant_count.toLocaleString()} modeled occupants</div>
            <div className="text-xs text-violet-300 mt-1">{zone.step_free_required} require step-free access</div>
            <div className="text-xs text-slate-400 mt-2">Assessment only · route unverified</div>
          </div>)}
        </div>
        <div className="flex flex-wrap gap-2">{assessment.exit_inventory.map(exit => <span key={exit.gate_id} className={`text-xs px-2 py-1 rounded border ${exit.blocked ? "border-rose-700 text-rose-300" : "border-slate-600 text-slate-300"}`}>
          {exit.gate_id.replace("_", " ")} · {exit.blocked ? "BLOCKED" : "open, route unverified"}{exit.step_free ? " · step-free" : ""}
        </span>)}</div>
        <div className="border-l-2 border-amber-500 pl-3 space-y-1">
          {assessment.warnings.map(warning => <p key={warning} className="text-xs text-amber-200">{warning}</p>)}
        </div>
        <details className="text-xs text-slate-400"><summary className="cursor-pointer">Source & assumptions</summary>
          <ul className="list-disc pl-5 mt-2 space-y-1">{assessment.assumptions.map(a => <li key={a}>{a}</li>)}</ul>
          <p className="mt-2 font-mono">{assessment.assessment_id}</p>
        </details>
      </>}
    <p className="text-xs text-slate-400">Crowd movement is not enabled in this phase. Zone order is spatial, not an evacuation priority. Emergency vehicles continue independently.</p>
  </section>;
}
