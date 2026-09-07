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
npm run preview
```

## Current vertical slice

- Procedural Field Station hub and field-operator character.
- Lightweight top-down collision, sprinting, jumping, respawn, and noclip.
- Luminous Falls, Signal Grid, and Space Archive portal zones, plus the discoverable
  Mightymatica sub-dimension nested beneath Signal Grid.
- Enterable/climbable survey tent, planning table, river rune monument, CRT banks,
  loose props, visibly wandering NPCs, and a moving instanced fish school. The river
  monument physically spins up and shines before revealing selected work, while the
  lantern-only Falls clues are inset into the bridge rather than the water.
- A visibly parting waterfall ritual with three symbolic sockets, a mixed cache of
  draggable crystals and decoys, ordered moon/tide/ember activation, fragile faceted
  crystals whose shattered pieces remain telekinetic, an `R` repair loop, and a hidden
  chest whose celebratory coin/light burst evolves Spark into Surge. Batched trees,
  riverbank glow-bushes, larger soft fireflies, hanging vines, climbable cliff crowns,
  and a marked ledge loop make the waterfall itself explorable vertically without
  blocking the crystal-cache sightline. Surface-height collision preserves jump arcs
  and a continuous contextual camera across both summit approaches.
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

The Pages workflow builds and deploys the optimized Vite `dist/` artifact.

## Ride music

The void-turtle ride visibly embeds Toby Fox’s official upload of
[“It’s Raining Somewhere Else”](https://www.youtube.com/watch?v=KtC-pl9P3kE)
through YouTube’s privacy-enhanced player. No soundtrack audio is copied into or
distributed with this project. Music by Toby Fox; rights administered by Materia
Music Publishing.
