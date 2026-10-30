# Falls terrain rebuild

Comparison baseline: `7112843` (playable build before the terrain restructure).

Use `art/concepts/03-luminous-falls-keyframe.png` for composition, atmosphere,
and the relationship between water, ruins, and inhabited clearings. The AI kit
and material boards describe a visual direction; they are not seamless textures
or exact construction plans.

## Geometry before materials

The working rune/chest progression stays intact. Replace the mostly flat walk
space with connected terraces around a lower river gorge:

- A dry arrival and low crystal garden lead to a raised Keeper shrine.
- A bridge connects the shrine side to an Archivist reading terrace. Its deck
  has a real underside, with enough clearance to walk through the gorge below.
- Tide occupies a lower terrace, Moon a higher western shrine, and Ember an
  eastern overlook. Stairs, broad landings, and short optional gap jumps connect
  them. Crystal carrying and inspection must respect each socket's elevation.
- The tallest waterfall moves west. Opening it reveals an elevated cave ledge;
  reaching the chest requires climbing, and the crown remains an optional ascent.
- Small mineral clusters, vines, purple trees, and recognizable reading/shrine/
  workshop props make the different routes and NPC homes legible.

Keep the watercourse downhill and its visible footprint consistent with swimming,
splash, fish, and pointer selection. Bridge support must be separate from terrain
height so walking under it never snaps the player onto its deck.

Terrain dimensions and landmark elevations belong together in `FallsLayout.ts`.
Static construction belongs in `FallsTerrain.ts`; the existing ritual controller
continues to own crystal state, restoration, the water reveal, and chest rewards.
Height-aware host ports connect those systems without moving game state into art.

The shared surface/collider contract has an explicit, opt-in walking step limit.
Terrain admits only small height changes through it; an overhead deck never becomes
ground support merely because its X/Z footprint overlaps the player. Socket
capture, crystal projections, rune traces, inspection, NPC homes, and scenery
placement use real elevations. Existing jump arcs and progression stay intact.

The western spring crosses a shallow channel on the Moon terrace before spilling
into the lower river. The main curtain lands in a shallow elevated basin before
the cave. Its northern bank joins the cave floor; water spills through a lowered
southern sill in a second cascade. This replaces the narrow gap between the old
apron and seal, where the player's radius overlapped opposing collision faces.

The basin now has a recessed bed 0.55 m below its waterline, raised rim stones,
and two broad submerged treads to walk out on the east side. Water and spillway
share a single skin. The player wades below it, with splashes and navigation/
shadow markers at the elevated water height. Crown dives into this pool retain
`WORTH IT`, the cushioned splash, and the flop-back/get-up animation used by the
lower river. Pool entry does not consume the first river/bridge observation.

The submerged treads leave a 0.95 m channel behind them. Previously a 0.65 m
gap between the first tread and rear bank admitted the player above the tread
during a jump, then trapped the 0.8 m body on descent. Opposing collision
corrections restored an older grounded position, producing the sideways warp.
The wider overflow also keeps its tall front corners outside the exit-tread
approach, so their radius cannot block the player before the second step.
The layout correction retains normal landing, step and recovery rules.

The lower river continues across the outer shelf to the radius-18 foundation
edge, where a curved curtain falls into the void. It shares the existing flow
texture and adds no animation callback or light. The fish keep their bounded
route inside the original gorge. Two western approach stones rise through
0.8 m and 1.6 m to a broad 2.4 × 2.0 m apron at height 2.4 m beside the pool.
Its 0.23 m final rise meets the existing walking-step allowance.
The western waterfall and its collision mass sit 0.55 m farther west, leaving
a 0.95 m slit beside the central pillar, with a supported turn around its front.
The Moon terrace extends west under the relocated spring pool; its socket and
eastern spill stay in place, joined by the extended runnel.
Behind the central left pillar, a solid inset catches falls at height 1.85 m.
The adjoining front escape ledge is 1.30 m higher, at 3.15 m. Walking back
inside the recess provides the takeoff space to clear its lip, then continue
south through the slit and back toward the pool or Moon shelf. The
player-width-inaccessible northern slot is filled flush with the adjacent crown.
The unsolved cave is concealed by a damp fractured stone face with faint marks;
the former bright violet circle has been removed.

The redundant workshop bridge was removed: the Ember and workshop terraces
already meet at x=5. Its coplanar paving caused the remaining Tinkerer moss
flicker even after the individual terrace render cores were recessed.

The first playtest follow-up also adds:

- A rear cluster of tall fractured pillars beyond the workshop, with their own
  finite collision volumes and crown surfaces.
- A wider lectern/book top and a taller shrine arch, moved clear of the wall
  behind it. Paving sits above a recessed render core, removing coplanar moss
  tiles while keeping a continuous physical support plane.
- A river monument south-east of the bridge, outside its visual cover and clear
  of both stairways.
- World-height camera tracking through jumps. Jump takeoff must not send the
  camera down to the river when `surfaceOffset` becomes zero.
- Loose-prop swept-bottom landing against nearby decks. A kicked crystal can
  leave its original support, hit a lower terrace, and settle on a bridge.
  Objects beneath a deck must not be lifted through it.
- Bounded collision recovery with final overlap validation. If opposing solids
  defeat local correction, restore a still-valid grounded pose and its support,
  not an already-airborne previous X/Z.
- `WORTH IT` qualification from a waterfall crown takeoff. Jumping from a new
  ordinary terrace still splashes, but does not award the waterfall dive.
- Warmer terrace pools and visible fireflies, with the existing 0/1/2 point-light
  budget on Low/Medium/High. `FallsWaterfallMist` owns bounded haze and droplets
  at four water impacts and the curved outlet. Broken foam ribbons and cyan
  glimmers with sparse warm accents add two instanced draws to the two particle
  draws, with no additional lights. All five sites remain visible on Low.
  The effect freezes under reduced motion and is removed before teardown or
  Event Horizon. Mushroom caps and glowberries use their instance colours
  without multiplying by an absent vertex-colour stream.

## Inspectable artifacts

`art/blender/falls-layout-medium.png` is an offline Workbench view of the terrain,
with a sibling `.blend` and `.glb`. These use flat inspection materials and scale
markers; they are not screenshots of the lit game. See
[the asset pipeline](asset-pipeline.md#multi-level-layout-reference) for bounded
regeneration commands. The original geology study is retained separately.

## Later material work

Once the routes and proportions have passed manual play:

1. Export the geometry as a meter-scale Blender guide.
2. Refine silhouettes and selected hero pieces against the keyframe.
3. Develop procedural stone, moss, wetness, and wear in Blender.
4. Bake approved surfaces into a small shared texture set for the runtime.

Baked materials must retain the existing batching, lazy-zone loading, quality
tiers, and resource ownership. No cloth/fluid simulation or new texture work is
needed to evaluate this terrain pass.

Falls walking routes carry support height through each sampled tread. The
bounded, on-demand route search keys nodes by both horizontal cell and height,
so the bridge deck and its underpass remain distinct. A clear direct walking
line takes priority over a jump; otherwise a safe direct drop or a chain of
supported jumps can avoid an island-wide walking detour. Hover checks do not
run the route search. A distant low plinth can still be approached on foot before
its final jump. Held-pointer failures are cached until the player, target,
support identity, or terrain registration changes; pointer motion retains the
planning throttle instead of forcing a new search every frame.

The portal/river/monument/cove corridor also has a small authored navigation graph
in `FallsNavigationRoutes.ts`. Explicit walking corners and directed jump edges
avoid repeatedly rediscovering the underpass and the clear western departure from
the monument. Static connections are lazily checked once per geometry/jump-speed
revision; local connectors and the selected route still receive live checks. The
wider solver handles destinations outside this first graph. A persistent blue
“Finding route” marker distinguishes queued planning from a refused destination.

Rear-pillar ground passages use clearance-aligned coordinate hints in the wider
walking search, rather than new authored route nodes. A uniform 0.48 m grid could
miss the much narrower valid player-centre strip between a companion shaft and
the terrace; its fine-grid retry was not guaranteed to find that strip either.
The hints preserve the ordinary grid while adding nearby obstacle-face clearance
coordinates. Real terrain registration, live clearance, and collision execution
remain authoritative, so this does not permit walking through a pillar or the rim.

The September 21 trace follow-up replaces the Tide/river jump links with a walk
through the dry bank at `(0.24, 0, 7.1)`. This preserves two individually walkable
height changes instead of combining the river's 0.16 m depression with the first
0.225 m riser. Return travel from the first cove platform uses a gravity-only
step-off to the clear river landing, then walks below the bridge and up the stairs.
The reverse route reserves its jump for the final ascent onto the cove platform.
The uploaded return endpoints are covered through the real controller, player
collision, and support frame order at 30/60 FPS and uneven cadence; the same
endpoints are also exercised in reverse. Neither direction intersects the bridge
in that headless replay. This does not replace the user's visual acceptance.

The planner smooths walking legs using supported, clear traces. The follower
then reaches each waypoint before turning; an early turn can bypass the bank
corner and meet a second riser before acquiring the first. Movement is capped at the
remaining waypoint distance to avoid stepping past narrow stair entrances.
Final jumps retain their takeoff point and check the whole body arc for overhead
clearance, including the bridge underside. Repeated held-pointer updates keep
the existing stall timer, so an obstructed route can actually recover.

Loose gravity props have height-aware side collision with bounded sweep samples,
in addition to swept-bottom landing. A supporting tread must not block a kick,
but a taller riser must. Held props clear the physical top of a newly encountered
surface before they can be flung, avoiding a release from inside the stone.

NPCs track their current support separately from their original home. They can
yield along stairs into adjacent areas, take sideways/backward escape steps in
corners, and give one another personal space. Once undisturbed, they follow a
walkable return route to the original nook. They do not step off cliffs.

Each socket owns only one crystal, independent of colour. A loose crystal
overlapping an occupied seat is rejected until it leaves that socket's capture
volume. Removing or fracturing the occupant cannot promote a buried replacement.
This is transient placement state in `FallsRuneRitual`, not another puzzle order
or a prohibition on physically piling props.

`FallsCrystalFrog` owns a small jade frog with gold eyes and luminous mineral
spines. Its route helper derives a bounded perch graph from the actual terraces
and rejects arcs through cliff faces or the bridge. The host checks furniture
and current NPC clearance before spawning or choosing a hop. Weighted choices
favor new perches and crossing between terraces; nearby players trigger quick
outward escape hops. A cornered frog waits rather than repeatedly reversing.
Fixed model parts are merged by material within their animated joints. It adds
no lights, and twinkles are capped at 0/6/12 on Low/Medium/High. Reduced motion
softens its poses and slows traversal while retaining terrain clearance.
The entire root stays out of static batching and click-navigation picking.
Event Horizon freezes the controller but retains its rig for destruction;
zone teardown disposes the owned subtree.

## Manual comparison route

Enter from the hub; climb from the garden to the shrine; cross the bridge and then
walk beneath it; carry crystals to all three elevations; remove, break, and repair
one at a raised socket; complete the ritual; climb into the cave and open the
chest; reach the crown and jump into the water. Check NPC retreat/homeward wandering,
click/hold navigation, crystal shadows, and Low quality along the same route.

Specifically retry jumping into the closed seal, landing beside the shrine arch,
kicking a crystal off its cache onto the terrace, and flinging one onto the
bridge. Compare a jump from an ordinary terrace with a dive from the waterfall
crown into the pool, wade out on its eastern treads, and check the same dive into
the lower river. Check summit camera framing during both ascent and descent. The offline
Workbench image verifies the geometry only; warm light, spray, and interaction
feel need the browser playtest.

Also try kicking crystals back into the sides of the garden stairs, dragging and
flinging one onto a higher step, click/hold walking up and down a whole flight,
and clicking from beneath the bridge to the right-hand stairs. Crowd the Tinkerer
into a corner and then toward the adjoining terrace; bring two NPCs close and
leave them to make room and return home. Inspect the river's outer lip and retry
the western pool escape with the cave both closed and open.

From beside the monument, including contact with its exposed sides, click its
top and verify one direct jump: rise enough to clear its side, then move onto
the top without visiting the Tide stairs. This covers request 369 from the
September 22 trace; the departure is `(1.7167451451, -0.16, 6.8243213269)` and the
destination is `(2.0988782901, 0.82, 5.2725401062)`.
With the bridge overhead, click the monument and verify that navigation still
finds a clear takeoff instead of lifting into the deck. Repeat the right-stair route
while holding the pointer. Place a wrong crystal in a socket, pile another over
it, then remove or break the occupant: the piled crystal should stay loose until
moved away and returned. Chase the frog between terraces, leave it to roam,
and check its silhouette and motion at gameplay zoom. Inspect foam at the basin
and outer lip, including Low quality and reduced motion.

Retry the main-falls warp by jumping from the basin near `(-5.5, -5.4)` toward
the right/back bank, then letting the player descend. Also fall into the
western slit, walk south onto the broad apron, and turn east into the pool.
Both standing and jumping must clear the cliff corners at full player width.
Drop into the shallow rear inset, hop onto its raised front escape ledge, and
inspect the filled northern seam using `debug top`.
