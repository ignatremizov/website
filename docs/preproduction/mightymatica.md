# Mightymatica Cube Dimension

## Purpose

Mightymatica is a nested preservation world beneath Signal Grid. It translates a
small representative set of recovered Flash-era experiments into native Three.js and
Canvas interactions while the complete SWF/XFL/ActionScript/FLA archive remains
separate and authoritative.

Yuri Remizov made the original site. The room carries one quiet attribution:
“From Yuri Remizov’s original experiments — rebuilt with love.” The wording is warm
and specific without framing the space as a memorial. The recovered files do not
establish per-object authorship or identify every photographed person; runtime copy
does not infer either.

The opening room is intentionally curated. It proves the world, discovery, lifecycle,
and interaction model without loading every recovered object or presenting unfinished
ports as playable work.

## Route and discovery

```text
Field Station → Signal Grid → sealed cube → Mightymatica
                                      ← cube-face aperture
```

1. The Grid cube begins sealed unless Math discovery was restored from storage.
2. Interaction performs a short reconstruction and preloads the Math chunk.
3. The active cube removes its collider and registers a dwell crossing whose core
   folds inward during departure.
4. First arrival records both discovery and visit. It may occur through the physical
   cube or an explicitly typed secret terminal alias; reconstruction without crossing
   does not.
5. The atlas reveals a nested Mightymatica node and the shell indexes
   `tp mightymatica`, `tp math`, and `cd /mightymatica`.
6. Either physical crossing rematerializes the matching destination face from
   scanline fragments and nested wireframes. Physical return uses the `math → grid`
   arrival anchor beside the Grid cube.
7. Atlas, `cd`, secret aliases, and cyan-pencil `tp` arrivals use their neutral spawn
   and do not borrow the physical cube's rematerialization effect.

Before discovery, Math appears in the visual Atlas only as a disabled unresolved
Grid-depth node and remains absent by name from `ls`, `tree`, help, and place completion.
The exact aliases `tp math`, `tp mightymatica`, and `cd /mightymatica` deliberately
remain usable as secret entrances. They print `unindexed carrier accepted`, travel to
the neutral Math spawn, and let normal first-arrival indexing reveal the destination.

Navigation is stored as version 1 in `portfolio-world-navigation`:

```json
{
  "version": 1,
  "discovered": ["field", "falls", "grid", "archive", "math"],
  "visited": ["field", "grid", "math"]
}
```

## Opening room

### Pythagoras

The curator remains a flat billboard but now follows the original Flash construction
rather than an interpretive redraw. His exact 348×452 body is decoded from the FLA's
embedded `Pifagor/Pifagor-body.png`; white eye bases, cyan irises and pupils, peach
hands, turquoise brow tufts, and the quiet beard line are redrawn at high resolution
from their original XFL coordinates and transforms. This preserves the compact round
silhouette, robe, laurel, hands, and facial proportions without scaling a 113×132
atlas frame. The complete animation atlas remains a non-runtime preservation reference.

### Mind Reader

The station retains the recovered magician photograph and places the complete ritual
on a readable in-world panel before the player invokes the orb:

```text
1. Choose any two-digit number.
2. Add its two digits.
3. Subtract that sum from the original number.
4. Find the result and remember its symbol.
5. Ask the orb for its answer.
```

Each round builds a new 0–99 chart. Multiples of nine receive one shared target
symbol; every other entry receives a deterministic alternate. Before reveal, all
in-world copy contains only the ritual. The first reveal names the predicted symbol
without explaining it. A subsequent inspection unlocks the
`(10a + b) - (a + b) = 9a` observation, after which the player may reset the chart.

### Needle Rain

The experiment starts from a red pressure button on a separate post rather than from
the tabletop. E/Enter/touch works while standing beside it, a nearby mouse or touch
may press the modeled button directly, and landing on its registered top depresses
the same switch. Four short posts carry animated black-yellow
tape around the table. The tape is a real low collider: walking cannot pass it, while
an ordinary jump clears it and the table edge.

The button starts a visible instanced rain rather than snapping in a batch. Its
emission rate accelerates over time; another press quickens the current run. Landed counts,
crossings, and the estimate `π ≈ 2LN / (DC)` update continuously on the table display,
where `L` is needle length, `D` line spacing, `N` settled drops, and `C` crossings.
Low/medium/high cap one run at 240/480/720 needles. Once the cap settles, emission,
matrix work, and Canvas texture updates stop until replay. Settled needles retain
their random planar angles and overlap in eleven extremely shallow height bands, so
the finished sample reads as one flat spiky accumulation rather than a tidy set of
separated sticks. Entering the cordon while collection is active collides with nearby
falling and settled samples: settled/crossing counts can decrease, displaced needles
fall again with altered positions and angles, and their new crossings are counted
when they land. The display continues showing the corrupted estimate but marks the
entire run invalid and withholds NEEDLE DROP.

### Chocolate out of nothing

The exhibit follows Yuri's actual `Chocolate out of nothing` scene recovered from the
`Paradox box.swf` XFL: a 5 × 8 bar divided into the top-left square, a five-square
vertical strip, and two shallow diagonal slabs. Raised cells are clipped by those
original piece outlines, so the diagonal visibly cuts the chocolate rather than
merely crossing a generic rectangle. The pieces move through intact, separated,
apparently reassembled, and explanation states using translation only. The top-left
square remains beside the reassembled bar; the one-square conserved area is spread
along the diagonal kink and rendered as a narrow recessed groove rather than a hole,
producing the apparent forty-first square. Each loose slab also owns a live blocker
and an exact polygon-footprint landing surface. Those records follow animation,
rotation, dragging, and stacking, so the player can climb the chocolate while the
open diagonal regions remain genuinely open.

### Sierpiński floor

The environment recursively divides a square three times and renders all 512
surviving cells through one instanced mesh. A solid foundation remains beneath it, so
the visual holes do not create collision traps.

The northeast patch is not a detached exhibit: it is the existing 3 × 3 floor parent
centered at `(12, 12)`. Its eight one-unit tiles and missing middle square are removed
from the static floor and redrawn dynamically with the exact same lit material,
elevation, thickness, gaps, and deterministic color rule. Each generation applies the
Sierpiński rule to every survivor, so the whole patch advances through `8`, `64`,
`512`, and `4,096` leaves rather than repeatedly following another selected corner.
Every parent loses its center at every level. One instanced draw keeps the complete
fourth-generation sub-carpet bounded. During each transition, the next generation's
eight survivors plus its temporary centre begin as nine compressed cells that exactly
reconstruct each parent tile's previous footprint and colour. The cells spread into
true thirds with a slight growth swell and colour change; only after that expansion
does a second bounded instanced pool sink and shrink the newly removed centre cells.
The whole floor neither vanishes nor snap-fills its old seams between generations.
Its flat perimeter line requires no new collider or landing surface. Reduced motion
reveals each generation immediately.

### Falling Solids Garden

Five instanced Platonic-solid families vary in size and drift toward five matching
vessels. Each family owns a fixed cyan, coral, amber, green, or violet unlit material
rather than relying on per-instance lighting or tint multiplication; a bright
matching facet wireframe keeps every face readable in the dark room on every quality
tier. Interaction releases a new wave. There is no
timer, failure state, or progression reward. Reduced-motion preference places the
shapes directly in their vessels instead of animating their fall.

### Recovery catalogue

The console states what is active and what remains preserved. Ladder Cat, MindCoins,
and Twin Structures are named as later-room candidates, not represented by empty
playable stations.

## Runtime boundary

`src/game/math/**` owns Math scene construction, exhibit state, animation, quality
changes, and texture cleanup. `PortfolioGame` owns only shared travel, interaction,
collision, status, and zone disposal contracts.

- The Math module is dynamically imported.
- The full floor, bounded 4,096-tile Sierpiński patch, Buffon needles, and falling solids
  use bounded instancing; chocolate uses four exact extruded pieces with batched
  clipped cell tops.
- Low/medium/high quality changes the Buffon run cap and active solid count.
- Recovered textures total under 200 KiB and are disposed on zone exit.
- Reduced motion settles ambient solids, slows cube/core rotation, and preserves every interaction.
- Ambient Math animation accepts the engine's adaptive 30 FPS idle cadence. Buffon
  falls and short chocolate/Sierpiński transitions promote rendering to 60 FPS, then
  relinquish it after settling.
- Buffon's live Canvas display is dirty-driven and throttled while counts change; a
  completed or untouched station performs no recurring texture upload.
- Exhibit-table colliders clear at their visible tops and have matching jump-only
  landing surfaces, preserving the world's climbable sandbox behavior.
- Every result and instruction is echoed through the existing live status region.

## Runtime assets

Two recovered rasters are loaded by the opening room:

- `public/assets/mightymatica/pythagoras-body-original.png`
- `public/assets/mightymatica/mind-reader-original.jpg`

`public/assets/mightymatica/pythagoras-atlas.png` remains beside it as an exact
preservation reference for the complete animation, but is not requested by the
runtime. Their exact sources and SHA-256 hashes are recorded in the asset directory
README. No SWF is loaded by the default experience.

## Manual route

1. With navigation storage cleared, confirm Atlas shows one disabled unresolved depth
   beneath Grid while Math remains absent by name from `ls`, `tree`, help, and
   completion.
2. Type `tp math` (repeat separately with `tp mightymatica` or
   `cd /mightymatica`) and confirm the hidden-carrier trace followed by arrival and
   indexing. Clear navigation storage again to test the physical route.
3. Start in Field Station, enter Signal Grid, and interact with the west-side cube.
4. Confirm reconstruction, remain inside the cube core, and cross.
5. Confirm the discovery journal event, nested atlas destination, terminal listings,
   aliases, and tab completion.
6. Confirm Pythagoras is crisp at close range and the Yuri attribution is quiet,
   readable, and not memorial framing.
7. Complete Mind Reader's visible five-step ritual, confirm the reveal contains no
   explanation, then inspect once more to unlock the multiple-of-nine observation.
8. Start Needle Rain from the separate red post using E, a direct click, and a jump
   landing on the button.
   Confirm the tape animates, blocks walking, and can be jumped. Enter during the run;
   nearby needles should lift/scatter, settled and crossing counts should revise, and
   the display should mark that run invalid. Reset, complete one clean run, and confirm
   it stops at the quality cap and becomes idle.
9. Run chocolate through all four phases and confirm the 5 × 8 bar uses the recovered
   top-left-square, five-square-strip, and diagonal cuts before revealing the apparent
   forty-first square; there should be no pre-cut holes or post-slide see-through gap.
10. Advance the existing 3 × 3 carpet corner from generation one through four. Confirm
    its first eight tiles match the surrounding floor, every center is absent, and the
    whole surviving sub-carpet subdivides at each step.
11. Confirm all five solid colors and facets remain readable in the dark.
12. Cross the square cube-face aperture and confirm arrival beside the Grid cube.
13. Reload, enter Grid, and confirm the cube and fast-travel route remain indexed.
