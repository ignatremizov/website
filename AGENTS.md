# Repository guidance

## Project summary

**Systems Under Strange Skies** is Ignat Remizov's personal portfolio presented in two layers:

- An eager, semantic HTML portfolio and landing shell that remains readable, accessible, crawlable, and useful without loading the game.
- An opt-in, top-down Three.js world containing Field Station, Luminous Falls, Signal Grid, Space Archive, and the separately lazy-loaded Mightymatica sub-dimension. The world combines traversal, puzzles, physics toys, achievements, spells, terminal commands, responsive controls, and persistent progression.

This is a browser-only Vite and TypeScript project with no application backend. Browser storage holds versioned preferences, discovery, achievements, and scene-independent progression. Most world art is procedural or code-built Three.js geometry, with a small set of static assets under `public/assets`.

Progressive loading is part of the product architecture. The HTML shell loads first, Three.js and `PortfolioGame` load only after entering the world, and Mightymatica loads only when its cube route is prepared or entered. Preserve those boundaries and the low/medium/high quality tiers when adding features. See `docs/preproduction/architecture.md` for the detailed technical design and `README.md` for the current gameplay inventory.

## Architecture and layer boundaries

### Repository tree

```text
index.html                         Current semantic shell and portfolio markup
src/
├── main.ts                        Eager browser composition root
├── styles.css                     Landing, portfolio, HUD, dialogs, and controls
├── world/
│   └── WorldContracts.ts          Three.js-free shared world vocabulary
├── shell/                         Scene-independent application state and rules
│   ├── AchievementLedger.ts       Achievement catalog and versioned persistence
│   ├── TerminalCommands.ts        Canonical command and alias registry
│   ├── WorldNavigation.ts         Discovery and visit persistence
│   ├── WorldPreferences.ts        Accessibility, quality-UI, and HUD preferences
│   ├── WorldProgress.ts           Versioned progression persistence
│   ├── WorldProgressRules.ts      Pure normalization and migration rules
│   ├── WorldMeta.ts               Event Horizon meta-progression
│   └── browserStorage.ts          Guarded browser-storage access
└── game/                          Lazy Three.js runtime
    ├── PortfolioGame.ts           Renderer and game composition root
    ├── InputController.ts         Keyboard and movement-input lifecycle
    ├── Kickable.ts                Shared lightweight-physics prop record
    ├── PortalNetwork.ts           Cross-world thresholds and progress displays
    ├── *Rules/selection/raycast   Focused deterministic gameplay helpers
    ├── *Effect/*Sequence          Stateful bounded visual controllers
    ├── scenePrimitives.ts         Shared primitive construction
    ├── sceneResources.ts          Shared GPU-resource disposal
    ├── proceduralTextures.ts      Runtime-authored texture helpers
    ├── zones/                     Stateful controllers grouped by owning world
    │   ├── archive/
    │   │   └── ArchiveSignalPuzzle.ts  Heliograph and observability lifecycle
    │   ├── falls/
    │   │   └── FallsRuneRitual.ts Rune puzzle, waterfall, and chest lifecycle
    │   └── grid/
    │       ├── HanoiPuzzle.ts     Checksum puzzle, snapshot, and visual lifecycle
    │       └── PongChallenge.ts   Court, reliquary, input, and match lifecycle
    └── math/                      Separately lazy Mightymatica feature boundary
        ├── MightymaticaZone.ts    Math-room composition and lifecycle
        ├── types.ts               Context and runtime ports to the main game
        └── *Exhibit/*Garden       One focused module per exhibit
public/                            Files served unchanged at runtime
tests/                             Fast Node tests for deterministic rules
scripts/                           Build and repository tooling
docs/preproduction/                Design, gameplay, architecture, and budgets
art/concepts/                      Reference art, not runtime source
```

The other root-level HTML files are preserved legacy/static pages. New portfolio and game work belongs in the current `index.html` and `src/` application unless the user specifically asks to modify a legacy page.

### Runtime flow

```text
DOM input
  → main.ts
  → public PortfolioGame command

PortfolioGame event
  → GameHooks callback
  → main.ts
  → DOM update or shell-owned persistence

PortfolioGame
  → dynamic import of MightymaticaZone
  → narrow MightymaticaZoneContext
  → individual exhibit controllers
```

`main.ts` owns DOM lookup, dialogs, terminal presentation and execution, URL/history integration, persistence wiring, and lazy construction of the game. It may depend on the shell and the public `PortfolioGame` API. Code below this layer must never import `main.ts`.

`src/shell/` owns state that remains meaningful when no Three.js scene exists. Shell modules may import Three.js-free types and validators from `world/WorldContracts.ts`; they must not import `PortfolioGame`, scene objects, renderer code, or math exhibits. Storage must remain guarded through `browserStorage.ts`, versioned, validated on read, and recoverable when storage is unavailable.

`world/WorldContracts.ts` is the lowest shared contract layer. Keep it free of Three.js, DOM access, storage, and feature-controller imports. Zone IDs, labels and aliases, quality tiers, spell ranks, and cross-layer status/progression types belong here when both the eager shell and lazy game need them.

`PortfolioGame.ts` is the Three.js composition root. It owns the renderer, frame loop, zone lifecycle, shared player/camera/collision/interaction systems, and adaptation to `GameHooks`. It may orchestrate features, but it should not own browser storage, query shell DOM, or render HTML UI. Avoid adding another large state cluster directly to this file when a mechanic has its own state, update loop, quality behavior, or disposal needs.

Focused modules under `src/game/` own reusable rules, effects, props, and sequences. A stateful controller should accept the smallest useful context or callbacks and expose a narrow lifecycle such as `update`, `setQuality`, `reactToSpell`, `reset`, or `dispose`. A pure calculation should avoid Three.js when plain numeric inputs are enough. Do not move a one-line coordinate or material adjustment into a new abstraction; extract a coherent behavior.

`PortalNetwork.ts` owns ordinary threshold construction, custom cube-aperture registration, dwell locking, arrival guards, milestone crystals, lantern-revealed command fragments, and the small read-only handles used by auto-walk and the traveling asteroid. `PortfolioGame` still decides when travel occurs and owns arrival placement, route solving, progression hooks, shared interactions, and per-world Event Horizon handling. Custom portals should register through `PortalNetwork`; do not mutate a second portal-state collection in a zone or exhibit.

`src/game/zones/` contains substantial world-owned controllers. A controller owns its feature state, geometry construction, interactions, animation, transient snapshot, and dynamic-object enumeration together. `PortfolioGame` supplies shared engine services through a narrow host context and decides when zone-level events run. Shared runtime records such as `Kickable` live above zone modules so the composition root never depends on a zone-specific physics type. In particular, `WorldCollapseSequence` owns the common Event Horizon envelope while `PortfolioGame` retains per-zone dispatch; a feature controller may expose its own destruction reaction without replacing that world-specific coordination.

`src/game/math/` is a hard lazy-loading boundary. `MightymaticaZone.ts` composes the room, and each substantial exhibit belongs in its own module. Exhibits receive shared engine services through `MightymaticaZoneContext`; they must not import `PortfolioGame`, `main.ts`, or shell modules. Do not statically import a math exhibit from code in the eager shell or main game chunk.

### Where new code belongs

- Landing, portfolio, HUD, dialogue, terminal, settings, accessibility, and responsive presentation belong in `index.html`, `styles.css`, and focused `src/shell/` modules. Keep `main.ts` as wiring; extract independent shell state or behavior instead of growing it by default.
- Persistence schemas and recovery belong in the matching `src/shell/` store. Pure invariants and migrations belong in a sibling rules module.
- Shared cross-layer vocabulary belongs in `world/WorldContracts.ts`, but only when more than one layer genuinely consumes it. Feature-local types should stay with the feature.
- Renderer-wide traversal, camera, collision, interaction, and zone-lifecycle changes are wired through `PortfolioGame`. Put separable calculations or controllers in focused `src/game/` files and let `PortfolioGame` compose them.
- Small changes to an existing Field, Falls, Grid, or Archive prop can remain beside its current builder in `PortfolioGame`. A substantial new puzzle or prop with independent state should become a named controller under `src/game/zones/<zone>/`.
- Mightymatica room changes belong in `src/game/math/`. Add a module per exhibit and register it through `MightymaticaZone`, extending the context port only for a service that multiple exhibits or the host must coordinate.
- Reusable geometry constructors belong in `scenePrimitives.ts`; procedural visual resources belong in `proceduralTextures.ts`; teardown logic belongs in `sceneResources.ts`. Do not duplicate these responsibilities inside a feature.
- Runtime images and preserved exhibit media belong under a descriptive `public/assets/` subdirectory. Design references belong in `art/concepts/`.
- Durable architecture or gameplay decisions belong in `docs/preproduction/`. `docs/preproduction/performance-budget.md` is generated by the build.
- Pure regression coverage belongs in `tests/` and should import the focused source module that owns the rule.

### Boundary rules

- Dependencies point toward contracts and focused helpers, never back toward a composition root. Avoid circular imports.
- Cross the shell/game boundary with initial state, public game commands, and `GameHooks`. Do not reach across it through storage, DOM queries, or global mutable state.
- Persist scene-independent facts, such as earned progression and discovery. Keep mesh references, timers, animation phases, pointer captures, and transient physics in the runtime that owns them.
- Any module that creates GPU resources or listeners must have a clear teardown path. Async feature work must tolerate zone changes and disposal.
- Frame-loop code must avoid routine allocations, DOM work, storage writes, texture regeneration, and repeated dynamic imports. Cache reusable vectors, geometry, materials, and scratch results.
- New visual controllers must honor quality changes and reduced-motion behavior where relevant. Bound particle, instance, and physics counts rather than allowing unbounded accumulation.

## Testing

Tests in this project should protect meaningful game behavior and previously observed regressions. They should not exist merely to increase a test count.

### What deserves a unit test

- Deterministic game rules with meaningful branches or invariants, such as progression recovery, terminal command resolution, challenge state, collision and surface-selection math, ray intersections, and cross-system ownership transitions.
- A focused regression when a bug can be reduced to stable inputs and outputs. Name the test after the player-visible behavior it protects.
- Pure helpers extracted from large rendering or update loops when that extraction also improves production boundaries and readability.
- Important edge cases that are difficult or time-consuming to reproduce manually.

### What usually does not deserve a unit test

- JavaScript, TypeScript, DOM, or Three.js behavior already guaranteed by those platforms and libraries.
- Constructors, getters, constant tables, static scene composition, trivial wrappers, or exact implementation details.
- Exact colors, positions, animation timings, particle counts, mesh shapes, camera framing, layering, and other presentation choices that require visual judgment.
- Mock-WebGL, large snapshots, or brittle DOM assertions used only to claim coverage for a visual feature.
- Test-only exports or abstractions that make production code less clear.

When a change is primarily visual or spatial, verify that it type-checks and builds, then give the user a short manual in-game checklist. Do not claim that an interaction looks or feels correct without visual confirmation.

### Browser and performance policy

- Do not run Playwright or other browser automation unless the user explicitly requests it. The user performs interactive visual testing, and automated browser runs have previously consumed excessive CPU.
- Keep unit tests deterministic, fast, and independent of a browser, GPU, network, wall-clock timing, and unseeded randomness.
- Run the narrowest relevant checks while iterating. Avoid repeatedly running the full suite for presentation-only edits.

### Project commands

- `npm run type-check`: default static verification for source changes.
- `npm run test:unit`: fast Node unit suite in `tests/*.test.mjs`.
- `npm run check`: type-check plus unit tests; use for logic changes before handoff.
- `npm run build`: production verification when integration or bundling may be affected. Its `postbuild` hook regenerates `docs/preproduction/performance-budget.md`; treat that file as generated output.

For a documentation-only change, inspect the result directly; do not run application tests without a concrete reason.
