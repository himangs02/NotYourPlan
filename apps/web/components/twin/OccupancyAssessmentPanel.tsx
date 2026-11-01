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
  return <section className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-4 shadow-sm text-slate-800" aria-label="Building occupancy assessment" aria-live="polite">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
      <h3 className="font-bold text-slate-900 tracking-tight">People at risk · Evacuation zones</h3>
      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">Phase 2.1 · Modeled inventory</span>
    </div>
    {!active ? <p className="text-xs text-slate-500">Activate the fire scenario to assess the affected building. No live occupant detection is connected.</p>
      : error ? <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-xl font-medium">Assessment unavailable: {error}. No occupant count or movement authorization is inferred.</p>
      : !assessment ? <p className="text-xs text-slate-500">Assessing the current world… Previous results are withheld.</p>
      : <>
        <p className="text-xs text-slate-600 font-medium">{assessment.building_name} · <span className="font-mono text-purple-700 font-bold">{assessment.world_version_id}</span></p>
        <div className="grid grid-cols-3 gap-3">
          {[["Inside affected building", assessment.affected_occupants], ["Step-free needs (subset)", assessment.step_free_required], ["Elsewhere in venue", assessment.elsewhere_occupants]].map(([label, value]) =>
            <div key={label} className="bg-slate-50 border border-slate-200 rounded-xl p-3"><div className="text-xl font-bold text-slate-900">{Number(value).toLocaleString()}</div><div className="text-[11px] text-slate-500 mt-0.5">{label}</div></div>)}
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          {assessment.zones.map((zone, i) => <div key={zone.zone_id} className="border border-amber-200 bg-amber-50/50 rounded-xl p-3">
            <div className="text-xs font-bold text-amber-800">Z{i + 1} · {zone.label}</div>
            <div className="text-xs font-semibold text-slate-800 mt-1">{zone.occupant_count.toLocaleString()} modeled occupants</div>
            <div className="text-[11px] text-purple-700 font-medium mt-0.5">{zone.step_free_required} require step-free access</div>
            <div className="text-[10px] text-slate-400 mt-1.5">Assessment only · route unverified</div>
          </div>)}
        </div>
        <div className="flex flex-wrap gap-2">{assessment.exit_inventory.map(exit => <span key={exit.gate_id} className={`text-[11px] font-mono font-medium px-2.5 py-1 rounded-full border ${exit.blocked ? "border-rose-300 bg-rose-50 text-rose-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
          {exit.gate_id.replace("_", " ")} · {exit.blocked ? "BLOCKED" : "open, route unverified"}{exit.step_free ? " · step-free" : ""}
        </span>)}</div>
        <div className="border-l-2 border-amber-500 pl-3 space-y-1 bg-amber-50/40 p-2 rounded-r-xl">
          {assessment.warnings.map(warning => <p key={warning} className="text-xs text-amber-800">{warning}</p>)}
        </div>
        <details className="text-xs text-slate-500"><summary className="cursor-pointer font-medium hover:text-slate-800">Source &amp; assumptions</summary>
          <ul className="list-disc pl-5 mt-2 space-y-1">{assessment.assumptions.map(a => <li key={a}>{a}</li>)}</ul>
          <p className="mt-2 font-mono text-[10px] text-slate-400">{assessment.assessment_id}</p>
        </details>
      </>}
    <p className="text-[11px] text-slate-400">Crowd movement is not enabled in this phase. Zone order is spatial, not an evacuation priority. Emergency vehicles continue independently.</p>
  </section>;
}
