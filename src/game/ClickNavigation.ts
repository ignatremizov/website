import * as THREE from "three";
import { disposeObjectTree } from "./sceneResources.ts";
import { ascendingJumpTime, descendingJumpTime, jumpDisplacement, jumpVelocityAfter } from "./JumpMotion.ts";

export { playerJumpLaunchVelocity, playerJumpGravity } from "./JumpMotion.ts";
const guidedHorizontalSpeed = 6.15;
const maximumGuidedJumpDistance = 5.35;
const maximumGuidedDrop = 6.2;
export const clickNavigationHoldDelay = 0.16;
// Steering starts promptly, but an ordinary stationary release still commits
// its destination even if a few held frames have already queued movement.
const clickNavigationOneShotReleaseDelay = 0.35;

export type ClickNavigationMarkerMode =
  | "reachable"
  | "blocked"
  | "planning"
  | "failed"
  | "active";

export type ClickNavigationFailureReason =
  | "No route found"
  | "Landing blocked"
  | "Landing changed"
  | "Route stopped";

export function isClickNavigationDragGesture(
  screenDistance: number,
  pointerType: string,
): boolean {
  const dragThreshold = pointerType === "touch" ? 11 : 5;
  return screenDistance >= dragThreshold;
}

export function isContinuousClickNavigationGesture(
  heldFor: number,
  screenDistance: number,
  pointerType: string,
): boolean {
  return (
    heldFor >= clickNavigationHoldDelay ||
    isClickNavigationDragGesture(screenDistance, pointerType)
  );
}

export function shouldCommitOneShotClickNavigation(
  pointerReleased: boolean,
  focusOnly: boolean,
  moved: boolean,
  heldFor: number,
): boolean {
  return (
    pointerReleased &&
    !focusOnly &&
    !moved &&
    heldFor <= clickNavigationOneShotReleaseDelay
  );
}

/**
 * Returns the conservative horizontal travel available when the descending
 * jump arc reaches `heightDelta`. It mirrors PortfolioGame's real jump
 * constants, with a small horizontal safety margin for steering and frame
 * cadence variance.
 */
export function getGuidedJumpRange(heightDelta: number): number {
  if (heightDelta < -maximumGuidedDrop) return 0;
  const descendingTime = descendingJumpTime(heightDelta);
  if (descendingTime === null) return 0;
  return Math.min(
    maximumGuidedJumpDistance,
    descendingTime * guidedHorizontalSpeed,
  );
}

export function canGuidedJump(
  horizontalDistance: number,
  heightDelta: number,
): boolean {
  return (
    Number.isFinite(horizontalDistance) &&
    Number.isFinite(heightDelta) &&
    horizontalDistance >= 0 &&
    heightDelta >= -maximumGuidedDrop &&
    descendingJumpTime(heightDelta) !== null &&
    horizontalDistance <= getGuidedJumpRange(heightDelta)
  );
}

interface JumpPoint { x: number; y: number; z: number }
type JumpLandingHeight = (
  previousX: number, previousZ: number, previousFeet: number,
  x: number, z: number, feet: number,
) => number | null;
type JumpClearance = (
  x: number, z: number, feetHeight: number, ascending: boolean, verticalTakeoff?: boolean,
) => boolean;

/** Checks body clearance and the first descending landing, not just the endpoint. */
export function hasGuidedJumpClearance(
  from: JumpPoint,
  to: JumpPoint,
  speed: number,
  isClear: JumpClearance,
  landingHeight?: JumpLandingHeight,
  horizontalDelay = 0,
): boolean {
  const duration = descendingJumpTime(to.y - from.y);
  if (duration === null || !Number.isFinite(speed) || speed <= 0 ||
    !Number.isFinite(horizontalDelay) || horizontalDelay < 0 || horizontalDelay > duration ||
    !Number.isFinite(from.x) || !Number.isFinite(from.y) || !Number.isFinite(from.z) ||
    !Number.isFinite(to.x) || !Number.isFinite(to.z)) return false;
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  if (distance > (duration - horizontalDelay) * speed) return false;
  // Planning only. The <=25 ms samples cover low bridges and narrow walls
  // without adding another search to ordinary movement frames.
  const samples = Math.min(160, Math.max(8, Math.ceil(duration / 0.025)));
  let previousX = from.x;
  let previousZ = from.z;
  let previousFeet = from.y;
  for (let index = 0; index <= samples; index += 1) {
    const time = duration * index / samples;
    const fraction = distance < 0.001 ? 1
      : Math.min(1, speed * Math.max(0, time - horizontalDelay) / distance);
    const x = from.x + (to.x - from.x) * fraction;
    const z = from.z + (to.z - from.z) * fraction;
    const feet = from.y + jumpDisplacement(time);
    const ascending = jumpVelocityAfter(time) > 0;
    if (!isClear(x, z, feet, ascending, horizontalDelay > 0 && fraction === 0)) return false;
    if (!ascending && index > 0 && landingHeight) {
      const landed = landingHeight(previousX, previousZ, previousFeet, x, z, feet);
      if (landed !== null) {
        // Physics stops the flight here. Its landing must satisfy the same
        // height/position tolerance as the follower's completed jump leg.
        return Math.abs(landed - to.y) < 0.08 &&
          Math.hypot(x - to.x, z - to.z) < 0.35;
      }
    }
    previousX = x;
    previousZ = z;
    previousFeet = feet;
  }
  return true;
}

/**
 * Prefer the existing running arc. A short upward jump may instead rise in
 * place to the landing height before translating, avoiding a stair/run-up
 * detour when already beside a plinth. Both complete arcs keep the same
 * gravity, launch velocity, body clearance, and first-landing checks.
 * At most two bounded arc probes; no profile search in the flight loop.
 */
export function findGuidedJumpDelay(
  from: JumpPoint, to: JumpPoint, speed: number,
  isClear: JumpClearance, landingHeight?: JumpLandingHeight,
): number | null {
  const heightDelta = to.y - from.y;
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  if (!canGuidedJump(distance, heightDelta)) return null;
  if (hasGuidedJumpClearance(from, to, speed, isClear, landingHeight)) return 0;
  if (heightDelta <= 0.295) return null;
  const delay = ascendingJumpTime(heightDelta);
  const duration = descendingJumpTime(heightDelta);
  // Arrive before the descending crossing even on the longest normal frame.
  if (delay === null || duration === null || !Number.isFinite(speed) || speed <= 0 ||
    delay + distance / speed > duration - 0.05) return null;
  return hasGuidedJumpClearance(from, to, speed, isClear, landingHeight, delay) ? delay : null;
}

export function canGuideDropWithRunup(
  horizontalDistance: number,
  heightDelta: number,
  maximumRunup = 3.4,
): boolean {
  const jumpRange = getGuidedJumpRange(heightDelta);
  return (
    heightDelta < -0.45 &&
    jumpRange > 0 &&
    horizontalDistance <= jumpRange + maximumRunup
  );
}

export function hasCrossedGuidedLandingPlane(
  targetDx: number,
  targetDz: number,
  jumpDirectionX: number,
  jumpDirectionZ: number,
  tolerance = 0.08,
): boolean {
  return (
    targetDx * jumpDirectionX +
      targetDz * jumpDirectionZ <=
    tolerance
  );
}

export function isClickNavigationPassThrough(
  object: THREE.Object3D,
): boolean {
  let branch: THREE.Object3D | null = object;
  while (branch) {
    if (branch.userData.clickNavigationPassThrough === true) return true;
    branch = branch.parent;
  }
  return false;
}

function isNavigationBlockingMaterial(material: THREE.Material): boolean {
  return (
    material.visible &&
    material.colorWrite &&
    material.opacity > 0.1 &&
    !material.transparent
  );
}

function appendClickNavigationBlockers(
  object: THREE.Object3D,
  result: THREE.Mesh[],
): void {
  if (
    !object.visible ||
    object.userData.clickNavigationPassThrough === true
  ) {
    return;
  }
  if (object instanceof THREE.Mesh) {
    const material = object.material;
    const blocksNavigation = Array.isArray(material)
      ? material.some(isNavigationBlockingMaterial)
      : isNavigationBlockingMaterial(material);
    if (blocksNavigation) result.push(object);
  }
  for (const child of object.children) {
    appendClickNavigationBlockers(child, result);
  }
}

/**
 * Navigation sees the rendered opaque world, including inherited visibility.
 * Hidden cave seals and retired crystal meshes must not leave invisible click
 * barriers. Filter before raycasting so particles, lines and foliage never
 * incur triangle/segment intersection work for destination picking.
 */
export function collectClickNavigationBlockers(
  root: THREE.Object3D,
  result: THREE.Mesh[],
): void {
  result.length = 0;
  appendClickNavigationBlockers(root, result);
}

/**
 * One reusable destination sigil serves hover, pending and active routes.
 * It stays depth-tested against the world, so a target cannot glow through a
 * wall merely because its analytic walkable surface is behind that wall.
 */
export class ClickNavigationMarker {
  readonly group = new THREE.Group();
  private readonly routeAnchor = new THREE.Mesh(
    new THREE.CircleGeometry(0.14, 20),
    new THREE.MeshBasicMaterial({
      color: 0xffc45d, transparent: true, opacity: 0.65,
      depthWrite: false, toneMapped: false, fog: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }),
  );

  private readonly spin = new THREE.Group();
  private readonly planningOrbit = new THREE.Group();
  private readonly planningLabel = new THREE.Group();
  private readonly statusLabels = new Map<string, THREE.Sprite>();
  private statusLabel: THREE.Sprite | null = null;
  private readonly material = new THREE.MeshBasicMaterial({
    color: 0x62e9ef,
    transparent: true,
    opacity: 0.72,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  private mode: ClickNavigationMarkerMode = "reachable";

  constructor(scene: THREE.Scene) {
    this.routeAnchor.name = "click-navigation-checked-path-dot";
    this.routeAnchor.rotation.x = -Math.PI / 2;
    this.routeAnchor.visible = false;
    this.routeAnchor.raycast = () => {};
    scene.add(this.routeAnchor);
    this.group.name = "click-navigation-destination-sigil";
    this.group.visible = false;
    const surfacePlane = new THREE.Group();
    surfacePlane.name = "click-navigation-surface-plane";
    surfacePlane.rotation.x = -Math.PI / 2;
    surfacePlane.add(this.spin);
    this.planningOrbit.name = "click-navigation-planning-orbit";
    this.planningOrbit.visible = false;
    surfacePlane.add(this.planningOrbit);
    this.group.add(surfacePlane);
    this.planningLabel.name = "click-navigation-planning-label";
    this.planningLabel.visible = false;
    this.group.add(this.planningLabel);

    const ringGeometry = new THREE.RingGeometry(0.24, 0.32, 24);
    const ring = new THREE.Mesh(ringGeometry, this.material);
    ring.renderOrder = 8;
    this.spin.add(ring);

    const centerGeometry = new THREE.CircleGeometry(0.055, 12);
    const center = new THREE.Mesh(centerGeometry, this.material);
    center.renderOrder = 8;
    this.spin.add(center);

    const tickGeometry = new THREE.PlaneGeometry(0.15, 0.038);
    const ticks = new THREE.InstancedMesh(
      tickGeometry,
      this.material,
      4,
    );
    ticks.name = "click-navigation-direction-ticks";
    const tickTransform = new THREE.Object3D();
    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * Math.PI * 2;
      tickTransform.position.set(
        Math.cos(angle) * 0.43,
        Math.sin(angle) * 0.43,
        0,
      );
      tickTransform.rotation.z = angle;
      tickTransform.updateMatrix();
      ticks.setMatrixAt(index, tickTransform.matrix);
    }
    ticks.instanceMatrix.needsUpdate = true;
    ticks.renderOrder = 8;
    this.spin.add(ticks);

    const arcGeometry = new THREE.RingGeometry(0.51, 0.58, 5, 1, 0, Math.PI / 5);
    const arcs = new THREE.InstancedMesh(arcGeometry, this.material, 8);
    arcs.name = "click-navigation-planning-segments";
    arcs.renderOrder = 8;
    tickTransform.position.set(0, 0, 0);
    for (let index = 0; index < 8; index += 1) {
      tickTransform.rotation.z = index * Math.PI / 4;
      tickTransform.updateMatrix();
      arcs.setMatrixAt(index, tickTransform.matrix);
    }
    arcs.instanceMatrix.needsUpdate = true;
    this.planningOrbit.add(arcs);

    // Fixed status labels are authored once, then billboarded by sprites.
    // Switching status never redraws a canvas or pulses the readable text.
    for (const text of [
      "Finding route", "No route found", "Landing blocked", "Landing changed", "Route stopped",
    ]) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 104;
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.fillStyle = "rgba(6, 18, 39, 0.94)";
      context.fillRect(4, 4, 504, 96);
      context.strokeStyle = text === "Finding route" ? "#70aaff" : "#f06458";
      context.lineWidth = 4;
      context.strokeRect(6, 6, 500, 92);
      context.fillStyle = "#edf5ff";
      context.font = "600 44px ui-monospace, SFMono-Regular, Menlo, monospace";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(text, 256, 54);
      const texture = new THREE.CanvasTexture(canvas);
      texture.name = `click-navigation-status-${text}`;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      }));
      label.name = `click-navigation-status-${text}`;
      label.visible = false;
      label.position.y = 0.7;
      label.center.set(0.5, 0);
      label.scale.set(2.6, 2.6 * canvas.height / canvas.width, 1);
      label.renderOrder = 8;
      this.planningLabel.add(label);
      this.statusLabels.set(text, label);
    }

    scene.add(this.group);
  }

  show(
    position: Readonly<THREE.Vector3>,
    mode: ClickNavigationMarkerMode,
    reason: ClickNavigationFailureReason = "No route found",
  ): void {
    this.mode = mode;
    this.group.position.copy(position);
    this.group.visible = true;
    this.planningOrbit.visible = mode === "planning";
    this.planningLabel.visible = mode === "planning" || mode === "failed";
    if (this.statusLabel) this.statusLabel.visible = false;
    this.statusLabel = this.statusLabels.get(mode === "planning" ? "Finding route" : reason) ?? null;
    if (this.statusLabel) this.statusLabel.visible = true;
    this.material.color.setHex(
      mode === "blocked" || mode === "failed"
        ? 0xf06458
        : mode === "active"
          ? 0xffc45d
          : mode === "planning"
            ? 0x609fff
            : 0x62e9ef,
    );
  }

  hide(): void {
    this.group.visible = false;
    this.routeAnchor.visible = false;
  }

  /** A subdued, stationary dot for the checked path while the ring follows input. */
  showRouteAnchor(position: Readonly<THREE.Vector3> | null): void {
    this.routeAnchor.visible = position !== null;
    if (position) this.routeAnchor.position.copy(position);
  }

  get visible(): boolean {
    return this.group.visible;
  }

  update(elapsed: number, reducedMotion: boolean): void {
    if (!this.group.visible) return;
    const planning = this.mode === "planning";
    const steady = reducedMotion || planning || this.mode === "failed";
    const pulse = steady
      ? 1
      : 1 + Math.sin(elapsed * (this.mode === "active" ? 5.4 : 3.8)) * 0.08;
    this.group.scale.setScalar(pulse);
    this.spin.rotation.z =
      steady
        ? 0
        : elapsed * (this.mode === "blocked" ? -0.18 : 0.28);
    this.planningOrbit.rotation.z = reducedMotion ? 0 : elapsed * 0.65;
    this.material.opacity =
      (this.mode === "blocked"
        ? 0.42
        : this.mode === "active" || planning || this.mode === "failed"
          ? 0.86
          : 0.68) *
      (steady ? 1 : 0.94 + Math.sin(elapsed * 4.6) * 0.06);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.routeAnchor);
    disposeObjectTree(this.routeAnchor);
    scene.remove(this.group);
    disposeObjectTree(this.group);
    this.group.clear();
    this.statusLabels.clear();
    this.statusLabel = null;
  }
}
