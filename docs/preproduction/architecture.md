# Technical Architecture

## Stack

- Vite and TypeScript.
- Three.js with `WebGLRenderer` as the compatibility baseline.
- A purpose-built circle-vs-box solver for top-down collision and wall sliding.
- Blender-authored glTF/GLB assets after the greybox is accepted.
- Semantic HTML/CSS for entry, portfolio, field folio, dialogue, terminal, controls, and
  fallback content.

## Loading

The HTML shell and Quick Portfolio load first. The landing gate states that the world
is an in-browser interactive 3D experience; Three.js and the small game module are
pulled through a dynamic import only when the visitor activates that gate. Landing
markup does not duplicate zone navigation owned by the in-world atlas.
On narrow portrait screens, the idle shell uses a deliberately short scroll: the
physical arch and centered gate occupy the opening view, while the identity panel and
all three quick facts continue below it. Entering the world resets that scroll before
the fixed-height canvas runtime starts.

The mobile terminal sizes itself from `VisualViewport` height and offset data, with
`interactive-widget=resizes-content` as the browser-level preference. This keeps its
input row above an open software keyboard while preserving a scrollable output pane.
It uses a native modal dialog, restores the invoking control on close, batches new log
nodes once per animation frame, and retains at most 320 rendered lines.

Mightymatica is a nested dynamic boundary inside the already-lazy game. Its module is
prefetched during the Grid cube's reconstruction boot or loaded immediately before an
explicit terminal alias or discovered atlas teleport. The initial Field/Falls/Grid/
Archive game chunk does not include the exhibit implementation. The two lazy entry
chunks use stable `PortfolioGame.js` and `MightymaticaZone.js` filenames so rebuilding
the preview while a tab remains open cannot strand that tab with a stale hashed import;
other assets retain content hashes.

## Modules

```text
main
├── shared world vocabulary (zones, aliases, quality, spell/status types)
├── shell and dialogs
├── canonical terminal command and alias registry
├── versioned discovery/visit persistence
├── versioned achievement, progression, and world-preference stores
├── portfolio content
├── terminal UI
└── game runtime (lazy)
    ├── PortfolioGame orchestration, renderer, physics, zones, and camera
    ├── InputController lifecycle
    ├── allocation-free surface candidate selection
    ├── shared synchronous/async world-action failure boundary
    ├── pure versioned-progress normalization and legacy reconciliation rules
    ├── scene-level AmbientGrid cloth, tearing, repair, and finale transforms
    ├── bounded WorldCollapseSequence phase envelopes and destruction visuals
    ├── bounded PencilTeleportRitual visual
    ├── shared scene primitives and resource disposal
    ├── stateful world props (for example RuneAltar)
    └── math (lazy from the game)
        ├── Mightymatica zone shell
        ├── archive-faithful Pythagoras curator
        ├── Mind Reader exhibit
        ├── Buffon Needle exhibit
        ├── Infinite Chocolate dissection
        ├── bounded Sierpiński corner
        ├── Falling Solids runtime
        └── cube-return aperture
```

`world/WorldContracts.ts` is intentionally Three.js-free and is the single source for zone IDs,
aliases, labels, quality tiers, ordered spell ranks, and world-status types. The eager HTML
shell and both lazy runtime layers may import it without pulling renderer code into
the landing bundle. `WorldNavigation` owns parsing and persistence of versioned
discovery state; the shell reacts to its first-visit/first-discovery result without
mutating storage collections directly. `PortfolioGame` remains the integration
boundary for shared physics and progression; self-contained props with their own
animation state belong in focused modules and expose an object, update method, and
narrow hooks rather than adding another state cluster to the controller.
`SurfaceSelection` is the first extracted physics seam: it selects active, descending,
and grounded surfaces in one reusable scan rather than allocating and sorting candidate
arrays in the frame loop. `TerminalCommands` similarly owns canonical commands and
aliases so parsing, completion, `which`, and `man` alias lookup resolve consistently.

Every world interaction that may return a promise passes through one failure boundary.
Synchronous throws and rejected lazy-route imports become a recoverable world status;
portal dwell state is reset so the player can retry without reloading. Failed initial
construction also disposes its partial scene and WebGL renderer before the shell offers
another attempt. The shell applies its landing-page renderer fallback only to that
initial construction boundary. A later navigation rejection leaves the existing game
and HUD mounted so the caller can report the route failure and retry it.

`AchievementLedger` owns the milestone catalog, validation, first-unlock semantics,
and versioned local serialization; the shell only renders its snapshots.
`WorldPreferences` similarly owns parsing and persistence for contrast, optional
motion reduction, and HUD telemetry. `WorldProgress` stores only scene-independent
upgrade dependencies: spell rank, Packet Interference, latched Pong/Archive challenge
results, and the current/source zones of the traveling WRONG ADDRESS asteroid. Pure
rules normalize partially written state and reconcile legacy achievements upward
before either the shell or renderer consumes it. The game receives one normalized
initial snapshot and emits a complete replacement snapshot after each mutation; it
never reaches into browser storage. The field folio consolidates the former map and
quality surfaces: all map requests select its Atlas tab, while runtime hooks feed its
read-only diagnostics without coupling the renderer to DOM controls.
All shell persistence modules acquire guarded browser storage through one
`browserStorage` boundary. Versioned stores retain their own schema validation while
privacy-restricted storage access remains handled consistently.

## Physics

The player uses a 2D circle collider against simple world boxes, with subdivided
movement to prevent tunneling and axis-separated resolution for wall sliding. Noclip
bypasses collision correction but preserves world bounds. A general 3D physics/WASM
runtime is intentionally unnecessary for the flat top-down world.

Variable-height supports such as the tent canopy and stacked Hanoi coins resolve
descent from signed clearance at both the previous and current horizontal positions.
This catches a player crossing an uphill surface during the same frame. Jump takeoff
detaches from the support and converts its elevation into world-space jump height, so
slopes and stepped stacks cannot pull an airborne player downward. Collision-debug
landing lattices sample the same `heightAt` functions instead of drawing misleading
flat rectangles.

## Interaction and progression state

- Navigation state is versioned separately from active scene geometry. Field, Falls,
  Grid, and Archive begin indexed; Mightymatica is added to both `discovered` and
  `visited` on first arrival and persisted in `portfolio-world-navigation`. Atlas
  visibility, shell listings, help, and completion all read the same set. The command
  parser separately accepts exact `math`/`mightymatica` aliases as an unadvertised
  route before discovery. The game receives a read-only discovery hook so a known cube
  can rebuild directly into its active form.
- Cube reconstruction is session state until the player crosses. The first
  interaction preloads the Math module, changes the cube materials, removes its
  blocking collider, and registers a dwell crossing. It does not itself record
  discovery. Once the player arrives, persisted discovery makes later Grid rebuilds
  start with the aperture active.
- Physical Grid ↔ Math travel preserves the origin zone. That origin selects both the
  matching cube-side arrival anchor and one shared bounded rematerialization helper:
  stable portal visuals scale in while three transient wireframes and one 16-instance
  scanline batch assemble around them. Both registered cores collapse inward on
  departure. Terminal travel—including a pre-discovery secret alias—and discovered
  atlas travel use neutral spawns and do not trigger the physical-cube effect. Math
  still registers its custom square core with the shared dwell detector without
  invoking the ordinary round portal renderer.
- Terminal `cd` and `tp` deliberately cross different boundaries. `cd` invokes the
  existing immediate zone transition and commits the modeled working directory only
  after the destination has actually settled. A rejected or interrupted crossing
  therefore leaves the prompt at its real location. `tp` first asks `PortfolioGame` whether the
  session-owned cyan pencil is still worn, then closes the terminal and starts one
  `PencilTeleportRitual`. That scene-level helper reuses fixed circle/glyph buffers,
  one thick indexed ring, instanced glyph strokes, one instanced segmented-pillar
  batch, one flash disc, one translucent beam, one two-point hand trace, one tracer,
  one aura, and one light. The game owns only the input lock, character pose blend,
  lazy Math readiness, departure/veil timing, and final zone build. The actual pencil
  is temporarily reparented from its satchel loop to the drawing hand and restored
  before active-zone disposal.
- The river monument owns an explicit idle → opening → holding → closing lifecycle.
  Its portfolio request moves it into a sustained active hold; the HTML dialog's
  native `close` event notifies the current game instance to begin the visual
  wind-down. Directly opened portfolio dialogs are harmless because an idle monument
  ignores that notification. The hold remains at the normal overlay frame cadence;
  only opening and closing request the higher animation cadence.
- Compass ownership is session state, separate from the active zone. Before collection
  the planning-table compass exists in the world and the HUD compass is hidden; a
  successful pickup disables its kickable state, reparents that same object to the
  avatar's right-belt mount, and reveals a live heading. The worn prop has its own
  direct raycast path because it is intentionally absent from active-zone kickables.
  Avatar yaw zero faces world `+Z` (south), while world `-Z` is north; heading
  conversion therefore uses `π - yaw` so clockwise screen turns remain clockwise on
  the compass. The HUD needle unwraps each eight-way heading to the nearest equivalent
  angle, so crossing north continues through 360 degrees instead of reversing through
  a full circle. First acquisition snaps while hidden; subsequent headings retain the
  short CSS transition.
  Dragging it begins by reparenting it into the active zone, recreating its lightweight
  kickable record, clearing ownership, and hiding the HUD before normal telekinesis
  takes over. Recollection reverses that transition. Zone disposal must not revoke or
  dispose a worn compass, but a fresh page load must. Loose recovery restores a world
  transform without silently granting the HUD.
- The turtle's automatic shell bounce is eligible only for player contact over the
  void. Riding is a separate, mutually exclusive state entered by explicit interaction
  after Thunder; normal movement and further bounce handling remain suspended until a
  safe dismount. The ride state machine is parked → departing → cruising → returning →
  dismounting. Departure expands into the outer orbit once rather than dipping back to
  the station every lap, and cruising has no automatic lap limit. Dismounting eases the
  turtle back to the current orbital bearing, interpolates the player's step to the
  platform edge, and makes that bearing the turtle's next stationary ride anchor.
- Completing the Falls sequence only removes the cave seal and parts the water.
  Chest opening is the one-way Surge transition: it raises the lid, reveals the
  prize, emits one coin/light burst, grants Surge, and reconciles any already-latched
  Pong/Archive results. Later inspection must not replay the opening or reward.
- Pong and Archive completion are separate latched results. Pong completion is
  presented as one mark; Archive completion is its answering signal. Each valid result
  is recorded immediately without clearing or synthesizing the other. Reconciliation
  may unlock Packet Interference, but never grants Thunder automatically. Once Surge
  and both records exist, the Daemon Controller interaction becomes the sole normal
  claim boundary and grants Thunder idempotently; command overrides remain sandbox
  exceptions. The ordering of Pong, Archive, and Surge remains unrestricted. Normal
  claiming starts the Grid-local reliquary release before persisting the spell rank:
  preallocated cage pieces burst from their authored transforms, one reusable line
  arcs from the contained orb to the avatar, and the prop settles into its released
  state. Its detailed idle silhouette remains bounded to one instanced winding batch
  per coil tier plus one quality-scaled reusable filament buffer inside the glass
  globe. Rebuilding a Grid whose save already contains Thunder constructs that final
  state directly.
- Pong rebounds derive vertical direction from contact offset and paddle velocity,
  then accelerate horizontal rallies within tunneling-safe caps. The Daemon
  Controller's coral hand samples a delayed linear intercept and therefore remains
  strong against direct shots but can be beaten by late banked trajectories.
  DAEMON SLAYER requires an active first-to-three
  victory with no Interference. PACKET LOSS likewise requires an active match won
  after Interference. Loose-ball kicks and drags retain physical reactions and
  Controller speech but cannot increment either official score or synthesize a
  milestone. Active ball dragging sets the match's Interference flag but never extends
  the paddle-glitch timer; only the Surge/Thunder cast path owns that timer. On a
  daemon victory, pointer capture is cancelled, control is disabled, and a short
  cyan-paddle defeat timer drives the same shrink/flicker visual language without
  corrupting the coral paddle.
- The traveling WRONG ADDRESS asteroid remains an ordinary kickable until its swept
  movement segment intersects the Pong packet. At contact, the existing asteroid
  becomes the packet visual and collision radius, the displaced packet receives one
  bounded ejection, and the rally inherits a capped playable velocity. The traveling
  object stays owned by its cross-zone record throughout the match. Match resolution,
  table exit, and zone teardown restore it to world physics before persistence or
  disposal; a rogue-packet victory always counts as Interference.
- Direct Pong dragging ray-projects mouse or touch coordinates onto the horizontal
  court plane, converts that point into court-local space, and captures one dedicated
  pointer until release or cancellation. A small grab offset prevents snapping, a
  bounded follow speed preserves fair paddle motion, and the existing per-frame
  paddle-velocity calculation continues to drive slice angles. This pointer remains
  independent from the touch joystick.
- The checksum Hanoi puzzle stores each peg as a bottom-to-top coin-index stack.
  Picking removes exactly the last entry, placement rejects a larger index over a
  smaller one, and reset restores `[[2, 1, 0], [], []]`. Reset requires a second
  confirmation within a short arming window. A full BUFFER stack latches an optional
  checkpoint independently from final SETTLE completion; neither reward mutates the
  required spell-progression records. SETTLE completion is a latched reward flag,
  not an interaction lock: legal peg movement continues, and the independent BUFFER
  checkpoint can still be reached afterward without resetting the tower.
- Each Hanoi peg owns one allocation-free step surface whose height is computed from
  the current stack and the player's radial position. It returns deck height outside
  a coin's radius, preventing body clipping without adding compound physics bodies.
- Three preallocated peg-tip surface records remain disabled with negative bounds
  unless their peg owns the complete stack. The enabled record uses the modeled cap
  height and jump-only landing rules.
- Before active Grid geometry is disposed, the Hanoi controller deep-copies all three
  stacks, move count, checkpoint, and completion into scene-independent session state.
  Rebuilding Grid restores coin peg/level transforms from that snapshot. A carried
  coin is returned to its source stack, and transient reset confirmation is discarded.

## Rendering

- One directional light, one hemisphere light, one low-tier-only ambient fill, one
  shadowless player-lantern point light, and one normally-zero Archive atlas pulse
  light; world lanterns remain emissive meshes rather than individual lights.
- Runtime quality changes keep the renderer shadow feature enabled so compiled PBR
  material programs remain stable. Low quality disables casting on the directional
  light itself, skips shadow-map allocation on a low-first visit, releases an existing
  cached map when stepping down from a higher tier, and enables the uniform ambient
  fill so dark batches and the avatar stay readable. Returning to medium/high
  invalidates lit materials once and refreshes the correctly sized cached shadow map.
- Static geometry and monitor traces are batched by material.
- Falls trunks, crowns, bushes, vines, parkour supports, and route marks remain static
  and enter the existing material batches; quality selects bounded object counts when
  the zone is built.
- Before that batching pass, each climbable Falls mesh is measured once into the
  engine's reusable `Box3`. The resulting world bounds create both its vertical-aware
  static collider and matching top surface. Decorative rock supports receive their
  own measured bounds; floating slabs no longer imply a full-height invisible column.
  A bounded descent-only clearance on those colliders lets the true top-crossing test
  win the landing frame without broadening the resting footprint.
- Portal cores and glyphs use translucent double-sided materials and stable transparent
  ordering so neither approach direction loses the surface or symbol.
- Player visibility uses a dedicated camera-to-avatar ray against a deliberately tiny
  registry of meaningful occluders. Opaque climbable visuals register alongside their
  collision record; waterfall sheets, Pythagoras, and complete Signal Grid rack groups
  opt in explicitly, while transparent climbables such as the star atlas opt out.
  Occlusion suppresses the ground blob and enables geometry-following rim replicas
  with one shared depth-tested shader material; it never traverses the full scene.
  The Archive heliograph collector and its transparent shafts share the avatar's late
  render layer. The avatar writes depth before the glass is composited, so apparent
  front-to-back ordering stays stable when the occlusion reveal pass switches on.
  The collector dish also retains the dedicated pointer layer for direct activation.
- Mightymatica owns its textures and frame update through an isolated runtime that is
  disposed before the shared zone group. The 512-cell Sierpiński floor, at-most
  4,096-cell whole-subcarpet corner patch, at-most 720 Buffon needles, and five
  Platonic-solid families are bounded instanced draws. Chocolate out of nothing uses
  four exact extruded shapes and four batched clipped-cell caps because its recovered
  5 × 8 cut geometry is the point of the exhibit. One recessed underlay turns the
  conserved diagonal area into a readable groove rather than a see-through gap.
  Four mutable collider records and four polygon-tested landing surfaces reuse each
  slab's existing transform and footprint data; no secondary rigid-body engine or
  per-frame registration churn is introduced.
- Quality limits active falling solids and caps Buffon samples at 240/480/720.
  Reduced motion settles ambient falling solids, slows cube/core rotation, settles
  progressively emitted needles without a fall, and reveals short exhibit transitions
  immediately.
  Ambient Math motion remains on the 30 FPS idle cadence; active needle falls and
  short chocolate/Sierpiński transitions or Falling Solid dissolve/rematerialize
  lifecycles request 60 FPS only until settled.
- Zone teardown traverses the active object tree once, deduplicates geometries,
  materials, and material-owned textures (including Sprite resources), and excludes
  the shared palette materials by ownership predicate. Zone controllers still cancel
  pending asynchronous work before that traversal. Delayed teleports check runtime
  disposal after every await and cannot rebuild a scene after teardown. Both
  teleport-visual helpers make stop/dispose idempotent, so a delayed `finally` block
  cannot touch already-released GPU resources.
- Buffon's Canvas scoreboard is dirty-driven and throttled while counts change.
  Completed and untouched stations perform no recurring redraw or texture upload.
  Its four tape planes share one 256×64 non-mipmapped procedural texture; only texture
  offset and four vertical transforms animate during collection. Intrusion reuses the
  existing bounded needle instances, adding scalar horizontal velocities rather than
  debris objects or a physics dependency.
- Math may register a small direct-pointer action against an explicit scene object.
  Pointer actions are proximity-gated, ray-tested only during pointer events, protected
  from static batching, and retain the normal E/Enter/touch interaction route for
  accessibility.
- The original Mind Reader photograph and Pythagoras's exact embedded body are the two
  recovered rasters loaded in the opening runtime. Pythagoras composites that body
  into a high-resolution Canvas with XFL-positioned vector-style facial and hand
  overlays; the recovered atlas remains a non-runtime preservation reference. The symbol chart is
  a zone-scoped Canvas texture regenerated per round; all multiples of nine receive
  one target glyph while other cells are deterministically varied. Pre-reveal UI
  exposes only the five-step ritual, while invariant copy is gated behind a completed
  reveal. One shared answer Canvas texture fades and scales into both the photographed
  orb and the separate 3D crystal ball.
- Achievement status carries an optional short title independently from its
  descriptive journal copy. Toasts, live-region announcements, and terminal history
  preserve that title, allowing labels such as TO THE MOON, WORTH IT, DAEMON SLAYER,
  and IT'S NOT CHEESE without duplicating instructions in the description. The shell
  forwards first unlocks to `AchievementLedger`; its versioned records feed the folio
  viewer, while locked catalog rows expose neither their title nor solution.
- A released cast snapshots its accumulated charge. That value scales digit count,
  point size, spatial spread, range, and force; spell stage supplies the palette and
  baseline density, with Surge using a dense violet/cyan mix.
- The observability event uses one preallocated 30-point log-sprite batch and one
  zone-scoped 256px procedural texture. Quality and motion preferences bound its draw
  range; Surge and Thunder only alter count, palette, travel, and duration. A resolved
  heliograph route indexes immutable authored sky points instead of normalizing its
  own route coordinates, keeping the decoded answer semantically and visually
  separate from the puzzle input.
- Archive relay pointer proxies live on the dedicated interaction layer and carry no
  avatar-distance gate; screen projection and pointer intersection determine reach.
  Continuous free aim resolves against finite-height static collider AABBs through a
  pure horizontal-ray helper only when route geometry changes. The nearest solid
  endpoint reuses one diffraction marker, while a miss receives the fixed far-void
  endpoint. Controller narration snapshots prior route membership so an inactive
  relay cannot describe a carrier it never received.
- The terminal rune diagnostic reuses one preallocated 37-point line, one packet mesh,
  and the existing rune sparkle/light pool. It reads rune transforms but never calls
  puzzle activation, so diagnostic traces cannot advance or fracture the ritual.
- Ritual socket placement reuses the shared kickable/telekinesis simulation. Required
  and decoy crystals carry affinity metadata; every intact cluster can seat, while only
  a matching affinity grows mineral roots and advances the chord. Every candidate can
  accumulate stress and shatter. A shattered required
  cluster disables its whole-object handle and enables five invisible raycast/physics
  proxies that drive the existing instanced shard matrices until reset; decoys expose
  five lightweight visible shard proxies so their breakability does not identify the
  solution.
- Telekinesis queries the same enabled and optional polygon-tested landing surfaces
  used by player traversal, choosing the highest support in one allocation-free scan.
  Release revalidates the candidate so a moving or disabled Math surface cannot catch a
  prop after it has ceased to exist. Non-gravity objects use their resting radius as
  support offset, allowing the Archive asteroid to travel over and settle on consoles
  rather than intersecting them.
- Touch movement and canvas telekinesis own independent captured pointers. Ordinary
  loose props keep one shared hand, while Archive planets use a pointer-keyed hold map
  plus a held-planet set. Every active planet hold owns its own projection plane, grab
  offset, previous point, timestamp, and release velocity; one pointer cannot steal a
  planet held by another. Pointer release removes only its matching hold, and global
  cancellation releases all captures without disturbing the separately owned joystick.
  Overlay entry, respawn, zone teardown, Pong mode changes, and the finale all pass
  through that one cancellation boundary. Cursor ownership is derived from every
  active drag rather than whichever pointer happened to finish last. Cancelling the
  spell HUD pointer aborts its charge; only an intentional pointer-up casts it.
- Archive planet pinball extends each existing orbit record with scalar radial
  displacement/velocity, impact decay, cooldown, and one reusable world-position
  vector. Player and asteroid contacts resolve directly against those records;
  visible planet pairs use a bounded pair pass to exchange radial and tangential
  momentum. Each pointer drag maps its own cursor/touch plane back into polar
  coordinates; its release vector is projected onto radial and tangent axes rather
  than reparenting the planet or adding a rigid body. Scalar springs restore the base
  radius. A dwell
  check across those same records drives one pooled atlas ring and normally-dark
  point light after all modifiers settle.
- The emergent player-launch behavior remains part of Archive pinball. The hidden
  ascension milestone reads the already-maintained world-space airborne peak and
  completes as soon as a non-noclip player crosses the fixed line above the highest
  orbit. It does not count contacts or prescribe whether moving, clumped, or
  Thunder-locked planets formed the route. The Archive update emits the achievement
  after contact chatter. Atlas landings keep their ordinary observation and mark it
  `after-achievement`; the DOM toast controller defers only that visual presentation
  behind an active achievement while journaling and live-region output remain
  immediate. Rigid contacts resolve
  penetration every frame but gate relaunches behind the existing per-planet cooldown,
  allowing a deliberate bounce ladder without a per-frame impulse loop. Spark and
  Surge clear that scalar rigidity before applying radial/tangential impulses; Thunder
  damps those same scalars and lowers their shared motion multiplier. The completion
  latch survives zone rebuilds for the current game instance without adding another
  per-frame allocation or physics body.
- Floating Archive asteroids reuse the existing kickable records with gravity off,
  a bounded room radius, and long damping. The floor challenge asteroid and four
  floating bodies share the planet-impact pass; only the floor asteroid remains
  eligible for monitor/portal progression.
- WRONG ADDRESS detaches the existing floor-pinball object from the disposable Archive
  zone before teardown. A small persistent route record owns its current zone, incoming
  zone, transform, velocity, and portal cooldown. Only current and incoming zones enter
  browser storage; live transforms remain in memory. On zone construction the same
  object tree is attached to the active zone, registered with the local kickable field,
  and placed just inside the counterpart portal. No replacement mesh is created during
  an in-session transfer.
- The Archive traffic wall is one transparent double-sided plane using a zone-scoped
  512×256 canvas texture. Runtime motion changes only texture offsets and material
  opacity; the canvas is never redrawn per frame. Opaque brass rails and dark cables
  use shared materials and enter static batching. Its thin collider matches the cage
  instead of the removed 1.2-unit opaque wall.
- Falls climbable colliders clear at visible-top minus roughly 1.5 centimeters.
  Landing resolves only on a downward world-foot crossing, with a bounded support
  margin for the visible boot. Platform exit preserves vertical velocity while
  converting local surface height, and the waterfall camera blends its alignment
  with continuous depth/lateral influence rather than switching at one x-coordinate.
- The high-dive response reuses one ring, one quality-bounded instanced droplet pool,
  and scalar recovery/rest blends on the existing avatar rig. No rigid body, extra
  camera, or per-drop light is created.
- Grid Thunder writes both local sky strikes and a nearest-neighbor rack chain into
  one preallocated dynamic line buffer. Rack caps expose stable world anchors, so the
  visible arc and synchronized reboot cascade describe the same hardware event.
- Field perimeter rock clusters use three small climb-clearable boxes matching their
  visible lobes rather than one oversized group wall or collision-free decoration.
- The Field's five-lantern resonance uses the visible inner-sigil radius as its only
  spatial threshold. It requires a fully charged Surge or Thunder so every successful
  activation has the corresponding visible outward spell ring.
- NPC route transforms and fish instance matrices continue updating while their zone
  is active, and their render bounds and water/terrain offsets keep that motion visible.
  A Falls spell stores one cast point, radius, strength, and age on the existing fish
  school. Its rise/fall envelope blends nearby river and airborne instances toward
  deterministic swirl offsets before returning them to their normal routes.
- Void-cruise effects use one quality-scaled instanced particle trail, one batched
  meteor line geometry, and one translucent halo. They are hidden outside the ride and
  update fixed typed arrays without per-frame allocation.
- Each Hanoi coin merges one beveled, square-holed cash disc, raised rim/collar, and
  value marks into one vertex-colored mesh; carried positions use existing frame
  vectors and no physics-body allocation.
- Higher tiers cache a static shadow map; the moving character uses one blob shadow.
- Rendering idles at 30 FPS and reaches 60 during input or active world motion.
  Overlays do not impose an arbitrary world-frame throttle; the same adaptive state
  prevents the terminal from slowing visible animation. Canvas pointer captures and
  HUD spell charging explicitly count as active input, including cases where no
  keyboard or joystick state is held. Low quality otherwise remains capped at 30 FPS,
  but temporarily services direct pointer input at display cadence so a dragged relay,
  packet, prop, or charging control does not feel half-rate.
- Device-pixel-ratio caps are 1.0, 1.25, and 1.5 across low, medium, and high.
- No post-processing in the vertical slice.

## Accessibility

The canvas is supplementary to complete HTML portfolio content. Dialogs are
keyboard-operable; once the world is running, closing one returns focus to the canvas
so movement resumes without an extra click. Controls have visible labels or accessible
names, and status changes use a restrained live region. While an overlay owns focus,
global gameplay shortcuts do not mutate the obscured world beneath it.

## Deployment

`npm run build` produces the optimized Vite `dist/` artifact. A GitHub Pages workflow
uploads and deploys that directory from the `gh-pages` branch.
