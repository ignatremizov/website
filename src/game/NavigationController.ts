import * as THREE from "three";
import {
  canGuideDropWithRunup, canGuidedJump, getGuidedJumpRange, hasCrossedGuidedLandingPlane,
  type ClickNavigationFailureReason,
} from "./ClickNavigation.ts";
import {
  advanceWalkingWaypoint, departureLandingState, FailedWalkingRequestCache, retargetWalkingRoute,
  type SampleWalkHeight, type WalkPoint,
} from "./GuidedWalkingRoute.ts";
import {
  NavigationJob, planNavigationWork, validateNavigationWork,
  type NavigationLeg, type NavigationPlanningContext,
} from "./NavigationPlanning.ts";
import type { MovementAxes } from "./InputController.ts";
import type { SurfaceArea } from "./SurfaceSelection.ts";
import type { ZoneId } from "../world/WorldContracts.ts";
import { NavigationTrace, type NavigationTraceKind } from "./NavigationTrace.ts";
import { guidedJumpHorizontalSeconds } from "./JumpMotion.ts";

export interface ClickNavigationTarget {
  /** Assigned on accepted input, never by geometry picking. */
  requestId?: number;
  position: THREE.Vector3;
  markerY: number;
  surface: SurfaceArea | null;
  surfaceOffsetX: number;
  surfaceOffsetZ: number;
  reachable: boolean;
  preservePortalTarget?: boolean;
  /** A locally clear support may still lie behind the wall that was clicked. */
  blockedAtPick?: boolean;
}

export interface ClickNavigationState {
  target: ClickNavigationTarget;
  path: THREE.Vector3[];
  waypointIndex: number;
  manualOverride: boolean;
  requiresJump: boolean;
  /** Non-null while the current path edge is an unfinished jump or step-off. */
  departureLanding: THREE.Vector3 | null;
  legs: NavigationLeg[] | null;
  legIndex: number;
  jumpTriggered: boolean;
  airborneObserved: boolean;
  jumpAttempts: number;
  jumpDirectionX: number;
  jumpDirectionZ: number;
  /** Checked rise-only phase; ordinary jumps and gravity-only drops keep zero. */
  jumpHorizontalDelay: number;
  plannedTarget: THREE.Vector3;
  plannedSurface: SurfaceArea | null;
  previousDistance: number;
  stalledFor: number;
}

interface PendingClickNavigation {
  job: NavigationJob;
  target: ClickNavigationTarget;
  latest: ClickNavigationTarget;
  start: WalkPoint;
  zone: ZoneId;
  revision: number;
  context: NavigationPlanningContext;
  validating: boolean;
  preserveProgress: boolean;
  /** The old, already-checked walking prefix may execute while its tail loads. */
  continuation?: WalkingContinuation;
}

interface WalkingContinuation {
  route: ClickNavigationState;
  endLegIndex: number;
  anchor: WalkPoint;
}

/** Borrowed frame inputs; the controller never owns or mutates physical state. */
export interface NavigationFrame {
  position: Readonly<THREE.Vector3>;
  forward: Readonly<THREE.Vector3>;
  right: Readonly<THREE.Vector3>;
  zone: ZoneId;
  revision: number;
  elapsed: number;
  surfaceOffset: number;
  jumpHeight: number;
  jumpVelocity: number;
  activePlatform: SurfaceArea | null;
  speedMultiplier: number;
  walkingSpeed: number;
  sprintingSpeed: number;
  inputEnabled: boolean;
  transitioning: boolean;
  locked: boolean;
  collapsing: boolean;
  spellHeld: boolean;
  continuous: boolean;
  heldTarget: ClickNavigationTarget | null;
}

export interface NavigationHost {
  readFrame(): NavigationFrame;
  now(): number;
  refreshTarget(target: ClickNavigationTarget): void;
  isTargetReachable(target: ClickNavigationTarget): boolean;
  distanceToSurface(target: ClickNavigationTarget): number;
  goalClearance(target: ClickNavigationTarget): number;
  findLegacyPath(target: THREE.Vector3, clearance: number): THREE.Vector3[];
  createContext(start: WalkPoint, goal: WalkPoint): NavigationPlanningContext;
  supportHeight(point: WalkPoint): number | null;
  canJumpFrom(from: WalkPoint, to: WalkPoint): boolean;
  /** Re-evaluate the complete arc at takeoff; null means it is no longer safe. */
  jumpDelay?(from: WalkPoint, to: WalkPoint): number | null;
  canDropFrom?(from: WalkPoint, to: WalkPoint): boolean;
  sampleWalkHeight: SampleWalkHeight;
  surfaceContains(surface: SurfaceArea, x: number, z: number): boolean;
  onBegin(): void;
  onHoverTarget(target: ClickNavigationTarget): void;
  onClearFeedback(): void;
  cancelPress(): void;
  onStatus(message: string): void;
}

function cloneTarget(target: ClickNavigationTarget): ClickNavigationTarget {
  return { ...target, position: target.position.clone() };
}

/** Owns accepted requests, bounded jobs, retargeting, failures, and path execution. */
export class NavigationController {
  readonly trace = new NavigationTrace();
  private nextRequestId = 0;
  private readonly host: NavigationHost;
  private frame: NavigationFrame;
  private routeState: ClickNavigationState | null = null;
  private pending: PendingClickNavigation | null = null;
  private deferredTarget: ClickNavigationTarget | null = null;
  private failureState: {
    target: ClickNavigationTarget;
    reason: ClickNavigationFailureReason;
    announcedAt: number;
  } | null = null;
  private readonly failures = new FailedWalkingRequestCache();
  private readonly scratchPosition = new THREE.Vector3();
  private jumpQueued = false;

  constructor(host: NavigationHost) {
    this.host = host;
    this.frame = host.readFrame();
  }

  get route(): Readonly<ClickNavigationState> | null { return this.routeState; }
  get pendingTarget(): ClickNavigationTarget | null { return this.pending?.latest ?? this.deferredTarget; }
  get failure(): Readonly<NonNullable<NavigationController["failureState"]>> | null { return this.failureState; }
  get hasPending(): boolean { return this.pending !== null || this.deferredTarget !== null; }
  get hasFeedback(): boolean { return this.routeState !== null || this.hasPending || this.failureState !== null; }

  consumeJump(): boolean {
    const queued = this.jumpQueued;
    this.jumpQueued = false;
    return queued;
  }

  clearFailures(): void { this.failures.clear(); }

  private record(kind: NavigationTraceKind, target: ClickNavigationTarget | null, reason?: string, work?: number, landing?: WalkPoint): void {
    if (!this.trace.enabled) return;
    this.trace.record({
      kind, requestId: target?.requestId ?? 0, zone: this.frame.zone, time: this.frame.elapsed,
      from: { x: this.frame.position.x, y: this.frame.surfaceOffset + this.frame.jumpHeight, z: this.frame.position.z },
      target: landing ? { x: landing.x, y: landing.y, z: landing.z }
        : target ? { x: target.position.x, y: target.position.y, z: target.position.z } : null,
      fromSupport: this.frame.activePlatform?.id ?? null,
      targetSupport: landing ? null : target?.surface?.id ?? null, reason, work,
    });
  }

  recordCollisionRecovery(
    x: number, y: number, z: number,
    toX: number, toY: number, toZ: number, support: string | null,
  ): void {
    if (!this.trace.enabled) return;
    this.frame = this.host.readFrame();
    this.trace.record({
      kind: "collision-recovery", requestId: this.routeState?.target.requestId ?? 0,
      zone: this.frame.zone, time: this.frame.elapsed,
      from: { x, y, z }, target: { x: toX, y: toY, z: toZ },
      fromSupport: null, targetSupport: support, reason: "Restored last collision-safe landing",
    });
  }

  begin(
    sourceTarget: ClickNavigationTarget,
  ): boolean {
    this.frame = this.host.readFrame();
    if (this.frame.locked) {
      return false;
    }
    const target = cloneTarget(sourceTarget);
    const accepted = this.pending?.latest ?? this.deferredTarget ?? this.routeState?.target;
    target.requestId = accepted && this.sameTarget(accepted, target)
      ? accepted.requestId : ++this.nextRequestId;
    if (target.requestId !== accepted?.requestId) this.record("request", target);
    target.reachable =
      this.host.isTargetReachable(target);
    this.host.onHoverTarget(target);
    const start = {
      x: this.frame.position.x, y: this.frame.surfaceOffset + this.frame.jumpHeight, z: this.frame.position.z,
    };
    const cachedFailure = this.frame.zone === "falls" && this.failures.matches(
      start, target.position, target.surface?.id ?? null, this.frame.revision,
    );
    if (cachedFailure) target.reachable = false;
    if (this.frame.zone === "falls") {
      if (!target.reachable) {
        this.pending?.job.cancel();
        this.pending = null;
        this.deferredTarget = null;
        this.routeState = null;
        this.jumpQueued = false;
        this.reportFailure(target, cachedFailure ? "No route found" : "Landing blocked");
        return false;
      }
      this.host.onBegin();
      return this.queue(target);
    }
    if (!target.reachable) {
      this.routeState = null;
      this.jumpQueued = false;
      this.reportFailure(target, "Landing blocked");
      return false;
    }

    this.host.onBegin();
    const currentFeetHeight =
      this.frame.surfaceOffset + this.frame.jumpHeight;
    const heightDelta = target.position.y - currentFeetHeight;
    const directDistance =
      this.host.distanceToSurface(target);
    const runupDrop =
      this.frame.activePlatform !== null &&
      canGuideDropWithRunup(
        directDistance,
        heightDelta,
      );
    const directJump =
      !(this.frame.zone === "field" && target.surface?.id === "void-turtle-shell") &&
      target.surface !== this.frame.activePlatform &&
      (target.surface !== null || this.frame.activePlatform !== null) &&
      Math.abs(heightDelta) > 0.24 &&
      (canGuidedJump(directDistance, heightDelta) || runupDrop);
    const goalClearance =
      this.host.goalClearance(target);
    const path = directJump
      ? [
          new THREE.Vector3(
            this.frame.position.x,
            currentFeetHeight,
            this.frame.position.z,
          ),
          new THREE.Vector3(
            target.position.x,
            target.position.y,
            target.position.z,
          ),
        ]
      : this.host.findLegacyPath(target.position, goalClearance);
    if (path.length === 0) {
      target.reachable = false;
      this.host.onHoverTarget(target);
      this.routeState = null;
      this.jumpQueued = false;
      this.reportFailure(target, "No route found");
      return false;
    }

    const requiresJump = target.surface !== this.frame.activePlatform &&
        (directJump || (target.surface !== null &&
          (target.surface.requiresJump || heightDelta > 0.24)));
    this.failureState = null;
    this.routeState = {
      target,
      path,
      waypointIndex: path.length > 1 ? 1 : 0,
      manualOverride: false,
      requiresJump,
      departureLanding: null,
      legs: null,
      legIndex: 0,
      jumpTriggered: false,
      airborneObserved: false,
      jumpAttempts: 0,
      jumpDirectionX: 0,
      jumpDirectionZ: 0,
      jumpHorizontalDelay: 0,
      plannedTarget: target.position.clone(),
      plannedSurface: target.surface,
      previousDistance: Number.POSITIVE_INFINITY,
      stalledFor: 0,
    };
    this.record("publish", target, "Legacy route");
    return true;
  }

  private sameTarget(a: ClickNavigationTarget, b: ClickNavigationTarget): boolean {
    // Compare against the checked endpoint, not successive pointer events:
    // sub-arrival camera/ray drift should not continually restart validation.
    return a.surface === b.surface &&
      Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) < 0.025 &&
      Math.abs(a.position.y - b.position.y) < 0.01;
  }

  private isForwardExtension(route: ClickNavigationState, target: ClickNavigationTarget): boolean {
    const dx = route.target.position.x - this.frame.position.x;
    const dz = route.target.position.z - this.frame.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.025) return false;
    const nextX = target.position.x - this.frame.position.x;
    const nextZ = target.position.z - this.frame.position.z;
    const along = (nextX * dx + nextZ * dz) / distance;
    return along > distance + 0.05 && along >= Math.hypot(nextX, nextZ) * 0.8;
  }

  private walkingContinuation(target: ClickNavigationTarget): WalkingContinuation | undefined {
    const route = this.routeState;
    if (!route?.legs || route.manualOverride || route.jumpTriggered ||
      this.frame.jumpHeight > 0.02 || this.frame.jumpVelocity > 0 ||
      route.legs[route.legIndex]?.kind !== "walk" || !this.isForwardExtension(route, target)) return;
    // Validate from a stable point ahead, not the constantly moving player.
    // Keep only checked walking legs; never commit an old jump for a new click.
    let endLegIndex = route.legIndex;
    let anchor = route.path.at(-1)!;
    let distance = Math.hypot(anchor.x - this.frame.position.x, anchor.z - this.frame.position.z);
    while (distance < 4 && route.legs[endLegIndex + 1]?.kind === "walk") {
      endLegIndex += 1;
      const next = route.legs[endLegIndex]!.path.at(-1)!;
      distance += Math.hypot(next.x - anchor.x, next.z - anchor.z);
      anchor = new THREE.Vector3(next.x, next.y, next.z);
    }
    return { route, endLegIndex, anchor: { x: anchor.x, y: anchor.y, z: anchor.z } };
  }

  private continuationPrefix(continuation: WalkingContinuation): NavigationLeg[] {
    const route = continuation.route;
    const position = { x: this.frame.position.x, y: this.frame.surfaceOffset, z: this.frame.position.z };
    const path: WalkPoint[] = [position];
    for (const point of route.path.slice(route.waypointIndex)) {
      path.push({ x: point.x, y: point.y, z: point.z });
    }
    for (let index = route.legIndex + 1; index <= continuation.endLegIndex; index += 1) {
      for (const point of route.legs![index]!.path.slice(1)) path.push({ ...point });
    }
    return path.some(point => Math.hypot(point.x - position.x, point.z - position.z) > 0.001 ||
      Math.abs(point.y - position.y) > 0.001) ? [{ kind: "walk", path }] : [];
  }

  private queue(target: ClickNavigationTarget, force = false): boolean {
    const pending = this.pending;
    if (pending) {
      if (pending.continuation && !this.isForwardExtension(pending.continuation.route, target)) {
        pending.job.cancel();
        this.pending = null;
        return this.queue(target, true);
      }
      if (!this.sameTarget(pending.latest, target)) this.record("retarget", target, "Coalesced pending request");
      pending.latest = cloneTarget(target);
      this.failureState = null;
      return true;
    }
    if (this.deferredTarget && !force) {
      this.deferredTarget = cloneTarget(target);
      this.failureState = null;
      return true;
    }
    this.deferredTarget = null;
    const route = this.routeState;
    if (!force && route && this.sameTarget(route.target, target)) {
      this.failureState = null;
      return true;
    }
    const continuation = !force ? this.walkingContinuation(target) : undefined;
    const start = continuation?.anchor ??
      { x: this.frame.position.x, y: this.frame.surfaceOffset + this.frame.jumpHeight, z: this.frame.position.z };
    if (this.failures.matches(
      start, target.position, target.surface?.id ?? null, this.frame.revision,
    )) {
      this.reportFailure(target, "No route found");
      return false;
    }
    this.failureState = null;
    const context = this.host.createContext(start, target.position);
    let work = planNavigationWork(start, target.position, context);
    let validating = false;
    if (!continuation && !force && route?.legs && !route.jumpTriggered &&
      Math.hypot(target.position.x - route.target.position.x, target.position.z - route.target.position.z) < 0.85) {
      const legs = route.legs.slice(route.legIndex);
      legs[0] = {
        kind: legs[0]!.kind,
        path: [{ ...start }, ...route.path.slice(route.waypointIndex).map((point) => ({ x: point.x, y: point.y, z: point.z }))],
      };
      work = validateNavigationWork(legs, start, target.position, context);
      validating = true;
    }
    this.pending = {
      job: new NavigationJob(work),
      target: cloneTarget(target), latest: cloneTarget(target), start,
      zone: this.frame.zone, revision: this.frame.revision, context, validating,
      preserveProgress: validating,
      continuation,
    };
    this.record("plan", target, continuation ? "Extend checked walking prefix"
      : validating ? "Validate retained route" : "Find route");
    return true;
  }

  private updatePlanning(): void {
    if (!this.pending && this.deferredTarget &&
      !this.routeState?.jumpTriggered && this.frame.jumpHeight <= 0.02) {
      const latest = this.deferredTarget;
      this.deferredTarget = null;
      if (!this.routeState || !this.sameTarget(this.routeState.target, latest)) {
        // A newer nearby goal must not freeze the just-published route again.
        // Search in the background; final start/arc validation still precedes
        // any switch. The current checked route can make progress meanwhile.
        this.queue(latest, !this.routeState || !this.isForwardExtension(this.routeState, latest));
      }
    }
    const pending = this.pending;
    if (!pending || this.routeState?.jumpTriggered || this.frame.jumpHeight > 0.02) return;
    if (pending.zone !== this.frame.zone || pending.revision !== this.frame.revision) {
      this.record("cancel", pending.latest, pending.zone !== this.frame.zone ? "Zone changed" : "Geometry or jump speed changed");
      pending.job.cancel();
      this.pending = null;
      if (pending.continuation) {
        // The prefix was checked against this revision too. Do not keep
        // executing it after its floor, headroom, or movement assumptions change.
        this.routeState = null;
        this.jumpQueued = false;
      }
      if (pending.zone === this.frame.zone) this.queue(pending.latest, true);
      return;
    }
    const deadline = this.host.now() + 2;
    pending.job.advance(2048, () => this.host.now() >= deadline);
    if (!pending.job.done) return;
    let result = pending.job.result;
    const latest = pending.latest;
    this.host.refreshTarget(latest);
    if (!latest.reachable || latest.surface?.enabled === false) {
      this.pending = null;
      this.deferredTarget = null;
      if (pending.continuation) { this.routeState = null; this.jumpQueued = false; }
      this.reportFailure(latest, "Landing changed");
      return;
    }
    const targetChanged = !this.sameTarget(pending.target, latest);
    const publishCheckedSnapshot = pending.validating && result !== null &&
      pending.target.surface === latest.surface &&
      Math.hypot(latest.position.x - pending.target.position.x, latest.position.z - pending.target.position.z) < 0.85 &&
      Math.abs(latest.position.y - pending.target.position.y) < 0.08;
    if (targetChanged && !publishCheckedSnapshot) {
      this.pending = null;
      if (result && Math.hypot(latest.position.x - pending.target.position.x, latest.position.z - pending.target.position.z) < 0.85) {
        pending.target = cloneTarget(latest);
        pending.start = pending.continuation?.anchor ??
          { x: this.frame.position.x, y: this.frame.surfaceOffset, z: this.frame.position.z };
        pending.job = new NavigationJob(validateNavigationWork(result, pending.start, latest.position, pending.context));
        pending.validating = true;
        this.pending = pending;
      } else this.queue(latest, !pending.continuation);
      return;
    }
    if (!result) {
      this.pending = null;
      if (pending.validating) {
        this.queue(latest, !pending.continuation);
      } else {
        if (pending.continuation) { this.routeState = null; this.jumpQueued = false; }
        this.failures.remember(
          pending.start, latest.position, latest.surface?.id ?? null, pending.revision,
        );
        latest.reachable = false;
        this.host.onHoverTarget(latest);
        this.reportFailure(latest, "No route found");
      }
      return;
    }
    const position = pending.continuation?.anchor ??
      { x: this.frame.position.x, y: this.frame.surfaceOffset, z: this.frame.position.z };
    if (!pending.validating || Math.hypot(position.x - pending.start.x, position.z - pending.start.z) > 0.025 ||
      Math.abs(position.y - pending.start.y) > 0.025) {
      pending.start = position;
      pending.target = cloneTarget(latest);
      pending.job = new NavigationJob(validateNavigationWork(result, position, latest.position, pending.context));
      pending.validating = true;
      return;
    }
    const previous = this.routeState;
    if (pending.continuation) {
      if (previous !== pending.continuation.route || previous.legIndex > pending.continuation.endLegIndex) {
        this.pending = null;
        this.queue(latest, true);
        return;
      }
      const prefix = this.continuationPrefix(pending.continuation);
      if (prefix.length && result[0]!.kind === "walk") {
        result = [{ kind: "walk", path: [...prefix[0]!.path, ...result[0]!.path.slice(1)] }, ...result.slice(1)];
      } else result = [...prefix, ...result];
    }
    this.pending = null;
    this.failureState = null;
    const first = result[0]!;
    const path = first.path.map((point) => new THREE.Vector3(point.x, point.y, point.z));
    // Keep target, offsets, and final leg tied to the geometry actually checked.
    // Holding a moving cursor cannot veto every completed validation; retain
    // its newer intent separately and let this route execute before retargeting.
    const checkedTarget = cloneTarget(pending.target);
    this.deferredTarget = targetChanged
      ? cloneTarget(latest) : null;
    this.routeState = {
      target: checkedTarget, path, waypointIndex: 1, legs: result, legIndex: 0,
      departureLanding: first.kind !== "walk" ? path[1]!.clone() : null,
      requiresJump: first.kind === "jump", manualOverride: false,
      jumpTriggered: false, airborneObserved: false, jumpAttempts: 0,
      jumpDirectionX: 0, jumpDirectionZ: 0, jumpHorizontalDelay: 0,
      plannedTarget: checkedTarget.position.clone(), plannedSurface: checkedTarget.surface,
      previousDistance: pending.preserveProgress ? previous?.previousDistance ?? Infinity : Infinity,
      stalledFor: pending.preserveProgress ? previous?.stalledFor ?? 0 : 0,
    };
    this.record("publish", checkedTarget, "Validated route", pending.job.workDone);
  }

  retarget(
    sourceTarget: ClickNavigationTarget,
  ): boolean {
    this.frame = this.host.readFrame();
    const route = this.routeState;
    // A held ray is sampled again as the camera moves. A transient wall hit
    // or cached rejection is not a new command to cancel the accepted route.
    if (this.frame.zone === "falls" &&
      (route || this.pending || this.deferredTarget)) {
      if (!sourceTarget.reachable || !this.host.isTargetReachable(sourceTarget) ||
        this.failures.matches(
          { x: this.frame.position.x, y: this.frame.surfaceOffset + this.frame.jumpHeight, z: this.frame.position.z },
          sourceTarget.position, sourceTarget.surface?.id ?? null, this.frame.revision,
        )) return false;
    }
    if (!route) return this.begin(sourceTarget);
    if (route.jumpTriggered || this.frame.jumpHeight > 0.02) return true;
    if (this.frame.zone === "falls") return this.begin(sourceTarget);

    const target = cloneTarget(sourceTarget);
    target.requestId = route.target.requestId;
    target.reachable =
      this.host.isTargetReachable(target);
    this.host.onHoverTarget(target);
    if (!target.reachable) {
      this.routeState = null;
      this.jumpQueued = false;
      return false;
    }
    // A committed jump keeps one landing vector. Re-aiming it underneath a
    // moving cursor can reverse steering in mid-air and produce oscillation.
    if (route.jumpTriggered || this.frame.jumpHeight > 0.02) return true;

    const plannedDrift = Math.hypot(
      target.position.x - route.plannedTarget.x,
      target.position.z - route.plannedTarget.z,
    );
    if (
      target.surface !== route.plannedSurface ||
      plannedDrift > 0.85
    ) {
      return this.begin(target);
    }

    if (!this.sameTarget(route.target, target)) this.record("retarget", target, "Retained legacy path");
    route.target = target;
    const lastPathPoint = route.path.at(-1);
    lastPathPoint?.set(
      target.position.x,
      target.position.y,
      target.position.z,
    );
    // A stationary held pointer updates this target every 75 ms. Preserve
    // progress tracking so a genuine obstruction can trigger a replan.
    return true;
  }

  private reportFailure(
    target: ClickNavigationTarget,
    reason: ClickNavigationFailureReason,
  ): void {
    const previous = this.failureState;
    if (previous?.reason === reason && previous.target.surface === target.surface &&
      previous.target.position.distanceTo(target.position) < 0.24) return;
    const failedTarget = cloneTarget(target);
    failedTarget.reachable = false;
    const announce = !previous || this.frame.elapsed - previous.announcedAt >= 1.5;
    this.failureState = {
      target: failedTarget, reason,
      announcedAt: announce ? this.frame.elapsed : previous.announcedAt,
    };
    this.record("failed", failedTarget, reason);
    if (announce) this.host.onStatus(`${reason}. Choose another spot or move closer.`);
  }

  cancel(reason = "Cancelled by input or world lifecycle"): void {
    this.frame = this.host.readFrame();
    if (this.hasFeedback) this.record("cancel", this.pending?.latest ?? this.deferredTarget ?? this.routeState?.target ?? this.failureState?.target ?? null, reason);
    this.pending?.job.cancel();
    this.pending = null;
    this.deferredTarget = null;
    this.failureState = null;
    this.routeState = null;
    this.jumpQueued = false;
    this.host.onClearFeedback();
  }

  private failRoute(
    route: ClickNavigationState,
  ): void {
    route.target.reachable = false;
    this.deferredTarget = null;
    this.routeState = null;
    this.jumpQueued = false;
    this.host.onHoverTarget(route.target);
    this.reportFailure(route.target, "Route stopped");
    if (this.frame.zone === "falls") this.failures.remember(
      { x: this.frame.position.x, y: this.frame.surfaceOffset + this.frame.jumpHeight, z: this.frame.position.z },
      route.target.position, route.target.surface?.id ?? null, this.frame.revision,
    );
  }

  update(
    axes: MovementAxes,
    delta: number,
    manualMovement: boolean,
    manualClickJumpStarted: boolean,
  ): void {
    this.frame = this.host.readFrame();
    if (!this.frame.inputEnabled || this.frame.transitioning || this.frame.locked || this.frame.collapsing) {
      this.cancel();
      return;
    }
    if (manualMovement || this.frame.spellHeld) {
      if (this.pending || this.deferredTarget) {
        this.record("cancel", this.pending?.latest ?? this.deferredTarget, "Manual movement or spell input");
      }
      this.pending?.job.cancel();
      this.pending = null;
      this.deferredTarget = null;
      this.failureState = null;
    } else this.updatePlanning();
    const route = this.routeState;
    if (!route || !this.frame.inputEnabled || this.frame.transitioning) {
      return;
    }
    if (this.pending?.validating && !this.pending.continuation && !manualMovement && !route.jumpTriggered) {
      axes.horizontal = 0;
      axes.forward = 0;
      axes.running = false;
      return;
    }
    if (
      manualMovement ||
      this.frame.spellHeld
    ) {
      if (this.frame.continuous) {
        route.manualOverride = true;
        route.previousDistance = Number.POSITIVE_INFINITY;
        route.stalledFor = 0;
        this.jumpQueued = false;
        return;
      }
      this.cancel();
      this.host.cancelPress();
      return;
    }
    if (route.manualOverride) {
      if (
        this.frame.jumpHeight > 0.02 ||
        Math.abs(this.frame.jumpVelocity) > 0.02
      ) {
        return;
      }
      const target = this.frame.continuous ? this.frame.heldTarget! : route.target;
      if (this.frame.zone === "falls") this.queue(target, true);
      else this.begin(target);
      return;
    }

    this.host.refreshTarget(route.target);
    if (
      !route.target.reachable ||
      route.target.surface?.enabled === false
    ) {
      this.failRoute(route);
      return;
    }
    if (route.legs) {
      if (manualClickJumpStarted && route.departureLanding && !route.jumpTriggered) {
        const dx = route.departureLanding.x - this.frame.position.x;
        const dz = route.departureLanding.z - this.frame.position.z;
        const length = Math.hypot(dx, dz);
        route.jumpTriggered = true;
        route.airborneObserved = this.frame.jumpHeight > 0.02;
        route.jumpAttempts += 1;
        route.jumpDirectionX = length > 0.001 ? dx / length : 0;
        route.jumpDirectionZ = length > 0.001 ? dz / length : 0;
        route.jumpHorizontalDelay = 0;
      }
      this.updatePlanned(route, axes, delta);
      return;
    }
    if (route.departureLanding && this.updateDepartureJump(route, axes, delta)) return;
    const lastPathPoint = route.path.at(-1);
    if (lastPathPoint) {
      lastPathPoint.set(
        route.target.position.x,
        route.target.position.y,
        route.target.position.z,
      );
    }

    const grounded =
      this.frame.jumpHeight <= 0 && this.frame.jumpVelocity <= 0;
    const supportedByTarget =
      route.target.surface === null
        ? grounded &&
          Math.abs(
            this.frame.surfaceOffset - route.target.position.y,
          ) < 0.24
        : route.target.surface === this.frame.activePlatform ||
          (grounded &&
            this.host.surfaceContains(
              route.target.surface,
              this.frame.position.x,
              this.frame.position.z,
            ) &&
            Math.abs(
              this.frame.surfaceOffset - route.target.position.y,
            ) < 0.24);
    if (grounded && route.airborneObserved) {
      this.record("jump-landing", route.target, supportedByTarget ? "landed" : "missed support");
    }
    if (route.requiresJump && supportedByTarget) {
      route.requiresJump = false;
      route.jumpTriggered = false;
      route.airborneObserved = false;
      route.jumpDirectionX = 0;
      route.jumpDirectionZ = 0;
      route.jumpHorizontalDelay = 0;
      route.previousDistance = Number.POSITIVE_INFINITY;
      route.stalledFor = 0;
    }

    if (route.jumpTriggered) {
      if (this.frame.jumpHeight > 0.02) {
        route.airborneObserved = true;
      } else if (route.airborneObserved && grounded) {
        if (supportedByTarget) {
          route.requiresJump = false;
          route.jumpTriggered = false;
          route.airborneObserved = false;
        } else if (route.jumpAttempts < 2) {
          route.jumpTriggered = false;
          route.airborneObserved = false;
          route.jumpDirectionX = 0;
          route.jumpDirectionZ = 0;
          route.jumpHorizontalDelay = 0;
          route.stalledFor = 0;
        } else {
          this.failRoute(route);
          axes.horizontal = 0;
          axes.forward = 0;
          axes.running = false;
          return;
        }
      }
    }

    const targetDx =
      route.target.position.x - this.frame.position.x;
    const targetDz =
      route.target.position.z - this.frame.position.z;
    const targetDistance = Math.hypot(targetDx, targetDz);
    if (
      manualClickJumpStarted &&
      !route.jumpTriggered &&
      targetDistance > 0.001
    ) {
      route.jumpTriggered = true;
      route.airborneObserved = this.frame.jumpHeight > 0.02;
      if (route.requiresJump) route.jumpAttempts += 1;
      route.jumpDirectionX = targetDx / targetDistance;
      route.jumpDirectionZ = targetDz / targetDistance;
      route.jumpHorizontalDelay = 0;
      this.record("jump-takeoff", route.target, "Manual jump along active route");
    }
    if (
      !route.requiresJump &&
      supportedByTarget &&
      targetDistance < 0.28
    ) {
      axes.horizontal = 0;
      axes.forward = 0;
      axes.running = false;
      this.record("arrived", route.target);
      this.cancel("Destination reached");
      return;
    }

    let waypoint =
      route.path[
        Math.min(route.waypointIndex, route.path.length - 1)
      ] ?? route.target.position;
    let dx = waypoint.x - this.frame.position.x;
    let dz = waypoint.z - this.frame.position.z;
    let distance = Math.hypot(dx, dz);
    if (this.frame.zone === "falls" && grounded && !route.jumpTriggered) {
      this.scratchPosition.set(
        this.frame.position.x, this.frame.surfaceOffset, this.frame.position.z,
      );
      const nextIndex = advanceWalkingWaypoint(
        route.path, route.waypointIndex, this.scratchPosition,
        this.host.sampleWalkHeight, route.requiresJump,
      );
      if (nextIndex !== route.waypointIndex) {
        route.waypointIndex = nextIndex;
        waypoint = route.path[nextIndex] ?? route.target.position;
        dx = waypoint.x - this.frame.position.x;
        dz = waypoint.z - this.frame.position.z;
        distance = Math.hypot(dx, dz);
        route.previousDistance = Number.POSITIVE_INFINITY;
        route.stalledFor = 0;
      }
    }
    while (
      this.frame.zone !== "falls" &&
      distance < (route.target.surface?.id === "void-turtle-shell" && route.requiresJump &&
        route.waypointIndex === route.path.length - 2 ? 0.025 : 0.46) &&
      route.waypointIndex < route.path.length - 1
    ) {
      route.waypointIndex += 1;
      waypoint =
        route.path[route.waypointIndex] ??
        route.target.position;
      dx = waypoint.x - this.frame.position.x;
      dz = waypoint.z - this.frame.position.z;
      distance = Math.hypot(dx, dz);
      route.previousDistance = Number.POSITIVE_INFINITY;
      route.stalledFor = 0;
    }

    // The approach may climb stairs before reaching a viable takeoff height.
    // Validate the jump only there, rather than rejecting it from the gorge.
    if (route.requiresJump && route.waypointIndex >= route.path.length - 1) {
      const currentFeetHeight =
        this.frame.surfaceOffset + this.frame.jumpHeight;
      const heightDelta =
        route.target.position.y - currentFeetHeight;
      const jumpRange = getGuidedJumpRange(heightDelta);
      const turtleLanding = this.frame.zone === "field" && route.target.surface?.id === "void-turtle-shell";
      const checkedDelay = !route.jumpTriggered && grounded && (turtleLanding || this.frame.zone === "falls")
        ? this.checkedJumpDelay(
            this.scratchPosition.set(this.frame.position.x, currentFeetHeight, this.frame.position.z),
            route.target.position,
          ) : 0;
      if (turtleLanding && !route.jumpTriggered && grounded &&
        (!canGuidedJump(targetDistance, heightDelta) || checkedDelay === null)) {
        // The floating shell may be above the apex for part of its bob. Wait
        // on the checked takeoff rather than walking into the void. A persistent
        // obstruction still ends the request rather than leaving it armed forever.
        axes.horizontal = 0;
        axes.forward = 0;
        axes.running = false;
        route.stalledFor += delta;
        if (route.stalledFor > 4) this.failRoute(route);
        return;
      }
      if (jumpRange <= 0) {
        this.failRoute(route);
        return;
      }
      const surfaceDistance =
        this.host.distanceToSurface(route.target);
      const triggerDistance = THREE.MathUtils.clamp(
        jumpRange * 0.62,
        0.58,
        2.85,
      );
      if (
        !route.jumpTriggered &&
        grounded &&
        surfaceDistance <= triggerDistance &&
        checkedDelay !== null
      ) {
        route.jumpTriggered = true;
        route.jumpHorizontalDelay = checkedDelay;
        route.airborneObserved = false;
        route.jumpAttempts += 1;
        if (targetDistance > 0.001) {
          route.jumpDirectionX = targetDx / targetDistance;
          route.jumpDirectionZ = targetDz / targetDistance;
        }
        this.jumpQueued = true;
        this.record("jump-takeoff", route.target, "Legacy jump");
        if (checkedDelay > 0) {
          axes.horizontal = 0;
          axes.forward = 0;
          axes.running = false;
          return;
        }
      }
    }

    if (route.jumpTriggered) {
      if (
        route.airborneObserved &&
        hasCrossedGuidedLandingPlane(
          targetDx,
          targetDz,
          route.jumpDirectionX,
          route.jumpDirectionZ,
          0.001,
        )
      ) {
        // Once the avatar crosses the intended landing plane, descend
        // vertically. Reversing toward the marker on every frame produces
        // visible backtracking at the end of both guided and manual jumps.
        dx = 0;
        dz = 0;
        distance = 0;
        axes.horizontal = 0;
        axes.forward = 0;
        axes.running = false;
      } else {
        dx = targetDx;
        dz = targetDz;
        distance = targetDistance;
      }
    }

    if (distance > 0.001) {
      const directionX = dx / distance;
      const directionZ = dz / distance;
      axes.forward =
        directionX * this.frame.forward.x +
        directionZ * this.frame.forward.z;
      axes.horizontal =
        directionX * this.frame.right.x +
        directionZ * this.frame.right.z;
      axes.running =
        route.jumpTriggered || targetDistance > 2.6;
      const speed = (axes.running ? this.frame.sprintingSpeed : this.frame.walkingSpeed) * this.frame.speedMultiplier;
      const movingTime = route.jumpTriggered && route.jumpHorizontalDelay > 0
        ? guidedJumpHorizontalSeconds(this.frame.jumpVelocity, delta, route.jumpHorizontalDelay) : delta;
      const inputScale = Math.min(movingTime / delta, distance / Math.max(0.001, speed * delta));
      axes.horizontal *= inputScale;
      axes.forward *= inputScale;
    }

    if (
      !route.jumpTriggered &&
      distance < route.previousDistance - 0.018
    ) {
      route.stalledFor = 0;
    } else if (!route.jumpTriggered) {
      route.stalledFor += delta;
    }
    route.previousDistance = distance;
    if (route.stalledFor <= 1.15) return;

    if (this.frame.zone === "falls") {
      this.begin(route.target);
      return;
    }
    const replanned = this.host.findLegacyPath(
          route.target.position, this.host.goalClearance(route.target),
        );
    if (replanned.length === 0) {
      this.failRoute(route);
      return;
    }
    route.path = replanned;
    route.waypointIndex = replanned.length > 1 ? 1 : 0;
    route.plannedTarget.copy(route.target.position);
    route.plannedSurface = route.target.surface;
    route.previousDistance = Number.POSITIVE_INFINITY;
    route.stalledFor = 0;
  }

  private advanceLeg(route: ClickNavigationState): void {
    if (this.pending?.continuation?.route === route &&
      this.pending.continuation.endLegIndex === route.legIndex) return;
    route.legIndex += 1;
    const next = route.legs?.[route.legIndex];
    if (!next) {
      this.record("arrived", route.target);
      if (this.pending || this.deferredTarget) {
        this.routeState = null;
        this.jumpQueued = false;
      } else this.cancel("Destination reached");
      return;
    }
    route.path = next.path.map((point) => new THREE.Vector3(point.x, point.y, point.z));
    route.path[0]!.set(this.frame.position.x, this.frame.surfaceOffset, this.frame.position.z);
    route.waypointIndex = 1;
    route.requiresJump = next.kind === "jump";
    route.departureLanding = next.kind !== "walk" ? route.path[1]!.clone() : null;
    route.jumpTriggered = false;
    route.airborneObserved = false;
    route.jumpDirectionX = 0;
    route.jumpDirectionZ = 0;
    route.jumpHorizontalDelay = 0;
    route.previousDistance = Infinity;
    route.stalledFor = 0;
  }

  private updatePlanned(
    route: ClickNavigationState, axes: MovementAxes, delta: number,
  ): void {
    if (route.departureLanding) {
      this.updateDepartureJump(route, axes, delta);
      return;
    }
    if (this.frame.jumpHeight > 0.02 || this.frame.jumpVelocity > 0) return;
    const position = this.scratchPosition.set(this.frame.position.x, this.frame.surfaceOffset, this.frame.position.z);
    // The planner has already smoothed this path against support and clearance.
    // Reach its corners before turning: skipping a bank waypoint early can
    // touch the second riser before the first tread owns the player's feet,
    // because physical movement resolves X/Z separately, not along the trace.
    axes.horizontal = 0;
    axes.forward = 0;
    axes.running = false;
    let waypoint = route.path[route.waypointIndex]!;
    let dx = waypoint.x - position.x;
    let dz = waypoint.z - position.z;
    let distance = Math.hypot(dx, dz);
    // Arrive at bends exactly, but don't insert an idle frame at each reached
    // waypoint or the old destination of an extended, collinear walking route.
    for (let consumed = 0; consumed < 8 && distance < 0.025 && Math.abs(position.y - waypoint.y) < 0.08; consumed += 1) {
      if (route.waypointIndex < route.path.length - 1) {
        route.waypointIndex += 1;
        route.previousDistance = Infinity;
        route.stalledFor = 0;
      } else {
        const oldLeg = route.legIndex;
        this.advanceLeg(route);
        if (this.routeState !== route || oldLeg === route.legIndex) return;
        if (route.departureLanding) {
          this.updateDepartureJump(route, axes, delta);
          return;
        }
      }
      waypoint = route.path[route.waypointIndex]!;
      dx = waypoint.x - position.x;
      dz = waypoint.z - position.z;
      distance = Math.hypot(dx, dz);
    }
    if (distance > 0.001) {
      axes.running = distance > 2.6;
      const speed = (axes.running ? this.frame.sprintingSpeed : this.frame.walkingSpeed) * this.frame.speedMultiplier;
      const scale = Math.min(1, distance / Math.max(0.001, speed * delta));
      axes.forward = (dx / distance * this.frame.forward.x + dz / distance * this.frame.forward.z) * scale;
      axes.horizontal = (dx / distance * this.frame.right.x + dz / distance * this.frame.right.z) * scale;
    }
    if (distance < route.previousDistance - 0.018) route.stalledFor = 0;
    else route.stalledFor += delta;
    route.previousDistance = distance;
    if (route.stalledFor > 1.15) {
      const target = this.pending?.latest ?? this.deferredTarget ?? route.target;
      if (this.pending?.continuation) {
        this.pending.job.cancel();
        this.pending = null;
        this.routeState = null;
        this.jumpQueued = false;
        axes.horizontal = 0;
        axes.forward = 0;
        axes.running = false;
      }
      if (!this.queue(target, true)) this.failRoute(route);
    }
  }

  /** Hosts without timed arcs retain their existing validated running jump. */
  private checkedJumpDelay(from: WalkPoint, to: WalkPoint): number | null {
    return this.host.jumpDelay
      ? this.host.jumpDelay(from, to)
      : this.host.canJumpFrom(from, to) ? 0 : null;
  }

  /** Execute one jump edge with normal input; advance only after actual support settles. */
  private updateDepartureJump(
    route: ClickNavigationState, axes: MovementAxes, delta: number,
  ): boolean {
    const landing = route.departureLanding!;
    const dropping = route.legs?.[route.legIndex]?.kind === "drop";
    const grounded = this.frame.jumpHeight <= 0 && this.frame.jumpVelocity <= 0;
    const position = this.scratchPosition.set(
      this.frame.position.x, this.frame.surfaceOffset + this.frame.jumpHeight, this.frame.position.z,
    );
    const dx = landing.x - position.x;
    const dz = landing.z - position.z;
    const distance = Math.hypot(dx, dz);
    axes.horizontal = 0;
    axes.forward = 0;
    axes.running = false;
    if (route.jumpTriggered && this.frame.jumpHeight > 0.02) {
      if (!route.airborneObserved) route.stalledFor = 0;
      route.airborneObserved = true;
    }
    if (route.airborneObserved && grounded) {
      // Actual physics decides where we landed. Never snap to the planned point.
      const support = this.host.supportHeight(position);
      const landingState = departureLandingState(position, landing, support, route.stalledFor);
      if (landingState === "settling") {
        route.stalledFor += delta;
        return true;
      }
      this.record(dropping ? "drop-landing" : "jump-landing", route.target, landingState, undefined, landing);
      if (landingState === "landed" && route.legs) {
        this.advanceLeg(route);
        return true;
      }
      const tail = landingState === "landed"
        ? retargetWalkingRoute(route.path, 2, position, route.target.position, this.host.sampleWalkHeight)
        : null;
      if (!tail) {
        this.failRoute(route);
        return true;
      }
      route.path = tail.map((point) => new THREE.Vector3(point.x, point.y, point.z));
      route.waypointIndex = 1;
      route.departureLanding = null;
      route.requiresJump = false;
      route.jumpTriggered = false;
      route.airborneObserved = false;
      route.jumpDirectionX = 0;
      route.jumpDirectionZ = 0;
      route.jumpHorizontalDelay = 0;
      route.previousDistance = Number.POSITIVE_INFINITY;
      route.stalledFor = 0;
      return false;
    }
    if (!route.jumpTriggered) {
      if (!grounded) return true;
      const support = this.host.supportHeight(landing);
      const delay = dropping ? 0 : this.checkedJumpDelay(position, landing);
      if (support === null || Math.abs(support - landing.y) >= 0.08 ||
        !(dropping ? this.host.canDropFrom?.(position, landing)
          : canGuidedJump(distance, landing.y - position.y) && delay !== null)) {
        if (!this.queue(route.target, true)) this.failRoute(route);
        return true;
      }
      route.jumpTriggered = true;
      route.stalledFor = 0;
      route.jumpAttempts += 1;
      route.jumpDirectionX = distance > 0.001 ? dx / distance : 0;
      route.jumpDirectionZ = distance > 0.001 ? dz / distance : 0;
      route.jumpHorizontalDelay = delay ?? 0;
      this.jumpQueued = !dropping;
      this.record(dropping ? "drop-start" : "jump-takeoff", route.target,
        `Leg ${route.legIndex + 1}${route.jumpHorizontalDelay > 0 ? "; rise first" : ""}`, undefined, landing);
      // updateJump consumes this on the next frame. Keep the validated takeoff
      // fixed until then instead of taking one grounded running step first.
      if (!dropping) return true;
    } else if (!route.airborneObserved && grounded) {
      // A rejected launch must not leave a permanently committed route.
      route.stalledFor += delta;
      if (route.stalledFor > 1.15) {
        this.failRoute(route);
        return true;
      }
    }
    if (route.airborneObserved && hasCrossedGuidedLandingPlane(
      dx, dz, route.jumpDirectionX, route.jumpDirectionZ, 0.001,
    )) return true;
    if (distance > 0.001) {
      // Match the planner's capped horizontal arc. Stopping 8 cm before a
      // narrow ledge (or overshooting it by a whole slow frame) can miss support.
      const speed = this.frame.sprintingSpeed * this.frame.speedMultiplier;
      const movingTime = !dropping && route.jumpHorizontalDelay > 0
        ? guidedJumpHorizontalSeconds(this.frame.jumpVelocity, delta, route.jumpHorizontalDelay) : delta;
      const scale = Math.min(movingTime / delta, distance / Math.max(0.001, speed * delta));
      axes.forward = (dx / distance * this.frame.forward.x + dz / distance * this.frame.forward.z) * scale;
      axes.horizontal = (dx / distance * this.frame.right.x + dz / distance * this.frame.right.z) * scale;
      axes.running = true;
    }
    return true;
  }

}
