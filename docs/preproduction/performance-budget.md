# Performance Budget

## Network

| Stage | Budget |
| --- | --- |
| HTML/CSS shell and preview | under 1 MB transferred |
| First playable game runtime | target under 500 kB transferred |
| Later production zone | target under 1.5 MB transferred per zone |
| Initial audio | zero; load after consent and interaction |
| Void turtle ride media | external YouTube embed; requested only after mounting |
| Void turtle ride FX | one instanced trail (12/18/24), one meteor line batch (3/5/6), one halo, four fin joints, six bounded loose asteroids |

## Runtime

| Metric | Desktop high | Mobile low |
| --- | --- | --- |
| Frame target | 60 active / 30 idle | 30 FPS |
| Device pixel ratio cap | 1.5 | 1.0 |
| Visible triangles | under 150k | under 70k |
| Draw calls | under 75 | under 55 |
| Active animated NPCs | 4 | 2 |

- Keep terminal output to at most 320 rendered lines. Batch queued lines through one
  fragment and perform one scroll measurement per animation frame.

## Quality tiers

- **Low:** DPR 1.0, 30 FPS, no shadow pass, one uniform ambient fill, reduced stars
  and decoration. Entering Low also releases any cached Medium/High shadow target.
- **Medium:** DPR up to 1.25 and one cached 512px static shadow map.
- **High:** DPR up to 1.5 and one cached 1024px static shadow map.

## Lifecycle rules

- Pause rendering while the document is hidden.
- Throttle to 30 FPS while idle. HTML overlays lock world input but retain the
  same adaptive 30/60 FPS rendering policy as the unobstructed world.
- Clamp frame delta after tab switches.
- Dispose zone geometries, owned materials, material textures (including Sprite
  resources), and colliders through one deduplicating object-tree traversal.
- Batch compatible static meshes and monitor traces by material.
- Generate the Field Station's 256px ground grain and 768×448 atlas once during
  zone construction; never redraw either canvas in the frame loop. The ground may
  use mipmaps to prevent oblique-angle shimmer, while the close-view atlas remains
  non-mipmapped. Keep the map plane physically separated from its parchment and use
  depth bias rather than a second animated surface to prevent z-fighting. Shade tent
  panels through vertex colors on the existing canopy,
  keep all seams and guy lines in one line mesh, and batch the four stakes with
  other shared-material static geometry.
- Draw every Field Station desire path through one indexed curved-ribbon mesh and
  one reusable 128×512 feathered soil texture. Route overlap may deepen wear, but
  adding paths must not add per-route materials, draw calls, colliders, or frame
  updates.
- Render the world backdrop as one static warped line mesh plus one dynamic line
  batch for every floating grid fragment. Prebuild five three-section fragments,
  their two-stage tear trees, and their selection proxies; quality tiers expose
  2/4/5 intact fragments, while tearing only reassigns existing buffer ranges to
  independent bounded motion.
  At construction, keep the complete rectangular edge topology in the shared buffer,
  but mark authored holes, ragged borders, and all active components except the largest
  as hidden constraints. This prevents orphan strands from masquerading as handles
  while leaving every absent edge available to the pencil repair path without geometry
  allocation.
  Bounds/landing proxies live on a non-rendered layer; pointer checks raycast the
  already-batched visible lines only during pointer events. Reduced-motion mode
  disables autonomous drift and vertex ripple.
  Keep backdrop parallax on the static substrate transform so interactable scraps
  remain world-anchored. Twenty-five preallocated lightweight landing-surface records
  cover whole/combined/leaf states without adding render objects or a rigid-body
  dependency; activate them only for scraps deliberately dropped onto the current
  Field Station platform. Floating scraps keep the cheap procedural ripple path.
  On release, subtract whole-sheet solver recoil, retain only bounded relative fold
  velocity, and derive body throw momentum from a clamped low-pass sample of actual
  hand movement. Run two lightweight length-constraint passes and bake stable node
  coordinates as the temporary local rest pose. A free, unentangled scrap then eases
  toward its authored coordinates at the normal 30 FPS idle cadence without reactivating
  severed lines; a prop-snagged scrap keeps its wrapped pose and only rustles. Only the
  actively dragged scrap runs the full preallocated per-node Verlet net, using two
  constraint passes on low and three on medium/high. Compensate body translation and
  yaw into node-local coordinates so unpinned nodes retain world-space inertia. No
  topology or vectors may be allocated in the frame loop. Project fragment dragging
  onto one horizontal hover plane. Yaw the held body toward measured travel, keep its
  grabbed knot under the
  pointer, and sweep only that small knot against existing static colliders and non-grid
  surfaces during pointer events; the authored rectangle is not a rigid collision body.
  Only the held net pays for swept node projection against registered boxes and
  surfaces. Resolve lantern posts and the player as rounded node and rendered-segment
  boundaries so a visible strand cannot pass through a narrow obstacle between two
  legal endpoints. Project contacted nodes away from an obstacle, buckle excess length,
  pin only snag-facing nodes, and pull only the grabbed neighborhood;
  accumulated tension and bounded cross-grab handling fatigue may sever visible
  constraints. Promote that visible break to one of the two prebuilt seams so detached
  geometry always gains independent ownership, up to three draggable sections. A seam
  split gives the detached section an opposing separation impulse so the tear reads at
  gameplay scale, without adding a rigid-body dependency. Field spells may seed bounded
  per-node release velocity and accelerate unfurling, but never heal a constraint.
  Pencil-tip traces may reactivate prebuilt nearby constraints. After bounded trace
  energy, gather every active body in that fragment family into one owner, interpolate
  its existing piece offsets and nodes back to the complete rectangle, and restore the
  prebuilt tear tree; do not create replacement meshes, line buffers, or physics bodies.
- Carry one selected planning pencil by reparenting the existing physical prop between
  the active zone and the avatar's persistent satchel mount. Do not clone its geometry
  or material when equipping, detaching, respawning, or crossing a portal. Resolve
  click-versus-draw intent from pointer displacement only during pointer events; before
  zone disposal, auto-stow an unlocked loose pencil so its object tree is not destroyed.
  Releasing over the player reuses that same equip path and allocates no replacement.
- Build cyan-pencil teleport drawing from one fixed 81-point filament, one 64-segment
  indexed stroke ring, one fixed 14-segment glyph plus a matching 14-instance thick
  stroke batch, one 14-instance cylinder-pillar batch, one flash disc, one open light
  column, one two-point dynamic hand trace, one tracer, one aura, and one shadowless
  light. Update only draw ranges/counts, the two trace endpoints, fixed instance
  matrices, opacity, and scalar pose state while active; keep the helper hidden and at
  zero light intensity otherwise. Reduced motion does not render the pillar batch or
  beam.
  The HTML folio is event-driven and must not add a render-loop observer.
- Render binary spell storms as two preallocated point batches. Charge and spell stage
  may change the active draw range, point size, and spread, but must not allocate more
  particles; Surge's dense violet/cyan treatment stays within those batches. Keep all
  lightning in one line batch.
- Render sprint dust through one global preallocated point cloud with 18/30/42 active
  slots on low/medium/high. Emit from measured grounded travel, reuse ring-buffer
  entries, and keep the cloud hidden when no particles remain.
- Render river fish as one instanced mesh. Keep animated NPCs within the quality-tier
  cap and four tiny local loops; lower tiers may reduce counts but must retain visible
  motion in inhabited zones.
- Ground the Space Archive pinball asteroid with one unlit circle mesh whose transform
  and opacity follow the existing kickable state. Do not enable a moving shadow-map
  caster for it.
- After WRONG ADDRESS, retain that asteroid and its one circle shadow outside inactive
  zone trees. Only its current world registers a kickable record; other worlds hold no
  duplicate mesh, collider, shadow, or per-frame update.
- Use one translucent, double-sided surface for each portal core or glyph rather than
  duplicate front/back geometry, and share compatible palette materials across portals.
- Share one cube-rematerialization implementation across Grid and Mightymatica.
  Each active arrival may add only three transient line frames and one 16-fragment
  instanced scanline batch; all stay hidden while idle. Reduced motion skips those
  transients and settles the existing cube visuals through a short opacity/scale pass.
- Pool the chest-open coin/light burst as one bounded particle or instance batch plus
  one brief shadowless light, with no per-coin shadows, lights, or colliders.
- Render all interactive rune tinkles through one 36-point circular pool and one
  shared, brief shadowless light. All six cache candidates reuse one five-shard
  transform template, with facets and cores instanced per cluster plus one bounded
  aura and ground glow. After shattering, required runes reuse five transparent
  raycast proxies that drive their existing rendered instances; decoys expose five
  lightweight visible shard proxies. Neither route allocates lights or unbounded debris.
- Reuse one Falls splash ring and at most 18 instanced droplets for high dives. Avatar
  rest and recovery use scalar pose blends on the existing rig.
- Keep Thunder's sky strikes and Grid rack chain inside one preallocated 96-segment
  line buffer and one shadowless point light.
- Keep the observability log cascade to one reusable 30-entry point batch and one
  procedural 256px texture. Spark does not render it; quality and reduced-motion tiers
  lower the active draw range without allocating new entries.
- Render the Archive heliograph route as two preallocated six-segment ribbon batches
  plus one six-instance packet batch. The sixth slot supports a bounded cyan-to-CRT
  or amber-to-void continuation after a lens detent. Rebuild ribbon vertices at most
  once per rendered frame while a prism is pointer-aimed; do not create one mesh per
  beam segment. Only the cyan CRT impact uses the endpoint flare: one core, one ring, and
  one eight-instance fragment batch. Amber runs beyond the camera without an endpoint
  marker. Free aim scans the already bounded Archive collider array only while route
  geometry is rebuilt, and reuses one core-and-ring diffraction marker for solid
  hits; it performs no frame-loop scene raycasts. Keep its four progress pips and six resolved stars
  in one instance batch each. The decoded sky uses two preallocated ten-segment
  ribbon batches, one shared low-detail icosahedron geometry for its dark body and
  wireframe limb, and three partial torus arcs. Intermediate ring feedback reuses one
  bounded capture-column mesh. Rooted prism bodies and the heliograph frame remain
  eligible for static merging while only the four aiming apertures stay dynamic.
- Test avatar interruption against the six cached route segments without raycasts or
  per-frame allocation. Truncate the existing batches with draw ranges, render the
  interrupted segment in two reusable one-segment ribbons, and keep impact feedback
  to one core, one ring, one body shimmer, and at most eight instanced fragments.
- Model the Archive traffic-glass cap as one narrow rectangular landing record over
  its existing blocker. Close the monitor/glass collision pocket with one static
  climbable service-box group; neither feature needs a per-frame update.
- During Event Horizon, replace intact Archive optical ribbons with one reusable
  24-instance box batch. Emit one short light fragment per source segment on low, two
  on medium, and three on high. Fade the original collector shafts, phase ribbons,
  feedback, false-route flare, and constellation through the same fracture envelope;
  allocate no collapse-only beam meshes at runtime.
- Keep the heliograph collector to one low-segment lathed glass dish, one static rib
  line batch, one merged four-contour-and-index-tab mesh, and three translucent shaft
  meshes. Its activation is scalar-driven and allocates nothing per frame. Hide the
  broad focus cone on low quality. Wrong-order feedback may retrigger at most two
  follow-up ring pulses per route change; it must never maintain an unbounded
  scan/cascade loop. Composite the collector and shafts in the existing late avatar
  layer so depth resolves player overlap without adding another scene render.
- Keep the focused-beam avatar reaction to one 12-instance low-poly flame batch, one
  wireframe heat shell, one shadowless point light, and one reusable 24-entry ember
  point pool. Quality limits active flames/embers to 6/12 on low, 9/20 on medium, and
  12/24 on high. Reduced motion uses six static flames, suppresses emitted embers, and
  replaces the ground roll with a short startled run. The panic choreography is a
  scalar sampled state sequence with no animation clips or runtime allocations;
  ignition changes no health, inventory, or progression state.
- Keep escaped Falling Solids glitches to one preallocated 72-instance box batch.
  Quality emits 7/11/16 short-lived voxel or scanline records per dissolve; inactive
  records have zero-scale matrices. The source instance flickers and contracts in
  place, then uses one scalar scale-in when reset—no textures, per-solid meshes,
  post-processing pass, or runtime object allocation.
- Keep Archive space-pinball physics to the quality-visible orbit records and at most
  ten planet-pair checks on high quality (six on medium, one on low). Reuse one world
  vector per record, update scalar spring/impact state in place, and cap active space
  asteroids at five shared kickable records. Planet pointer picking may allocate only
  in pointer events, never the render loop. Do not add a general rigid-body dependency.
- Keep the Archive order and ascension responses to one normally hidden ring, one
  additive four-point star mesh, existing atlas materials, and one shadowless point
  light. Before ascension its intensity is zero outside the 1.65-second restoration
  pulse; afterward a low persistent silver glow may remain without adding a light.
  Read ascension from the existing airborne-peak scalar after the bounded planet update;
  do not add contact history or landing gates. The shell may retain one deferred toast
  record so an atlas observation waits behind an active achievement without adding a
  render-loop allocation.
- Render the Archive traffic cage with one 512×256 non-mipmapped canvas texture and
  one transparent plane. Animate texture offsets and opacity only; never redraw the
  canvas in the frame loop. Keep frame rails on shared opaque materials so they batch.
- Keep terminal rune diagnostics to one reusable 37-point path and one packet mesh;
  rune arrivals reuse the existing sparkle pool and shared tinkle light.
- Reuse that same 36-point rune sparkle pool and one aggregate tinkle light when a
  Falls spell flashes nearby crystals. At most six intact cluster records are checked
  per cast; quality limits each cluster to 3/4–5/5–6 points so the pool never grows.
- Keep spell-reactive fish on their existing instanced meshes and procedural paths.
  One scalar envelope and one stored cast point temporarily blend only in-range fish
  toward bounded swirl targets; no bodies, path copies, or per-frame objects are
  created, and reduced motion scales the attraction to 34%.
- Keep each movable Hanoi cash coin—including its square-holed body, rim, collar, and
  marks—to one merged mesh. BUFFER and SETTLE each use one bounded signal group; the
  deck, three coin stacks, and three toggled peg-tip records use simple computed
  surface heights and no compound collider or physics body.
- Build Falls vegetation from shared opaque materials so trunks, crowns, bushes,
  vines, ledges, and route marks collapse into the existing static batches. Bound
  trees/bushes/vines to 6/10/4 on low, 8/14/6 on medium, and 10/18/8 on high; landing
  surfaces and colliders remain lightweight data records. Measure climbable world
  bounds only during zone construction using the existing reusable `Box3`; never
  recompute mesh bounds in the frame loop.
- Use one shadowless player-lantern light and opacity-only reveal stencils.
- Represent the turtle's storm clue with one static low-poly stone and one
  opacity-only lightning shape in the existing lantern-reveal update. Sleeping and
  waking swap visibility between one two-segment eyelid mesh and the existing
  instanced eyes; neither state adds a light or per-frame allocation. Keep the
  turtle's four fins on reused low-poly geometry and cap its collectible system at
  six shared-material kickables. Captured stones bypass general kickable integration
  while orbiting; pointer release converts existing drag velocity into scalar
  radial/tangential state without a rigid-body dependency or render-loop allocation.
- Keep static shadows cached; represent the moving player with one blob shadow and
  normally hidden geometry-following rim replicas sharing one shader material. Test
  occlusion only against the small zone-owned registry, never the full scene graph.
  Climbable rendered solids join that registry when their collision/surface record is
  created, while translucent covers such as waterfall panels opt in explicitly.
  Register each Signal Grid rack as one recursive group; intentionally transparent
  climbables such as the Archive star atlas opt out.
- Hold the river monument's already allocated ring, beam, flare, and light state while
  its portfolio dialog is open. The hold uses the normal 30 FPS overlay cadence;
  only its bounded opening and close wind-down request 60 FPS.
- Keep Buffon's control boundary to four shared-material tape planes and one
  non-mipmapped 256×64 procedural texture. Player contamination mutates only existing
  bounded instance records; direct button picking runs only on pointer events.
  Surge and Thunder may relaunch the existing needle instances, but activate them in
  quality-scaled 24/40/56-record chunks (Thunder may raise a chunk by 35%) rather than
  rebuilding geometry or waking all 720 records in one frame.
- Keep Infinite Chocolate manipulation to one invisible four-instance picking proxy
  with one fixed roaming broad-phase sphere and precise per-instance ray tests.
  Detailed slab meshes remain independent. Bake the board's non-uniform cell scale
  below each slab's uniformly transformed rotation wrapper so loose pieces never
  shear. Drag, throw, proximity-falloff spell impulse, world bounds, and magnetic
  arrangement snapping update only the four scalar piece records. Resolve the six
  possible slab pairs with at most two bounded OBB/SAT passes per active update;
  fixed cut/seam helpers fade while the arrangement is disturbed.
- Avoid per-frame allocations in movement and camera loops.
- Load only the active zone and a small shared player kit.

## Vertical-slice measurement

The production build records output file sizes. Browser verification checks desktop
and 390px layouts, console errors, canvas dimensions, horizontal overflow, and
resource transfer. `npm run build` rewrites the marked artifact-size block using
level-6 gzip; runtime draw-call observations remain manual.

Measured on the vertical slice:

<!-- build-metrics:start -->
- Shell JavaScript: 53.78 kB minified / 18.10 kB gzip.
- Shell CSS: 80.83 kB minified / 18.26 kB gzip.
- In-page hero: 252.69 kB WebP (the 528.42 kB JPEG remains social metadata only).
- Lazy game code: 570.04 kB minified / 164.40 kB gzip.
- Nested Mightymatica code: 85.18 kB minified / 26.19 kB gzip.
- Lazy Three.js: 589.00 kB minified / 148.09 kB gzip.
- First-playable JavaScript after the shell: about 312 kB gzip.
<!-- build-metrics:end -->
- General-purpose WASM physics payload: zero; top-down collision is local game code.
- Verified scenes: 43–72 calls across exploration positions, below the 75-call
  desktop budget.
