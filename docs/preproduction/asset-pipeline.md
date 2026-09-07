# Asset Pipeline

## Coordinate and naming conventions

- Blender unit scale: one unit equals one meter.
- The game and glTF use Y-up; Blender uses Z-up. Let the glTF importer/exporter
  perform the axis conversion rather than rotating the entire asset manually.
- Apply scale and rotation before export.
- Origins sit at the ground center for environment props.
- Names use `zone_category_asset_variant_lod`.

## Source and output

```text
art/blender/        editable .blend sources
art/concepts/       image references, never deployed
assets/source/      licensed source downloads
public/assets/      optimized runtime GLB, textures, audio
```

## Falls: procedural now, editable art next

Falls stone and water-sheet meshes are currently built once on zone entry by
`src/game/zones/falls/FallsScenery.ts`. Its fractured cliff surfaces retain their
authored bounds and flat landing heights. Mineral/moss colors live on vertices,
while one repeating stone texture supplies the fine surface detail. Recessed
stone liners close the joins around the cave without adding movement barriers.

For the next substantial environment-art pass, use a hybrid workflow:

1. Author the static cliff silhouettes, overhangs, roots, and sculpted surface
   detail in Blender. Keep separate visual and collision geometry.
2. Export optimized GLB chunks and load only the current zone's art. Preserve
   meter scale, origins, named interaction anchors, and the existing route
   clearances.
3. Keep flowing/parting water, spells, crystals, fish, NPCs, and puzzle state in
   code. Baking a live scene into one model loses those ownership boundaries.

A stored model avoids procedural construction work but adds download and decode
work. Once uploaded, equivalent geometry/materials have essentially the same GPU
cost. Mesh/material count, batching, texture size, shadows, and transparent
overdraw matter more than whether Blender or JavaScript authored the vertices.
See the [Three.js batching guide](https://threejs.org/manual/en/optimize-lots-of-objects.html).
Keep this choice measurement-driven; do not add a GLB loader merely to serialize
the same small procedural meshes.

### Editable geology reference

`art/blender/falls-geology-medium.glb` is a texture-free modeling reference
generated from the same mesh builders. It includes representative waterfall/cave
assemblies, a terrace, and small landings with named objects and meter-scale
dimensions. It is a geology study, **not a complete exported Falls level**:
foliage, lights, shaders, gameplay, collision registrations, and runtime batching
are absent. Its simple material tints approximate the runtime textures.

```sh
npm run art:falls -- medium
blender --background --threads 2 \
  --python scripts/render-falls-reference.py -- \
  art/blender/falls-geology-medium.glb
```

The exporter also accepts `low` and `high`. Blender writes a sibling editable
`.blend` and a 1024 × 768 Workbench `.png`, without baking or simulation. The
preview checks geometry and proportions, not in-game lighting or water shading.
Its camera, neutral ground, and `Preview tint` color attributes are inspection
aids; omit them from any future runtime export and retain the original imported
color attributes. Copy the `.blend` to a new authoring filename before hand edits,
since rerunning the preview script regenerates that file.

These files remain outside `public/`, so players download none of the reference
art. Interactive verification remains manual: climb the outer ledges and crown,
check the cave from behind, and open the waterfall before reviewing the chest
entrance. Check both Low and Medium/High for silhouette and material readability.

## Meshy

Use generated images for isolated props and the clean player base. Prefer a single
clean three-quarter source or Meshy's own consistent multiview output. Generated
turnaround sheets are design references; resolve inconsistencies in Blender.

## Blender review

- Confirm dimensions, origin, orientation, transforms, and manifold geometry.
- Separate render mesh and simplified collider.
- Consolidate materials.
- Remove unseen faces and tiny geometry.
- Verify animation names and root motion policy.
- Preview in Eevee or Workbench; avoid Cycles for routine validation.

## Behavior-ready exports

- Author each portal core and glyph as one surface with a dedicated translucent
  material slot. Runtime materials provide both faces; do not add back-to-back
  duplicate geometry to make the reverse approach visible.
- Keep the planning-table compass as a named, separately selectable object with a
  simple pickup proxy and useful local origin. Its meshes must remain raycastable
  after reparenting to the avatar's belt clip so direct removal can enter the shared
  telekinesis path. Do not merge it into the table during optimization; the HUD
  representation remains a UI asset.
- Give the void turtle a simple shell contact proxy and a named ride anchor. Keep
  bounce, ride, and dismount behavior in runtime state rather than baking one
  irreversible sequence into the asset.
- NPC locomotion clips must loop cleanly without baked route translation. Fish use one
  shared mesh suitable for instancing, with a silhouette that remains readable through
  the river material from the game camera.
- Keep the chest lid on its hinge pivot and the prize independently revealable. Coins
  use shared burst geometry/materials, while the opening flash remains a runtime light
  rather than a baked or per-coin light.

## Web optimization

- Export GLB.
- Deduplicate and prune.
- Use Meshopt or Draco where measurement shows a benefit.
- Resize textures before compression.
- Use KTX2/Basis for production GPU textures.
- Prefer a shared palette texture or vertex colors for stylized props.

## Licensing

Every external or generated asset must record its source, author, license,
attribution requirement, modifications, and local path in `asset-register.csv`.
Publicly visible VRChat content is not presumed reusable.

## Machine limits

Run one Blender conversion or render job at a time. Use 512–1024px validation
renders, bounded particle counts, and incremental compression.
