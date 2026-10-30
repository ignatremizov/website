import * as THREE from "three";
import { disposeObjectTree } from "./sceneResources.ts";

export interface NavigationDebugPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface NavigationDebugLeg {
  readonly from: NavigationDebugPoint;
  readonly to: NavigationDebugPoint;
  /** Actual arc lift above linear interpolation; omitted means a straight leg. */
  readonly lift?: number;
  /** Player route landing index; defaults to its last waypoint. */
  readonly landingIndex?: number;
}

export interface NavigationDebugTarget {
  readonly position: NavigationDebugPoint;
  /** Only set when the host actually observed an unreachable route result. */
  readonly unreachable?: boolean;
}

interface NavigationDebugRouteLeg {
  readonly kind: "walk" | "jump" | "drop";
  readonly path: readonly NavigationDebugPoint[];
}

const maximumWalkingLegs = 256;
const arcSegments = 24;
const maximumSegments = maximumWalkingLegs + 2 * (arcSegments + 2) + 2;
const cyan = new THREE.Color(0x44e5ff);
const amber = new THREE.Color(0xffbd55);
const green = new THREE.Color(0x69f58a);
const red = new THREE.Color(0xff5269);

/**
 * Observes host-owned routes; never searches terrain or infers rejection reasons.
 * All coordinates are parent-local. An identity scene group accepts world feet.
 */
export class NavigationDebug {
  private readonly group = new THREE.Group();
  private readonly positions = new THREE.BufferAttribute(
    new Float32Array(maximumSegments * 6), 3,
  ).setUsage(THREE.DynamicDrawUsage);
  private readonly colors = new THREE.BufferAttribute(
    new Float32Array(maximumSegments * 6), 3,
  ).setUsage(THREE.DynamicDrawUsage);
  private readonly geometry = new THREE.BufferGeometry();
  private segmentCount = 0;
  private active = false;
  private disposed = false;

  constructor(parent: THREE.Object3D) {
    this.group.name = "navigation-debug";
    this.group.visible = false;
    this.geometry.setAttribute("position", this.positions);
    this.geometry.setAttribute("color", this.colors);
    this.geometry.setDrawRange(0, 0);
    const lines = new THREE.LineSegments(
      this.geometry,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    lines.name = "navigation-debug-paths";
    lines.frustumCulled = false;
    lines.renderOrder = 1000;
    // Even recursive scene raycasts must never select debug geometry.
    lines.raycast = () => {};
    this.geometry.addEventListener("dispose", () => {
      this.disposed = true;
      this.active = false;
      this.group.visible = false;
    });
    this.group.add(lines);
    parent.add(this.group);
  }

  get enabled(): boolean {
    return this.active;
  }

  toggle(force?: boolean): boolean {
    if (this.disposed) return false;
    this.active = force ?? !this.active;
    this.group.visible = this.active;
    if (!this.active) this.clear();
    return this.active;
  }

  /**
   * No work when disabled. Hosts should also guard any snapshot construction
   * with enabled. Inputs are read immediately and never retained or mutated.
   */
  update(
    playerFeet: NavigationDebugPoint,
    waypoints: readonly NavigationDebugPoint[],
    currentIndex: number,
    finalJump?: NavigationDebugLeg | null,
    frogHop?: NavigationDebugLeg | null,
    target?: NavigationDebugTarget | null,
    routeLegs?: readonly NavigationDebugRouteLeg[] | null,
    nextLegIndex = 0,
  ): void {
    if (!this.active || this.disposed) return;
    this.segmentCount = 0;
    const start = Number.isFinite(currentIndex)
      ? Math.max(0, Math.floor(currentIndex))
      : waypoints.length;
    const end = Math.min(waypoints.length, start + maximumWalkingLegs);
    const jumpIndex = finalJump?.landingIndex ?? waypoints.length - 1;
    let from = playerFeet;
    for (let index = start; index < end; index += 1) {
      const to = waypoints[index]!;
      if (!finalJump || index !== jumpIndex) {
        this.segment(from.x, from.y, from.z, to.x, to.y, to.z, cyan);
      }
      from = to;
    }
    if (finalJump) this.leg(finalJump, amber);
    if (frogHop) this.leg(frogHop, green);
    if (routeLegs) {
      for (let legIndex = nextLegIndex; legIndex < routeLegs.length; legIndex += 1) {
        if (this.segmentCount >= maximumWalkingLegs) break;
        const leg = routeLegs[legIndex]!;
        for (let index = 1; index < leg.path.length; index += 1) {
          if (this.segmentCount >= maximumWalkingLegs) break;
          const from = leg.path[index - 1]!;
          const to = leg.path[index]!;
          this.segment(from.x, from.y, from.z, to.x, to.y, to.z,
            leg.kind === "jump" ? amber : cyan);
        }
      }
    }
    const destination = target?.position ?? waypoints[waypoints.length - 1];
    if (destination) {
      this.cross(destination, target?.unreachable === true ? red : cyan, 0.24);
    }
    this.geometry.setDrawRange(0, this.segmentCount * 2);
    // Upload only the populated prefix of the fixed buffers.
    this.positions.clearUpdateRanges();
    this.colors.clearUpdateRanges();
    if (this.segmentCount > 0) {
      this.positions.addUpdateRange(0, this.segmentCount * 6);
      this.colors.addUpdateRange(0, this.segmentCount * 6);
      this.positions.needsUpdate = true;
      this.colors.needsUpdate = true;
    }
  }

  clear(): void {
    if (this.disposed) return;
    this.segmentCount = 0;
    this.geometry.setDrawRange(0, 0);
  }

  dispose(): void {
    this.group.removeFromParent();
    if (this.disposed) return;
    this.active = false;
    this.disposed = true;
    disposeObjectTree(this.group);
  }

  private leg(leg: NavigationDebugLeg, color: THREE.Color): void {
    const { from, to } = leg;
    const lift = leg.lift ?? 0;
    const count = lift === 0 ? 1 : arcSegments;
    let x = from.x;
    let y = from.y;
    let z = from.z;
    for (let index = 1; index <= count; index += 1) {
      const t = index / count;
      const nextX = from.x + (to.x - from.x) * t;
      const nextY = from.y + (to.y - from.y) * t + 4 * lift * t * (1 - t);
      const nextZ = from.z + (to.z - from.z) * t;
      this.segment(x, y, z, nextX, nextY, nextZ, color);
      x = nextX;
      y = nextY;
      z = nextZ;
    }
    this.cross(to, color, 0.16);
  }

  private cross(point: NavigationDebugPoint, color: THREE.Color, radius: number): void {
    this.segment(
      point.x - radius, point.y, point.z - radius,
      point.x + radius, point.y, point.z + radius, color,
    );
    this.segment(
      point.x - radius, point.y, point.z + radius,
      point.x + radius, point.y, point.z - radius, color,
    );
  }

  private segment(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    color: THREE.Color,
  ): void {
    if (this.segmentCount >= maximumSegments ||
      !Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az) ||
      !Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) return;
    const vertex = this.segmentCount * 2;
    this.positions.setXYZ(vertex, ax, ay, az);
    this.positions.setXYZ(vertex + 1, bx, by, bz);
    this.colors.setXYZ(vertex, color.r, color.g, color.b);
    this.colors.setXYZ(vertex + 1, color.r, color.g, color.b);
    this.segmentCount += 1;
  }
}
