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
is an in-browser interactive 3D experience; Three.js and the game module are
pulled through a dynamic import only when the visitor activates that gate. Landing
markup does not duplicate zone navigation owned by the in-world atlas.
On narrow portrait screens, the idle shell uses a deliberately short scroll: the
physical arch and centered gate occupy the opening view, while the identity panel and
all three quick facts continue below it. Entering the world resets that scroll before
the fixed-height canvas runtime starts.

The complete portfolio is an ordinary `section` in the source HTML, with its
stylesheet linked directly from the document. Both document and body permit
scrolling before shell readiness. Only after shell setup succeeds does `main.ts`
move the existing article into a native modal dialog and enable the game controls.
Disabled JavaScript, an unavailable shell module, or failed initialization therefore
leaves the same complete content readable through `#portfolio`, not an abbreviated
duplicate biography. Failed enhancement restores the original section.

The mobile terminal sizes itself from `VisualViewport` height and offset data, with
`interactive-widget=resizes-content` as the browser-level preference. This keeps its
input row above an open software keyboard while preserving a scrollable output pane.
It uses a native modal dialog, restores the invoking control on close, batches new log
nodes once per animation frame, and retains at most 320 rendered lines.

Mightymatica is a nested dynamic boundary inside the already-lazy game. Its module is
prefetched during the Grid cube's reconstruction boot or loaded immediately before an
explicit terminal alias or discovered atlas teleport. The initial Field/Falls/Grid/
Archive game chunk does not include the exhibit implementation. All JavaScript chunks,
including both lazy entries, use content-hashed filenames so distinct builds cannot
silently share a module URL. Old tabs can still request assets removed by deployment.
The shell handles `vite:preloadError` with an explicit refresh/portfolio/dismiss dialog,
without suppressing the rejected import or bypassing the existing cleanup paths.
There is no automatic reload or storage reset. The notice distinguishes saved
progress/preferences from temporary scene state that restarts on refresh.

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
    ├── cross-world PortalNetwork thresholds, dwell locks, and progress displays
    ├── shared scene primitives and resource disposal
    ├── stateful world props (for example RuneAltar)
    ├── world-owned feature controllers
    │   ├── Archive heliograph, observability ring, and beam lifecycle
    │   ├── Field void-turtle ride, orbiters, and cargo lifecycle
    │   ├── Falls rune ritual, waterfall opening, and chest lifecycle
    │   ├── Grid Hanoi puzzle, session snapshot, and visual lifecycle
    │   └── Grid Pong court, Thunder reliquary, pointer input, and match lifecycle
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
World-owned controllers under `game/zones` receive shared collision, interaction,
status, player-frame, and material services through narrow host contexts. The Hanoi
controller owns construction, legal-move state, cross-zone session snapshots,
interaction labels, animation, batching protection, and its coin-level collapse
reaction. The Pong controller owns the court, match state, pointer capture, Thunder
reliquary, and local collapse reaction. Cross-world WRONG ADDRESS ownership crosses
that boundary through a revocable packet lease; progression remains in
`PortfolioGame` and is reported through a victory callback. `PortfolioGame` still
decides when Grid's Event Horizon branch runs and coordinates the controller reactions
with rack and Daemon behavior. The Archive signal controller owns the heliograph,
relay bearings, observability pulse/log cascade, routed beams, player interruption,
spell disruption, and optical collapse fragments. The Archive orbit controller owns
the planets, floor contact projections, multi-pointer telekinesis, planet/player/
asteroid ricochets, Thunder gravity lock, orbit restoration, star-atlas ascension,
and the route-agnostic `TO THE MOON` height milestone. Traveling-asteroid routing and
its revocable Pong lease remain cross-world composition concerns. The Archive Event
Horizon branch supplies its active collapse frame to both local controllers and
coordinates those reactions with data-glass behavior.
The Falls rune controller owns the six movable crystal clusters, socket placement and
sequence state, shattering and trace-driven repair, rune effects, cave seal, central
waterfall opening, hidden chest, and chest burst. It registers crystal bodies and
shards with the shared `Kickable` runtime through a host port; fish consume a narrow
mutable shard lease without learning the rest of the ritual model. Spell and chest
progression remain composition-root decisions. `PortfolioGame` also retains Falls
water traversal, fish schooling, the monument, terrain and camera behavior, and the
Falls Event Horizon branch, forwarding only the active collapse frame to the ritual's
local water-panel and crystal reaction.
The Field turtle controller owns the turtle geometry, wake state, ride state machine,
comet and meteor effects, collected-stone session state, and temporary portable-prop
orbits. Shared player position, surface ownership, heading, shadow projection,
telekinesis release, and `Kickable` registration cross a narrow host port. The Field
Event Horizon branch remains in `PortfolioGame` and explicitly invokes only the
turtle's local fin and moon-orbit reaction.
`SurfaceSelection` is the first extracted physics seam: it selects active, descending,
and grounded surfaces in one reusable scan rather than allocating and sorting candidate
arrays in the frame loop. `TerminalCommands` similarly owns canonical commands and
aliases so parsing, completion, `which`, and `man` alias lookup resolve consistently.

`PortalNetwork` is the shared Three.js navigation-prop boundary. It owns ordinary
threshold geometry, custom cube-aperture registration, dwell state, arrival guards,
milestone crystal growth, and lantern-revealed command-fragment signs. It exposes only
read-only destination/position handles to atlas auto-walk and traveling-asteroid
routing. `PortfolioGame` still owns the transition itself, arrival anchors, route
solving, persistence callbacks, and each world's Event Horizon coordination.

Every world interaction that may return a promise passes through one failure boundary.
Synchronous throws and rejected lazy-route imports become a recoverable world status;
the portal controller resets its dwell state so the player can retry without reloading.
Failed initial construction also disposes its partial scene and WebGL renderer before
the shell offers another attempt. The shell applies its landing-page renderer fallback
only to that initial construction boundary. A later navigation rejection leaves the
existing game and HUD mounted so the caller can report the route failure and retry it.

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
runtime is intentionally unnecessary for this height-aware top-down world.

`JumpMotion` supplies exact ballistic displacement and velocity to both the player
and jump-clearance prediction. Incremental motion composes across 30/60 FPS and
uneven frames rather than losing jump height through velocity-first Euler updates.
Guided horizontal movement is capped at the planned endpoint during a jump, too;
stopping several centimetres early or overshooting by one slow frame can miss a
narrow landing. Existing swept landing and collision rules still decide support.

Short upward jumps also have a bounded rise-first option. `findGuidedJumpDelay`
prefers the original running arc; only if that fails, it checks rising in place
to the destination height before translating at the normal sprint speed. The
whole lift, horizontal arc, and first descending support must be clear, with
enough remaining airtime to arrive before landing. The stationary phase uses
the actual player radius rather than requiring unused lateral steering room;
horizontal travel keeps its existing extra clearance. Neither gravity nor the
jump impulse changes. The controller rechecks and stores the selected delay at
takeoff, then derives the fraction of each frame available for horizontal motion
from the already-integrated vertical velocity. It does not search again midair,
teleport the player, or delay keyboard movement. Cancellation drops the profile
with its owning route.

Variable-height supports such as the tent canopy and stacked Hanoi coins resolve
descent from signed clearance at both the previous and current horizontal positions.
This catches a player crossing an uphill surface during the same frame. Jump takeoff
detaches from the support and converts its elevation into world-space jump height, so
slopes and stepped stacks cannot pull an airborne player downward. Collision-debug
landing lattices sample the same `heightAt` functions instead of drawing misleading
flat rectangles.

Falls click navigation searches reachable support heights, including the distinct
river and bridge levels. `GuidedWalkingRoute` supplies yielding walking searches
and traces; `NavigationPlanning` owns request-local jobs and explicit walk/jump/drop legs.
`NavigationController` owns accepted, pending, and deferred requests, failure caching,
validation/publication, manual overrides, and both legacy and multi-leg followers.
`PortfolioGame` retains picking, geometry, physical movement, camera, and composition;
a reused read-only frame view and narrow host callbacks connect the two owners.
The controller advances at most 2,048 work units toward a 2 ms deadline. Tracing,
smoothing, retries, and intermediate-support checks all yield; a bounded
jump/drop check can slightly exceed the deadline. A jump checks at most two
arcs of up to 160 sample intervals each (running, then rise-first when eligible).
A clear direct walk wins first,
then a validated step-off descent, then a jump. `DropNavigation` checks the supported
run-up, gravity-only descent, first landing, and headroom at both ends of the
runtime's support-release delay range. Its bounded queries include the river bed;
the follower supplies ordinary running input, never a jump impulse or position snap.
Authored jump connections likewise resolve to a legal walk/drop before requiring
a jump, and cache the resolved kind and cost for the current geometry revision.

The fallback walking grid retains its start-aligned cells, but `WalkingGrid`
inserts destination and clearance-offset coordinates from at most 24 nearby,
vertically relevant solids. This prevents a narrow ground passage (such as the
rear-pillar/terrace lane) disappearing between grid columns for some starting
positions. Added intervals use their actual distance as search cost; all edges
still trace live support height and full body clearance. Coordinate hints are
request-local, and do not change colliders, boundary limits, or route work budgets.

`NavigationTrace` is off by default and retains at most 128 immutable, session-only
events in an in-memory ring. `debug trace on|off|clear|export` controls recording and
an explicit JSON download. Events include request IDs, support heights, planning,
publication, failure/cancellation reasons, jump takeoffs/landings, drop starts/landings, and successful
collision-safe rollbacks. Disabled hot paths do not construct diagnostic records;
there are no automatic storage writes, console logs, or uploads. This is a bounded
diagnostic history, not a full deterministic replay or a saved game.

`PerformanceMonitor` is a separate opt-in, timed CPU/frame recorder, composed by
`PortfolioGame` and controlled through `debug perf` in the shell. It observes the
existing animation loop, does not change pacing or gameplay, and keeps preallocated
numeric frame/hitch buffers. `FramePacer.expectedFrameIntervalMs` exposes only the
current display-aligned interval for diagnosis. Raw gaps retain the preceding
frame's cost; hidden periods reset their baselines. Optional browser observers
are feature-detected and sanitize entries to timing only. Captures stop after
10–300 seconds, are never uploaded or persisted, and export only on request.
Render-submission CPU measurements are not GPU timings. See
[frame-drop capture](../performance-capture.md) for bounds, fields, and interpretation.

Deterministic tests exercise both isolated request ownership and a headless
planner/controller/player-collision replay. The latter executes the real movement
and surface methods for narrow elevated landings and the river-to-stairs route;
it does not construct a renderer. Visual feel and the historical western-waterfall
warp still require manual playtesting.

For common Falls travel, `zones/falls/FallsNavigationRoutes` authors directed
connections through the portal approach, Tide stairs, monument, river underpass,
and cove stones, as well as the reading/deck walk and both waterfall crown chains.
Cove descents step off and land outside bridge headroom before walking underneath.
The Tide connection goes through the dry bank (height 0), between the river bed
(-0.16) and first tread (0.225); it does not reinterpret their combined 0.385 m
rise as a legal stair step. Crown routes
keep separate landing and takeoff corners when a neighboring riser needs a run-up;
the western route uses the actual waterfall cap above the nominal first step.
`NavigationRouteGraph` chooses among these connections by complete
path distance plus a jump penalty. It checks each static edge lazily under the same
work budget, retaining only completed checks. Start/goal connectors are bounded,
height-aware, and live-validated on every request. The complete selected route is
validated again before publication. `PortfolioGame` owns the graph instance for one
geometry revision and drops it on zone teardown; speed commands also advance that
revision because speed changes jump-arc clearance. No scene queries run in the
graph constructor, and cached connectivity never bypasses live collision checks.

An authored-graph miss retains the wider solver. After a useful walking-search
prefix, a nearby jump-only prop or a bounded support graph can provide a climb;
otherwise that same suspended walking search resumes.

Long walking approaches may end in short jumps; the graph's ordinary edge-distance
limit does not reject that composite route from the original start. Takeoff height
comes from the completed walking trace, including stair-to-river descents. Up to
eight goal-connected intermediate supports also check newly discovered walking
parents for a two-jump continuation. Walking continues while the fallback graph
advances, so useful late-discovered takeoffs can finish the job without exhausting
the room. These checks yield under the same frame budget and retain the original
walking parent chains.

Support candidates cover centers, near-edge points, and corners of up to 24 nearby
surfaces, plus nearby ground landings. Half-meter insets previously erased narrow
exposed pillar caps and usable crown takeoffs. The graph permits up to eight
separately validated jumps and retains the 256-expansion limit. Cheaper arrivals
using fewer jumps dominate redundant visits to the same landing, keeping lower
platform loops from exhausting that limit. Physical jump height/range is unchanged.
Walking clearance honors a prop's authored `solidTop`, matching jump clearance;
coarse decorative boxes above a supported top cannot masquerade as a ceiling.
Jump validation also checks the first descending support crossing using the same
height-crossing predicate as physical surface selection. An overlapping higher
canopy can invalidate a lower planned landing even without a solid collider.
The airborne support margin is independent of the player's currently active
platform. Decks above the flight stay overhead; these checks never substitute
the globally highest surface at an X/Z position.

Held-pointer changes coalesce into the latest destination. A valid current route
remains available while replacement planning runs; commit validation checks the
current player position, supports, and a captured target. Sub-arrival pointer drift
is compared with the checked endpoint, not the preceding pointer event. A completed
validation may publish its checked snapshot while a nearby same-support destination
remains deferred. That newer intent starts a background search on the next grounded
update, avoiding an endless cycle of validation restarts without player movement.
Nearby targets can reuse remaining legs with fresh walking and jump clearance.
The pointerdown dispatcher does not cancel navigation merely to begin classifying
a new click or hold. It retains accepted routes and pending jobs until release
commits the replacement, or a mechanism, prop, puzzle, focus-reclaiming click, or
empty pick takes ownership. A cancelled uncommitted replacement leaves the previous
request intact. Headless integration tests cover the actual pointerdown/up dispatch,
not only direct calls to the navigation controller.
Farther, aligned clicks instead retain an already-checked walking prefix and plan
from a stable anchor ahead. The prefix remains in motion during both planning and
validation; publication prepends only its unconsumed waypoints to the checked tail.
It never commits an old jump on behalf of the new destination. The follower waits
at the anchor if the tail is not ready; reversal, cancellation, and geometry changes
discard the continuation. Reached walking waypoints advance within a bounded loop
in the same frame, without cutting their corners or inserting a stopped frame.
Cancellation and manual input clear pending and deferred intent; zone, geometry,
and jump-speed changes invalidate work. Jump legs retain their takeoff and landing until real
physics confirms arrival and support settling. Smoothed walking legs reach each
waypoint before turning: early corner cutting can touch a second stair riser before
the sequential-axis movement solver acquires the first. Live connectors and wider
searches remain request-local; only the authored graph's static edges are cached.
Transient blocked or cached-rejected held samples keep the last accepted target
and pending job. Target records are cloned at request boundaries so subsequent
pointer picks cannot mutate the geometry being validated.

Pointer steering activates after 160 ms, but a stationary release through 350 ms
still commits a one-shot destination. Elapsed time does not count as pointer
movement: real drags use the existing mouse/touch displacement thresholds.
Deliberate holds and drags stop on release; focus-only presses and cancellation
never commit a destination.

For one-shot clicks, the committed pending destination owns a blue segmented marker and a camera-facing
“Finding route” label until planning finishes. Moving the mouse elsewhere or
leaving the canvas does not hide a one-shot request. A replacement request displays
its destination while an older checked route can continue moving. Publication
switches to the active marker; cancellation clears pending and deferred feedback.
Failed requests instead retain a separate red marker with a short reason:
“No route found”, “Landing blocked”, “Landing changed”, or “Route stopped”.
Hover changes and pointer leave cannot erase that feedback; an accepted request,
publication, or explicit cancellation clears it. Status messages are deduplicated
and rate-limited. All label textures are generated once, and reduced motion uses
a steady static sigil.

Held steering separates display intent from route ownership. A reused `visualTarget`
is picked once per rendered frame after the camera moves; it never aliases the
accepted target, a pending job, or published waypoints. The ring follows that local
pick (red for a locally blocked landing), while route submissions keep their 75 ms
throttle and the planner's existing work budget. A small, depth-tested amber dot
shows only the published route's endpoint, not a pending request. It is hidden when
the points coincide or the hold ends. A ray miss hides the cursor ring without
cancelling the last safe route. Ordinary one-shot planning/failure labels are unchanged.

`WorldBounds` shares the ordinary 0.55 m player-centre inset between endpoint clamps,
containment, and `WorldEdge` scenery. A numerical epsilon keeps radially clamped
points selectable; it does not expand movement. Exact clear legacy walks bypass
grid quantization, so a rim goal is not rejected merely because its rounded grid
cell lies outside the disk. `WorldEdge` dresses the otherwise misleading outer
foundation in one static mesh of chipped slabs and exposed fissures. Geometry begins
at that inset, with a narrow irregular transition, world-specific vertex colours,
and no new collision, lights, textures, or picking barriers. Falls water outlets are
excluded. Normal scene teardown owns the geometry and material.

`ClickNavigationTarget` projects visible rim hits inside physical movement bounds
and searches a bounded local neighborhood for clear footing on the selected support.
Obstacle-face projections allow targets to slide along walls; deterministic tie
handling prevents radial candidates from flipping across the same wall.
Wall fallback compares cleared ground with up to six nearest support footprints,
ranking final positions from one fixed click anchor. A physical box containing the
visible hit may stabilize a faceted wall's depth and exclude landings through its
back. Custom-shaped solids keep their rendered hit. The visible hit's height remains
the ceiling, so fallback cannot select a deck above it. Direct top hits and portals
retain their own selection paths. Idle pointer events retain only the newest sample;
the native cursor affordance and destination marker are picked once after camera
movement. Recent mouse motion uses the active display-aligned cadence on every
quality tier, with a 150 ms grace period before returning to idle. There is no
second 30 Hz marker timer. A stationary pointer/view does not repeat the projection.
Within that synchronous feedback pass, repeated queries for the same pointer share
one canvas measurement and camera ray; the cache cannot survive an input event or
camera update. Captured drags and click/hold classification remain immediate.
Prop picking reuses one hit buffer and associates hits directly with their owner,
without temporary filter/map lists or recursive ownership searches. `debug paths`
observes route legs without running searches; `debug top` provides a north-up view.

Frog and intact ritual-crystal bodies register a fixed, feet-origin envelope on
`Kickable`; that same body is used during grabs, release, and loose physics. Named
and decoy clusters both use their 0.64 m radius and 2.15 m height, not an AABB of
their aura, ground glow, breathing instances, or temporary restoration scale.
`DragSurfaceProjection` changes support depth gradually along the current pointer
ray; automatic height correction is excluded from fling velocity. Fixed bodies
are carried 0.62 m above projected support to clear low parapets, while swept
collision still blocks solid walls and overhead decks. The placement/shadow cue
cannot claim a projected upper deck while the resolved body remains underneath.
Stable release requires actual support contact and clear placement; an airborne
gentle release falls under gravity, without an invented upward bounce. Cancelled
captures discard fling velocity. Old platform ownership is cleared at grab time.
Released fixed bodies use their base footprint for both swept landing and retained
support, so an overhanging edge cannot catch the held body and then become a hole
on release. Crystal shadows use that same footprint. Player step/landing rules,
navigation, and the frog's existing body dimensions remain independent.

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
- The river monument owns an explicit idle → opening → transmitting → holding →
  closing lifecycle.
  Its portfolio request moves it into a sustained active hold; the HTML dialog's
  native `close` event notifies the current game instance to begin the visual
  wind-down. Directly opened portfolio dialogs are harmless because an idle monument
  ignores that notification. The hold remains at the normal overlay frame cadence;
  opening, transmission, and closing request the higher animation cadence. Both altar
  point-light slots remain registered throughout Medium/High and hidden throughout
  Low; animation changes intensity only, avoiding a scene-wide light-count shader
  change at the flash. Two invisible entry submissions warm the actual effect meshes,
  with zero packet instances, before transmission restores the packet-buffer capacity.
  The shell separately prepares the portfolio's layout and portrait before reveal.
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
- The registered Field turtle shell is the only click-landing exception outside the
  ordinary rim; neither bare void nor another surface with the same ID gains access.
  Far-side picks snap to its station-facing cap. Ground routing reaches a precise
  island takeoff before the final jump, which waits for the bobbing shell's arc
  clearance (bounded to four seconds for a permanently obstructed departure).
  Sleeping-shell contact bucks the player back with the existing trampoline impulse
  and clears the old route/hold instead of steering into another failed landing.
  An awakened shell accepts standing and walking without clamping its supported
  player onto the island. Riding remains a separate state entered by explicit interaction
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
  `StaticBatchRaycast` builds a small bounding-volume tree over the merged mesh's
  per-piece bounds once at zone construction. Cursor rays reject whole distant
  branches rather than scanning every part. Candidate parts retain original
  triangle order for equal-distance hits. Its CPU-only buffer view
  shares the batch's attributes and never changes the rendered draw range. Changed
  geometry, including Event Horizon deformation, falls back to ordinary raycasting.
- The chest reward borrows existing Falls light slot zero, temporarily taking
  priority over crystal ambience and tinkles; it never adds/removes a visible
  point light. The light returns to normal ownership without retaining the flash
  intensity. Reduced motion uses a steady fading glow instead of a flicker.
  Coins stay registered as a zero-count instanced mesh while inactive, warming
  the material and buffers before opening without issuing an instanced draw.
  Opening changes only existing counts, transforms, and light uniforms.
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
- Player visibility samples camera-to-avatar rays against registered occluders.
  `VisibleOccluders` resolves overlapping assembly/child registrations through ancestor
  lookups, updates each required transform once, and excludes hidden subtrees before
  raycasting. Opaque climbable visuals register alongside their
  collision record; waterfall sheets, Pythagoras, and complete Signal Grid rack groups
  opt in explicitly, while transparent climbables such as the star atlas opt out.
  Occlusion enables geometry-following rim replicas with one shared depth-tested
  shader material; the ground shadow keeps its own depth test. Only the registered
  subtrees and required ancestors are visited.
  The Archive heliograph collector and its transparent shafts share the avatar's late
  render layer. The avatar writes depth before the glass is composited, so apparent
  front-to-back ordering stays stable when the occlusion reveal pass switches on.
  The collector dish also retains the dedicated pointer layer for direct activation.
- Falls foam and ground-glow planes use single-pass transparent rendering. Settled
  socket-root transforms and frozen firefly buffers remain untouched until their
  growth or quality state changes. Frog terrain routes persist across zone visits,
  while each selected hop still checks current scenery and NPC clearance; blocked
  weighted candidates are removed and retried within that decision.
- The Falls frog exposes one borrowed `Kickable`. Its controller owns roaming and
  held animation; shared pointer projection/capture and released-prop physics stay
  in `PortfolioGame`. A fixed feet-origin collision envelope keeps flailing limbs
  from shifting its physical floor or cursor projection. A supported release
  reconnects from the actual landing through freshly checked hop arcs. Void or
  stranded recovery dissolves before choosing a currently clear respawn perch.
  `GlitchFragments` owns the bounded fragment effect shared with Mightymatica's
  falling solids; Falls never imports an exhibit through this dependency.
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
  existing bounded needle instances and settled-cell index, adding scalar horizontal
  velocities rather than debris objects or a physics dependency. A narrow read-only
  traveling-body port lets the lazy exhibit sample the current WRONG ADDRESS position,
  size, resting height, and held state without importing the shared kickable runtime;
  player and asteroid sweeps share the same bounded disturbance pass.
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
