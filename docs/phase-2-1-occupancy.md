# Phase 2.1: building occupancy and evacuation zones

Fire activation now requests `POST /api/evacuation/assess` using the event,
world version, incident ID, building zone and blocked gates. The endpoint reads
the persisted world scoped to that event. Unknown worlds, buildings and gates
are rejected; the frontend does not fabricate a successful fallback.

The response contains a deterministic input fingerprint, conserved headcounts,
modeled step-free needs, zone footprints, campus-gate inventory and explicit
limitations. Changing a world/gate or resetting fire immediately hides prior
results and cancels obsolete requests. Results are computed, not persisted as
approved evacuation plans.

Current campus seeds contain 1,800 auditorium occupants and 1,200 elsewhere.
The older persisted schema contains three auditorium tiers (1,000 / 1,200 / 800).
An explicit adapter preserves those tier counts and IDs. Its overlay uses a
schematic 26 × 18 display footprint, not surveyed tier geometry. The UI discloses
this distinction. Neither layout supplies live detection or validated interior
navigation. Step-free needs are a population-ratio assumption, not observations.

The old looping crowd animation is no longer invoked by the viewer: particles
that repeatedly respawn cannot represent evacuation accounting. Fire visuals,
emergency vehicle controllers and emergency routing are unchanged. The new
translucent zone overlays are inventory visualization only.

Movement remains unauthorized. The next phase must model interior connectivity,
hazard exclusion, accessible paths, shared exit capacities, emergency-corridor
conflicts, congestion and assembly capacity before releasing cohorts. It must
count each occupant once through departure and arrival rather than respawning.

Validation: backend test suite (including emergency regressions), Next.js
production build in an isolated directory, and the live occupancy endpoint.
Run tests with a fresh disposable DATABASE_URL: older emergency tests write
fixtures without cleanup, so reusing their database can contaminate results.
