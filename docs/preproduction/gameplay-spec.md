# Gameplay Specification

## Core loop

Explore a compact zone, approach a landmark, interact for portfolio content or a
playful response, then walk, map, or teleport to another zone.

## Desktop controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move |
| Shift | Sprint |
| Spacebar | Jump |
| Q (hold / release) | Charge and cast the current spell |
| F | Raise or stow the hidden-mark-revealing lantern |
| Mouse / touch drag and release | Hold and fling loose objects with telekinesis |
| E / Enter | Interact |
| J | Open the satchel field folio |
| M | Open the folio directly to Atlas |
| Backtick / T | Terminal |
| P | Quick Portfolio |
| R | Respawn; repair Falls runes, restore the ritual cache, and recover loose Field equipment |
| Escape | Close active overlay |

Sprinting across solid ground leaves a short trail of cool silver dust behind the
player's feet. It follows actual travel rather than input alone, so walls, jumps,
water, Pong control, and stationary Shift presses do not emit it.

## Touch controls

- Left virtual joystick controls movement.
- A right-thumb cluster keeps Interact, Jump, Lantern, and the chargeable Spell
  control together; Jump uses the same queued action as Spacebar.
- Top controls open the Atlas, terminal, portfolio, and help; a leather-and-brass
  satchel control opens the combined journey/Atlas/settings folio.
- Movement and canvas telekinesis track separate pointer IDs, so the player can keep
  walking while other fingers drag or fling objects. Archive planets additionally
  own one hold record per pointer, allowing several distinct worlds to move at once
  without sharing grab offsets or release velocities. Pointer cancellation, capture
  loss, app backgrounding, and window blur release their respective controls cleanly.
- Controls remain outside the central character and landmark viewing area.

## Camera

- Three-quarter top-down orthographic view.
- Smoothly follows the player, aligns with the falls, and moves overhead for Pong.
- Framing expands on portrait screens.
- Reduced motion disables decorative camera easing and substantially reduces character
  bob/stride amplitude without removing locomotion feedback.

## Interaction

The closest eligible interaction displays a prompt. Direct buttons and keyboard paths
remain available for all essential actions.

World copy follows a discovery-first rule. NPC dialogue and a future optional guide
may offer direct guidance, but ordinary props, landmarks, and hidden markings only
describe what the player sees, hears, or feels. They do not name prerequisites,
prescribe the next input, or disclose puzzle solutions. Functional controls such as
terminals, portals, and puzzle pieces may still use concise action labels.

In Luminous Falls, moon, tide, and ember are three spatial sockets rather than
pre-filled switches. Their floor glyphs depict a crescent, a current, and a flame.
A separate low cache holds the required violet, cyan, and amber crystal clusters
among three colored decoys. The player drags crystals with mouse telekinesis; correct
clusters snap into their matching glyphs while wrong clusters are visibly rejected.
All three sockets must be filled before moon → tide → ember can release the seal and
visibly part the center waterfall. Leaving the bridge drops the player into shallow
water with a splash instead of creating an invisible collision wall. Opening the
revealed chest triggers a celebratory burst of coins and light and evolves Spark into
Surge; merely parting the waterfall does not change the spell.
Lantern-only sequence and weather inscriptions sit in two shallow rows across the
bridge planks. The nearby river monument reveals selected work through a short
world-side spin-up and light response rather than opening the HTML surface instantly.
Its crown remains visibly charged while that portfolio window is open; closing the
window returns to the active monument first, then lets its beam, flare, rings, and
light wind down together.
Leaping from a waterfall crown into the river records the actual airborne peak:
a high fall produces a much larger pooled spray, briefly leaves the operator prone
in the shallows, and then returns control through a visible stand-up beat.

The Falls perimeter uses quality-bounded trees, bushes, and hanging vines rather than
an empty grass disk. A chain of low marked ledges joins the side moss terraces,
waterfall crowns, and center summit from either direction. Each ledge, visible rock
support, terrace, and crown derives its collision footprint and top directly from its
rendered world bounds, and the waterfall camera raises its focus with the player. The
river ribbon follows one non-self-crossing S bend, while the center cave has continuous
rear and side walls plus a traversable roof.

All six loose ritual candidates have faceted emissive shards, an inner glow, and a
pooled sparkle/light response when sounded, so appearance and fragility do not reveal
which three belong to the sockets. Repeated interaction reveals hairline fractures
and the fourth strike shatters a candidate. Every loose shard then becomes
independently kickable, spell-reactive, mouse-draggable, and flingable. `R` re-knits
the broken crystal, returns all required and decoy clusters to the cache, and resets
the sequence. Spark, Surge, and Thunder also make every intact candidate within the
physical spell radius flash in its own affinity colour and share a bounded shower of
tinkling facets; this visual response accompanies rather than replaces knockback.
A released shard resting on the rendered river becomes bait: the
nearest water fish visibly leaves its route, turns toward the facet, and eats it
after a short approach. The first six offerings each awaken a five-fish airborne
school; later offerings are still eaten without exceeding the bounded thirty-fish
flight pool. During a Falls cast, nearby water and flying fish briefly curl toward
the falling digit cloud, circle its cast point, and ease back onto their original
procedural routes as the digits fade.
Solved runes remain safely resonant. `ritual open` is the hidden deterministic sandbox
solution. The Tinkerer identifies `open` as the second word and frames the override as
a stolen answer, keeping it distinct from `open portfolio`.
The plain terminal command `ritual` is a non-solving repair and diagnostic. It
re-knits broken required and decoy clusters where they shattered while preserving
intact crystal positions and seated progress. Consumed facets return from the flying
schools, whose borrowed colour settles back into the river. The command then closes
the terminal and sends a visible violet packet path from the player through moon,
tide, and ember. Each arrival uses the pooled rune sparkle/light response but does not
increment crystal stress, change sequence progress, or solve the ritual.

At the Signal Grid table, interaction links the player to the cyan paddle. W/S, the
touch joystick, or a direct mouse/touch drag controls it against the coral AI until E
exits the table. Direct dragging captures only the pointer that began on the enlarged
cyan-paddle hit area; it projects that pointer onto the physical court plane, follows
it with a bounded speed, and preserves paddle velocity for sliced returns. The court
retains its world alignment while the camera eases into an overhead game view, and a
cyan perimeter lights only while the player is linked.
Outside control mode, walking into the ball kicks it. The Daemon Controller explicitly
operates the coral paddle as his hand and issues the first-to-three challenge himself.
A win records Pong completion independently. Off-court kicks and drags still provoke
the Controller and nearby racks, but no match score exists until the player explicitly
links to the table; sandbox goals cannot award PACKET LOSS or DAEMON SLAYER.
Ball dragging counts as match Interference but does not freeze the Controller's paddle;
the player can redirect the packet while his prediction continues. Casting unlocked
Packet Surge is the separate corruption route that visibly glitches, shrinks, and
slows the coral paddle. Either route disqualifies a clean win, and they can be combined.
After WRONG ADDRESS, the traveling asteroid can physically strike the packet from
outside or inside control mode. Swept contact ejects the ordinary packet and makes the
asteroid itself the live rally packet until the match resolves or the player leaves.
Its inherited speed is bounded for playability, and any controlled rally using it is
recorded as Interference.
Interference is the easier route, not a requirement:
paddle position and movement both steer rebound angle, rallies safely accelerate, and
bank shots can invalidate the Controller's delayed linear prediction. Winning a controlled
match without using Interference records the harder DAEMON SLAYER achievement and reveals
an amber witness seal on the caged-storm pedestal beside the Controller. Losing severs
control, glitches the cyan paddle out of the court, and requires a new interaction to
try again. The Controller's challenge dialogue names the physical reliquary directly
and warns that his greater power requires violet Surge. When both challenge marks and
Surge are present, speaking with him fractures the coral cage and arcs its contained
Thunder into the player; revisiting after the unlock shows the emptied reliquary.

The northwest Grid corner contains a walk-on three-coin checksum Tower of Hanoi.
Interacting with a peg lifts only its top coin; the coin follows the player's free
right hand while the lantern remains on the left until another peg is selected. The
pieces resemble thick bronze ancient
cash coins, with raised rims, patina value marks, and actual square holes around the
pegs. Larger-value coins cannot cover smaller-value coins. Coral marks INGRESS, cyan
marks BUFFER, and green marks SETTLE. Completing BUFFER reveals a cyan checkpoint
packet without ending the puzzle; moving the stack on to SETTLE reveals the final
cache token. SETTLE completion also leaves every peg interactive: CASH FLOW remains
latched while the player can move the stack onward to BUFFER and record MIDDLE
MANAGEMENT in the opposite order. The spatially separated violet console explains
the protocol and requires an arm-then-confirm interaction before resetting.
Each peg also exposes a dynamic, step-climbable surface matching its current coin
stack. The surface drops to the deck when empty and follows stack height after every
move, while the thin center peg remains a real obstacle. When one peg holds all three
coins, a separate narrow jump-only surface activates at the visible cap height. The
player can jump from the completed stack and balance on the tip rather than clipping
through it; lifting any coin disables that tip surface immediately.
Stacks, move count, BUFFER state, and SETTLE completion survive portal and terminal
teleports during the active session. Teleporting while carrying a coin safely returns
that coin to the peg it came from.

The former Grid observability position holds the sealed Mightymatica carrier. Its
first interaction starts a short reconstruction boot, preloads the isolated Math
module, changes the cube from cyan-sealed to amber/violet-active, removes the physical
seal, and registers a dwell crossing. This activation requires no Pong, Hanoi,
spell, or other challenge result. Reconstruction alone is not discovery: the route is
indexed only after the player physically crosses and arrives inside.

Mightymatica is a square-bounded sub-dimension nested beneath Signal Grid. Its opening
workshop contains:

- a three-level instanced Sierpiński carpet and rotating transparent cube frames;
- an existing 3 × 3 corner section whose center is already absent and whose entire
  surviving sub-carpet recurses through four generations, capped at 4,096 tiles;
- a crisp, archive-faithful Flash-hybrid Pythagoras figure as an optional curator;
- a Mind Reader with its complete five-step ritual visible before invocation, a
  spoiler-free first reveal materialized in both the recovered photograph's orb and
  the 3D crystal ball, and a multiples-of-nine explanation unlocked only by
  subsequent inspection; the station and chart are deliberately room-scale rather
  than a small tabletop prop;
- a progressive, accelerating Buffon rain triggered by interaction, pointer press,
  or a physical landing on its remote red pressure post, enclosed
  by low animated hazard tape that must be jumped, with live settled/crossing counts
  and quality caps of 240/480/720; entering during a live sample knocks nearby
  needles back into motion, revises both counters, and invalidates that run; the
  traveling WRONG ADDRESS asteroid performs the same contamination with a heavier
  impulse and can physically hold the pressure button down to start or accelerate
  the feed once per placement;
- the recovered four-piece 5 × 8 Chocolate out of nothing cut, with a top-left
  square, five-square strip, two shallow diagonal slabs, and an apparent
  forty-first-square cycle whose residual area reads as a narrow recessed seam.
  Every slab carries moving side collision and an exact-footprint top surface, so
  dragged and stacked chocolate remains climbable without filling its cutout gaps;
- a quality-bounded, non-punitive garden of lighting-independent cyan, coral, amber,
  green, and violet falling Platonic solids. A grabbed or flung solid that leaves
  the garden no longer snaps away: it breaks into cyan/magenta scanline fragments,
  dissolves, and rematerializes into the next rain wave;
- a provenance console distinguishing active adaptations from preserved later work;
  and
- the quiet attribution “From Yuri Remizov’s original experiments — rebuilt with
  love.”

All exhibit actions use the shared E/Enter/touch interaction path and report
instructions or results through the existing accessible live region. Reduced motion
keeps the exhibits usable while settling ambient solids, slowing recursive cube/core
rotation, and revealing short transitions immediately.
Both physical cube faces use an inward dwell collapse on departure. On arrival, the
matching destination cube rebuilds once from scanline fragments and nested wireframes;
the Math side remains a square amber-violet aperture rather than the ordinary round
portal kit. Physical return uses the cube-side Signal Grid arrival anchor. Atlas,
terminal, and pencil-teleport arrivals remain neutral.

The Field Station's loose cosmic grid scraps are line-cloth rather than rigid cards.
Dragging a visible strand pulls its nearby knot while the remainder lags, folds, and
slides around registered scenery, lantern posts, and the player. A strained snag can
tear along either of two prepared seams, leaving every separated section independently
draggable. Releasing a scrap preserves its final yaw and bakes its settled deformation
without inheriting a random solver recoil. If it is free of scenery, its surviving
strands slowly unfurl toward their natural layout; if it remains wrapped around a prop
or caught between props, it holds that arrangement with only a quiet rustle. Ordinary
unfurling never restores severed strands. Field spells throw a visible wave through
nearby cloth and accelerate free unfurling; a strongly charged Surge or Thunder can
shake a snag loose, but spell energy does not repair it.

Both planning pencils are physical repair tools. Moving a pencil tip across a scrap
redraws nearby missing coordinates, including holes that were absent in the initially
authored ragged mesh. Continued tracing gathers every separated section from the same
original scrap, preserves their current world poses at the beginning of the repair,
then visibly draws them together and completes a rectangular grid. The rebuilt sheet
regains its original two-stage tear structure and can be destroyed again.

The Field Station planning table can be reached with a jump. Picking up its compass
clips the physical prop onto the avatar's right hip and unlocks an on-HUD compass for
the current expedition; it no longer remains as a loose duplicate. The clipped
compass remains a direct mouse target. Clicking and dragging it off the belt turns
the HUD heading off immediately and returns the same object to telekinesis, gravity,
kicks, and spells; collecting the loose compass clips it back on and restores the HUD.
Its pencils can be kicked, moved by Thunder, mouse-dragged and flung, or used to redraw
the loose cosmic grid. A click/tap without crossing the drag threshold equips that
physical pencil through a short arcing flight into the avatar's satchel loop; dragging
still takes immediate telekinetic control. The prop rotates and scales into its carried
pose during the flight, with a shortened low-arc version under reduced motion. The
equipped pencil remains attached to the persistent avatar across every portal,
projects visibly upward and behind the satchel, and can be dragged directly out of its
loop in any world. Releasing that pencil onto the player equips it again; a click
without movement leaves an already worn pencil equipped. If an unlocked loose pencil
is left behind during travel, portal teardown safely stows the same object before
disposing the zone. `R` likewise recovers it to the loop. Before first
collection, `R` restores a lost compass to its recorded tabletop transform. After it
has been pulled from the belt, `R` returns it to a safe loose recovery point without
silently restoring compass ownership.
The table's landing surface covers the full visible top, and its collider remains
solid until the player's feet clear the tabletop. The survey tent has a walk-through opening, visible
interior, climbable outer roof, and an interior-only bedroll interaction. Resting
places the operator on the bed, softens the camera, and holds that state until E,
movement, jump, or spell input wakes them. The initial Enter the World arrival places
the player one step outside that opening, facing into the tent; portal returns still
use their matching portal anchors. Each three-stone perimeter cluster has matching
per-rock foot collision and jump clearance instead of remaining a decorative clipping
volume. The void turtle stays out in the void beyond the
island, ignores incidental contact, bounces players only when they deliberately jump
onto its shell, and becomes rideable only after a cast Thunder pulse physically
reaches it. Merely unlocking Thunder does not wake it. Before then its eyes remain
shut and its inspection only observes its sleep. Raising the lantern near the void
edge reveals a lightning mark on a separate stone as environmental foreshadowing;
neither the mark nor the turtle explicitly states the prerequisite. A mounted turtle
circles indefinitely in a stable outer orbit so the official music embed can play
through. Its four articulated fins flap during flight. Six loose void asteroids are
spaced across one cruise lap and join bounded orbits as the turtle passes; captured
stones remain pointer-draggable, convert release velocity into radial/tangential
orbit changes, and follow the turtle after dismount or a later Field return. After
dismount, walking contact also kicks a captured stone into a changed orbit. A nearby
Thunder cast throws every captured stone into staggered radial/tangential arcs; the
existing turtle-orbit spring then draws them home without teleporting.
The cruise also adds a tapered comet trail, slow meteorite drift, galaxy haze, and
restrained Void Raid / chill telemetry. Only an explicit dismount begins the return: the turtle
spirals back, rotates toward its parked heading, and the player visibly steps from the
raised shell onto the platform instead of teleporting. The turtle remains at that
matching platform bearing. The river rune monument, Archive console, and CRT banks are
jump-landable.
NPCs remain visible while wandering, and the fish school remains visible and moving.

Near the center falls, the camera aligns with and tightens around the cave. Portals
face inward toward each island and charge automatically after the player remains
inside. Their surfaces are translucent, and each glyph and charging spinner remains
visible from either face.

Falls ledges, terraces, supports, and waterfall crowns no longer duplicate hand-entered
collision dimensions. Their rendered `Box3` bounds establish the collider center,
footprint, vertical span, clear height, and landing height before static batching.
A raised surface still catches only a descending operator whose previous/current
world-foot heights cross that exact top. A boot-width support allowance preserves
legitimate edge landings, while a short descent-only side-clearance window prevents
the body collider from rejecting the player on the same frame as a valid landing.
Floating ledges also honor their measured lower bound instead of behaving like
invisible columns down to the floor. Leaving a raised surface converts
platform-relative height into world height without canceling upward velocity.
The contextual waterfall camera uses a broad lateral falloff rather than a hard
center-line cutoff, so both summit routes retain one continuous view.

Q and the visible spell button charge while held and cast on release. Quick taps
remain responsive. Holding progressively increases binary digit count, digit size,
spread, and cast power. The Field heart is marked by a nested five-point floor sigil:
standing inside its visible boundary and releasing a full Surge or Thunder sends the
spell's outward pulse through all five lanterns. Spark cannot complete that circuit.
The sigil itself has no interaction target, hint prompt, or explanatory inspection;
players discover its response by experimenting with the visible center mark.
Surge is visibly distinct from Spark, with denser violet/cyan particles. Thunder adds
lightning, stronger object knockback, a light flash, and a ground shockwave.

Spell progress is condition-based rather than linear. The Falls ritual opens the cave;
opening its hidden chest evolves Spark into Surge. Pong and either Archive pinball
outcome can be completed in either order and are recorded independently. Pong victory
and the Archive signal prepare two independent marks. Once both exist, the player must
return to the Daemon Controller with Surge and speak to him; only that explicit
conversation bestows Thunder. Speaking after Pong with only Spark clearly names Surge
as the missing vessel. Terminal spell overrides remain deliberate sandbox exceptions.

F or the lantern HUD button raises a warm, shadowless player light. Nearby hidden
floor stencils and pictorial marks fade in; stowing it hides them again. Where a
revealed mark is inspectable, its copy remains an observation rather than a command
or solution.

Signal Grid towers are inspectable edge server racks. Surge ripples their status bars;
Thunder briefly flickers the entire rack cluster into a reboot cascade.
The Space Archive observability lens's baseline Spark probe remains a simple outward
scan. Once Surge is available, inspection or a cast emits a pooled
cyan/green/violet metrics-log-trace cascade around the lens. Thunder increases
density and speed and adds amber/coral warning records.

The west side also contains a sunless heliograph beneath a large suspended glass
parabola. A faint shaft enters from beyond the Archive along the collector's optical
axis. Operating the heliograph starts a bounded power sequence: the collector
brightens, its outer and inner gimbal rings align in order, the glass concentrates a
cone into the aperture, and the routed carrier appears only at the end. Quenching it
retracts the routed light before the rings coast down. This power state survives
ordinary world travel during the current run.

The concentrated source cone is physically reactive. Remaining inside it first
builds a wireframe heat shimmer, then ignites the avatar after 1.35 seconds. Ignition
is cosmetic and lasts about six seconds away from the cone, using low-poly flame
instances, a shadowless orange light, and a bounded amber/cyan ember trail. Its first
ignition in an exposure cycle cancels current movement, telekinetic holds, spell
charge, and guided walking, then briefly takes control for slapstick: the avatar runs
inward in a curved line, flails, drops, rolls twice, and gets back up before control
returns.
Standing in the cone can refresh the fire but cannot restart that control sequence
until the fire has completely gone out. Reduced motion uses a short startled run and
omits the ground roll. Falls water and `R` extinguish it immediately; leaving during
the warning stage cools the avatar without ignition.

The energized beam enters the violet archive prism. Four rooted crystal relays each
turn through discrete bearings toward the other prisms. Cyan and amber also retain
engraved observability bearings as deliberate false routes; violet and green do not,
because the field lies naturally between their faces. A click or tap advances a
prism between engraved bearings. Any relay controller visibly under the pointer can
be clicked or dragged regardless of the avatar's distance. Holding and dragging
rotates it continuously, leaves it at the released angle, and casts through
observability rather than treating the field as a physical target. A free-aim carrier
stops with a diffraction mark at the first finite Archive collision box; an
unobstructed one continues beyond every reachable camera framing. Relays can be
arranged while the source is dark, but route outcomes and achievements resolve only
after concentrated light reaches them.
Only relays reached by the live route emit the next segment, so a loop folds visibly
back into an already lit crystal. Moving a relay outside the live chain reports only
its dark controller bearing and never narrates a nonexistent carrier. Cyan focused
through observability converges into a noisy impact on the rear CRT bank. Amber
remains overdriven, crosses the field undaunted, and continues beyond every reachable
camera framing with no endpoint marker.

The energized carrier is physically interruptible by the avatar. A segment entering
the standing body stops at the coat with a colored diffraction ring, fragment sparks,
and a faint wireframe shimmer. All later segments, relay energy, phase packets, and
receiver effects go dark while the route is blocked. The chosen prism bearings do not
change, so stepping away restores the circuit immediately; the beam can also be
jumped over because interruption respects the avatar's current vertical span.

The Archive telemetry glass is also part of the room's vertical route. Its tall
blocker terminates at the rendered upper brass rail and shares that exact height with
a narrow jump-only landing strip, allowing careful traversal along the frame. A low
indexed service box fills the player-width cavity where the side-facing monitor bank,
rear observatory wall, and glass frame meet; it is a climbable step rather than a
collision pocket.

The four phase seals establish the required violet, amber, cyan, green order. Violet
splits the carrier into paired rails, amber amplifies and drives those rails apart,
cyan converges them, and green recombines them. The solved route then closes green
back into violet. That final criss-cross passes almost exactly through the
observability center, so the ring samples and amplifies the circulating carrier.
Correct phase and strong closed-loop feedback together record THE LONG LISTEN, spin
up the observability effects, and decode a signal that is visually distinct from the
relay route. The overhead answer resembles an eye-shaped remote sky containing an
eclipsed faceted world, broken orbital arcs, phase-colored stars, and one cold pulse
leaving the mapped edge. A violet-green-violet shortcut produces a repeated
two-color resonance, but cannot resolve without amber gain and cyan alignment. Other
wrong-order crossings excite weaker unstable responses. An unstable loop receives
only a small finite burst of observability pulses before settling into a steady glow;
it never continually restarts the telemetry cascade. The puzzle uses no carried
crystals or sockets. Spells flare the current route without changing its bearings or
solving it.

The archive asteroid has two optional outcomes: bank it into the marked CRT to reveal
a cracked-screen achievement, or send it through the violet portal to misroute it
into Field Station. Either records Archive pinball completion and unlocks Packet
Interference without requiring prior Pong completion. WRONG ADDRESS promotes the same
physical asteroid into a cross-world object. It rematerializes just inside the matching
Field Station threshold and may subsequently be kicked or dragged into any registered
portal; the destination world receives it beside that portal's counterpart. Its current
world and source route persist, while live transforms remain session-local. A small
projected contact shadow follows the asteroid across every world, follows stable
surfaces when it is deliberately placed, and fades while telekinesis lifts it.

The room-scale planets also form a lightweight space-pinball field. Walking into a
planet gives it radial and tangential momentum, briefly flashes and wobbles its body,
and nudges the player back. A displaced planet can cross an adjacent lane and exchange
momentum with another planet. Each visible planet is also a direct mouse/touch target.
On touch devices, separate fingers may hold separate planets while another remains on
the joystick. Radial dragging pulls a world out of lane, while its own release velocity
is decomposed into radial travel and angular boost so a tangential fling changes
orbital speed. A bounded atlas spring draws displaced worlds back without snapping.
Once every disturbed orbit
has remained settled, the central star atlas answers with a cyan pulse and brief light.
Archive casts have distinct physical verbs. Spark and Surge cancel planetary rigidity,
push nearby worlds away from the caster, and add angular speed; Surge supplies the
larger impulse. Thunder instead damps radial, angular, and tilt momentum almost to a
standstill, turns the footprint rings gold, and makes those temporarily heavy worlds
repeatable collision supports. Charge extends that slowdown rather than granting the
same effect to the earlier spells.
Repeated body-checks against actively orbiting planets intentionally preserve their
vertical player impulse. Crossing the fixed flight line above the room's highest orbit
records the hidden, session-latched ascension milestone immediately. The route is
deliberately unconstrained: a moving ladder, player-clumped worlds, or temporarily
Thunder-locked planets all qualify, while noclip does not. The Archive update emits
the milestone after that frame's contact chatter. If the player subsequently lands on
the star-atlas crown while the milestone toast remains visible, its ordinary landing
observation is retained in the journal and announced to assistive technology
immediately, but its visual toast waits until the achievement has finished.
The floating asteroid belt uses the shared kickable/telekinesis simulation, rebounds
from room boundaries and planets, and transfers strikes into their orbits. These
collisions and the atlas response are playful secondary interactions, not additional
progression requirements. The initial asteroid layout leaves the observability lens's
approach and face unobstructed.

The observatory's east corner uses framed amber data glass rather than an opaque wall.
White orbit records and trace bars scroll across one translucent pane while players,
planets, and asteroids remain readable through it. Thin brass rails and dark cables
retain the structural silhouette, and the corresponding collision is narrowed to
that visible cage instead of preserving the former solid block. Every CRT uses its
own body collider and matching visible-top landing surface rather than one broad
invisible bank; a low maintenance trunk provides the first deliberate step.

## Terminal

Required commands:

```text
help
man <command>
ls [place]
cd <field|falls|grid|archive|mightymatica|..|/>
pwd
cat <file>
tree
history
echo <text>
date
uname
which <command>
open <atlas|folio|portfolio>
exit
map
goto field
goto falls
goto grid
goto archive
goto mightymatica
tp field
tp falls
tp grid
tp archive
tp mightymatica
tp math
whoami
projects
portfolio
respawn
quality low|medium|high
speed 1|2|3
noclip
spark
spell surge
spell thunder
surge
thunder
lantern
lantern on
lantern off
clear
ritual
ritual open
```

The terminal initially models the four indexed surface zones as mounted directories.
Before Mightymatica discovery, the dimensional Atlas shows only a disabled unresolved
depth beneath Signal Grid, while `ls`, `tree`, help, and place completion omit its
name. Exact commands `goto math`, `goto mightymatica`, `tp math`, `tp mightymatica`,
and `cd /mightymatica` are still accepted as unadvertised routes. `goto` takes the
physical cube route, while `tp` retains its normal pencil requirement. Both emit an
`unindexed carrier accepted` trace before travel. First arrival through one of these
commands or the physical cube adds the versioned
discovery and visit records, writes a signal-indexed journal milestone, and reveals
the nested atlas node plus normal terminal listings/completion. The canonical shell
directory is `/math`. `ls` exposes zone-local lore/status files, `cat` reads them,
and the title tracks the physical terminal's current zone. Terminal history uses the
arrow keys; Tab completes commands and currently indexed place names.

`cd <place>` is the immediate operator route. The modeled shell directory changes only
after the destination settles, so failed or interrupted crossings do not leave the
prompt claiming a different world.
`goto <place>` closes the terminal and asks the existing A* route solver to walk the
avatar through the required portal chain. It does not auto-equip the pencil or replace
the journey with a teleport. Manual movement cancels the route.
`tp <place>` does not provide a second instant alias: it requires the cyan planning
pencil to be physically equipped. The avatar kneels, takes that same prop from the
satchel loop, visibly traces a thick cyan circumference, and ignites the interior route
glyph stroke by stroke. Segmented cyan pillars then rise around the completed seal
before a ground flash and translucent light column enter the normal transition. The
veil waits long enough for that departure beat to read. Reduced motion resolves the
same circle and glyph quickly, omits the rising pillars, and uses a softer flash. A
missing or loose pencil leaves the terminal open with an actionable error pointing to
`cd`; an amber pencil is a valid repair tool but cannot execute this route.

## Field folio

The world-side satchel opens one native dialog with four leaves:

- **Journey** shows every catalogued milestone slot without revealing locked names or solutions.
  First-unlock title, description, place, and date persist locally and are also retained
  by the current-session terminal journal.
- **Atlas** is the single discovery-aware shortcut surface. Its constellation layout
  uses a projected survey lattice, routed threshold lines, and spatial nodes rather
  than a card menu. The unresolved Grid-depth node becomes an active Mightymatica
  route after first arrival. `M`, the top Atlas button, world requests, and terminal
  `map` all open this leaf rather than maintaining a separate duplicate map dialog.
- **Spells** shows recovered forms, the active form, and Packet Interference state.
  Selecting an unlocked form changes the equipped cast without rewriting completed
  challenge records.
- **Magitech** combines leather/brass framing with cyan diagnostic circuitry. It owns
  live quality selection, atmospheric/high-contrast UI ink, system/reduced optional
  motion, HUD telemetry visibility, field-manual access, and current-zone respawn.

## Persistence

Quality and the versioned folio appearance/accessibility preferences are stored in
`localStorage`. The achievement ledger uses `portfolio-world-achievements`; folio
preferences use `portfolio-world-preferences`. Versioned navigation state persists
discovered and visited zones under `portfolio-world-navigation`; it is the shared
source for atlas and terminal authorization. A separate
`portfolio-world-progress` record persists spell rank, Packet Interference, the
Pong/Archive flags required by the upgrade chain, and the current/source zones of the
traveling WRONG ADDRESS asteroid. Pure normalization repairs coupled invariants in
partially written state, while existing milestone records remain an upward-only
migration source. Live prop transforms, puzzle layouts other than the session Hanoi
snapshot, compass ownership, and pencil ownership intentionally are not persisted:
each fresh world requires picking up the physical table compass. Scene-independent
runtime memory preserves a worn compass and the Hanoi board across teleports while
active-zone geometry is disposed and rebuilt. Pulling the compass loose revokes that
ownership state and hides the HUD until the physical prop is collected again.
