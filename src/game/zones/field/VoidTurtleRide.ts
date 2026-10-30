import * as THREE from "three";

import type {
  QualityTier,
  WorldStatusOptions,
} from "../../../world/WorldContracts";
import type { Kickable } from "../../Kickable";
import type { SurfaceArea } from "../../SurfaceSelection";
import type { WorldCollapseFrame } from "../../WorldCollapseSequence";

interface TurtleAnimatedItem {
  object: THREE.Object3D;
  originY: number;
  phase: number;
  amplitude: number;
  rotationSpeed: number;
  rotationAxis?: "x" | "y" | "z";
}

export interface VoidTurtleRideHost {
  materials: Readonly<{
    amber: THREE.Material;
    cyanSoft: THREE.Material;
    darkStone: THREE.Material;
    moss: THREE.Material;
    mossDark: THREE.Material;
    violet: THREE.Material;
  }>;
  colors: Readonly<{
    amber: number;
    cyan: number;
    violet: number;
  }>;
  playerRadius: number;
  addInteraction: (
    id: string,
    label: string,
    x: number,
    z: number,
    radius: number,
    action: () => void | Promise<void>,
  ) => void;
  updateInteractionLabel: (id: string, label: string) => void;
  moveInteraction: (id: string, x: number, z: number) => void;
  addSurface: (surface: SurfaceArea) => void;
  addAnimatedItem: (item: TurtleAnimatedItem) => void;
  registerKickable: (
    object: THREE.Object3D,
    radius: number,
    restingY: number,
    platform: SurfaceArea | null,
    gravity: boolean,
    pinballRadius: number | null,
    friction: number,
    message: string,
  ) => Kickable;
  getKickables: () => readonly Kickable[];
  getHeldKickable: () => Kickable | null;
  getTravelingAsteroid: () => Kickable | null;
  getPlayerMovement: () => Readonly<THREE.Vector3>;
  getPlayerPosition: () => Readonly<THREE.Vector3>;
  setPlayerPosition: (x: number, y: number, z: number) => void;
  copyPlayerPosition: (position: Readonly<THREE.Vector3>) => void;
  lerpPlayerPosition: (
    start: Readonly<THREE.Vector3>,
    end: Readonly<THREE.Vector3>,
    alpha: number,
  ) => void;
  getSpawnY: () => number;
  getQuality: () => QualityTier;
  getElapsed: () => number;
  isReducedMotion: () => boolean;
  resetJump: () => void;
  setPlayerSupport: (surface: SurfaceArea | null, offset: number) => void;
  setPlayerHeading: (heading: number) => void;
  setShadowState: (surfaceY: number, verticalDistance: number) => void;
  syncLooseToolInteraction: (kickable: Kickable) => void;
  finishTelekinesis: (event: PointerEvent) => void;
  onMediaChange: (active: boolean) => void;
  onStatus: (message: string, options?: WorldStatusOptions) => void;
}

type VoidTurtleRidePhase =
  "parked" | "departing" | "cruising" | "returning" | "dismounting";

interface VoidRideEffects {
  halo: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  trail: THREE.InstancedMesh<
    THREE.DodecahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  trailPositions: Float32Array;
  trailDummy: THREE.Object3D;
  maximumTrailCount: number;
  meteors: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  meteorPositions: Float32Array;
  maximumMeteorCount: number;
}

interface VoidTurtleFin {
  pivot: THREE.Group;
  side: -1 | 1;
  phase: number;
  rear: boolean;
}

interface VoidTurtleState {
  group: THREE.Group;
  moonOrbit: THREE.Group;
  fins: VoidTurtleFin[];
  eyes: THREE.InstancedMesh;
  sleepEyes: THREE.LineSegments;
  awake: boolean;
  surface: SurfaceArea;
  interactionId: string;
  stationAngle: number;
  stationRadius: number;
  rideAngle: number;
  rideTravel: number;
  riding: boolean;
  ridePhase: VoidTurtleRidePhase;
  phaseAge: number;
  returnStartAngle: number;
  returnStartRadius: number;
  returnTargetAngle: number;
  dismountStart: THREE.Vector3;
  dismountTarget: THREE.Vector3;
  dismountHeight: number;
  dismountHeading: number;
  buckAge: number;
  effects: VoidRideEffects;
}

interface TurtleAsteroidState {
  index: number;
  object: THREE.Group;
  band: THREE.Mesh;
  kickable: Kickable;
  collected: boolean;
  idleY: number;
  verticalPhase: number;
  orbitAngle: number;
  orbitRadius: number;
  targetRadius: number;
  orbitSpeed: number;
  baseOrbitSpeed: number;
  radialVelocity: number;
}

interface TurtleCargoOrbiterState {
  kickable: Kickable;
  orbitAngle: number;
  orbitRadius: number;
  targetRadius: number;
  orbitSpeed: number;
  radialVelocity: number;
  verticalPhase: number;
  originalGravity: boolean;
  originalRestingY: number;
}

const voidTurtleRideSpeed = 0.25;

const voidTurtleCruiseOffset = 5.8;

const voidTurtleDepartureDuration = 2.7;

const voidTurtleReturnDuration = 2.4;

const voidTurtleDismountDuration = 0.92;

const voidTurtleAsteroidConfigs = [
  [1.3, 25.6, 1.2, 0.56],
  [2.36, 26.8, 1.75, 0.68],
  [3.43, 25.9, 1.35, 0.5],
  [4.52, 27.1, 2.05, 0.63],
  [5.62, 26.2, 1.55, 0.58],
  [0.48, 25.4, 1.3, 0.52],
] as const;

export interface TurtleShellBounce {
  x: number;
  z: number;
  message: string;
}

export class VoidTurtleRide {
  private turtle: VoidTurtleState | null = null;
  private awakened = false;
  private readonly turtleAsteroids: TurtleAsteroidState[] = [];
  private readonly turtleCargoOrbiters: TurtleCargoOrbiterState[] = [];
  private readonly capturedTurtleAsteroidIndices = new Set<number>();
  private turtleAsteroidFlingAnnounced = false;
  private turtleCargoCaptureAnnounced = false;

  constructor(private readonly host: VoidTurtleRideHost) {}

  mount(parent: THREE.Group, x: number, z: number): void {
    if (this.turtle) {
      throw new Error("The void turtle ride is already mounted.");
    }
    this.createVoidTurtle(parent, x, z);
    this.host.addInteraction(
      "void-turtle",
      this.awakened
        ? "Greet the wakeful void turtle"
        : "Observe the sleeping void turtle",
      x,
      z,
      5.2,
      () => this.interactVoidTurtle(),
    );
    this.createVoidTurtleAsteroids(parent);
  }

  unmount(): void {
    this.host.onMediaChange(false);
    for (const orbiter of [...this.turtleCargoOrbiters]) {
      this.releaseCargo(orbiter.kickable);
    }
    this.turtle = null;
    this.turtleAsteroids.length = 0;
    this.turtleCargoOrbiters.length = 0;
  }

  update(delta: number): void {
    this.updateVoidTurtle(delta);
  }

  updateOrbiters(delta: number): void {
    this.updateTurtleAsteroids(delta);
  }

  isRiding(): boolean {
    return this.turtle?.riding === true;
  }

  isDismounting(): boolean {
    return (
      this.turtle?.riding === true && this.turtle.ridePhase === "dismounting"
    );
  }

  getDismountHeight(): number {
    return this.turtle?.dismountHeight ?? 0;
  }

  getShellSurface(): Readonly<SurfaceArea> | null {
    return this.turtle?.surface ?? null;
  }

  isOrbitControlled(kickable: Kickable): boolean {
    return (
      this.getTurtleAsteroidState(kickable)?.collected === true ||
      this.getTurtleCargoOrbiter(kickable) !== null
    );
  }

  isBoundKickable(kickable: Kickable): boolean {
    return (
      this.getTurtleAsteroidState(kickable) !== null ||
      this.getTurtleCargoOrbiter(kickable) !== null
    );
  }

  triggerShellBounce(): TurtleShellBounce | null {
    const turtle = this.turtle;
    if (!turtle || turtle.riding || turtle.awake) return null;
    turtle.buckAge = 0;
    return {
      x: turtle.surface.x,
      z: turtle.surface.z,
      message: "The sleeping turtle flinches beneath your boots. Its shell throws you back toward the station.",
    };
  }

  stopForWorldCollapse(): void {
    const turtle = this.turtle;
    if (!turtle?.riding) return;
    turtle.riding = false;
    turtle.ridePhase = "parked";
    this.host.onMediaChange(false);
  }

  refreshQuality(): void {
    const effects = this.turtle?.effects;
    if (!effects) return;
    const quality = this.host.getQuality();
    effects.trail.count =
      quality === "low"
        ? Math.min(12, effects.maximumTrailCount)
        : quality === "medium"
          ? Math.min(18, effects.maximumTrailCount)
          : effects.maximumTrailCount;
    const meteorCount =
      quality === "low"
        ? Math.min(3, effects.maximumMeteorCount)
        : quality === "medium"
          ? Math.min(5, effects.maximumMeteorCount)
          : effects.maximumMeteorCount;
    effects.meteors.geometry.setDrawRange(0, meteorCount * 2);
  }

  reactToWorldCollapse(frame: WorldCollapseFrame, delta: number): void {
    const turtle = this.turtle;
    if (!turtle || this.host.isReducedMotion()) return;
    const { instability } = frame;
    const elapsed = this.host.getElapsed();
    for (const fin of turtle.fins) {
      const struggle =
        Math.sin(elapsed * (8.5 + Number(fin.rear) * 1.7) + fin.phase) *
        instability;
      fin.pivot.rotation.z = fin.side * struggle * (0.22 + frame.pull * 0.64);
      fin.pivot.rotation.x =
        Math.cos(elapsed * 7.2 + fin.phase) * instability * 0.16;
    }
    turtle.moonOrbit.rotation.y +=
      delta * instability * (3.6 + frame.pull * 9.6);
  }

  forEachDynamicObject(visit: (object: THREE.Object3D) => void): void {
    const turtle = this.turtle;
    if (!turtle) return;
    visit(turtle.group);
    visit(turtle.effects.trail);
    visit(turtle.effects.meteors);
  }

  private createVoidRideEffects(
    parent: THREE.Group,
    turtle: THREE.Group,
  ): VoidRideEffects {
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(2.72, 4.35, 48, 1, 0.18, Math.PI * 1.72),
      new THREE.MeshBasicMaterial({
        color: this.host.colors.violet,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    halo.name = "void-turtle-galaxy-halo";
    halo.position.y = 0.28;
    halo.rotation.x = -Math.PI / 2;
    halo.renderOrder = 3;
    halo.visible = false;
    turtle.add(halo);

    const maximumTrailCount = 24;
    const trail = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.18, 0),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
      maximumTrailCount,
    );
    trail.name = "void-turtle-comet-trail";
    trail.frustumCulled = false;
    trail.renderOrder = 3;
    trail.visible = false;
    trail.count =
      this.host.getQuality() === "low"
        ? 12
        : this.host.getQuality() === "medium"
          ? 18
          : maximumTrailCount;
    const trailPositions = new Float32Array(maximumTrailCount * 3);
    const trailDummy = new THREE.Object3D();
    const color = new THREE.Color();
    const cyan = new THREE.Color(this.host.colors.cyan);
    const violet = new THREE.Color(this.host.colors.violet);
    for (let index = 0; index < maximumTrailCount; index += 1) {
      trailDummy.scale.setScalar(0.001);
      trailDummy.updateMatrix();
      trail.setMatrixAt(index, trailDummy.matrix);
      color.lerpColors(
        cyan,
        violet,
        index / Math.max(1, maximumTrailCount - 1),
      );
      trail.setColorAt(index, color);
    }
    trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    trail.instanceMatrix.needsUpdate = true;
    if (trail.instanceColor) trail.instanceColor.needsUpdate = true;
    parent.add(trail);

    const maximumMeteorCount = 6;
    const meteorPositions = new Float32Array(maximumMeteorCount * 2 * 3);
    const meteorColors = new Float32Array(maximumMeteorCount * 2 * 3);
    for (let index = 0; index < maximumMeteorCount; index += 1) {
      color.lerpColors(
        index % 2 === 0 ? cyan : violet,
        index % 2 === 0 ? violet : cyan,
        0.32,
      );
      for (let endpoint = 0; endpoint < 2; endpoint += 1) {
        const offset = (index * 2 + endpoint) * 3;
        meteorColors[offset] = color.r;
        meteorColors[offset + 1] = color.g;
        meteorColors[offset + 2] = color.b;
      }
    }
    const meteorGeometry = new THREE.BufferGeometry();
    const meteorPositionAttribute = new THREE.BufferAttribute(
      meteorPositions,
      3,
    );
    meteorPositionAttribute.setUsage(THREE.DynamicDrawUsage);
    meteorGeometry.setAttribute("position", meteorPositionAttribute);
    meteorGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(meteorColors, 3),
    );
    const meteorCount =
      this.host.getQuality() === "low"
        ? 3
        : this.host.getQuality() === "medium"
          ? 5
          : maximumMeteorCount;
    meteorGeometry.setDrawRange(0, meteorCount * 2);
    const meteors = new THREE.LineSegments(
      meteorGeometry,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    meteors.name = "void-ride-meteorite-drift";
    meteors.frustumCulled = false;
    meteors.renderOrder = 3;
    meteors.visible = false;
    parent.add(meteors);

    return {
      halo,
      trail,
      trailPositions,
      trailDummy,
      maximumTrailCount,
      meteors,
      meteorPositions,
      maximumMeteorCount,
    };
  }

  private resetVoidRideEffects(turtle: VoidTurtleState): void {
    const effects = turtle.effects;
    const tangentX = -Math.sin(turtle.rideAngle);
    const tangentZ = Math.cos(turtle.rideAngle);
    for (let index = 0; index < effects.maximumTrailCount; index += 1) {
      const distance = 1.7 + index * 0.34;
      const offset = index * 3;
      effects.trailPositions[offset] =
        turtle.group.position.x - tangentX * distance;
      effects.trailPositions[offset + 1] = turtle.group.position.y + 0.58;
      effects.trailPositions[offset + 2] =
        turtle.group.position.z - tangentZ * distance;
    }
  }

  private updateVoidRideEffects(turtle: VoidTurtleState, delta: number): void {
    const effects = turtle.effects;
    effects.halo.visible = turtle.riding;
    effects.trail.visible = turtle.riding;
    effects.meteors.visible = turtle.riding;
    if (!turtle.riding) return;

    const dismountFade =
      turtle.ridePhase === "dismounting"
        ? Math.max(
            0,
            1 - turtle.phaseAge / (this.host.isReducedMotion() ? 0.36 : 0.92),
          )
        : 1;
    const pulse = 1 + Math.sin(this.host.getElapsed() * 1.7) * 0.055;
    effects.halo.scale.setScalar(pulse);
    effects.halo.material.opacity =
      (0.13 + Math.sin(this.host.getElapsed() * 1.1) * 0.025) * dismountFade;
    if (!this.host.isReducedMotion()) effects.halo.rotation.z += delta * 0.16;

    const tangentX = -Math.sin(turtle.rideAngle);
    const tangentZ = Math.cos(turtle.rideAngle);
    const headX = turtle.group.position.x - tangentX * 1.85;
    const headY = turtle.group.position.y + 0.58;
    const headZ = turtle.group.position.z - tangentZ * 1.85;
    for (let index = 0; index < effects.maximumTrailCount; index += 1) {
      const offset = index * 3;
      const targetOffset = Math.max(0, offset - 3);
      const targetX =
        index === 0 ? headX : effects.trailPositions[targetOffset]!;
      const targetY =
        index === 0 ? headY : effects.trailPositions[targetOffset + 1]!;
      const targetZ =
        index === 0 ? headZ : effects.trailPositions[targetOffset + 2]!;
      const follow = 1 - Math.exp(-delta * (index === 0 ? 11 : 7.2));
      effects.trailPositions[offset] = THREE.MathUtils.lerp(
        effects.trailPositions[offset]!,
        targetX,
        follow,
      );
      effects.trailPositions[offset + 1] = THREE.MathUtils.lerp(
        effects.trailPositions[offset + 1]!,
        targetY,
        follow,
      );
      effects.trailPositions[offset + 2] = THREE.MathUtils.lerp(
        effects.trailPositions[offset + 2]!,
        targetZ,
        follow,
      );

      const taper = 1 - index / effects.maximumTrailCount;
      const shimmer =
        0.86 + Math.sin(this.host.getElapsed() * 5.2 - index * 0.63) * 0.14;
      effects.trailDummy.position.set(
        effects.trailPositions[offset]!,
        effects.trailPositions[offset + 1]!,
        effects.trailPositions[offset + 2]!,
      );
      effects.trailDummy.rotation.set(
        this.host.getElapsed() * 0.34 + index * 0.21,
        -this.host.getElapsed() * 0.27 + index * 0.33,
        index * 0.19,
      );
      effects.trailDummy.scale.setScalar(
        (0.2 + Math.pow(taper, 1.35) * 1.18) * shimmer * dismountFade,
      );
      effects.trailDummy.updateMatrix();
      effects.trail.setMatrixAt(index, effects.trailDummy.matrix);
    }
    effects.trail.instanceMatrix.needsUpdate = true;
    effects.trail.material.opacity = 0.68 * dismountFade;

    for (let index = 0; index < effects.maximumMeteorCount; index += 1) {
      const speed = this.host.isReducedMotion() ? 0 : 0.025 + index * 0.003;
      const phase = (this.host.getElapsed() * speed + index * 0.173) % 1;
      const lane = (index - (effects.maximumMeteorCount - 1) / 2) * 2.35;
      const x = turtle.group.position.x - 14 + phase * 28 + lane * 0.45;
      const y = 2.6 + (index % 3) * 1.15 + Math.sin(index * 1.7) * 0.3;
      const z = turtle.group.position.z + 11 - phase * 22 + lane;
      const length = 1.7 + (index % 3) * 0.55;
      const offset = index * 6;
      effects.meteorPositions[offset] = x;
      effects.meteorPositions[offset + 1] = y;
      effects.meteorPositions[offset + 2] = z;
      effects.meteorPositions[offset + 3] = x - length;
      effects.meteorPositions[offset + 4] = y + length * 0.42;
      effects.meteorPositions[offset + 5] = z + length * 0.78;
    }
    const positionAttribute = effects.meteors.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    positionAttribute.needsUpdate = true;
    effects.meteors.material.opacity =
      (0.46 + Math.sin(this.host.getElapsed() * 1.3) * 0.08) * dismountFade;
  }

  private createVoidTurtle(parent: THREE.Group, x: number, z: number): void {
    const turtle = new THREE.Group();
    turtle.name = "void-turtle-world-body";
    turtle.userData.clickNavigationPassThrough = true;
    turtle.position.set(x, 0.08, z);
    // Face away from the station so the head does not occupy the jump/landing lane.
    turtle.rotation.y = Math.atan2(x, z);

    const shell = new THREE.Mesh(
      new THREE.DodecahedronGeometry(2.05, 1),
      this.host.materials.mossDark,
    );
    shell.scale.set(1.24, 0.48, 1.46);
    shell.position.y = 0.38;
    shell.castShadow = false;
    turtle.add(shell);

    const head = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.72, 0),
      this.host.materials.moss,
    );
    head.position.set(0, 0.25, 3.02);
    head.scale.set(1, 0.78, 1.08);
    head.castShadow = false;
    turtle.add(head);

    const fins: VoidTurtleFin[] = [];
    for (const [side, rear] of [
      [-1, false],
      [1, false],
      [-1, true],
      [1, true],
    ] as const) {
      const pivot = new THREE.Group();
      const radius = rear ? 0.62 : 0.72;
      const centerX = rear ? 2.05 : 2.35;
      const jointX = rear ? 1.35 : 1.48;
      const z = rear ? -1.55 : 0.78;
      pivot.position.set(side * jointX, rear ? 0.02 : 0.05, z);

      const fin = new THREE.Mesh(
        new THREE.DodecahedronGeometry(radius, 0),
        this.host.materials.moss,
      );
      fin.position.x = side * (centerX - jointX);
      fin.scale.set(rear ? 1.18 : 1.35, rear ? 0.2 : 0.24, rear ? 0.62 : 0.72);
      fin.rotation.y = side * (rear ? -0.35 : 0.35);
      fin.castShadow = false;
      pivot.add(fin);
      turtle.add(pivot);
      fins.push({
        pivot,
        side,
        phase: rear ? Math.PI * 0.72 : 0,
        rear,
      });
    }

    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(2.48, 0.055, 5, 30),
      this.host.materials.cyanSoft,
    );
    orbit.position.y = 0.68;
    orbit.rotation.set(Math.PI / 2, 0.16, 0.12);
    orbit.scale.z = 1.15;
    turtle.add(orbit);

    const moonOrbit = new THREE.Group();
    moonOrbit.position.y = 0.72;
    const moon = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.24, 0),
      this.host.materials.violet,
    );
    moon.position.x = 2.48;
    moonOrbit.add(moon);
    turtle.add(moonOrbit);

    const eyes = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.09, 6, 5),
      this.host.materials.amber,
      2,
    );
    const eyeTransform = new THREE.Object3D();
    for (const [index, eyeX] of [-0.23, 0.23].entries()) {
      eyeTransform.position.set(eyeX, 0.43, 3.62);
      eyeTransform.updateMatrix();
      eyes.setMatrixAt(index, eyeTransform.matrix);
    }
    eyes.instanceMatrix.needsUpdate = true;
    const turtleAwake = this.awakened;
    eyes.visible = turtleAwake;
    turtle.add(eyes);

    const sleepEyes = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.35, 0.43, 3.64),
        new THREE.Vector3(-0.11, 0.43, 3.64),
        new THREE.Vector3(0.11, 0.43, 3.64),
        new THREE.Vector3(0.35, 0.43, 3.64),
      ]),
      new THREE.LineBasicMaterial({
        color: this.host.colors.amber,
        transparent: true,
        opacity: 0.72,
        depthTest: false,
      }),
    );
    sleepEyes.visible = !turtleAwake;
    sleepEyes.renderOrder = 4;
    turtle.add(sleepEyes);

    parent.add(turtle);
    const effects = this.createVoidRideEffects(parent, turtle);
    this.host.addAnimatedItem({
      object: turtle,
      originY: turtle.position.y,
      phase: 0.7,
      amplitude: 0.16,
      rotationSpeed: 0,
    });
    const shellSurface: SurfaceArea = {
      id: "void-turtle-shell",
      x,
      z,
      halfWidth: 2.2,
      halfDepth: 2.35,
      requiresJump: true,
      // Follow the floating shell instead of letting the rider's feet and
      // lantern sink into its highest facets as the turtle bobs.
      heightAt: () => turtle.position.y + 1.38,
    };
    this.host.addSurface(shellSurface);
    const stationAngle = Math.atan2(z, x);
    const stationRadius = Math.hypot(x, z);
    this.turtle = {
      group: turtle,
      moonOrbit,
      fins,
      eyes,
      sleepEyes,
      awake: turtleAwake,
      surface: shellSurface,
      interactionId: "void-turtle",
      stationAngle,
      stationRadius,
      rideAngle: stationAngle,
      rideTravel: 0,
      riding: false,
      ridePhase: "parked",
      phaseAge: 0,
      returnStartAngle: stationAngle,
      returnStartRadius: stationRadius,
      returnTargetAngle: stationAngle,
      dismountStart: new THREE.Vector3(x, 0, z),
      dismountTarget: new THREE.Vector3(x, 0, z),
      dismountHeight: 0,
      dismountHeading: turtle.rotation.y,
      buckAge: 2,
      effects,
    };
  }

  private createVoidTurtleAsteroids(parent: THREE.Group): void {
    for (const [
      index,
      [angle, radius, idleY, size],
    ] of voidTurtleAsteroidConfigs.entries()) {
      const asteroid = new THREE.Group();
      asteroid.name = `void-turtle-asteroid-${index}`;
      asteroid.position.set(
        Math.cos(angle) * radius,
        idleY,
        Math.sin(angle) * radius,
      );
      asteroid.rotation.set(index * 0.31, index * 0.67, -index * 0.18);

      const body = new THREE.Mesh(
        new THREE.DodecahedronGeometry(size, 0),
        this.host.materials.darkStone,
      );
      body.scale.set(1, 0.76 + (index % 3) * 0.08, 0.9);
      body.castShadow = false;
      asteroid.add(body);

      const band = new THREE.Mesh(
        new THREE.TorusGeometry(size * 0.76, 0.028, 4, 16),
        this.host.materials.cyanSoft,
      );
      band.rotation.set(Math.PI / 2, index * 0.23, 0.18);
      band.visible = this.capturedTurtleAsteroidIndices.has(index);
      band.castShadow = false;
      asteroid.add(band);
      parent.add(asteroid);

      const kickable = this.host.registerKickable(
        asteroid,
        size * 0.88,
        idleY,
        null,
        false,
        null,
        0.996,
        "",
      );
      const baseOrbitSpeed = 0.34 + (index % 3) * 0.055;
      this.turtleAsteroids.push({
        index,
        object: asteroid,
        band,
        kickable,
        collected: this.capturedTurtleAsteroidIndices.has(index),
        idleY,
        verticalPhase: index * 1.37,
        orbitAngle: angle,
        orbitRadius: 3.45 + (index % 3) * 0.62,
        targetRadius: 3.45 + (index % 3) * 0.62,
        orbitSpeed: baseOrbitSpeed,
        baseOrbitSpeed,
        radialVelocity: 0,
      });
    }
    this.updateTurtleAsteroids(0);
  }

  private getTurtleAsteroidState(
    kickable: Kickable,
  ): TurtleAsteroidState | null {
    return (
      this.turtleAsteroids.find((asteroid) => asteroid.kickable === kickable) ??
      null
    );
  }

  private captureTurtleAsteroid(
    asteroid: TurtleAsteroidState,
    turtle: VoidTurtleState,
  ): void {
    const dx = asteroid.object.position.x - turtle.group.position.x;
    const dz = asteroid.object.position.z - turtle.group.position.z;
    asteroid.collected = true;
    asteroid.band.visible = true;
    asteroid.orbitAngle = Math.atan2(dz, dx);
    asteroid.orbitRadius = THREE.MathUtils.clamp(Math.hypot(dx, dz), 3.05, 6.8);
    asteroid.radialVelocity = 0;
    asteroid.kickable.velocity.set(0, 0, 0);
    asteroid.kickable.platform = null;
    asteroid.kickable.onPlatform = false;
    this.capturedTurtleAsteroidIndices.add(asteroid.index);

    if (this.capturedTurtleAsteroidIndices.size === 1) {
      this.host.onStatus(
        "A loose asteroid catches the turtle’s wake and settles into a small orbit.",
      );
    } else if (
      this.capturedTurtleAsteroidIndices.size ===
      voidTurtleAsteroidConfigs.length
    ) {
      this.host.onStatus(
        "The last wandering stone joins the turtle’s little moving system.",
        { kind: "achievement", title: "ROCK COLLECTOR" },
      );
    }
  }

  private getTurtleCargoOrbiter(
    kickable: Kickable,
  ): TurtleCargoOrbiterState | null {
    return (
      this.turtleCargoOrbiters.find(
        (orbiter) => orbiter.kickable === kickable,
      ) ?? null
    );
  }

  releaseCargo(kickable: Kickable, restorePhysics = true): boolean {
    const index = this.turtleCargoOrbiters.findIndex(
      (orbiter) => orbiter.kickable === kickable,
    );
    if (index < 0) return false;
    const [orbiter] = this.turtleCargoOrbiters.splice(index, 1);
    if (orbiter && restorePhysics) {
      kickable.gravity = orbiter.originalGravity;
      kickable.restingY = orbiter.originalRestingY;
    }
    kickable.object.userData.turtleCargo = false;
    return true;
  }

  private captureTurtleCargoOrbiter(
    kickable: Kickable,
    turtle: VoidTurtleState,
  ): TurtleCargoOrbiterState {
    const existing = this.getTurtleCargoOrbiter(kickable);
    if (existing) return existing;
    const dx = kickable.object.position.x - turtle.group.position.x;
    const dz = kickable.object.position.z - turtle.group.position.z;
    const cargoIndex = this.turtleCargoOrbiters.length;
    const rawRadius = Math.max(0.001, Math.hypot(dx, dz));
    const direction = cargoIndex % 2 === 0 ? 1 : -1;
    const orbiter: TurtleCargoOrbiterState = {
      kickable,
      orbitAngle: Math.atan2(dz, dx),
      orbitRadius: THREE.MathUtils.clamp(rawRadius, 2.65, 6.8),
      targetRadius: 2.85 + (cargoIndex % 5) * 0.54,
      orbitSpeed: direction * (0.4 + (cargoIndex % 4) * 0.055),
      radialVelocity: 0,
      verticalPhase: cargoIndex * 1.73 + kickable.radius,
      originalGravity: kickable.gravity,
      originalRestingY: kickable.restingY,
    };
    kickable.gravity = false;
    kickable.velocity.set(0, 0, 0);
    kickable.platform = null;
    kickable.onPlatform = false;
    kickable.object.userData.turtleCargo = true;
    this.turtleCargoOrbiters.push(orbiter);
    if (!this.turtleCargoCaptureAnnounced) {
      this.turtleCargoCaptureAnnounced = true;
      this.host.onStatus(
        kickable === this.host.getTravelingAsteroid()
          ? "The misrouted asteroid catches the turtle’s wake and begins circling with the stones."
          : "A loose tool catches the turtle’s wake and begins circling with the stones.",
      );
    }
    return orbiter;
  }

  private updateTurtleCargoOrbiters(
    delta: number,
    turtle: VoidTurtleState,
  ): void {
    if (turtle.riding) {
      for (const kickable of this.host.getKickables()) {
        if (
          !kickable.enabled ||
          kickable === this.host.getHeldKickable() ||
          (kickable.pinballRadius !== null &&
            kickable !== this.host.getTravelingAsteroid()) ||
          this.getTurtleAsteroidState(kickable) ||
          this.getTurtleCargoOrbiter(kickable)
        ) {
          continue;
        }
        const dx = kickable.object.position.x - turtle.group.position.x;
        const dz = kickable.object.position.z - turtle.group.position.z;
        const captureDistance = 3.45 + kickable.radius;
        if (dx * dx + dz * dz <= captureDistance * captureDistance) {
          this.captureTurtleCargoOrbiter(kickable, turtle);
        }
      }
    }

    for (const orbiter of this.turtleCargoOrbiters) {
      const { kickable } = orbiter;
      if (!kickable.enabled || kickable === this.host.getHeldKickable())
        continue;
      const spring = (orbiter.targetRadius - orbiter.orbitRadius) * 1.55;
      orbiter.radialVelocity += spring * delta;
      orbiter.radialVelocity *= Math.exp(-delta * 1.18);
      const maximumOrbitRadius =
        kickable === this.host.getTravelingAsteroid() && turtle.riding
          ? 11.5
          : 7.4;
      orbiter.orbitRadius = THREE.MathUtils.clamp(
        orbiter.orbitRadius + orbiter.radialVelocity * delta,
        2.55,
        maximumOrbitRadius,
      );
      orbiter.orbitAngle += orbiter.orbitSpeed * delta;
      kickable.object.position.set(
        turtle.group.position.x +
          Math.cos(orbiter.orbitAngle) * orbiter.orbitRadius,
        turtle.group.position.y +
          1.05 +
          Math.sin(orbiter.orbitAngle * 1.7 + orbiter.verticalPhase) * 0.48,
        turtle.group.position.z +
          Math.sin(orbiter.orbitAngle) * orbiter.orbitRadius,
      );
      kickable.object.rotation.y += delta * (0.7 + kickable.radius * 0.2);
      if (kickable.object.userData.upright !== true) {
        kickable.object.rotation.z += delta * 0.42;
      }
      this.host.syncLooseToolInteraction(kickable);
    }
  }

  private updateTurtleAsteroids(delta: number): void {
    const turtle = this.turtle;
    if (!turtle) return;

    for (const asteroid of this.turtleAsteroids) {
      if (!asteroid.collected) {
        if (asteroid.kickable !== this.host.getHeldKickable()) {
          asteroid.object.position.y =
            asteroid.idleY +
            Math.sin(this.host.getElapsed() * 0.72 + asteroid.verticalPhase) *
              0.16;
          asteroid.object.rotation.y += delta * (0.18 + asteroid.index * 0.018);
        }
        if (!turtle.riding || asteroid.kickable === this.host.getHeldKickable())
          continue;
        const dx = asteroid.object.position.x - turtle.group.position.x;
        const dz = asteroid.object.position.z - turtle.group.position.z;
        const captureDistance = 3.45 + asteroid.kickable.radius;
        if (dx * dx + dz * dz > captureDistance * captureDistance) continue;
        this.captureTurtleAsteroid(asteroid, turtle);
      }

      if (asteroid.kickable === this.host.getHeldKickable()) continue;
      const spring = (asteroid.targetRadius - asteroid.orbitRadius) * 1.75;
      asteroid.radialVelocity += spring * delta;
      asteroid.radialVelocity *= Math.exp(-delta * 1.15);
      asteroid.orbitRadius = THREE.MathUtils.clamp(
        asteroid.orbitRadius + asteroid.radialVelocity * delta,
        3.05,
        7.6,
      );
      asteroid.orbitSpeed = THREE.MathUtils.lerp(
        asteroid.orbitSpeed,
        asteroid.baseOrbitSpeed,
        1 - Math.exp(-delta * 0.07),
      );
      asteroid.orbitAngle += asteroid.orbitSpeed * delta;
      asteroid.object.position.set(
        turtle.group.position.x +
          Math.cos(asteroid.orbitAngle) * asteroid.orbitRadius,
        turtle.group.position.y +
          0.92 +
          Math.sin(asteroid.orbitAngle * 1.8 + asteroid.verticalPhase) * 0.62,
        turtle.group.position.z +
          Math.sin(asteroid.orbitAngle) * asteroid.orbitRadius,
      );
      asteroid.object.rotation.x += delta * (0.24 + asteroid.index * 0.025);
      asteroid.object.rotation.y += delta * (0.38 + asteroid.index * 0.02);
      this.kickCapturedTurtleAsteroid(asteroid, turtle, delta);
    }
    this.updateTurtleCargoOrbiters(delta, turtle);
  }

  private kickCapturedTurtleAsteroid(
    asteroid: TurtleAsteroidState,
    turtle: VoidTurtleState,
    delta: number,
  ): void {
    asteroid.kickable.kickCooldown = Math.max(
      0,
      asteroid.kickable.kickCooldown - delta,
    );
    if (
      turtle.riding ||
      asteroid.kickable.kickCooldown > 0 ||
      this.host.getPlayerMovement().lengthSq() <= 0.0001
    ) {
      return;
    }
    const dx = asteroid.object.position.x - this.host.getPlayerPosition().x;
    const dz = asteroid.object.position.z - this.host.getPlayerPosition().z;
    const contact = asteroid.kickable.radius + this.host.playerRadius + 0.14;
    if (dx * dx + dz * dz > contact * contact) return;

    const movementLength = Math.max(
      0.001,
      Math.hypot(
        this.host.getPlayerMovement().x,
        this.host.getPlayerMovement().z,
      ),
    );
    const directionX = this.host.getPlayerMovement().x / movementLength;
    const directionZ = this.host.getPlayerMovement().z / movementLength;
    const radialX = Math.cos(asteroid.orbitAngle);
    const radialZ = Math.sin(asteroid.orbitAngle);
    const tangentX = -radialZ;
    const tangentZ = radialX;
    const radialPush = directionX * radialX + directionZ * radialZ;
    const tangentialPush = directionX * tangentX + directionZ * tangentZ;
    asteroid.radialVelocity = THREE.MathUtils.clamp(
      asteroid.radialVelocity + radialPush * 3.9,
      -4.8,
      7.1,
    );
    asteroid.orbitSpeed = THREE.MathUtils.clamp(
      asteroid.orbitSpeed +
        (tangentialPush * 2.8) / Math.max(3.05, asteroid.orbitRadius),
      -1.8,
      1.8,
    );
    asteroid.kickable.kickCooldown = 0.38;
    if (!this.turtleAsteroidFlingAnnounced) {
      this.turtleAsteroidFlingAnnounced = true;
      this.host.onStatus(
        "The kicked stone keeps the shove, but the turtle’s curve refuses to let it go.",
      );
    }
  }

  releaseAsteroidTelekinesis(kickable: Kickable, event: PointerEvent): boolean {
    const asteroid = this.getTurtleAsteroidState(kickable);
    const turtle = this.turtle;
    if (!asteroid?.collected || !turtle) return false;

    const dx = asteroid.object.position.x - turtle.group.position.x;
    const dz = asteroid.object.position.z - turtle.group.position.z;
    const rawRadius = Math.max(0.001, Math.hypot(dx, dz));
    asteroid.orbitAngle = Math.atan2(dz, dx);
    asteroid.orbitRadius = THREE.MathUtils.clamp(rawRadius, 3.05, 7.6);
    const radialX = Math.cos(asteroid.orbitAngle);
    const radialZ = Math.sin(asteroid.orbitAngle);
    const tangentX = -radialZ;
    const tangentZ = radialX;
    const radialSpeed =
      kickable.velocity.x * radialX + kickable.velocity.z * radialZ;
    const tangentialSpeed =
      kickable.velocity.x * tangentX + kickable.velocity.z * tangentZ;
    asteroid.radialVelocity = THREE.MathUtils.clamp(radialSpeed, -4.8, 4.8);
    asteroid.orbitSpeed = THREE.MathUtils.clamp(
      asteroid.orbitSpeed +
        tangentialSpeed / Math.max(3.05, asteroid.orbitRadius),
      -1.8,
      1.8,
    );
    asteroid.object.position.x =
      turtle.group.position.x + radialX * asteroid.orbitRadius;
    asteroid.object.position.z =
      turtle.group.position.z + radialZ * asteroid.orbitRadius;
    kickable.velocity.set(0, 0, 0);
    kickable.kickCooldown = 0.28;

    if (!this.turtleAsteroidFlingAnnounced) {
      this.turtleAsteroidFlingAnnounced = true;
      this.host.onStatus(
        "The released stone catches the turtle’s curve and keeps the speed you gave it.",
      );
    }

    this.host.finishTelekinesis(event);
    return true;
  }

  releaseCargoTelekinesis(kickable: Kickable, event: PointerEvent): boolean {
    const turtle = this.turtle;
    if (!turtle || this.getTurtleAsteroidState(kickable)) return false;
    let orbiter = this.getTurtleCargoOrbiter(kickable);
    if (!orbiter) {
      if (!turtle.riding) return false;
      const dx = kickable.object.position.x - turtle.group.position.x;
      const dz = kickable.object.position.z - turtle.group.position.z;
      const captureDistance = 3.45 + kickable.radius;
      if (dx * dx + dz * dz > captureDistance * captureDistance) {
        return false;
      }
      orbiter = this.captureTurtleCargoOrbiter(kickable, turtle);
    }

    const dx = kickable.object.position.x - turtle.group.position.x;
    const dz = kickable.object.position.z - turtle.group.position.z;
    const rawRadius = Math.max(0.001, Math.hypot(dx, dz));
    orbiter.orbitAngle = Math.atan2(dz, dx);
    const maximumOrbitRadius =
      kickable === this.host.getTravelingAsteroid() && turtle.riding
        ? 11.5
        : 7.4;
    orbiter.orbitRadius = THREE.MathUtils.clamp(
      rawRadius,
      2.55,
      maximumOrbitRadius,
    );
    const radialX = Math.cos(orbiter.orbitAngle);
    const radialZ = Math.sin(orbiter.orbitAngle);
    const tangentX = -radialZ;
    const tangentZ = radialX;
    const radialSpeed =
      kickable.velocity.x * radialX + kickable.velocity.z * radialZ;
    const tangentialSpeed =
      kickable.velocity.x * tangentX + kickable.velocity.z * tangentZ;
    orbiter.radialVelocity = THREE.MathUtils.clamp(radialSpeed, -4.4, 4.4);
    orbiter.orbitSpeed = THREE.MathUtils.clamp(
      orbiter.orbitSpeed +
        tangentialSpeed / Math.max(2.55, orbiter.orbitRadius),
      -1.7,
      1.7,
    );
    kickable.gravity = false;
    kickable.velocity.set(0, 0, 0);
    kickable.platform = null;
    kickable.onPlatform = false;
    kickable.kickCooldown = 0.28;
    this.host.finishTelekinesis(event);
    return true;
  }

  private interactVoidTurtle(): void {
    const turtle = this.turtle;
    if (!turtle) return;
    if (turtle.riding) {
      this.beginVoidTurtleReturn();
      return;
    }
    if (!turtle.awake) {
      this.host.onStatus(
        "The turtle sleeps on, limbs drifting in the dark. Its shell rises and falls in a very slow tide.",
      );
      return;
    }

    turtle.riding = true;
    turtle.ridePhase = "departing";
    turtle.phaseAge = 0;
    turtle.stationAngle = Math.atan2(
      turtle.group.position.z,
      turtle.group.position.x,
    );
    turtle.rideAngle = Math.atan2(
      turtle.group.position.z,
      turtle.group.position.x,
    );
    turtle.rideTravel = 0;
    turtle.returnStartAngle = turtle.rideAngle;
    turtle.returnStartRadius = turtle.stationRadius;
    turtle.returnTargetAngle = turtle.rideAngle;
    turtle.dismountHeight = turtle.surface.heightAt(
      turtle.surface.x,
      turtle.surface.z,
    );
    this.resetVoidRideEffects(turtle);
    this.host.resetJump();
    this.host.setPlayerSupport(
      turtle.surface,
      turtle.surface.heightAt(turtle.surface.x, turtle.surface.z),
    );
    this.host.setPlayerPosition(
      turtle.surface.x,
      this.host.getSpawnY(),
      turtle.surface.z,
    );
    this.host.updateInteractionLabel(
      turtle.interactionId,
      "Dismount at the current bearing",
    );
    this.host.onStatus(
      "The turtle answers your approach. The void bends into a slow orbit, and music arrives from somewhere beyond it.",
    );
    this.host.onMediaChange(true);
  }

  wakeFromThunder(range: number): boolean {
    const turtle = this.turtle;
    if (!turtle || this.awakened) {
      return false;
    }
    const distance = Math.hypot(
      turtle.group.position.x - this.host.getPlayerPosition().x,
      turtle.group.position.z - this.host.getPlayerPosition().z,
    );
    const shellReach = 2.15;
    if (distance > range + shellReach) return false;

    this.awakened = true;
    turtle.awake = true;
    turtle.eyes.visible = true;
    turtle.sleepEyes.visible = false;
    turtle.buckAge = 0;
    this.host.updateInteractionLabel(
      turtle.interactionId,
      "Greet the wakeful void turtle",
    );
    return true;
  }

  pulseCapturedAsteroids(range: number, charge: number): number {
    const turtle = this.turtle;
    if (!turtle) return 0;
    const distance = Math.hypot(
      turtle.group.position.x - this.host.getPlayerPosition().x,
      turtle.group.position.z - this.host.getPlayerPosition().z,
    );
    if (distance > range + 2.15) return 0;

    let pulsed = 0;
    for (const asteroid of this.turtleAsteroids) {
      if (
        !asteroid.collected ||
        asteroid.kickable === this.host.getHeldKickable()
      ) {
        continue;
      }
      const stagger = (asteroid.index % 3) * 0.22;
      asteroid.radialVelocity = THREE.MathUtils.clamp(
        Math.max(asteroid.radialVelocity, 4.15 + charge * 2.25 + stagger),
        -4.8,
        7.1,
      );
      const scatterDirection = asteroid.index % 2 === 0 ? 1 : -1;
      asteroid.orbitSpeed = THREE.MathUtils.clamp(
        asteroid.orbitSpeed + scatterDirection * (0.12 + charge * 0.18),
        -1.8,
        1.8,
      );
      asteroid.kickable.velocity.set(0, 0, 0);
      pulsed += 1;
    }
    return pulsed;
  }

  private beginVoidTurtleReturn(): void {
    const turtle = this.turtle;
    if (!turtle?.riding) return;
    if (
      turtle.ridePhase === "returning" ||
      turtle.ridePhase === "dismounting"
    ) {
      this.host.onStatus(
        "Return vector already locked. Soft landing in progress.",
      );
      return;
    }

    turtle.ridePhase = "returning";
    turtle.phaseAge = 0;
    turtle.returnStartAngle = turtle.rideAngle;
    turtle.returnStartRadius = Math.hypot(
      turtle.group.position.x,
      turtle.group.position.z,
    );
    const returnDuration = this.host.isReducedMotion()
      ? 0.36
      : voidTurtleReturnDuration;
    turtle.returnTargetAngle =
      turtle.returnStartAngle + (voidTurtleRideSpeed * returnDuration) / 2;
    this.host.updateInteractionLabel(
      turtle.interactionId,
      "Returning to the station…",
    );
    this.host.onStatus(
      "Return vector locked. The turtle arcs gently toward the platform; stay aboard for the soft landing.",
    );
  }

  private beginVoidTurtleDismount(turtle: VoidTurtleState): void {
    turtle.ridePhase = "dismounting";
    turtle.phaseAge = 0;
    turtle.stationAngle = Math.atan2(
      turtle.group.position.z,
      turtle.group.position.x,
    );
    turtle.rideAngle = turtle.stationAngle;
    turtle.dismountStart.set(
      turtle.group.position.x,
      this.host.getSpawnY(),
      turtle.group.position.z,
    );
    const platformRadius = Math.max(0, turtle.stationRadius - 4.15);
    turtle.dismountTarget.set(
      Math.cos(turtle.stationAngle) * platformRadius,
      this.host.getSpawnY(),
      Math.sin(turtle.stationAngle) * platformRadius,
    );
    turtle.dismountHeight = turtle.surface.heightAt(
      turtle.surface.x,
      turtle.surface.z,
    );
    this.host.setPlayerSupport(null, 0);
    this.host.resetJump();
    turtle.dismountHeading = Math.atan2(
      turtle.dismountTarget.x - turtle.dismountStart.x,
      turtle.dismountTarget.z - turtle.dismountStart.z,
    );
    this.host.setPlayerHeading(turtle.dismountHeading);
    this.host.updateInteractionLabel(turtle.interactionId, "Stepping off…");
  }

  private completeVoidTurtleDismount(turtle: VoidTurtleState): void {
    turtle.riding = false;
    turtle.ridePhase = "parked";
    turtle.phaseAge = 0;
    turtle.rideTravel = 0;
    this.host.onMediaChange(false);
    turtle.group.position.x =
      Math.cos(turtle.stationAngle) * turtle.stationRadius;
    turtle.group.position.z =
      Math.sin(turtle.stationAngle) * turtle.stationRadius;
    turtle.group.rotation.y = Math.atan2(
      turtle.group.position.x,
      turtle.group.position.z,
    );
    turtle.surface.x = turtle.group.position.x;
    turtle.surface.z = turtle.group.position.z;
    this.host.moveInteraction(
      turtle.interactionId,
      turtle.surface.x,
      turtle.surface.z,
    );
    this.host.updateInteractionLabel(
      turtle.interactionId,
      "Ride the void turtle",
    );
    this.host.copyPlayerPosition(turtle.dismountTarget);
    this.host.setPlayerHeading(turtle.dismountHeading);
    this.host.setPlayerSupport(null, 0);
    this.host.resetJump();
    this.host.setShadowState(0.16, 0);
    this.updateVoidRideEffects(turtle, 0);
    this.host.onStatus(
      "Soft landing. The turtle settles beside the station at this bearing and waits.",
    );
  }

  private updateVoidTurtle(delta: number): void {
    const turtle = this.turtle;
    if (!turtle) return;
    const shouldBeAwake = this.awakened || turtle.riding;
    if (shouldBeAwake !== turtle.awake) {
      turtle.awake = shouldBeAwake;
      turtle.eyes.visible = shouldBeAwake;
      turtle.sleepEyes.visible = !shouldBeAwake;
      if (!turtle.riding) {
        this.host.updateInteractionLabel(
          turtle.interactionId,
          shouldBeAwake
            ? "Greet the wakeful void turtle"
            : "Observe the sleeping void turtle",
        );
      }
    }
    const ambientMotionScale = this.host.isReducedMotion() ? 0.24 : 1;
    const moonOrbitSpeed = turtle.awake ? 0.22 : 0.13;
    turtle.moonOrbit.rotation.y +=
      delta * moonOrbitSpeed * ambientMotionScale;
    const finAmplitude =
      (turtle.riding
        ? turtle.ridePhase === "dismounting"
          ? 0.16
          : 0.34
        : turtle.awake
          ? 0.065
          : 0.018) * ambientMotionScale;
    const finSpeed = turtle.riding ? 3.4 : turtle.awake ? 1.25 : 0.72;
    for (const fin of turtle.fins) {
      const stroke = Math.sin(this.host.getElapsed() * finSpeed + fin.phase);
      fin.pivot.rotation.z = fin.side * stroke * finAmplitude;
      fin.pivot.rotation.x =
        Math.cos(this.host.getElapsed() * finSpeed * 0.82 + fin.phase) *
        finAmplitude *
        (fin.rear ? -0.14 : 0.1);
    }
    turtle.buckAge = Math.min(2, turtle.buckAge + delta);
    const buckProgress = Math.min(1, turtle.buckAge / 0.72);
    const buck = Math.sin(buckProgress * Math.PI) * (1 - buckProgress);
    turtle.group.rotation.x = -buck * 0.3;
    turtle.group.rotation.z = buck * 0.2;

    if (turtle.riding) {
      turtle.phaseAge += delta;
      let radius = Math.hypot(turtle.group.position.x, turtle.group.position.z);

      if (turtle.ridePhase === "departing") {
        turtle.rideTravel += voidTurtleRideSpeed * delta;
        turtle.rideAngle = turtle.stationAngle + turtle.rideTravel;
        const duration = this.host.isReducedMotion()
          ? 0.36
          : voidTurtleDepartureDuration;
        const progress = Math.min(1, turtle.phaseAge / duration);
        const eased = progress * progress * (3 - 2 * progress);
        radius = turtle.stationRadius + voidTurtleCruiseOffset * eased;
        if (progress >= 1) {
          turtle.ridePhase = "cruising";
          turtle.phaseAge = 0;
        }
      } else if (turtle.ridePhase === "cruising") {
        turtle.rideTravel += voidTurtleRideSpeed * delta;
        turtle.rideAngle = turtle.stationAngle + turtle.rideTravel;
        radius = turtle.stationRadius + voidTurtleCruiseOffset;
      } else if (turtle.ridePhase === "returning") {
        const duration = this.host.isReducedMotion()
          ? 0.36
          : voidTurtleReturnDuration;
        const progress = Math.min(1, turtle.phaseAge / duration);
        const radialEase = progress * progress * (3 - 2 * progress);
        const angularEase = 1 - (1 - progress) * (1 - progress);
        turtle.rideAngle = THREE.MathUtils.lerp(
          turtle.returnStartAngle,
          turtle.returnTargetAngle,
          angularEase,
        );
        radius = THREE.MathUtils.lerp(
          turtle.returnStartRadius,
          turtle.stationRadius,
          radialEase,
        );
        if (progress >= 1) this.beginVoidTurtleDismount(turtle);
      }

      if (turtle.ridePhase !== "dismounting") {
        turtle.group.position.x = Math.cos(turtle.rideAngle) * radius;
        turtle.group.position.z = Math.sin(turtle.rideAngle) * radius;
        let turtleYaw = -turtle.rideAngle;
        if (turtle.ridePhase === "departing") {
          const parkedYaw = Math.atan2(
            Math.cos(turtle.stationAngle),
            Math.sin(turtle.stationAngle),
          );
          const targetYaw = -turtle.rideAngle;
          const yawDelta = Math.atan2(
            Math.sin(targetYaw - parkedYaw),
            Math.cos(targetYaw - parkedYaw),
          );
          const turnDuration = this.host.isReducedMotion() ? 0.18 : 0.82;
          const turnProgress = Math.min(1, turtle.phaseAge / turnDuration);
          const turnEase = turnProgress * turnProgress * (3 - 2 * turnProgress);
          turtleYaw = parkedYaw + yawDelta * turnEase;
        }
        turtle.group.rotation.y = turtleYaw;
        this.host.setPlayerHeading(turtle.group.rotation.y);
        this.host.setPlayerPosition(
          turtle.group.position.x,
          this.host.getSpawnY(),
          turtle.group.position.z,
        );
        this.host.setPlayerSupport(
          turtle.surface,
          turtle.surface.heightAt(turtle.surface.x, turtle.surface.z),
        );
      } else {
        const duration = this.host.isReducedMotion()
          ? 0.36
          : voidTurtleDismountDuration;
        const progress = Math.min(1, turtle.phaseAge / duration);
        const eased = progress * progress * (3 - 2 * progress);
        this.host.lerpPlayerPosition(
          turtle.dismountStart,
          turtle.dismountTarget,
          eased,
        );
        const shellHeight = turtle.surface.heightAt(
          turtle.surface.x,
          turtle.surface.z,
        );
        const groundHeight = THREE.MathUtils.lerp(shellHeight, 0, eased);
        const hop =
          Math.sin(progress * Math.PI) *
          (this.host.isReducedMotion() ? 0.08 : 0.5);
        turtle.dismountHeight = groundHeight + hop;
        this.host.setShadowState(
          THREE.MathUtils.lerp(shellHeight + 0.012, 0.16, eased),
          Math.max(0, hop),
        );

        const startYaw = -turtle.stationAngle;
        const targetYaw = Math.atan2(
          turtle.group.position.x,
          turtle.group.position.z,
        );
        const yawDelta = Math.atan2(
          Math.sin(targetYaw - startYaw),
          Math.cos(targetYaw - startYaw),
        );
        turtle.group.rotation.y = startYaw + yawDelta * eased;
        if (progress >= 1) this.completeVoidTurtleDismount(turtle);
      }

      turtle.surface.x = turtle.group.position.x;
      turtle.surface.z = turtle.group.position.z;
      this.host.moveInteraction(
        turtle.interactionId,
        turtle.surface.x,
        turtle.surface.z,
      );
      this.updateVoidRideEffects(turtle, delta);
      return;
    }

    turtle.surface.x = turtle.group.position.x;
    turtle.surface.z = turtle.group.position.z;
    this.updateVoidRideEffects(turtle, delta);
  }
}
