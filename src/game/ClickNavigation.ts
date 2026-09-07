import * as THREE from "three";
import { disposeObjectTree } from "./sceneResources.ts";

export const playerJumpLaunchVelocity = 7.4;
export const playerJumpGravity = 17.5;
const guidedHorizontalSpeed = 6.15;
const maximumGuidedJumpDistance = 5.35;
const maximumGuidedDrop = 6.2;
export const clickNavigationHoldDelay = 0.16;

export type ClickNavigationMarkerMode =
  | "reachable"
  | "blocked"
  | "active";

export function isContinuousClickNavigationGesture(
  heldFor: number,
  screenDistance: number,
  pointerType: string,
): boolean {
  const dragThreshold = pointerType === "touch" ? 11 : 5;
  return (
    heldFor >= clickNavigationHoldDelay ||
    screenDistance >= dragThreshold
  );
}

export function shouldCommitOneShotClickNavigation(
  pointerReleased: boolean,
  focusOnly: boolean,
  moved: boolean,
  continuous: boolean,
): boolean {
  return (
    pointerReleased &&
    !focusOnly &&
    !moved &&
    !continuous
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
  const discriminant =
    playerJumpLaunchVelocity * playerJumpLaunchVelocity -
    2 * playerJumpGravity * heightDelta;
  if (discriminant < 0) return 0;
  const descendingTime =
    (playerJumpLaunchVelocity + Math.sqrt(discriminant)) /
    playerJumpGravity;
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
    horizontalDistance >= 0 &&
    horizontalDistance <= getGuidedJumpRange(heightDelta)
  );
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
 * One reusable destination sigil serves hover feedback and the active route.
 * It stays depth-tested against the world, so a target cannot glow through a
 * wall merely because its analytic walkable surface is behind that wall.
 */
export class ClickNavigationMarker {
  readonly group = new THREE.Group();

  private readonly spin = new THREE.Group();
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
    this.group.name = "click-navigation-destination-sigil";
    this.group.visible = false;
    const surfacePlane = new THREE.Group();
    surfacePlane.name = "click-navigation-surface-plane";
    surfacePlane.rotation.x = -Math.PI / 2;
    surfacePlane.add(this.spin);
    this.group.add(surfacePlane);

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

    scene.add(this.group);
  }

  show(
    position: Readonly<THREE.Vector3>,
    mode: ClickNavigationMarkerMode,
  ): void {
    this.mode = mode;
    this.group.position.copy(position);
    this.group.visible = true;
    this.material.color.setHex(
      mode === "blocked"
        ? 0xf06458
        : mode === "active"
          ? 0xffc45d
          : 0x62e9ef,
    );
  }

  hide(): void {
    this.group.visible = false;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  update(elapsed: number, reducedMotion: boolean): void {
    if (!this.group.visible) return;
    const pulse = reducedMotion
      ? 1
      : 1 + Math.sin(elapsed * (this.mode === "active" ? 5.4 : 3.8)) * 0.08;
    this.group.scale.setScalar(pulse);
    this.spin.rotation.z =
      reducedMotion
        ? 0
        : elapsed * (this.mode === "blocked" ? -0.18 : 0.28);
    this.material.opacity =
      (this.mode === "blocked"
        ? 0.42
        : this.mode === "active"
          ? 0.86
          : 0.68) *
      (reducedMotion ? 1 : 0.94 + Math.sin(elapsed * 4.6) * 0.06);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    disposeObjectTree(this.group);
    this.group.clear();
  }
}
