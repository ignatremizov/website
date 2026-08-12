# Asset Pipeline

## Coordinate and naming conventions

- Blender unit scale: one unit equals one meter.
- Y is up; glTF forward is +Z.
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
