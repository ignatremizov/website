# World Map

Reference: [`art/concepts/01-world-map.png`](../../art/concepts/01-world-map.png)

## Topology

The world is made of independently loaded islands connected by portals.
Portals are translucent, with their glyph and spinner visible from both faces.

```text
                    Space Archive
                         |
                    hidden portal
                         |
Luminous Falls <-> Field Station <-> Signal Grid
                                          |
                              reconstructed cube
                                          |
                                    Mightymatica
```

## Field Station

The hub contains the introduction, enterable survey tent, planning table, terminal,
telescope, and three inward-facing portal approaches. Picking up the planning-table
compass clips it to the avatar's right hip and unlocks an on-HUD heading for the
current expedition. Pulling it from the clip makes it loose and hides that heading
until recollected. The moon-ringed turtle remains out in
the void, bounces only players who intentionally jump onto its shell, and becomes
rideable after Thunder.

## Luminous Falls

The fantasy zone contains tiered waterfalls, a bridge loop, three symbolic ritual
sockets, a mixed draggable crystal cache, three visible wandering NPCs, and a visible
moving fish school. Trees, bushes, and hanging vines frame a two-sided parkour route
that links ground-level ledges, moss terraces, all three waterfall crowns, and the
central summit. The placement-and-sequence ritual parts the center waterfall; opening
the chest behind it produces a celebratory coin/light burst and establishes Surge.

## Signal Grid

The systems zone contains the career route, connected edge server racks, terminal
plaza, reconstructable legacy-simulation cube, checksum Tower of Hanoi, and Pong arena.
The Hanoi corner uses three square-holed, ancient cash-inspired value coins; coral
INGRESS, cyan BUFFER, and green SETTLE provide a checkpoint-to-consensus route with
guarded reset.
Its lightly emissive deep-teal floor and lifted atmospheric baseline keep black rack,
court, portal, and puzzle silhouettes readable without weakening the neon accents.
Surge and Thunder visibly ripple or reboot the racks. The Daemon Controller operates
the coral Pong paddle as his hand; Packet Interference disrupts its prediction.
Pong completion grants the Controller's dormant storm-mark independently and may
happen before or after Archive pinball.

The cube is a nested threshold rather than another Field Station portal. Its first
interaction performs a short browser-native reconstruction and opens without requiring
Pong, Hanoi, a spell stage, or another challenge. The first physical crossing leads
to Mightymatica. Its return route rebuilds Signal Grid and places the player beside
the cube rather than at the Field portal. Inside Math, that return route is a square
wireframe inside face of the reconstructed cube with an amber-violet core, visually
distinct from the world's round portal kit.

## Mightymatica

Mightymatica is an explorable workshop held inside the reconstructed cube. A
three-level instanced Sierpiński carpet establishes the room, while transparent
rotating cube frames expose its sub-dimensional character. Pythagoras retains his
original compact Flash model through a recovered body and XFL-positioned Canvas
overlays while remaining a crisp flat billboard. A restrained line
reads: “From Yuri Remizov’s original experiments — rebuilt with love.”

The opening room curates five recovered ideas rather than importing the complete Flash
archive: the multiple-of-nine Mind Reader with its original magician image, a
remote-button Buffon needle rain inside a jumpable animated control boundary, Yuri's
recovered four-piece 5 × 8 Chocolate out of
nothing cut, an existing floor corner deepening subtractively as one complete
four-generation sub-carpet, and a
relaxed Falling Figure reinterpretation using five lighting-independent Platonic-solid
colors. Mind Reader keeps the multiple-of-nine observation hidden until after the
first reveal. Ladder Cat, MindCoins, and Twin Structures remain preserved candidates
for deeper rooms.

## Space Archive

The optional archive is a CRT observatory containing a monitor choir, stylized market
and ledger telemetry, an observability lens, a smiley screen, star globe, wandering
moon, and asteroids. Its observability sightline stays clear while the room-scale
planets act as reactive pinball bumpers: player and asteroid impacts disturb their
lanes, neighboring worlds can ricochet, and mouse flings alter radial position and
angular speed. Floating asteroids are independently flingable. The central atlas
briefly lights once all disturbed planetary lanes settle. Transparent amber traffic
glass keeps the east pinball corner visible beneath scrolling telemetry. A sunless
heliograph in the west hangs beneath a glass parabolic collector. Its incoming
off-world shaft and sequential gimbal spin-up make source power visible before a
concentrated beam reaches four fixed crystal prisms. Violet, amber, cyan, then green
transforms the beam before green closes the circuit back into violet. That return
crosses observability and decodes an eye-shaped remote sky around an eclipsed world
rather than reproducing the relay route. Visible relay faces support long-range
detent clicks and continuous pointer aiming. Free rays strike Archive collision boxes
or continue into the void. Cyan's lens detent ends
against the CRT bank; amber's passes through the ring and beyond the platform. No
essential
portfolio content depends on finding it. Either floor-asteroid goal outcome records
Archive completion and unlocks Packet Interference independently of Pong.

## Progression rule

Opening the Falls chest establishes Surge. Pong and either Archive pinball outcome
can be completed in either order, and both results are recorded independently.
Thunder wakes from the Daemon Controller's storm-mark only once both challenges are
complete and Surge exists.

Mightymatica discovery is independent from spell/challenge progression. Before first
arrival it is absent from the atlas, terminal root, `tree`, help, and completion.
The command parser nevertheless accepts the exact, explicitly typed aliases
`tp mightymatica` and `tp math` (with the cyan pencil worn), plus
`cd /mightymatica`, as secret routes. First arrival
through either the cube or a secret command persists discovery and visit state;
afterward those routes become advertised through normal atlas and terminal surfaces.

## Streaming rule

Only the active island remains live. The destination may be prefetched when the
player approaches a portal. The transition effect masks unloading and creation of the
next zone. Mightymatica code is a second dynamic chunk loaded during cube
reconstruction or before discovered fast travel; its textures and scene runtime are
disposed when leaving the zone.
