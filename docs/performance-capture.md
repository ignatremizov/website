# Frame-drop capture

The recorder is off by default. It observes the existing runtime without changing
frame pacing, resolution, lighting, physics, route budgets, or input behaviour.
It does not start another rendering loop, replay controls, or run a browser test.

## Record normal play

Refresh the production preview, enter the world, open its terminal, and run:

```text
debug perf 120
```

The terminal closes after confirming the command. Play for about two minutes:
walk, hold-drag across surfaces, jump onto the monument, carry a crystal, and open
the chest when convenient. Keep your usual quality setting. There is no need to
enable collider, path, or top-down overlays; they add work of their own.

The recorder stops automatically and shows a completion status. Then run:

```text
debug perf export
```

This downloads `performance-trace.json`. Exporting stops an unfinished capture
before serializing it, so the download itself cannot produce a recorded hitch.
Send the file with a brief description of any noticeable pauses. A separate phone
capture is useful, but do not compare it with a simultaneous automated workload.

`debug perf` reports status. `debug perf off` stops and retains data; `clear` stops
and erases it; `mark` adds a timestamped user marker without free-text contents.
`on` starts a new 120-second capture. A numeric duration accepts 10–300 whole
seconds. Starting a new capture replaces the previous one. The duration is wall
time, so switching apps does not keep a recorder alive indefinitely.

## What the file contains

The versioned export includes a column schema and compact numeric frame rows,
the 32 worst candidate hitch frames paired with their preceding frame, bounded
events, and the build filename, browser user agent, and initial viewport size.
Rows include:

- Raw rendered-frame gaps, the current/preceding pacing allowance, callback gaps,
  and the number of callbacks since the last rendered frame (including paced skips).
- CPU durations for player/travel, other actors, NPCs/fish, the Falls ritual and
  effects, spells/interactions, animation, camera/dragging, occlusion, pointer
  feedback, render submission, and metric updates. Navigation and prop physics
  (including placement) are nested measurements within player time.
- Player position, request ID, zone, quality, input/route/airborne/effect flags,
  render calls, triangles, cached program count/change, geometry/texture counts,
  backing-buffer size, and pixel ratio. These read existing JavaScript records,
  not synchronous GPU queries.
- Pointer-dispatch counts, total/worst CPU time, and slow-event markers. Events
  also annotate chest opening, zone/quality changes, focus, visibility, and
  input locking by overlays.

`longtask` and `long-animation-frame` observations are included only when the
browser advertises support. The export says which types were enabled. Only
their type, relative start time, and duration are retained: script URLs,
attribution, function names, DOM contents, and terminal text are not collected.
An absent browser event is **not** evidence that no external task occurred.

## Interpretation and limits

A candidate hitch exceeds `max(1.5 × expected interval, expected interval + 8 ms)
+ 0.5 ms` in either raw frame gap or CPU time. This is a diagnostic threshold, not
a count of frames physically missed by the display. The pacer's existing display
alignment and previous idle/active interval are accounted for, so normal 30 FPS
rendering and switching to active cadence do not automatically count as drops.

An expensive frame can delay the **next** callback. Inspect a hitch's preceding
frame as well as its current CPU breakdown. If both are inexpensive, the gap
remains unaccounted for: browser scheduling, GPU/compositor work, or other work
outside these phases needs a separate investigation. `renderSubmitMs` is **not
GPU execution time**. A new cached shader program is a correlation, not a shader
compilation stopwatch. There is no GPU readback or forced driver synchronization.

Top-level phase durations cover frame work except final recorder bookkeeping.
Do not add nested navigation/prop measurements to their parent. Pointer spans
are separate event accounting; synchronous capture callbacks can overlap a frame.
The recorder itself has a small timing/copying cost; it is not a zero-overhead
profiler. No per-frame console logging, timeline marks, or DOM overlays are added.

At most 16,384 recent frames, 32 worst hitch pairs, and 192 events are retained.
Frame and hitch storage uses preallocated numeric buffers (about 6.5 MB together).
Buffers are allocated only when capture is requested, and cleared on runtime
disposal. A long capture may wrap the recent-frame ring: the export explicitly
reports overwritten frames, while worst pairs and maxima span the full capture.
Percentiles describe retained data and mix pacing/quality/zone contexts; use the
row fields to compare like-for-like runs.

Visibility pauses reset frame/callback baselines without deleting earlier samples.
They are recorded as observation gaps, not frame drops. A single stop timer bounds
the session even without new animation callbacks. Optional observers are drained
and disconnected on stop, export, restart, clear, and disposal. A late delivery
from a previous capture cannot enter a new capture.

Nothing is uploaded or written to browser storage. The trace contains timing and
transient game diagnostics, not achievements, saved progress, page URLs, or
personal form data. The ordinary navigation trace remains independent.

Browser API references: [feature-detected observer entry types](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver/supportedEntryTypes_static)
and [avoiding blocking GPU queries](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).
