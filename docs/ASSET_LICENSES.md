# EventFlow — Third-Party Asset Licenses

This document records all third-party 3D assets included in or used by EventFlow.
It is mandatory to preserve this attribution wherever the asset appears in the product.

---

## city.glb — 3D City Environment Model

| Field | Value |
|---|---|
| **Asset name** | Low Poly City Pack / City GLB Environment |
| **File in repo** | `apps/web/public/models/city.glb` |
| **Original source** | [Sketchfab](https://sketchfab.com) (Creative Commons Attribution collection) |
| **License** | [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/) |
| **Commercial use** | **Permitted** under CC BY 4.0, provided attribution is preserved |
| **Modification** | Permitted with attribution |
| **Attribution requirement** | **YES — see below** |

### Required Attribution

> 3D city environment model used under [Creative Commons Attribution 4.0 (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
> Original model sourced from Sketchfab. EventFlow does not claim ownership of this asset.
> This model is used solely as a synthetic visual environment. It does not represent
> a real-world campus or venue and does not imply any real-world accuracy.

### Usage in EventFlow

- The model is loaded as a **visual environment/background** only.
- All safety logic, gate states, crowd simulation, and deterministic evaluation
  operate on EventFlow's own **semantic object layer**, which is independent of the GLB mesh hierarchy.
- The GLB is **never cloned** per world version. Only semantic state deltas are stored per version.
- The application includes a visible label: **"MODELED DIGITAL TWIN — SYNTHETIC VENUE GEOMETRY"**
  to prevent any false impression that the 3D scene represents a real venue.

### Do NOT

- Do not claim this model is owned by EventFlow or the EventFlow team.
- Do not distribute the model without this attribution.
- Do not use the model in a way that implies real-world spatial accuracy.

---

## Optimization Notice

If an optimized derivative (`city.optimized.glb`) is generated via tools such as
`gltf-pipeline`, `glTF-Transform`, or `meshoptimizer`, it remains a derivative work
of the original and carries the same CC BY 4.0 license terms.

Document the optimization command used:

```bash
# Example using gltf-pipeline (Cesium):
# npx gltf-pipeline -i apps/web/public/models/city.glb \
#   -o apps/web/public/models/city.optimized.glb \
#   --draco.compressMeshes

# Example using glTF-Transform:
# npx gltf-transform optimize apps/web/public/models/city.glb \
#   apps/web/public/models/city.optimized.glb \
#   --compress draco
```

The EventFlow application will automatically prefer `city.optimized.glb` when present,
falling back to `city.glb` if the optimized file is missing.

---

## Other Assets

All other visual assets (Three.js geometry, colors, UI icons from Lucide React) are
generated programmatically or licensed under their respective open-source licenses
(Apache 2.0 for Lucide React, MIT for Three.js).

---

*Last updated: 2026-10-31*
*Maintained by: EventFlow team*
