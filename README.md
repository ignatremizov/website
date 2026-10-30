# Systems Under Strange Skies

Ignat Remizov's portfolio is an explorable top-down Three.js world with a complete
HTML portfolio fallback. A gate-aligned landing control explicitly launches the
in-browser 3D experience; the game runtime is lazy-loaded only after activation.

## Run locally

```sh
npm install
npm run dev
```

Production checks and preview:

```sh
npm run type-check
npm run test:unit
npm run check
npm run build
npm run check:build
npm run preview
```

`build` also checks compressed transfer budgets and emitted lazy-loading boundaries.
The Pages workflow requires the deterministic unit suite before deployment. Tests
use at most two workers; browser automation is not part of this workflow.

For a preview independent of terminals and MCP, use the persistent
[`website-preview-4173.service`](docs/preview-service.md). It serves the current
production build on `127.0.0.1:4173`, starts with the user session, and writes logs
to the journal. It does not install dependencies or rebuild during login.

The complete portfolio remains readable when JavaScript is disabled or the shell
cannot load. Successful startup enhances the same article into its modal presentation.
If a lazy world module fails after deployment or a connection interruption, a notice
offers an explicit refresh or the portfolio; it never automatically clears progress.

### Navigation diagnostics

`debug paths` and `debug top` retain their existing visual overlays. For an intermittent
route or collision-recovery issue, use `debug trace on`, reproduce the movement, and
run `debug trace export` to download `navigation-trace.json`. The record is off by
default, capped at 128 events, and held only in memory. `debug trace` shows its status;
`debug trace clear` clears events, and `debug trace off` stops recording. Nothing is
uploaded or automatically persisted. This history supplements a recording; it is
not a complete game replay.

For occasional frame drops, run `debug perf 120`, play normally, and then
`debug perf export`. The opt-in recorder stops automatically, retains bounded
CPU/frame/callback timing and render/input context, and downloads
`performance-trace.json` without storage writes or uploads. It distinguishes
intentional idle pacing from candidate hitches, but does not measure GPU execution.
See [frame-drop capture](docs/performance-capture.md) for controls and interpretation.

## Current vertical slice

- Procedural Field Station hub and field-operator character.
- Lightweight top-down collision, sprinting, jumping, respawn, and noclip.
- Click or hold-drag to guide movement. Falls planning runs in bounded frame
  slices, supports intermediate climbs through books, desks, pillars and the
  waterfall crown, and snaps wall/rim targets to nearby clear footing. Safe
  descents step off without a jump impulse; uphill gaps still use jumps, and
  walkable stair treads stay walking routes. Tide stairs approach the river
  through the dry bank instead of jumping over the first riser.
  Authored connections speed up common portal/river/monument/cove journeys,
  the reading-to-bridge walk, and both waterfall crown climbs; unusual
  destinations retain the wider solver. A blue **Finding route** marker
  stays at the clicked destination while searching, then turns amber for movement.
  Blocked held-pointer samples preserve the accepted request. Failed searches
  retain a red marker with a short reason until another request or cancellation.
  Short stationary clicks commit a destination even after hold-steering starts;
  deliberate holds and drags stop on release.
  During a hold, the cyan cursor sigil follows the latest surface every rendered
  frame while route submissions retain their 75 ms throttle. A small amber dot
  shows the last published path endpoint when it differs from the cursor; it never
  presents an unfinished request as a checked path.
  Farther clicks in the same direction keep the checked walking prefix moving
  while its replacement tail is planned and validated. Reached waypoints do not
  insert idle frames; movement waits at the last checked point when necessary.
  Hover feedback uses the active frame cadence while the mouse moves, coalescing
  high-rate pointer events without delaying captured drags or ordinary clicks.
  Pointerdown retains the accepted route until a destination is committed or
  an object/puzzle interaction takes ownership, so separate clicks do not stop
  movement before the controller can reuse the path.
- Playable rims have a broken-bedrock band with chipped slabs, dark fissures, and
  world-specific stone/metal colours, tied to the actual movement limit rather
  than the larger decorative foundation. Water outlets stay open. The sleeping
  Field turtle is an explicit jump destination beyond that rim: clicking approaches
  the shore, lands on its near cap, and triggers its buckle/trampoline return.
  Awakening it stops the automatic bucking; boarding the ride still uses interaction.
- Optional navigation diagnostics: `debug paths [on|off]` in the terminal
  toggles a depth-independent overlay (off by default). Cyan shows remaining
  height-aware player waypoints and the target cross; amber shows
  jump legs and landings, including later steps of a climb; green shows the
  frog's current planned hop. A red
  target cross means the host reported an unreachable route, not an inferred
  rejection reason. Long walking routes display at most 256 remaining legs.
  `debug top [on|off]` switches to a north-up overhead camera for inspecting
  terrain gaps; combine it with either overlay and toggle it off to restore
  the ordinary exploration camera.
- Luminous Falls, Signal Grid, and Space Archive portal zones, plus the discoverable
  Mightymatica sub-dimension nested beneath Signal Grid.
- Enterable/climbable survey tent, planning table, river rune monument, CRT banks,
  loose props, visibly wandering NPCs, and a moving instanced fish school. The river
  monument physically spins up and shines before revealing selected work, while the
  lantern-only Falls clues are inset into the bridge rather than the water.
- A visibly parting waterfall ritual with three symbolic sockets, a mixed cache of
  draggable crystals and decoys, ordered moon/tide/ember activation, fragile faceted
  crystals whose shattered pieces remain telekinetic, an `R` repair loop, and a hidden
  chest whose celebratory coin/light burst evolves Spark into Surge. Falls now has
  connected garden/shrine terraces, separate-height sockets, a raised stone bridge
  with a river underpass, and two optional routes to the western waterfall crown.
  The revealed cave has an elevated entrance reached across stepping stones and
  a recessed, wadeable pool with submerged exit steps, spilling into the lower
  river through a second cascade.
  Intact crystals and decoys keep one physical body across dragging and release,
  independent of decorative glow. They hover over low edges while carried, settle
  onto the first real support when released, and retain partial-footprint support
  at platform edges. Solid walls and bridge undersides still block their bodies.
  Mist, broken foam streaks, and cyan/warm glimmers mark the water impacts and
  the river's fading spill into the void. Tall rear pillars frame the workshop.
  Purple trees, mineral clusters, ferns, vines, mushrooms, and terrace-height
  fireflies frame an Archivist reading nook, a Keeper shrine, and a Tinkerer bench.
  A jade crystal frog roams between clear terrace perches and flees approaching
  players in quick hops, favoring new routes over a repeating patrol.
  Catch it mid-hop with telekinesis for an indignant leg-flail; release it to
  land, splash, and scramble away. A fling into the void ends in a glitch
  dissolve and rematerialization on a clear perch.
  Sockets hold one crystal at a time; crystals piled over an occupant must be
  moved clear and returned before they can replace it.
  Explicit small stair risers preserve the distinction between walking, jumping,
  and passing underneath another route. See
  [the terrain rebuild notes](docs/preproduction/falls-terrain-rebuild.md) for the
  comparison checkpoint, offline Blender reference, and manual route.
- A walk-on checksum Tower of Hanoi in the Signal Grid with three bronze,
  square-holed cash coins, step-climbable dynamic stacks, legal-move validation,
  carried-coin animation, completion-gated peg-tip balancing, a cyan BUFFER
  checkpoint, guarded reset protocol, green SETTLE reward, and board state preserved
  across teleports.
- A hidden Signal Grid server repair with two loose magnetic patch leads and one
  draggable floppy. Completing its SNEAKERNET carrier installs `WORM.COM` in every
  terminal and opens `C2://192.168.0.1:31337`: a compact, accelerating Snake game
  launched with `worm` or `c2`, with keyboard, swipe, on-screen controls, and a
  two-turn input buffer. Enter or the restart control relaunches a faulted carrier;
  Escape or `^C` unloads it. `trace` remains the installation receipt rather than
  the reward itself. Filling all 308 addresses produces the unpersisted `ROOT PWNED`
  mastery ending; it is deliberately not an exploration achievement or finale gate.
  `worm autorun` demonstrates a guaranteed closed-board route while packets continue
  to appear randomly across every free address; any steering input hijacks it, and
  assisted rounds do not replace the player's manual high score.
- Signal Grid's sealed simulation cube performs a short reconstruction boot and opens
  the discoverable physical route into Mightymatica. Crossing it—or explicitly typing
  a hidden Math alias—indexes the destination for later atlas and terminal fast
  travel; returning through a cube-face aperture deposits the player beside the cube.
- A dynamically loaded Mightymatica workshop with a three-level instanced Sierpiński
  floor plus an integrated fourth-generation/4,096-cell recursive corner, an archive-faithful
  Pythagoras curator reconstructed from his original Flash body and vector overlays,
  a room-scale spoiler-safe Mind Reader whose answer materializes in both the
  original photographed orb and its 3D counterpart, a remote pressure-button Buffon
  needle rain triggered by interaction, pointer, or landing and enclosed by jumpable
  animated hazard tape with physically corruptible
  samples,
  Yuri's recovered four-piece 5 × 8 Chocolate out of nothing cut, and a bright
  quality-bounded Platonic-solids garden. A quiet room
  attribution reads: “From Yuri Remizov’s original experiments — rebuilt with love.”
- CRT observatory with market telemetry, a smiley monitor, an unobstructed
  observability lens, pointer-flingable flying asteroids, and shaded planets that can
  be body-checked or telekinetically pulled out of their tidy lanes. Each planet owns
  an independent touch capture, allowing several worlds to be moved at once while a
  separate finger drives the joystick. Tangential flings alter orbit speed, neighboring
  worlds and asteroids ricochet, and the central atlas lights when every disturbed
  planet settles back into order. A framed, transparent
  amber traffic-glass wall scrolls white telemetry without hiding corner pinball. Its
  narrow brass cap is a deliberately precarious walkable route, and a small indexed
  service box closes the monitor-bank pinch point beneath it. The
  floor asteroid can also crack a marked CRT or enter the archive portal. A west-side
  sunless heliograph receives a pale off-world shaft through a suspended glass
  parabola. Operating its aperture aligns two gimbal rings in sequence, concentrates
  the collected light, and only then energizes four steerable crystal relays. The
  focused cone also heats an avatar standing beneath it: a brief warning shimmer
  becomes pronounced harmless spectral fire and a short amber/cyan ember trail. The
  first ignition briefly wrests control away for an inward panic sprint, flailing
  drop, and two-roll recovery before returning control; Falls water extinguishes it
  immediately. The
  solved violet, amber, cyan, green circuit closes green back into violet through
  observability and resolves into an amplified spectral lattice. Clicks snap between
  engraved bearings while pointer drags leave a prism at an arbitrary angle. Cyan
  can focus through the lens into the CRT bank; amber carries straight through it
  and beyond the camera into open void, without a receiver marker. The avatar can
  physically interrupt any live route: the carrier diffracts against the coat,
  downstream optics fall dark, and jumping clear or stepping away restores the
  unchanged circuit.
- Translucent auto-charging portals with two-sided glyphs and spinners, animated
  telescopes, contextual cameras, and held casting that scales binary rain and power.
- Challenge-earned Spark → Surge → Thunder spells, with a denser violet/cyan Surge
  and independently recorded Pong and Archive pinball outcomes.
- Pong supports direct mouse/touch paddle dragging alongside W/S and joystick control,
  plus paddle-slice and bank-shot clean wins. Packet Interference remains an easier
  option, while a controlled no-Interference victory awards a visible DAEMON SLAYER
  token. After WRONG ADDRESS, the same cross-world asteroid can physically knock the
  ordinary packet off its rail and take its place for the rally; leaving the table or
  resolving the match returns the asteroid to the active world.
- Camera-blocking waterfall sheets and the flat Pythagoras curator replace the
  through-object ground blob with a small x-ray player outline, keeping accidental
  falls readable without outlining the avatar during normal play.
- The Space Archive observability lens evolves from a Spark pulse into pooled Surge
  log/metric/trace records, with denser warning-colored diagnostics under Thunder.
- A planning-table compass that clips onto the avatar's belt and unlocks the HUD
  heading for the current expedition. It remains directly mouse-draggable: pulling
  it off the belt removes the HUD heading until it is collected again. The free hand
  remains available for telekinesis, while `R` can recover a loose compass.
- A void turtle that sleeps out in the void, bounces only deliberate jump landings,
  and wakes only when a cast Thunder pulse reaches its shell. A lantern-revealed
  lightning mark nearby hints at the connection without turning its inspection text
  into a walkthrough. Once awake, its four fins articulate through a stable
  deep-space orbit while its wake gathers six loose asteroids into a moving system.
  Captured stones remain mouse-draggable and retain player-given orbital speed before
  slowly settling. The rider travels behind a comet trail with a lazy-loaded official
  YouTube player until an explicit, animated return and step-off.
- Discovery-aware map travel and a small virtual shell with `ls`,
  place-changing `cd`, collision-aware `goto` walking, `pwd`, readable world files,
  history, completion, cheats, and
  a world-side `ritual` rune trace plus the hidden `ritual open` solve route.
  Mightymatica stays absent from advertised atlas/shell surfaces until first arrival,
  while explicitly typing `cd /mightymatica` remains an immediate unadvertised
  discovery route. `tp <place>` is a separate cyan-pencil rite: the equipped pencil
  moves into the character's drawing hand, a circle and route glyph are traced into
  the floor, and the character kneels before the world transition.
- Depth-tested click/tap navigation reuses the same collision-aware route solver for
  ordinary surfaces and portals. A short click follows one route; holding or dragging
  continuously steers auto-move until release. A small world-space sigil previews the
  destination, foliage and particles remain pointer-transparent, loose-object and
  puzzle gestures retain priority, and reachable ledges or lower landings use real
  jump physics rather than teleporting the avatar.
- A leather-and-brass satchel button opens a field folio with a persistent milestone
  ledger, discovery-aware Atlas shortcuts, and a cyan-circuit magitech
  settings leaf. Rendering quality, interface contrast, reduced optional motion, HUD
  telemetry, controls, and local respawn are consolidated there.
- Completing the expedition reveals a four-world terminal incantation that arms an
  in-place Event Horizon finale. The active zone fractures around a growing black
  hole, including deformed cosmic-fabric scraps, zone props, terrain, and local
  farewells. Progress is cleared only after blackout; the hidden Last Ember record and
  appearance preferences survive the reboot.
- Keyboard, pointer, and touch controls with low/medium/high quality tiers.
- Complete Quick Portfolio without downloading the game engine.

Start with [the preproduction vision](docs/preproduction/vision.md),
[world map](docs/preproduction/world-map.md),
[Mightymatica slice](docs/preproduction/mightymatica.md), and
[vertical-slice acceptance criteria](docs/preproduction/vertical-slice.md). Image
references and their review status are in [the concept pack](art/concepts/README.md).

The Pages workflow builds and deploys the optimized Vite `dist/` artifact, with
the approved standalone [MightyMatica](https://github.com/ignatremizov/mightymatica)
build composed at `/mightymatica/`. Its source revision is pinned in the workflow;
an explicit manual-dispatch input can select another reviewed revision. The final
combined-artifact gate checks both sites, native-only files and the Pages size
limit. See [the alpha release notes](docs/alpha-release.md) for domain setup,
verification and rollback.

## Ride music

The void-turtle ride visibly embeds Toby Fox’s official upload of
[“It’s Raining Somewhere Else”](https://www.youtube.com/watch?v=KtC-pl9P3kE)
through YouTube’s privacy-enhanced player. No soundtrack audio is copied into or
distributed with this project. Music by Toby Fox; rights administered by Materia
Music Publishing.
