import * as THREE from "three";

import type { Kickable } from "../../Kickable";
import { addCylinder } from "../../scenePrimitives";
import type { WorldCollapseFrame } from "../../WorldCollapseSequence";
import type {
  QualityTier,
  SpellStage,
  WorldStatusOptions,
} from "../../../world/WorldContracts";

interface OrbitingPlanet {
  pivot: THREE.Group;
  planet: THREE.Object3D;
  bodyMaterial: THREE.MeshStandardMaterial;
  speed: number;
  detail: number;
  radius: number;
  collisionRadius: number;
  orbitalBoost: number;
  radialOffset: number;
  radialVelocity: number;
  tiltVelocity: number;
  impact: number;
  collisionCooldown: number;
  playerContact: boolean;
  rigidity: number;
  rigidUntil: number;
  worldPosition: THREE.Vector3;
}

interface OrbitTelekinesisHold {
  planet: OrbitingPlanet;
  plane: THREE.Plane;
  point: THREE.Vector3;
  previousPoint: THREE.Vector3;
  velocity: THREE.Vector3;
  grabOffset: THREE.Vector3;
  previousTime: number;
  moved: boolean;
}

interface ArchiveAtlasState {
  globe: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial>;
  orbit: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>;
  star: THREE.Group;
  starMaterial: THREE.MeshBasicMaterial;
  pulse: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  light: THREE.PointLight;
  pulseAge: number;
  ascensionBlend: number;
}

interface OrbitAnimatedItem {
  object: THREE.Object3D;
  originY: number;
  phase: number;
  amplitude: number;
  rotationSpeed: number;
  rotationAxis?: "x" | "y" | "z";
}

export interface ArchiveOrbitPlaygroundHost {
  canvas: HTMLCanvasElement;
  materials: Readonly<{
    amber: THREE.Material;
    brass: THREE.Material;
    coral: THREE.Material;
    cyan: THREE.Material;
    cyanSoft: THREE.Material;
    green: THREE.Material;
    parchment: THREE.Material;
    stone: THREE.Material;
    violet: THREE.Material;
  }>;
  colors: Readonly<{
    brass: number;
    cyan: number;
  }>;
  pointerRaycaster: THREE.Raycaster;
  playerRadius: number;
  addInteraction: (
    id: string,
    label: string,
    x: number,
    z: number,
    radius: number,
    action: () => void | Promise<void>,
  ) => void;
  addAnimatedItem: (item: OrbitAnimatedItem) => void;
  registerClimbableBox: (
    object: THREE.Object3D,
    id: string | null,
    landingMessage?: string,
    collisionClearAbove?: number,
    occludesPlayer?: boolean,
  ) => void;
  updatePointerRay: (event: PointerEvent) => void;
  getKickables: () => readonly Kickable[];
  getHeldKickable: () => Kickable | null;
  getPlayerPosition: () => Readonly<THREE.Vector3>;
  getPlayerMovement: () => Readonly<THREE.Vector3>;
  setPlayerHorizontalPosition: (x: number, z: number) => void;
  offsetPlayerHorizontalPosition: (x: number, z: number) => void;
  launchPlayer: (minimumHeight: number, minimumVelocity: number) => void;
  getPlayerPeakHeight: () => number;
  isNoclipEnabled: () => boolean;
  getQuality: () => QualityTier;
  getElapsed: () => number;
  isReducedMotion: () => boolean;
  hasAchievement: (title: string) => boolean;
  onStatus: (message: string, options?: WorldStatusOptions) => void;
  syncPointerCursor: (idleCursor?: "" | "grab") => void;
}

const up = new THREE.Vector3(0, 1, 0);
const atlasX = -2;
const atlasZ = -1.1;
const atlasBarrierRadius = 2.08;
const orbitOuterRadius = 13.1;
const ascensionHeight = 5.55;
const gravityLockDuration = 10;
const gravityLockMotionScale = 0.045;
const gravityLockImpulseScale = 0.12;
const groundProjectionRenderOrder = -10;
const atlasRestColor = new THREE.Color(0x081521);
const atlasRestEmissive = new THREE.Color(0x0b3040);
const atlasSilverColor = new THREE.Color(0xb9c7cd);
const atlasSilverEmissive = new THREE.Color(0x8ab9c6);
const atlasSilverOrbitColor = new THREE.Color(0xe0eaed);
const atlasSilverLightColor = new THREE.Color(0xf2fdff);

export class ArchiveOrbitPlayground {
  private root: THREE.Group | null = null;
  private atlas: ArchiveAtlasState | null = null;
  private footprints: THREE.InstancedMesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  > | null = null;
  private readonly planets: OrbitingPlanet[] = [];
  private readonly asteroids: Kickable[] = [];
  private readonly holds = new Map<number, OrbitTelekinesisHold>();
  private readonly heldPlanets = new Set<OrbitingPlanet>();
  private readonly footprintDummy = new THREE.Object3D();
  private readonly footprintColor = new THREE.Color();
  private readonly footprintRestColor: THREE.Color;
  private readonly footprintLockColor = new THREE.Color(0xffefb2);
  private readonly atlasRestOrbitColor: THREE.Color;
  private readonly atlasRestLightColor: THREE.Color;
  private readonly tempWorld = new THREE.Vector3();
  private readonly tempRelative = new THREE.Vector2();
  private readonly tempRelativeB = new THREE.Vector2();
  private orbitDisturbed = false;
  private orbitRestoreDwell = 0;
  private telekinesisAnnounced = false;
  private pinballAnnounced = false;
  private ascensionComplete: boolean;

  constructor(private readonly host: ArchiveOrbitPlaygroundHost) {
    this.footprintRestColor = new THREE.Color(host.colors.cyan);
    this.atlasRestOrbitColor = new THREE.Color(host.colors.brass);
    this.atlasRestLightColor = new THREE.Color(host.colors.cyan);
    this.ascensionComplete = host.hasAchievement("TO THE MOON");
  }

  mount(parent: THREE.Group): void {
    if (this.root) {
      throw new Error("The Archive orbit playground is already mounted.");
    }
    this.root = parent;

    const atlas = this.createStarAtlas(parent);
    this.host.registerClimbableBox(
      atlas,
      "archive-star-atlas",
      "You balance atop the turning atlas. Its brass orbit circles beneath your boots.",
      undefined,
      false,
    );
    this.host.addInteraction(
      "star-globe",
      "Read the star atlas",
      atlasX,
      atlasZ,
      2.7,
      () => {
        this.host.onStatus(
          this.ascensionComplete
            ? "A cold star burns inside the silver atlas. Its wireframe sky has taken your impossible ascent for a new coordinate."
            : "A dark wireframe sky turns inside the atlas, charting no familiar stars.",
        );
      },
    );

    this.createOrbitingMoon(parent, -8.4, -7.2);
    for (const [
      radius,
      height,
      size,
      material,
      phase,
      speed,
      ringed,
      detail,
    ] of [
      [9.6, 3.4, 0.82, this.host.materials.cyan, 0.2, 0.11, true, 0],
      [7.2, 4.35, 0.58, this.host.materials.violet, 1.45, -0.16, false, 1],
      [11.4, 2.75, 0.74, this.host.materials.amber, 2.7, 0.085, true, 2],
      [5.4, 3.05, 0.46, this.host.materials.green, 4.1, -0.21, false, 3],
      [12.2, 4.7, 0.52, this.host.materials.coral, 5.25, 0.13, false, 4],
    ] as const) {
      this.createRoomPlanet(
        parent,
        radius,
        height,
        size,
        material,
        phase,
        speed,
        ringed,
        detail,
      );
    }
    this.createPlanetFootprints(parent);
  }

  unmount(): void {
    this.cancelPointerDrags();
    this.root = null;
    this.atlas = null;
    this.footprints = null;
    this.planets.length = 0;
    this.asteroids.length = 0;
    this.orbitDisturbed = false;
    this.orbitRestoreDwell = 0;
    this.telekinesisAnnounced = false;
    this.pinballAnnounced = false;
  }

  registerAsteroid(asteroid: Kickable): void {
    if (!this.asteroids.includes(asteroid)) {
      this.asteroids.push(asteroid);
    }
  }

  refreshQuality(): void {
    const quality = this.host.getQuality();
    for (const planet of this.planets) {
      planet.pivot.visible =
        this.heldPlanets.has(planet) ||
        quality === "high" ||
        (quality === "medium" && planet.detail < 4) ||
        planet.detail < 2;
    }
  }

  hasPointerDrag(): boolean {
    return this.holds.size > 0;
  }

  hasActiveMotion(): boolean {
    return (
      this.holds.size > 0 ||
      (this.atlas?.pulseAge ?? 2) < 1.65
    );
  }

  getHeldTarget(): Readonly<THREE.Vector3> | null {
    for (const hold of this.holds.values()) {
      return hold.planet.worldPosition;
    }
    return null;
  }

  isPointingAtPlanet(event: PointerEvent): boolean {
    return this.findPointedPlanet(event) !== null;
  }

  beginPointerDrag(event: PointerEvent): boolean {
    const planet = this.findPointedPlanet(event);
    if (
      !planet ||
      this.holds.has(event.pointerId) ||
      this.heldPlanets.has(planet)
    ) {
      return false;
    }
    planet.planet.getWorldPosition(planet.worldPosition);
    const relativePosition = this.getRelativePosition(
      planet.worldPosition,
      this.tempRelative,
    );
    const currentRadius = THREE.MathUtils.clamp(
      relativePosition.length(),
      this.getMinimumRadius(planet),
      this.getMaximumRadius(planet),
    );
    planet.pivot.rotation.z = 0;
    planet.tiltVelocity = 0;
    planet.pivot.rotation.y = Math.atan2(
      -relativePosition.y,
      relativePosition.x,
    );
    planet.radialOffset = currentRadius - planet.radius;
    planet.radialVelocity = 0;
    planet.planet.position.x = currentRadius;
    planet.planet.getWorldPosition(planet.worldPosition);

    const hold: OrbitTelekinesisHold = {
      planet,
      plane: new THREE.Plane(up, -planet.worldPosition.y),
      point: new THREE.Vector3(),
      previousPoint: planet.worldPosition.clone(),
      velocity: new THREE.Vector3(),
      grabOffset: new THREE.Vector3(),
      previousTime: event.timeStamp,
      moved: false,
    };
    this.host.updatePointerRay(event);
    if (
      this.host.pointerRaycaster.ray.intersectPlane(
        hold.plane,
        hold.point,
      )
    ) {
      hold.grabOffset.set(
        planet.worldPosition.x - hold.point.x,
        0,
        planet.worldPosition.z - hold.point.z,
      );
    }
    this.holds.set(event.pointerId, hold);
    this.heldPlanets.add(planet);
    planet.pivot.visible = true;
    this.host.canvas.setPointerCapture(event.pointerId);
    this.host.canvas.style.cursor = "grabbing";
    event.preventDefault();
    return true;
  }

  updatePointerDrag(event: PointerEvent): boolean {
    const hold = this.holds.get(event.pointerId);
    if (!hold) return false;
    const { planet } = hold;
    this.host.updatePointerRay(event);
    if (
      !this.host.pointerRaycaster.ray.intersectPlane(
        hold.plane,
        hold.point,
      )
    ) {
      return true;
    }

    const rawWorldX = hold.point.x + hold.grabOffset.x;
    const rawWorldZ = hold.point.z + hold.grabOffset.z;
    const rawRelativeX = rawWorldX - atlasX;
    const rawRelativeZ = rawWorldZ - atlasZ;
    const rawRadius = Math.max(
      0.001,
      Math.hypot(rawRelativeX, rawRelativeZ),
    );
    const radius = THREE.MathUtils.clamp(
      rawRadius,
      this.getMinimumRadius(planet),
      this.getMaximumRadius(planet),
    );
    const targetX = atlasX + (rawRelativeX / rawRadius) * radius;
    const targetZ = atlasZ + (rawRelativeZ / rawRadius) * radius;
    const deltaTime = Math.max(
      1 / 120,
      Math.min(0.08, (event.timeStamp - hold.previousTime) / 1000),
    );
    hold.velocity.set(
      (targetX - hold.previousPoint.x) / deltaTime,
      0,
      (targetZ - hold.previousPoint.z) / deltaTime,
    );
    const speed = Math.hypot(hold.velocity.x, hold.velocity.z);
    if (speed > 12) {
      hold.velocity.multiplyScalar(12 / speed);
    }

    const movementSquared =
      (targetX - hold.previousPoint.x) ** 2 +
      (targetZ - hold.previousPoint.z) ** 2;
    if (movementSquared > 0.0004) {
      hold.moved = true;
      this.markDisturbed();
    }
    planet.pivot.rotation.y = Math.atan2(
      -(targetZ - atlasZ),
      targetX - atlasX,
    );
    planet.pivot.rotation.z = 0;
    planet.radialOffset = radius - planet.radius;
    planet.radialVelocity = 0;
    planet.tiltVelocity = 0;
    planet.planet.position.x = radius;
    planet.impact = 1;
    planet.planet.getWorldPosition(planet.worldPosition);
    hold.previousPoint.copy(planet.worldPosition);
    hold.previousTime = event.timeStamp;
    event.preventDefault();
    return true;
  }

  releasePointerDrag(event: PointerEvent): boolean {
    const hold = this.holds.get(event.pointerId);
    if (!hold) return false;
    const { planet } = hold;

    const staleVelocity = event.timeStamp - hold.previousTime > 110;
    if (staleVelocity) hold.velocity.set(0, 0, 0);
    if (hold.moved) {
      planet.planet.getWorldPosition(planet.worldPosition);
      const relativePosition = this.getRelativePosition(
        planet.worldPosition,
        this.tempRelative,
      );
      const radius = Math.max(0.001, relativePosition.length());
      const radialX = relativePosition.x / radius;
      const radialZ = relativePosition.y / radius;
      const tangentX = radialZ;
      const tangentZ = -radialX;
      const radialSpeed =
        hold.velocity.x * radialX + hold.velocity.z * radialZ;
      const tangentialSpeed =
        hold.velocity.x * tangentX + hold.velocity.z * tangentZ;
      const releaseMobility = THREE.MathUtils.lerp(
        1,
        gravityLockImpulseScale,
        planet.rigidity,
      );
      planet.radialVelocity = THREE.MathUtils.clamp(
        radialSpeed * releaseMobility,
        -6.4,
        6.4,
      );
      planet.orbitalBoost = THREE.MathUtils.clamp(
        planet.orbitalBoost +
          (tangentialSpeed /
            Math.max(this.getMinimumRadius(planet), radius)) *
            releaseMobility,
        -2.4,
        2.4,
      );
      planet.tiltVelocity = THREE.MathUtils.clamp(
        tangentialSpeed * 0.035 * releaseMobility,
        -0.72,
        0.72,
      );
      planet.impact = 1;
      planet.collisionCooldown = 0.42;
      this.markDisturbed();
      if (!this.telekinesisAnnounced) {
        this.telekinesisAnnounced = true;
        this.host.onStatus(
          "The released world catches the atlas curve. Its new speed remains entirely your fault.",
        );
      }
    }

    this.holds.delete(event.pointerId);
    this.heldPlanets.delete(planet);
    planet.pivot.visible = this.isVisibleAtQuality(planet);
    if (this.host.canvas.hasPointerCapture(event.pointerId)) {
      this.host.canvas.releasePointerCapture(event.pointerId);
    }
    this.host.syncPointerCursor("grab");
    event.preventDefault();
    return true;
  }

  cancelPointerDrags(): void {
    if (this.holds.size === 0) return;
    const holds = [...this.holds.entries()];
    this.holds.clear();
    this.heldPlanets.clear();
    for (const [pointerId, hold] of holds) {
      hold.planet.pivot.visible = this.isVisibleAtQuality(
        hold.planet,
      );
      if (this.host.canvas.hasPointerCapture(pointerId)) {
        this.host.canvas.releasePointerCapture(pointerId);
      }
    }
    this.host.syncPointerCursor();
  }

  reactToSpell(
    stage: SpellStage,
    charge: number,
    range: number,
  ): string {
    const isThunder = stage === "thunder";
    const isSurge = stage === "surge";
    const playerPosition = this.host.getPlayerPosition();
    const elapsed = this.host.getElapsed();
    this.markDisturbed();
    let gravityLocked = 0;
    let worldsPushed = 0;
    for (const planet of this.planets) {
      if (!planet.pivot.visible) continue;
      planet.planet.getWorldPosition(this.tempWorld);
      const awayX = this.tempWorld.x - playerPosition.x;
      const awayZ = this.tempWorld.z - playerPosition.z;
      const distance = Math.hypot(awayX, awayZ);
      if (distance <= 0.01 || distance > range) continue;

      if (isThunder) {
        const lockDuration =
          gravityLockDuration * (0.42 + charge * 0.58);
        planet.rigidUntil = Math.max(
          planet.rigidUntil,
          elapsed + lockDuration,
        );
        planet.rigidity = Math.max(
          planet.rigidity,
          0.78 + charge * 0.2,
        );
        planet.radialVelocity *= THREE.MathUtils.lerp(
          0.3,
          0.045,
          charge,
        );
        planet.orbitalBoost *= THREE.MathUtils.lerp(
          0.26,
          0.035,
          charge,
        );
        planet.tiltVelocity *= THREE.MathUtils.lerp(
          0.34,
          0.08,
          charge,
        );
        gravityLocked += 1;
        continue;
      }

      planet.rigidUntil = elapsed;
      planet.rigidity = Math.min(planet.rigidity, 0.12);
      const direction = Math.sign(planet.speed) || 1;
      const stageForce = isSurge ? 1.28 : 0.72;
      const chargeForce = 0.68 + charge * 0.78;
      const tiltDirection = planet.detail % 2 === 0 ? 1 : -1;
      this.applyPlanetImpulse(
        planet,
        awayX / distance,
        awayZ / distance,
        (isSurge ? 5.2 : 3.4) * chargeForce,
      );
      planet.orbitalBoost = THREE.MathUtils.clamp(
        planet.orbitalBoost + direction * stageForce * chargeForce,
        -2.4,
        2.4,
      );
      planet.tiltVelocity = THREE.MathUtils.clamp(
        planet.tiltVelocity +
          tiltDirection * (0.16 + stageForce * 0.13) * chargeForce,
        -0.72,
        0.72,
      );
      worldsPushed += 1;
    }

    return isThunder
      ? gravityLocked > 0
        ? `Thunder catches ${gravityLocked} nearby ${
            gravityLocked === 1 ? "world" : "worlds"
          }. Gold contact-rings harden as the orbits slow almost to stillness.`
        : "Thunder rolls into the dark; no nearby world answers its weight."
      : worldsPushed > 0
        ? `${
            isSurge ? "Packet Surge" : "Binary rain"
          } drives ${worldsPushed} nearby ${
            worldsPushed === 1 ? "world" : "worlds"
          } outward into fast new arcs.`
        : `${
            isSurge ? "Packet Surge" : "Binary rain"
          } scatters before reaching an orbit.`;
  }

  reactToWorldCollapse(
    frame: WorldCollapseFrame,
    delta: number,
  ): void {
    for (const [index, planet] of this.planets.entries()) {
      planet.pivot.rotation.y +=
        delta * frame.instability * (1.5 + index * 0.42);
      planet.pivot.rotation.z =
        Math.sin(this.host.getElapsed() * 0.8 + index) *
        frame.instability *
        0.28;
    }
    if (!this.atlas) return;
    this.atlas.light.intensity = Math.max(
      this.atlas.light.intensity,
      frame.instability *
        (2.4 + Math.sin(this.host.getElapsed() * 8) * 0.8),
    );
    this.atlas.orbit.rotation.z +=
      delta * frame.instability * 2.4;
  }

  update(delta: number): void {
    if (!this.root) return;
    const elapsed = this.host.getElapsed();
    const reducedMotion = this.host.isReducedMotion();
    const playerPosition = this.host.getPlayerPosition();
    const playerMovement = this.host.getPlayerMovement();

    for (
      let planetIndex = 0;
      planetIndex < this.planets.length;
      planetIndex += 1
    ) {
      const planet = this.planets[planetIndex];
      if (!planet) continue;
      planet.collisionCooldown = Math.max(
        0,
        planet.collisionCooldown - delta,
      );
      const rigidityTarget = elapsed < planet.rigidUntil ? 1 : 0;
      const rigidityRate = rigidityTarget > planet.rigidity ? 9.5 : 2.2;
      planet.rigidity +=
        (rigidityTarget - planet.rigidity) *
        (1 - Math.exp(-delta * rigidityRate));
      if (rigidityTarget === 0 && planet.rigidity < 0.002) {
        planet.rigidity = 0;
      }
      const held = this.heldPlanets.has(planet);
      if (held) {
        planet.impact = 1;
        planet.collisionCooldown = 0.3;
      } else {
        planet.orbitalBoost *= Math.exp(
          -delta * THREE.MathUtils.lerp(1.08, 4.8, planet.rigidity),
        );
        planet.impact *= Math.exp(-delta * 5.8);

        const radialAcceleration =
          THREE.MathUtils.clamp(
            planet.radialOffset * 2.8,
            -8.5,
            8.5,
          ) *
          (1 - planet.rigidity * 0.92);
        planet.radialVelocity -= radialAcceleration * delta;
        planet.radialVelocity *= Math.exp(
          -delta * THREE.MathUtils.lerp(0.72, 5.4, planet.rigidity),
        );
        planet.radialVelocity = THREE.MathUtils.clamp(
          planet.radialVelocity,
          -6.4,
          6.4,
        );
        planet.radialOffset += planet.radialVelocity * delta;
        const minimumOffset =
          this.getMinimumRadius(planet) - planet.radius;
        const maximumOffset =
          this.getMaximumRadius(planet) - planet.radius;
        if (planet.radialOffset < minimumOffset) {
          planet.radialOffset = minimumOffset;
          planet.radialVelocity =
            Math.abs(planet.radialVelocity) *
            THREE.MathUtils.lerp(0.58, 0.08, planet.rigidity);
        } else if (planet.radialOffset > maximumOffset) {
          planet.radialOffset = maximumOffset;
          planet.radialVelocity =
            -Math.abs(planet.radialVelocity) *
            THREE.MathUtils.lerp(0.58, 0.08, planet.rigidity);
        }
        planet.planet.position.x = planet.radius + planet.radialOffset;

        const orbitalSpeed = planet.speed + planet.orbitalBoost;
        const motionScale =
          (reducedMotion ? 0.24 : 1) *
          THREE.MathUtils.lerp(
            1,
            gravityLockMotionScale,
            planet.rigidity,
          );
        planet.pivot.rotation.y += orbitalSpeed * delta * motionScale;
        planet.planet.rotation.y +=
          orbitalSpeed * delta * 2.4 * motionScale;
        planet.planet.rotation.x +=
          orbitalSpeed * delta * 0.35 * motionScale;
        planet.tiltVelocity -= planet.pivot.rotation.z * 4.2 * delta;
        planet.tiltVelocity *= Math.exp(
          -delta * THREE.MathUtils.lerp(1.45, 5.2, planet.rigidity),
        );
        planet.pivot.rotation.z += planet.tiltVelocity * delta;
      }

      const impactScale = planet.impact * (reducedMotion ? 0.045 : 0.12);
      planet.planet.scale.set(
        1 + impactScale,
        1 - impactScale * 0.62,
        1 + impactScale,
      );
      planet.bodyMaterial.emissiveIntensity =
        0.7 + planet.impact * 1.45 + planet.rigidity * 0.72;

      planet.planet.getWorldPosition(planet.worldPosition);
      this.updatePlanetFootprint(planet, planetIndex);
      if (!planet.pivot.visible) {
        planet.playerContact = false;
        continue;
      }
      if (held) {
        planet.playerContact = false;
        continue;
      }

      const playerDx = planet.worldPosition.x - playerPosition.x;
      const playerDz = planet.worldPosition.z - playerPosition.z;
      const playerContactRadius =
        planet.collisionRadius + this.host.playerRadius + 0.12;
      const playerContact =
        playerDx * playerDx + playerDz * playerDz <
        playerContactRadius ** 2;
      const playerMoving = playerMovement.lengthSq() > 0.0001;
      const rigidContact = planet.rigidity >= 0.72;
      const canRebound = rigidContact
        ? planet.collisionCooldown <= 0
        : !planet.playerContact;
      if (rigidContact && playerContact) {
        const contactDistance = Math.max(
          0.001,
          Math.hypot(playerDx, playerDz),
        );
        const movementLength = Math.max(
          0.001,
          Math.hypot(playerMovement.x, playerMovement.z),
        );
        const awayX =
          contactDistance > 0.001
            ? -playerDx / contactDistance
            : -playerMovement.x / movementLength;
        const awayZ =
          contactDistance > 0.001
            ? -playerDz / contactDistance
            : -playerMovement.z / movementLength;
        this.host.setPlayerHorizontalPosition(
          planet.worldPosition.x +
            awayX * (playerContactRadius + 0.025),
          planet.worldPosition.z +
            awayZ * (playerContactRadius + 0.025),
        );
      }
      if (playerMoving && playerContact && canRebound) {
        const movementLength = Math.max(
          0.001,
          Math.hypot(playerMovement.x, playerMovement.z),
        );
        const directionX = playerMovement.x / movementLength;
        const directionZ = playerMovement.z / movementLength;
        const movementSpeed = movementLength / Math.max(delta, 0.001);
        this.applyPlanetImpulse(
          planet,
          directionX,
          directionZ,
          THREE.MathUtils.clamp(movementSpeed * 0.88, 2.8, 6.2),
        );
        if (!rigidContact) {
          const playerRecoil = THREE.MathUtils.lerp(
            0.2,
            0.055,
            planet.rigidity,
          );
          this.host.offsetPlayerHorizontalPosition(
            -directionX * playerRecoil,
            -directionZ * playerRecoil,
          );
        }
        this.host.launchPlayer(
          0.025,
          2.5 + planet.rigidity * 1.12,
        );
        this.announcePinball(
          "Your boot catches the little world. Its neat orbit buckles sideways.",
        );
      }
      planet.playerContact = rigidContact ? false : playerContact;
    }

    if (this.footprints) {
      this.footprints.instanceMatrix.needsUpdate = true;
      if (this.footprints.instanceColor) {
        this.footprints.instanceColor.needsUpdate = true;
      }
    }

    this.resolveAsteroidPlanetCollisions();
    this.resolvePlanetCollisions();
    this.updateOrbitOrder(delta);
    this.updateAtlas(delta);
    this.updateAscensionMilestone();
  }

  forEachDynamicObject(
    visit: (object: THREE.Object3D) => void,
  ): void {
    if (this.atlas?.pulse) visit(this.atlas.pulse);
    for (const planet of this.planets) visit(planet.pivot);
  }

  private createStarAtlas(parent: THREE.Group): THREE.Group {
    const group = new THREE.Group();
    group.name = "archive-star-atlas";
    group.position.set(atlasX, 0, atlasZ);
    const globeMaterial = new THREE.MeshStandardMaterial({
      color: 0x081521,
      emissive: 0x0b3040,
      emissiveIntensity: 0.9,
      roughness: 0.38,
      metalness: 0.25,
      wireframe: true,
    });
    const globe = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.65, 2),
      globeMaterial,
    );
    globe.position.y = 2.2;
    group.add(globe);
    const orbitMaterial = new THREE.MeshStandardMaterial({
      color: this.host.colors.brass,
      emissive: this.host.colors.cyan,
      emissiveIntensity: 0,
      roughness: 0.44,
      metalness: 0.58,
    });
    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(2, 0.08, 5, 32),
      orbitMaterial,
    );
    orbit.position.y = 2.2;
    orbit.rotation.x = 0.6;
    orbit.rotation.y = 0.3;
    group.add(orbit);

    const starShape = new THREE.Shape();
    for (let point = 0; point < 8; point += 1) {
      const radius = point % 2 === 0 ? 0.52 : 0.15;
      const angle = Math.PI / 2 + (point / 8) * Math.PI * 2;
      const pointX = Math.cos(angle) * radius;
      const pointY = Math.sin(angle) * radius;
      if (point === 0) starShape.moveTo(pointX, pointY);
      else starShape.lineTo(pointX, pointY);
    }
    starShape.closePath();
    const starMaterial = new THREE.MeshBasicMaterial({
      color: atlasSilverLightColor,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const star = new THREE.Group();
    star.name = "archive-ascension-star";
    star.position.y = 2.2;
    star.visible = this.ascensionComplete;
    const starFace = new THREE.Mesh(
      new THREE.ShapeGeometry(starShape),
      starMaterial,
    );
    starFace.rotation.x = -Math.PI / 2;
    starFace.renderOrder = 3;
    star.add(starFace);
    group.add(star);

    const base = addCylinder(
      group,
      1.2,
      1.5,
      0.45,
      10,
      [0, 0.22, 0],
      this.host.materials.brass,
    );
    base.castShadow = false;

    const pulse = new THREE.Mesh(
      new THREE.RingGeometry(1.52, 1.68, 32),
      new THREE.MeshBasicMaterial({
        color: this.host.colors.cyan,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    pulse.rotation.x = -Math.PI / 2;
    pulse.position.y = 0.47;
    pulse.visible = false;
    pulse.renderOrder = 4;
    group.add(pulse);

    const light = new THREE.PointLight(
      this.host.colors.cyan,
      0,
      8.5,
      2,
    );
    light.position.y = 2.2;
    light.castShadow = false;
    group.add(light);

    this.host.addAnimatedItem({
      object: globe,
      originY: globe.position.y,
      phase: 0,
      amplitude: 0.04,
      rotationSpeed: 0.16,
    });
    parent.add(group);
    this.atlas = {
      globe,
      orbit,
      star,
      starMaterial,
      pulse,
      light,
      pulseAge: 2,
      ascensionBlend: this.ascensionComplete ? 1 : 0,
    };
    this.updateAtlas(0);
    return group;
  }

  private createOrbitingMoon(
    parent: THREE.Group,
    x: number,
    z: number,
  ): void {
    const moonSystem = new THREE.Group();
    moonSystem.position.set(x, 0, z);
    const moon = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.15, 1),
      this.host.materials.stone,
    );
    moon.position.y = 3;
    moon.scale.set(1, 0.92, 1);
    moon.castShadow = false;
    moonSystem.add(moon);
    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(1.62, 0.045, 5, 28),
      this.host.materials.cyanSoft,
    );
    orbit.position.y = 3;
    orbit.rotation.set(0.72, 0.18, 0.1);
    moonSystem.add(orbit);
    parent.add(moonSystem);
    this.host.addAnimatedItem({
      object: moonSystem,
      originY: moonSystem.position.y,
      phase: 2.8,
      amplitude: 0.12,
      rotationSpeed: 0.08,
    });
  }

  private createRoomPlanet(
    parent: THREE.Group,
    radius: number,
    height: number,
    size: number,
    material: THREE.Material,
    phase: number,
    speed: number,
    ringed: boolean,
    detail: number,
  ): void {
    const pivot = new THREE.Group();
    pivot.position.set(atlasX, 0, atlasZ);
    pivot.rotation.y = phase;
    const planet = new THREE.Group();
    planet.position.set(radius, height, 0);
    const sourceColor =
      material instanceof THREE.MeshBasicMaterial ||
      material instanceof THREE.MeshStandardMaterial
        ? material.color.clone()
        : new THREE.Color(this.host.colors.cyan);
    const geometry = new THREE.DodecahedronGeometry(size, 0);
    const positions = geometry.getAttribute("position");
    const faceColors = new Float32Array(positions.count * 3);
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      const face = Math.floor(vertex / 3);
      const shade = 0.58 + ((face + detail * 2) % 5) * 0.085;
      const faceColor = sourceColor.clone().multiplyScalar(shade);
      faceColors[vertex * 3] = faceColor.r;
      faceColors[vertex * 3 + 1] = faceColor.g;
      faceColors[vertex * 3 + 2] = faceColor.b;
    }
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(faceColors, 3),
    );
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      emissive: sourceColor.clone().multiplyScalar(0.18),
      emissiveIntensity: 0.7,
      flatShading: true,
      roughness: 0.68,
      metalness: 0.08,
    });
    const body = new THREE.Mesh(geometry, bodyMaterial);
    body.scale.set(1, 0.92, 1);
    body.rotation.set(
      phase * 0.11,
      phase * 0.17,
      detail * 0.19,
    );
    body.castShadow = false;
    body.receiveShadow = true;
    planet.add(body);
    if (ringed) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(
          size * 1.42,
          size * 0.075,
          5,
          24,
        ),
        this.host.materials.parchment,
      );
      ring.rotation.set(0.8, 0.15, 0.2);
      ring.castShadow = false;
      planet.add(ring);
    }
    pivot.add(planet);
    parent.add(pivot);
    pivot.visible = this.isDetailVisibleAtQuality(detail);
    this.planets.push({
      pivot,
      planet,
      bodyMaterial,
      speed,
      detail,
      radius,
      collisionRadius: size * (ringed ? 1.34 : 1.04),
      orbitalBoost: 0,
      radialOffset: 0,
      radialVelocity: 0,
      tiltVelocity: 0,
      impact: 0,
      collisionCooldown: 0,
      playerContact: false,
      rigidity: 0,
      rigidUntil: 0,
      worldPosition: new THREE.Vector3(),
    });
  }

  private createPlanetFootprints(parent: THREE.Group): void {
    if (this.planets.length === 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (context) {
      const shadow = context.createRadialGradient(
        64,
        64,
        3,
        64,
        64,
        61,
      );
      shadow.addColorStop(0, "rgba(2, 7, 10, 0.54)");
      shadow.addColorStop(0.64, "rgba(2, 7, 10, 0.34)");
      shadow.addColorStop(0.88, "rgba(2, 7, 10, 0.12)");
      shadow.addColorStop(0.96, "rgba(2, 7, 10, 0)");
      context.fillStyle = shadow;
      context.beginPath();
      context.arc(64, 64, 62, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = "rgba(232, 253, 255, 0.95)";
      context.lineWidth = 2.5;
      context.beginPath();
      context.arc(64, 64, 61, 0, Math.PI * 2);
      context.stroke();

      context.fillStyle = "rgba(238, 254, 255, 0.92)";
      context.beginPath();
      context.arc(64, 64, 3.5, 0, Math.PI * 2);
      context.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      toneMapped: false,
      vertexColors: true,
    });
    const footprints = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(2, 2),
      material,
      this.planets.length,
    );
    footprints.frustumCulled = false;
    footprints.renderOrder = groundProjectionRenderOrder;
    footprints.count = this.planets.length;
    parent.add(footprints);
    this.footprints = footprints;
  }

  private updatePlanetFootprint(
    planet: OrbitingPlanet,
    index: number,
  ): void {
    const footprints = this.footprints;
    if (!footprints) return;

    const contactRadius =
      planet.collisionRadius + this.host.playerRadius + 0.12;
    const visibleScale = planet.pivot.visible
      ? contactRadius
      : 0.0001;
    this.footprintDummy.position.set(
      planet.worldPosition.x,
      0.125,
      planet.worldPosition.z,
    );
    this.footprintDummy.rotation.set(-Math.PI / 2, 0, 0);
    this.footprintDummy.scale.set(
      visibleScale,
      visibleScale,
      visibleScale,
    );
    this.footprintDummy.updateMatrix();
    footprints.setMatrixAt(index, this.footprintDummy.matrix);
    this.footprintColor
      .copy(this.footprintRestColor)
      .lerp(this.footprintLockColor, planet.rigidity);
    footprints.setColorAt(index, this.footprintColor);
  }

  private findPointedPlanet(
    event: PointerEvent,
  ): OrbitingPlanet | null {
    if (!this.root || this.planets.length === 0) return null;
    const candidates = this.planets.filter(
      (planet) => planet.pivot.visible,
    );
    if (candidates.length === 0) return null;
    this.host.updatePointerRay(event);
    const kickableObjects = this.host
      .getKickables()
      .filter((kickable) => kickable.enabled)
      .map((kickable) => kickable.object);
    const hits = this.host.pointerRaycaster.intersectObjects(
      [
        ...candidates.map((planet) => planet.planet),
        ...kickableObjects,
      ],
      true,
    );
    for (const hit of hits) {
      const planet = candidates.find(
        (candidate) =>
          hit.object === candidate.planet ||
          candidate.planet.getObjectById(hit.object.id) !== undefined,
      );
      if (planet) {
        return this.heldPlanets.has(planet) ? null : planet;
      }
      if (
        kickableObjects.some(
          (object) =>
            hit.object === object ||
            object.getObjectById(hit.object.id) !== undefined,
        )
      ) {
        return null;
      }
    }
    return null;
  }

  private getMinimumRadius(planet: OrbitingPlanet): number {
    return atlasBarrierRadius + planet.collisionRadius + 0.08;
  }

  private getMaximumRadius(planet: OrbitingPlanet): number {
    return Math.max(
      this.getMinimumRadius(planet),
      orbitOuterRadius - planet.collisionRadius,
    );
  }

  private getRelativePosition(
    worldPosition: Readonly<THREE.Vector3>,
    target: THREE.Vector2,
  ): THREE.Vector2 {
    return target.set(
      worldPosition.x - atlasX,
      worldPosition.z - atlasZ,
    );
  }

  private applyPlanetImpulse(
    planet: OrbitingPlanet,
    directionX: number,
    directionZ: number,
    strength: number,
  ): void {
    const directionLength = Math.max(
      0.001,
      Math.hypot(directionX, directionZ),
    );
    const normalizedX = directionX / directionLength;
    const normalizedZ = directionZ / directionLength;
    const relativePosition = this.getRelativePosition(
      planet.worldPosition,
      this.tempRelative,
    );
    const radialLength = Math.max(0.001, relativePosition.length());
    const radialX = relativePosition.x / radialLength;
    const radialZ = relativePosition.y / radialLength;
    const tangentX = radialZ;
    const tangentZ = -radialX;
    const radialImpulse =
      normalizedX * radialX + normalizedZ * radialZ;
    const tangentImpulse =
      normalizedX * tangentX + normalizedZ * tangentZ;
    const responsiveStrength =
      strength *
      THREE.MathUtils.lerp(
        1,
        gravityLockImpulseScale,
        planet.rigidity,
      );

    planet.radialVelocity = THREE.MathUtils.clamp(
      planet.radialVelocity +
        radialImpulse * responsiveStrength * 0.82,
      -4.8,
      4.8,
    );
    planet.orbitalBoost = THREE.MathUtils.clamp(
      planet.orbitalBoost +
        tangentImpulse * responsiveStrength * 0.15,
      -2.4,
      2.4,
    );
    const tiltSign = planet.detail % 2 === 0 ? 1 : -1;
    planet.tiltVelocity = THREE.MathUtils.clamp(
      planet.tiltVelocity +
        tangentImpulse * responsiveStrength * 0.055 +
        radialImpulse * responsiveStrength * 0.028 * tiltSign,
      -0.9,
      0.9,
    );
    planet.impact = 1;
    planet.collisionCooldown = Math.max(
      planet.collisionCooldown,
      0.24,
    );
    this.markDisturbed();
  }

  private resolveAsteroidPlanetCollisions(): void {
    const heldKickable = this.host.getHeldKickable();
    for (const asteroid of this.asteroids) {
      if (
        !asteroid.enabled ||
        asteroid === heldKickable ||
        asteroid.velocity.lengthSq() < 0.2
      ) {
        continue;
      }

      for (const planet of this.planets) {
        if (!planet.pivot.visible || planet.collisionCooldown > 0) {
          continue;
        }
        const dx =
          asteroid.object.position.x - planet.worldPosition.x;
        const dz =
          asteroid.object.position.z - planet.worldPosition.z;
        const contact = asteroid.radius + planet.collisionRadius;
        const distanceSquared = dx * dx + dz * dz;
        if (distanceSquared >= contact * contact) continue;

        const distance = Math.max(0.001, Math.sqrt(distanceSquared));
        const normalX = dx / distance;
        const normalZ = dz / distance;
        const incoming =
          asteroid.velocity.x * normalX +
          asteroid.velocity.z * normalZ;
        if (incoming >= -0.08) continue;

        const incomingX = asteroid.velocity.x;
        const incomingZ = asteroid.velocity.z;
        const speed = Math.max(
          0.001,
          Math.hypot(incomingX, incomingZ),
        );
        asteroid.velocity.x -= incoming * normalX * 1.9;
        asteroid.velocity.z -= incoming * normalZ * 1.9;
        asteroid.velocity.multiplyScalar(1.02);
        asteroid.object.position.x =
          planet.worldPosition.x + normalX * (contact + 0.035);
        asteroid.object.position.z =
          planet.worldPosition.z + normalZ * (contact + 0.035);
        asteroid.kickCooldown = Math.max(
          asteroid.kickCooldown,
          0.2,
        );
        this.applyPlanetImpulse(
          planet,
          incomingX / speed,
          incomingZ / speed,
          THREE.MathUtils.clamp(speed * 0.72, 2.4, 6.4),
        );
        planet.collisionCooldown = 0.42;
        this.announcePinball(
          "Stone meets world with a bright, impossible clack. Both paths change.",
        );
      }
    }
  }

  private resolvePlanetCollisions(): void {
    for (
      let leftIndex = 0;
      leftIndex < this.planets.length;
      leftIndex += 1
    ) {
      const left = this.planets[leftIndex];
      if (!left?.pivot.visible || left.collisionCooldown > 0) {
        continue;
      }

      for (
        let rightIndex = leftIndex + 1;
        rightIndex < this.planets.length;
        rightIndex += 1
      ) {
        const right = this.planets[rightIndex];
        if (!right?.pivot.visible || right.collisionCooldown > 0) {
          continue;
        }
        const collisionChainActive =
          Math.abs(left.radialOffset) > 0.08 ||
          Math.abs(left.radialVelocity) > 0.18 ||
          Math.abs(left.orbitalBoost) > 0.08 ||
          left.impact > 0.08 ||
          Math.abs(right.radialOffset) > 0.08 ||
          Math.abs(right.radialVelocity) > 0.18 ||
          Math.abs(right.orbitalBoost) > 0.08 ||
          right.impact > 0.08;
        if (!collisionChainActive) continue;
        const dx =
          right.worldPosition.x - left.worldPosition.x;
        const dz =
          right.worldPosition.z - left.worldPosition.z;
        const contact =
          (left.collisionRadius + right.collisionRadius) * 0.92;
        const distanceSquared = dx * dx + dz * dz;
        if (distanceSquared >= contact * contact) continue;

        const distance = Math.max(0.001, Math.sqrt(distanceSquared));
        const normalX = dx / distance;
        const normalZ = dz / distance;
        const leftRelative = this.getRelativePosition(
          left.worldPosition,
          this.tempRelative,
        );
        const rightRelative = this.getRelativePosition(
          right.worldPosition,
          this.tempRelativeB,
        );
        const leftRadius = Math.max(0.001, leftRelative.length());
        const rightRadius = Math.max(
          0.001,
          rightRelative.length(),
        );
        const leftTangentX = leftRelative.y / leftRadius;
        const leftTangentZ = -leftRelative.x / leftRadius;
        const rightTangentX = rightRelative.y / rightRadius;
        const rightTangentZ = -rightRelative.x / rightRadius;
        const baseMotionScale = this.host.isReducedMotion()
          ? 0.24
          : 1;
        const leftMotionScale =
          baseMotionScale *
          THREE.MathUtils.lerp(
            1,
            gravityLockMotionScale,
            left.rigidity,
          );
        const rightMotionScale =
          baseMotionScale *
          THREE.MathUtils.lerp(
            1,
            gravityLockMotionScale,
            right.rigidity,
          );
        const leftVelocityX =
          leftTangentX *
            (left.speed + left.orbitalBoost) *
            leftRadius *
            leftMotionScale +
          (leftRelative.x / leftRadius) * left.radialVelocity;
        const leftVelocityZ =
          leftTangentZ *
            (left.speed + left.orbitalBoost) *
            leftRadius *
            leftMotionScale +
          (leftRelative.y / leftRadius) * left.radialVelocity;
        const rightVelocityX =
          rightTangentX *
            (right.speed + right.orbitalBoost) *
            rightRadius *
            rightMotionScale +
          (rightRelative.x / rightRadius) *
            right.radialVelocity;
        const rightVelocityZ =
          rightTangentZ *
            (right.speed + right.orbitalBoost) *
            rightRadius *
            rightMotionScale +
          (rightRelative.y / rightRadius) *
            right.radialVelocity;
        const closingSpeed =
          (leftVelocityX - rightVelocityX) * normalX +
          (leftVelocityZ - rightVelocityZ) * normalZ;
        const overlap = contact - distance;
        if (closingSpeed <= 0.04 && overlap < 0.16) continue;

        const impactStrength = THREE.MathUtils.clamp(
          Math.max(1.6, closingSpeed * 0.58),
          1.6,
          5.4,
        );
        this.applyPlanetImpulse(
          left,
          -normalX,
          -normalZ,
          impactStrength,
        );
        this.applyPlanetImpulse(
          right,
          normalX,
          normalZ,
          impactStrength,
        );
        const leftMobility = THREE.MathUtils.lerp(
          1,
          gravityLockImpulseScale,
          left.rigidity,
        );
        const rightMobility = THREE.MathUtils.lerp(
          1,
          gravityLockImpulseScale,
          right.rigidity,
        );
        const totalMobility = Math.max(
          0.001,
          leftMobility + rightMobility,
        );
        const correction =
          overlap *
          0.68 *
          Math.max(leftMobility, rightMobility);
        const leftCorrection =
          correction * (leftMobility / totalMobility);
        const rightCorrection =
          correction * (rightMobility / totalMobility);
        if (leftRadius <= rightRadius) {
          left.radialOffset -= leftCorrection;
          right.radialOffset += rightCorrection;
        } else {
          left.radialOffset += leftCorrection;
          right.radialOffset -= rightCorrection;
        }
        left.collisionCooldown = 0.46;
        right.collisionCooldown = 0.46;
        this.announcePinball(
          "Two wandering worlds meet. Their paths trade momentum.",
        );
      }
    }
  }

  private announcePinball(message: string): void {
    if (this.pinballAnnounced) return;
    this.pinballAnnounced = true;
    this.host.onStatus(message);
  }

  private markDisturbed(): void {
    this.orbitDisturbed = true;
    this.orbitRestoreDwell = 0;
    const atlas = this.atlas;
    if (!atlas || atlas.pulseAge >= 1.65) return;
    atlas.pulseAge = 1.65;
    atlas.globe.material.emissiveIntensity = 0.9;
    atlas.orbit.material.emissiveIntensity = 0;
    atlas.light.intensity = 0;
    atlas.pulse.visible = false;
  }

  private updateOrbitOrder(delta: number): void {
    if (
      !this.atlas ||
      !this.orbitDisturbed ||
      this.holds.size > 0
    ) {
      this.orbitRestoreDwell = 0;
      return;
    }
    const ordered = this.planets.every(
      (planet) =>
        Math.abs(planet.radialOffset) < 0.065 &&
        Math.abs(planet.radialVelocity) < 0.14 &&
        Math.abs(planet.orbitalBoost) < 0.035 &&
        Math.abs(planet.tiltVelocity) < 0.045 &&
        Math.abs(planet.pivot.rotation.z) < 0.045,
    );
    this.orbitRestoreDwell = ordered
      ? this.orbitRestoreDwell + delta
      : 0;
    if (this.orbitRestoreDwell < 0.82) return;

    this.orbitDisturbed = false;
    this.orbitRestoreDwell = 0;
    this.atlas.pulseAge = 0;
    this.atlas.pulse.material.color.setHex(
      this.host.colors.cyan,
    );
    this.atlas.pulse.visible = true;
    this.host.onStatus(
      "The last wandering world finds its old line. The atlas answers in cyan.",
    );
  }

  private updateAscensionMilestone(): void {
    if (
      this.ascensionComplete ||
      this.host.isNoclipEnabled() ||
      this.host.getPlayerPeakHeight() < ascensionHeight
    ) {
      return;
    }
    this.ascensionComplete = true;
    this.activateAscensionAtlas();
    this.host.onStatus(
      "The moving worlds hand you beyond the highest orbit. For one impossible moment, the Archive has a moon of its own.",
      { kind: "achievement", title: "TO THE MOON" },
    );
  }

  private activateAscensionAtlas(): void {
    const atlas = this.atlas;
    if (!atlas) return;
    atlas.pulseAge = 0;
    atlas.pulse.material.color.copy(atlasSilverLightColor);
    atlas.pulse.visible = true;
  }

  private updateAtlas(delta: number): void {
    const atlas = this.atlas;
    if (!atlas) return;
    const reducedMotion = this.host.isReducedMotion();
    const ascensionTarget = this.ascensionComplete ? 1 : 0;
    const ascensionFollow = reducedMotion
      ? 1
      : 1 - Math.exp(-delta * 2.4);
    atlas.ascensionBlend = THREE.MathUtils.lerp(
      atlas.ascensionBlend,
      ascensionTarget,
      ascensionFollow,
    );
    const ascension = THREE.MathUtils.smoothstep(
      atlas.ascensionBlend,
      0,
      1,
    );

    let flare = 0;
    if (atlas.pulseAge < 1.65) {
      atlas.pulseAge += delta;
      const progress = Math.min(1, atlas.pulseAge / 1.65);
      flare = Math.sin(progress * Math.PI);
      atlas.pulse.material.opacity = (1 - progress) * 0.78;
      atlas.pulse.scale.setScalar(
        reducedMotion ? 1.2 : 0.72 + progress * 2.15,
      );
      if (progress >= 1) atlas.pulse.visible = false;
    }

    atlas.globe.material.color.lerpColors(
      atlasRestColor,
      atlasSilverColor,
      ascension,
    );
    atlas.globe.material.emissive.lerpColors(
      atlasRestEmissive,
      atlasSilverEmissive,
      ascension,
    );
    atlas.globe.material.metalness = THREE.MathUtils.lerp(
      0.25,
      0.88,
      ascension,
    );
    atlas.globe.material.roughness = THREE.MathUtils.lerp(
      0.38,
      0.18,
      ascension,
    );
    atlas.globe.material.emissiveIntensity =
      0.9 + ascension * 0.62 + flare * 2.7;
    atlas.orbit.material.color.lerpColors(
      this.atlasRestOrbitColor,
      atlasSilverOrbitColor,
      ascension,
    );
    atlas.orbit.material.emissive.lerpColors(
      this.atlasRestLightColor,
      atlasSilverLightColor,
      ascension,
    );
    atlas.orbit.material.emissiveIntensity =
      ascension * 0.48 + flare * 2.2;
    atlas.star.visible = ascension > 0.005;
    atlas.starMaterial.opacity = ascension * (0.8 + flare * 0.2);
    const starBreath = reducedMotion
      ? 1
      : 1 +
        Math.sin(this.host.getElapsed() * 2.2) *
          0.065 *
          ascension;
    atlas.star.scale.setScalar(
      THREE.MathUtils.lerp(0.3, starBreath, ascension),
    );
    atlas.star.rotation.y +=
      delta * (reducedMotion ? 0.08 : 0.42) * ascension;
    atlas.light.color.lerpColors(
      this.atlasRestLightColor,
      atlasSilverLightColor,
      ascension,
    );
    const persistentLight =
      ascension *
      (this.host.getQuality() === "low" ? 1.35 : 2.35);
    atlas.light.intensity =
      persistentLight +
      flare * (this.host.getQuality() === "low" ? 3.8 : 6.2);
  }

  private isVisibleAtQuality(planet: OrbitingPlanet): boolean {
    return (
      this.heldPlanets.has(planet) ||
      this.isDetailVisibleAtQuality(planet.detail)
    );
  }

  private isDetailVisibleAtQuality(detail: number): boolean {
    const quality = this.host.getQuality();
    return (
      quality === "high" ||
      (quality === "medium" && detail < 4) ||
      detail < 2
    );
  }
}
