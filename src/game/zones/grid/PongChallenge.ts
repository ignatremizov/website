import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import {
  findSweptCircleContactProgress,
  resolveRoguePacketVelocity,
} from "../../PongRoguePacket";
import { addBox, addCylinder } from "../../scenePrimitives";
import type {
  QualityTier,
  SpellStage,
  WorldStatusOptions,
} from "../../../world/WorldContracts";

export interface PongVictoryResolution {
  cleanAchievementUnlocked: boolean;
  thunderReady: boolean;
}

export interface PongRoguePacketLease {
  object: THREE.Object3D;
  velocity: THREE.Vector3;
  radius: number;
  restingY: number;
  capture: () => void;
  sync: (worldVelocity: Readonly<THREE.Vector3>) => void;
  release: (
    worldVelocity: Readonly<THREE.Vector3>,
    reason: "match" | "leave" | "teardown",
  ) => void;
}

export interface PongChallengeHost {
  canvas: HTMLCanvasElement;
  materials: Readonly<{
    amber: THREE.Material;
    amberSoft: THREE.Material;
    black: THREE.Material;
    brass: THREE.Material;
    coral: THREE.Material;
    cyan: THREE.Material;
    parchment: THREE.MeshStandardMaterial;
    tealDark: THREE.Material;
    violet: THREE.Material;
  }>;
  colors: Readonly<{
    amber: number;
    cyan: number;
    violet: number;
  }>;
  pointerRaycaster: THREE.Raycaster;
  addStaticBox: (
    x: number,
    y: number,
    z: number,
    halfWidth: number,
    halfHeight: number,
    halfDepth: number,
  ) => void;
  addInteraction: (
    id: string,
    label: string,
    x: number,
    z: number,
    radius: number,
    action: () => void | Promise<void>,
  ) => void;
  updateInteractionLabel: (id: string, label: string) => void;
  registerPlayerOccluder: (object: THREE.Object3D) => void;
  onStatus: (message: string, options?: WorldStatusOptions) => void;
  onPongChange: (
    active: boolean,
    playerScore: number,
    daemonScore: number,
  ) => void;
  onDaemonSpeech: (message: string) => void;
  onServerRackFlicker: (stage: SpellStage) => void;
  onVictory: (cleanVictory: boolean) => PongVictoryResolution;
  getElapsed: () => number;
  getHighestSpellStage: () => SpellStage;
  getPlayerPosition: () => Readonly<THREE.Vector3>;
  getPlayerGroup: () => THREE.Group;
  getQuality: () => QualityTier;
  getSelectedSpellStage: () => SpellStage;
  isArchivePinballChallengeComplete: () => boolean;
  isCleanPongVictoryComplete: () => boolean;
  isPacketInterferenceUnlocked: () => boolean;
  isPongChallengeComplete: () => boolean;
  isReducedMotion: () => boolean;
  updatePointerRay: (event: PointerEvent) => void;
  cancelOtherPointerDrags: () => void;
  syncPointerCursor: () => void;
}

type PongInterferenceSource = "grab" | "kick" | "spell";
const up = new THREE.Vector3(0, 1, 0);

interface PongReliquaryCagePiece {
  object: THREE.Object3D;
  origin: THREE.Vector3;
  originRotation: THREE.Euler;
  direction: THREE.Vector3;
  spin: THREE.Vector3;
}

interface PongThunderReliquary {
  group: THREE.Group;
  globe: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  orb: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  halo: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  plasmaArcs: THREE.LineSegments<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >;
  plasmaArcPositions: Float32Array;
  plasmaArcSegments: number;
  maximumPlasmaArcCount: number;
  cagePieces: PongReliquaryCagePiece[];
  beam: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  beamPositions: Float32Array;
  transferPulse: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  light: THREE.PointLight;
  releaseAge: number;
  releaseDuration: number;
  releasing: boolean;
  released: boolean;
  surgeAge: number;
  surgeDuration: number;
  surgeStrength: number;
}

interface PongState {
  group: THREE.Group;
  leftPaddle: THREE.Mesh;
  rightPaddle: THREE.Mesh;
  ball: THREE.Mesh;
  displacedBall: THREE.Mesh;
  displacedBallVelocity: THREE.Vector3;
  displacedBallAge: number;
  roguePacket: PongRoguePacketLease | null;
  roguePacketCooldownUntil: number;
  roguePacketUsed: boolean;
  cleanReward: THREE.Mesh;
  activeBorder: THREE.Group;
  activeBorderMaterial: THREE.MeshBasicMaterial;
  thunderReliquary: PongThunderReliquary;
  velocity: THREE.Vector2;
  leftPaddleVelocity: number;
  rightPaddleVelocity: number;
  daemonTarget: number;
  daemonReactionCooldown: number;
  rallyHits: number;
  active: boolean;
  playerScore: number;
  daemonScore: number;
  kickCooldown: number;
  paddleGlitchUntil: number;
  cyanDefeatUntil: number;
  interferenceUsed: boolean;
  intrusionAnnounced: boolean;
  offCourtKickUntil: number;
  offCourtInterferenceSource: "grab" | "kick" | null;
  daemonGrumbleUntil: number;
  daemonLastGrumbleSource: PongInterferenceSource | null;
}

interface PongBallTelekinesisHold {
  pointerId: number;
  grabOffset: THREE.Vector2;
  previousPoint: THREE.Vector2;
  velocity: THREE.Vector2;
  previousTime: number;
  moved: boolean;
}

export class PongChallenge {
  private readonly tempWorld = new THREE.Vector3();
  private readonly tempDirection = new THREE.Vector3();
  private readonly tempQuaternion = new THREE.Quaternion();
  private readonly pongPointerPlane = new THREE.Plane(
    new THREE.Vector3(0, 1, 0),
  );
  private readonly pongPointerPoint = new THREE.Vector3();
  private pong: PongState | null = null;
  private pongPointerId: number | null = null;
  private pongPointerTargetZ = 0;
  private pongPointerGrabOffsetZ = 0;
  private pongBallHold: PongBallTelekinesisHold | null = null;

  constructor(private readonly host: PongChallengeHost) {}

  private get elapsed(): number {
    return this.host.getElapsed();
  }

  private get canvas(): HTMLCanvasElement {
    return this.host.canvas;
  }

  private get reduceMotion(): boolean {
    return this.host.isReducedMotion();
  }

  private get quality(): QualityTier {
    return this.host.getQuality();
  }

  private get playerPosition(): Readonly<THREE.Vector3> {
    return this.host.getPlayerPosition();
  }

  private get spellStage(): SpellStage {
    return this.host.getSelectedSpellStage();
  }

  private get highestSpellStage(): SpellStage {
    return this.host.getHighestSpellStage();
  }

  private get packetInterferenceUnlocked(): boolean {
    return this.host.isPacketInterferenceUnlocked();
  }

  private get pongChallengeComplete(): boolean {
    return this.host.isPongChallengeComplete();
  }

  private get cleanPongVictoryComplete(): boolean {
    return this.host.isCleanPongVictoryComplete();
  }

  private get archivePinballChallengeComplete(): boolean {
    return this.host.isArchivePinballChallengeComplete();
  }

  tryCaptureRoguePacket(
    kickable: PongRoguePacketLease,
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
  ): boolean {
    const pong = this.pong;
    if (
      !pong ||
      pong.roguePacket !== null ||
      this.elapsed < pong.roguePacketCooldownUntil
    ) {
      return false;
    }

    pong.group.worldToLocal(this.tempWorld.set(startX, 0, startZ));
    const localStartX = this.tempWorld.x;
    const localStartZ = this.tempWorld.z;
    pong.group.worldToLocal(this.tempWorld.set(endX, 0, endZ));
    const localEndX = this.tempWorld.x;
    const localEndZ = this.tempWorld.z;
    const contactProgress = findSweptCircleContactProgress(
      { x: localStartX, z: localStartZ },
      { x: localEndX, z: localEndZ },
      pong.ball.position,
      kickable.radius + 0.24,
    );
    if (contactProgress === null) return false;

    pong.group.getWorldQuaternion(this.tempQuaternion).invert();
    this.tempDirection
      .copy(kickable.velocity)
      .applyQuaternion(this.tempQuaternion);
    const inheritedVelocity = resolveRoguePacketVelocity(
      { x: this.tempDirection.x, z: this.tempDirection.z },
      { x: pong.velocity.x, z: pong.velocity.y },
    );
    const inheritedSpeed = Math.hypot(
      inheritedVelocity.x,
      inheritedVelocity.z,
    );

    pong.displacedBall.position.copy(pong.ball.position);
    pong.displacedBall.position.y = 0.46;
    pong.displacedBall.rotation.set(0, 0, 0);
    pong.displacedBall.scale.setScalar(1);
    pong.displacedBall.visible = true;
    pong.displacedBallAge = 0;
    pong.displacedBallVelocity.set(
      inheritedVelocity.x * 0.62,
      3.15 + Math.min(1.25, inheritedSpeed * 0.16),
      inheritedVelocity.z * 0.62 +
        (Math.abs(inheritedVelocity.z) > 0.12
          ? Math.sign(inheritedVelocity.z) * 0.65
          : 0.8),
    );
    const displacedMaterial = pong.displacedBall
      .material as THREE.MeshStandardMaterial;
    displacedMaterial.opacity = 1;

    pong.ball.position.x = THREE.MathUtils.lerp(
      localStartX,
      localEndX,
      contactProgress,
    );
    pong.ball.position.z = THREE.MathUtils.lerp(
      localStartZ,
      localEndZ,
      contactProgress,
    );
    pong.roguePacket = kickable;
    pong.ball.visible = false;
    pong.velocity.set(inheritedVelocity.x, inheritedVelocity.z);
    pong.daemonTarget = pong.ball.position.z;
    pong.daemonReactionCooldown = 0.42;
    pong.interferenceUsed ||= pong.active;
    pong.roguePacketUsed ||= pong.active;
    pong.offCourtKickUntil = 0;
    pong.offCourtInterferenceSource = null;
    pong.intrusionAnnounced = false;
    kickable.capture();
    kickable.object.userData.pongRoguePacket = true;
    this.syncPongRoguePacketVisual(0);
    this.host.onServerRackFlicker(
      this.spellStage === "thunder" ? "thunder" : "surge",
    );
    this.host.onDaemonSpeech(
      "Wrong address. Thou hast struck packet from rail and set a wandering stone in its office. Very well. Let weight contend with prediction.",
    );
    return true;
  }

  private grumblePongInterference(
    source: PongInterferenceSource,
  ): boolean {
    const pong = this.pong;
    if (!pong) return false;
    if (
      this.elapsed < pong.daemonGrumbleUntil &&
      pong.daemonLastGrumbleSource === source
    ) {
      return true;
    }
    pong.daemonGrumbleUntil = this.elapsed + 2.1;
    pong.daemonLastGrumbleSource = source;
    const line =
      !pong.active && source !== "spell"
        ? source === "grab"
          ? "Interference. Thou hast seized the packet between ticks. The rail remembers every trespass."
          : "Interference. Feet are not an approved transport layer. The packet disagrees with the floor."
        : {
            grab:
              "Interference. The cyan hand has seized the packet between ticks. Release what the rail has claimed.",
            kick:
              "Interference. Feet are not an approved transport layer. Return the packet to its rail.",
            spell:
              "Interference. Violet weather has entered my prediction line. I will not call this play.",
          }[source];
    this.host.onDaemonSpeech(line);
    return true;
  }

  kickLooseBall(playerMoving: boolean): void {
    const pong = this.pong;
    if (!pong || pong.active || !playerMoving || pong.kickCooldown > 0) return;
    pong.group.updateWorldMatrix(true, false);
    pong.group.localToWorld(this.tempWorld.copy(pong.ball.position));
    const dx = this.tempWorld.x - this.playerPosition.x;
    const dz = this.tempWorld.z - this.playerPosition.z;
    if (dx * dx + dz * dz > 0.95 * 0.95) return;

    const length = Math.max(0.001, Math.hypot(dx, dz));
    const worldX = dx / length;
    const worldZ = dz / length;
    const angle = pong.group.rotation.y;
    const localX = Math.cos(angle) * worldX - Math.sin(angle) * worldZ;
    const localZ = Math.sin(angle) * worldX + Math.cos(angle) * worldZ;
    pong.velocity.x = THREE.MathUtils.clamp(pong.velocity.x + localX * 3.8, -5.2, 5.2);
    pong.velocity.y = THREE.MathUtils.clamp(pong.velocity.y + localZ * 3.8, -4.5, 4.5);
    pong.kickCooldown = 0.4;
    pong.offCourtKickUntil = this.elapsed + 4.5;
    pong.offCourtInterferenceSource = "kick";
    pong.intrusionAnnounced = false;
    if (!this.grumblePongInterference("kick")) {
      this.host.onStatus(
        pong.velocity.x > 0
          ? "The loose packet skims toward coral territory. The Controller’s paddle twitches."
          : "The loose packet skims back across cyan. The Controller tracks it anyway.",
      );
    }
  }

  mount(
    parent: THREE.Group,
    x: number,
    z: number,
    thunderReliquaryX: number,
    thunderReliquaryZ: number,
  ): void {
    if (this.pong) {
      throw new Error("The Daemon Pong challenge is already mounted.");
    }
    const group = new THREE.Group();
    group.name = "daemon-pong-court";
    group.position.set(x, 0, z);
    group.rotation.y = 0;
    addBox(group, [7.4, 0.18, 5.1], [0, 0.12, 0], this.host.materials.black);
    const activeBorderMaterial = new THREE.MeshBasicMaterial({
      color: this.host.colors.cyan,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const activeBorder = new THREE.Group();
    activeBorder.name = "pong-active-link-border";
    addBox(
      activeBorder,
      [7.34, 0.045, 0.075],
      [0, 0.235, -2.47],
      activeBorderMaterial,
      { castShadow: false, receiveShadow: false },
    );
    addBox(
      activeBorder,
      [7.34, 0.045, 0.075],
      [0, 0.235, 2.47],
      activeBorderMaterial,
      { castShadow: false, receiveShadow: false },
    );
    addBox(
      activeBorder,
      [0.075, 0.045, 4.86],
      [-3.62, 0.235, 0],
      activeBorderMaterial,
      { castShadow: false, receiveShadow: false },
    );
    addBox(
      activeBorder,
      [0.075, 0.045, 4.86],
      [3.62, 0.235, 0],
      activeBorderMaterial,
      { castShadow: false, receiveShadow: false },
    );
    activeBorder.visible = false;
    group.add(activeBorder);
    addBox(group, [0.08, 0.04, 4.4], [0, 0.24, 0], this.host.materials.cyan);
    const leftPaddle = addBox(
      group,
      [0.54, 0.5, 1.64],
      [-2.7, 0.4, 0],
      this.host.materials.tealDark,
    );
    const leftCap = addBox(
      leftPaddle,
      [0.42, 0.09, 1.5],
      [0, 0.285, 0],
      this.host.materials.cyan,
    );
    leftCap.castShadow = false;
    const rightPaddle = addBox(
      group,
      [0.54, 0.5, 1.64],
      [2.7, 0.4, 0],
      this.host.materials.black,
    );
    const rightCap = addBox(
      rightPaddle,
      [0.42, 0.09, 1.5],
      [0, 0.285, 0],
      this.host.materials.coral,
    );
    rightCap.castShadow = false;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), this.host.materials.parchment);
    ball.position.set(0.5, 0.42, 0.3);
    group.add(ball);
    const displacedBallMaterial = this.host.materials.parchment.clone();
    displacedBallMaterial.name = "displaced-pong-packet-material";
    displacedBallMaterial.transparent = true;
    const displacedBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 8, 6),
      displacedBallMaterial,
    );
    displacedBall.name = "displaced-pong-packet";
    displacedBall.visible = false;
    displacedBall.castShadow = false;
    group.add(displacedBall);

    const thunderReliquary = this.createPongThunderReliquary(
      parent,
      this.highestSpellStage === "thunder",
      thunderReliquaryX,
      thunderReliquaryZ,
    );
    const cleanRingGeometry = new THREE.TorusGeometry(0.27, 0.05, 5, 18);
    cleanRingGeometry.rotateX(Math.PI / 2);
    const cleanMarkGeometry = new THREE.OctahedronGeometry(0.17, 0);
    cleanMarkGeometry.translate(0, 0.38, 0);
    const mergedCleanReward = mergeGeometries(
      [cleanRingGeometry, cleanMarkGeometry],
      false,
    );
    cleanRingGeometry.dispose();
    cleanMarkGeometry.dispose();
    const cleanReward = new THREE.Mesh(
      mergedCleanReward ?? new THREE.OctahedronGeometry(0.2, 0),
      this.host.materials.amber,
    );
    cleanReward.name = "clean-route-pong-token";
    cleanReward.position.set(0, 0.43, 0.52);
    cleanReward.visible = this.cleanPongVictoryComplete;
    cleanReward.castShadow = false;
    thunderReliquary.group.add(cleanReward);

    parent.add(group);
    this.pong = {
      group,
      leftPaddle,
      rightPaddle,
      ball,
      displacedBall,
      displacedBallVelocity: new THREE.Vector3(),
      displacedBallAge: 2,
      roguePacket: null,
      roguePacketCooldownUntil: 0,
      roguePacketUsed: false,
      cleanReward,
      activeBorder,
      activeBorderMaterial,
      thunderReliquary,
      velocity: new THREE.Vector2(2.65, 1.35),
      leftPaddleVelocity: 0,
      rightPaddleVelocity: 0,
      daemonTarget: 0,
      daemonReactionCooldown: 0,
      rallyHits: 0,
      active: false,
      playerScore: 0,
      daemonScore: 0,
      kickCooldown: 0,
      paddleGlitchUntil: 0,
      cyanDefeatUntil: 0,
      interferenceUsed: false,
      intrusionAnnounced: false,
      offCourtKickUntil: 0,
      offCourtInterferenceSource: null,
      daemonGrumbleUntil: 0,
      daemonLastGrumbleSource: null,
    };
    this.host.addStaticBox(
      thunderReliquaryX,
      1.12,
      thunderReliquaryZ,
      0.52,
      1.12,
      0.49,
    );
    this.host.addInteraction(
      "pong",
      this.getIdleInteractionLabel(),
      x,
      z,
      3.2,
      () => this.toggle(),
    );
    this.host.addInteraction(
      "thunder-reliquary",
      this.highestSpellStage === "thunder"
        ? "Inspect the discharged glass engine"
        : "Inspect the caged storm",
      thunderReliquaryX,
      thunderReliquaryZ,
      1.75,
      () => {
        this.host.onStatus(
          this.pong?.thunderReliquary.released
            ? "The globe is cold. A soot-dark path crosses its silver crown where Thunder escaped the glass."
            : "Copper windings climb from a black transformer into a glass globe. Violet filaments test every coral bar from within.",
        );
      },
    );
  }

  private createPongThunderReliquary(
    parent: THREE.Group,
    released: boolean,
    x: number,
    z: number,
  ): PongThunderReliquary {
    const group = new THREE.Group();
    group.name = "caged-thunder-reliquary";
    group.position.set(x, 0.14, z);
    group.rotation.y = Math.atan2(-x, -z);
    parent.add(group);

    const transformerBase = addBox(
      group,
      [0.96, 0.32, 0.84],
      [0, 0.16, 0],
      this.host.materials.black,
    );
    this.host.registerPlayerOccluder(transformerBase);
    addBox(
      group,
      [0.84, 0.08, 0.74],
      [0, 0.36, 0],
      this.host.materials.brass,
      { castShadow: false },
    );
    addBox(
      group,
      [0.58, 0.2, 0.055],
      [0, 0.22, 0.435],
      this.host.materials.brass,
      { castShadow: false },
    );
    addBox(
      group,
      [0.4, 0.075, 0.025],
      [0, 0.24, 0.47],
      released ? this.host.materials.amberSoft : this.host.materials.violet,
      { castShadow: false },
    );

    const copperMaterial = new THREE.MeshStandardMaterial({
      color: 0xc86f32,
      emissive: 0x4e1709,
      emissiveIntensity: 0.52,
      roughness: 0.32,
      metalness: 0.68,
    });
    copperMaterial.name = "thunder-reliquary-copper";
    const silverMaterial = new THREE.MeshStandardMaterial({
      color: 0xbecbd0,
      emissive: 0x21383d,
      emissiveIntensity: released ? 0.12 : 0.32,
      roughness: 0.22,
      metalness: 0.82,
    });
    silverMaterial.name = "thunder-reliquary-silver";

    addCylinder(
      group,
      0.13,
      0.15,
      0.8,
      12,
      [0, 0.79, 0],
      this.host.materials.black,
    );

    const secondaryWindingCount = 12;
    const secondaryWindings = new THREE.InstancedMesh(
      new THREE.TorusGeometry(0.235, 0.018, 5, 18),
      copperMaterial,
      secondaryWindingCount,
    );
    secondaryWindings.name = "thunder-secondary-windings";
    secondaryWindings.castShadow = false;
    const instanceTransform = new THREE.Object3D();
    instanceTransform.rotation.x = Math.PI / 2;
    for (let index = 0; index < secondaryWindingCount; index += 1) {
      instanceTransform.position.set(
        0,
        0.49 + index * 0.056,
        0,
      );
      const breathing = 1 + Math.sin(index * 1.7) * 0.025;
      instanceTransform.scale.set(breathing, breathing, breathing);
      instanceTransform.updateMatrix();
      secondaryWindings.setMatrixAt(index, instanceTransform.matrix);
    }
    secondaryWindings.instanceMatrix.needsUpdate = true;
    group.add(secondaryWindings);

    const primaryCoilCount = 3;
    const primaryCoils = new THREE.InstancedMesh(
      new THREE.TorusGeometry(0.31, 0.028, 5, 20),
      copperMaterial,
      primaryCoilCount,
    );
    primaryCoils.name = "thunder-primary-windings";
    primaryCoils.castShadow = false;
    for (let index = 0; index < primaryCoilCount; index += 1) {
      const scale = 1 + index * 0.2;
      instanceTransform.position.set(0, 0.43 - index * 0.052, 0);
      instanceTransform.scale.set(scale, scale, scale);
      instanceTransform.updateMatrix();
      primaryCoils.setMatrixAt(index, instanceTransform.matrix);
    }
    primaryCoils.instanceMatrix.needsUpdate = true;
    group.add(primaryCoils);

    const topLoad = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.075, 7, 24),
      silverMaterial,
    );
    topLoad.name = "thunder-toroid-crown";
    topLoad.position.y = 1.2;
    topLoad.rotation.x = Math.PI / 2;
    topLoad.castShadow = false;
    group.add(topLoad);
    addCylinder(
      group,
      0.035,
      0.045,
      0.4,
      8,
      [0, 1.43, 0],
      silverMaterial,
      { castShadow: false },
    );

    const globeMaterial = new THREE.MeshStandardMaterial({
      color: 0xa6e9f2,
      emissive: released ? 0x1b282c : 0x30205f,
      emissiveIntensity: released ? 0.1 : 0.42,
      roughness: 0.08,
      metalness: 0,
      transparent: true,
      opacity: released ? 0.075 : 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    globeMaterial.name = "thunder-plasma-globe-glass";
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(0.44, 16, 10),
      globeMaterial,
    );
    globe.name = "thunder-plasma-globe";
    globe.position.y = 1.69;
    globe.castShadow = false;
    globe.renderOrder = 4;
    group.add(globe);

    const orbMaterial = new THREE.MeshStandardMaterial({
      color: 0xd8fbff,
      emissive: released ? 0x301c4c : this.host.colors.violet,
      emissiveIntensity: released ? 0.18 : 3.4,
      roughness: 0.08,
      metalness: 0.2,
    });
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.105, 10, 7),
      orbMaterial,
    );
    orb.name = "contained-thunder-core";
    orb.position.copy(globe.position);
    orb.castShadow = false;
    orb.visible = !released;
    group.add(orb);

    const plasmaArcSegments = 4;
    const maximumPlasmaArcCount = 8;
    const plasmaArcPositions = new Float32Array(
      maximumPlasmaArcCount * plasmaArcSegments * 2 * 3,
    );
    const plasmaArcGeometry = new THREE.BufferGeometry();
    const plasmaArcAttribute = new THREE.BufferAttribute(
      plasmaArcPositions,
      3,
    );
    plasmaArcAttribute.setUsage(THREE.DynamicDrawUsage);
    plasmaArcGeometry.setAttribute("position", plasmaArcAttribute);
    const plasmaArcs = new THREE.LineSegments(
      plasmaArcGeometry,
      new THREE.LineBasicMaterial({
        color: 0xc7b5ff,
        transparent: true,
        opacity: released ? 0 : 0.88,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    plasmaArcs.name = "contained-thunder-filaments";
    plasmaArcs.position.copy(orb.position);
    plasmaArcs.visible = !released;
    plasmaArcs.frustumCulled = false;
    plasmaArcs.renderOrder = 5;
    group.add(plasmaArcs);

    const haloMaterial = new THREE.MeshBasicMaterial({
      color: this.host.colors.violet,
      transparent: true,
      opacity: released ? 0 : 0.56,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.39, 0.014, 5, 24),
      haloMaterial,
    );
    halo.name = "contained-thunder-halo";
    halo.position.copy(orb.position);
    halo.rotation.x = Math.PI / 2;
    halo.visible = !released;
    group.add(halo);

    const cagePieces: PongReliquaryCagePiece[] = [];
    const registerCagePiece = (
      object: THREE.Object3D,
      direction: THREE.Vector3,
      spin: THREE.Vector3,
    ): void => {
      group.add(object);
      object.visible = !released;
      cagePieces.push({
        object,
        origin: object.position.clone(),
        originRotation: object.rotation.clone(),
        direction: direction.normalize(),
        spin,
      });
    };
    for (let index = 0; index < 5; index += 1) {
      const angle = (index / 5) * Math.PI * 2;
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 1.04, 0.055),
        this.host.materials.coral,
      );
      bar.name = "thunder-cage-bar";
      bar.position.set(
        Math.cos(angle) * 0.52,
        1.68,
        Math.sin(angle) * 0.52,
      );
      bar.rotation.y = -angle;
      registerCagePiece(
        bar,
        new THREE.Vector3(Math.cos(angle), 0.46, Math.sin(angle)),
        new THREE.Vector3(
          1.4 + index * 0.17,
          -1.1 + index * 0.31,
          1.7 - index * 0.13,
        ),
      );
    }
    for (const [index, y] of [1.16, 2.2].entries()) {
      const cageRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.52, 0.035, 5, 22),
        this.host.materials.coral,
      );
      cageRing.name = "thunder-cage-ring";
      cageRing.position.y = y;
      cageRing.rotation.x = Math.PI / 2;
      registerCagePiece(
        cageRing,
        new THREE.Vector3(index === 0 ? -0.65 : 0.65, 0.7, index === 0 ? 0.4 : -0.4),
        new THREE.Vector3(2.1, index === 0 ? -1.4 : 1.4, 0.9),
      );
    }

    const beamPointCount = 13;
    const beamPositions = new Float32Array(beamPointCount * 3);
    const beamGeometry = new THREE.BufferGeometry();
    const beamPositionAttribute = new THREE.BufferAttribute(
      beamPositions,
      3,
    );
    beamPositionAttribute.setUsage(THREE.DynamicDrawUsage);
    beamGeometry.setAttribute("position", beamPositionAttribute);
    const beam = new THREE.Line(
      beamGeometry,
      new THREE.LineBasicMaterial({
        color: 0xc8f6ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    beam.name = "thunder-transfer-arc";
    beam.visible = false;
    beam.frustumCulled = false;
    beam.renderOrder = 6;
    group.add(beam);

    const transferPulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0xe8fcff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    transferPulse.name = "thunder-transfer-impact";
    transferPulse.visible = false;
    transferPulse.renderOrder = 6;
    group.add(transferPulse);

    const light = new THREE.PointLight(
      released ? this.host.colors.amber : this.host.colors.violet,
      released ? 0.22 : 1.1,
      5.5,
      2,
    );
    light.position.copy(orb.position);
    group.add(light);

    const reliquary: PongThunderReliquary = {
      group,
      globe,
      orb,
      halo,
      plasmaArcs,
      plasmaArcPositions,
      plasmaArcSegments,
      maximumPlasmaArcCount,
      cagePieces,
      beam,
      beamPositions,
      transferPulse,
      light,
      releaseAge: released ? 2.2 : 0,
      releaseDuration: this.reduceMotion ? 0.8 : 2.2,
      releasing: false,
      released,
      surgeAge: 1,
      surgeDuration: 1,
      surgeStrength: 0,
    };
    this.setPongThunderReliquaryQuality(reliquary);
    if (!released) this.updatePongThunderPlasma(reliquary, 1);
    return reliquary;
  }

  private setPongThunderReliquaryQuality(
    reliquary: PongThunderReliquary,
  ): void {
    const arcCount =
      this.quality === "low"
        ? 4
        : this.quality === "medium"
          ? 6
          : reliquary.maximumPlasmaArcCount;
    reliquary.plasmaArcs.geometry.setDrawRange(
      0,
      arcCount * reliquary.plasmaArcSegments * 2,
    );
  }

  private updatePongThunderPlasma(
    reliquary: PongThunderReliquary,
    intensity: number,
  ): void {
    const arcCount =
      this.quality === "low"
        ? 4
        : this.quality === "medium"
          ? 6
          : reliquary.maximumPlasmaArcCount;
    const time = this.reduceMotion ? 0.73 : this.elapsed;
    const positions = reliquary.plasmaArcPositions;
    const overloadReach =
      1 +
      THREE.MathUtils.clamp(intensity - 1, 0, 1.8) * 0.82;
    const arcRadius = 0.385 * overloadReach;
    let positionIndex = 0;
    for (let arc = 0; arc < arcCount; arc += 1) {
      const azimuth =
        arc * 2.399963 +
        Math.sin(time * 0.72 + arc * 1.31) * 0.28;
      const elevation =
        -0.54 +
        ((arc * 0.381966 + 0.18) % 1) * 1.08 +
        Math.sin(time * 0.53 + arc * 2.17) * 0.08;
      const horizontalRadius = Math.cos(elevation) * arcRadius;
      const endX = Math.cos(azimuth) * horizontalRadius;
      const endY = Math.sin(elevation) * arcRadius;
      const endZ = Math.sin(azimuth) * horizontalRadius;
      for (
        let segment = 0;
        segment < reliquary.plasmaArcSegments;
        segment += 1
      ) {
        for (let endpoint = 0; endpoint < 2; endpoint += 1) {
          const t =
            (segment + endpoint) / reliquary.plasmaArcSegments;
          const envelope = Math.sin(t * Math.PI);
          const flicker =
            (this.reduceMotion ? 0.004 : 0.034) *
            intensity *
            envelope;
          positions[positionIndex] =
            endX * t +
            Math.sin(time * 13.7 + arc * 4.1 + t * 8.3) * flicker;
          positions[positionIndex + 1] =
            endY * t +
            Math.cos(time * 16.1 + arc * 2.9 + t * 7.1) *
              flicker *
              0.82;
          positions[positionIndex + 2] =
            endZ * t +
            Math.sin(time * 18.3 + arc * 3.7 - t * 6.4) *
              flicker *
              0.9;
          positionIndex += 3;
        }
      }
    }
    reliquary.plasmaArcs.geometry.getAttribute("position").needsUpdate = true;
    reliquary.plasmaArcs.material.opacity = THREE.MathUtils.clamp(
      (0.74 +
        (this.reduceMotion ? 0 : Math.sin(this.elapsed * 19.2) * 0.18)) *
        intensity,
      0,
      1,
    );
  }

  triggerThunderReliquarySurge(
    range: number,
    charge: number,
  ): boolean {
    const reliquary = this.pong?.thunderReliquary;
    if (
      !reliquary ||
      reliquary.released ||
      reliquary.releasing
    ) {
      return false;
    }
    reliquary.group.getWorldPosition(this.tempWorld);
    const distance = Math.hypot(
      this.tempWorld.x - this.playerPosition.x,
      this.tempWorld.z - this.playerPosition.z,
    );
    const reactionRange = range + 0.85;
    if (distance > reactionRange) return false;

    const proximity = 1 - THREE.MathUtils.clamp(
      distance / reactionRange,
      0,
      1,
    );
    reliquary.surgeAge = 0;
    reliquary.surgeDuration = this.reduceMotion
      ? 0.72
      : 1.65 + charge * 0.7;
    reliquary.surgeStrength = Math.max(
      reliquary.surgeStrength * 0.7,
      (0.74 + charge * 0.76) * (0.7 + proximity * 0.3),
    );
    return true;
  }

  refreshQuality(): void {
    const reliquary = this.pong?.thunderReliquary;
    if (reliquary) this.setPongThunderReliquaryQuality(reliquary);
  }

  releaseThunderReliquary(): void {
    const reliquary = this.pong?.thunderReliquary;
    if (!reliquary || reliquary.released || reliquary.releasing) return;
    reliquary.releasing = true;
    reliquary.releaseAge = 0;
    reliquary.releaseDuration = this.reduceMotion ? 0.8 : 2.2;
    reliquary.surgeAge = reliquary.surgeDuration;
    reliquary.surgeStrength = 0;
    reliquary.orb.visible = true;
    reliquary.orb.scale.setScalar(1);
    reliquary.orb.material.emissiveIntensity = 3.4;
    reliquary.halo.visible = true;
    reliquary.plasmaArcs.visible = true;
    reliquary.globe.scale.setScalar(1);
    reliquary.globe.material.emissiveIntensity = 0.42;
    reliquary.globe.material.opacity = 0.18;
    for (const piece of reliquary.cagePieces) {
      piece.object.position.copy(piece.origin);
      piece.object.rotation.copy(piece.originRotation);
      piece.object.scale.set(1, 1, 1);
      piece.object.visible = true;
    }
  }

  private updatePongThunderReliquary(delta: number): void {
    const reliquary = this.pong?.thunderReliquary;
    if (!reliquary) return;

    if (!reliquary.releasing) {
      if (!reliquary.released) {
        reliquary.surgeAge = Math.min(
          reliquary.surgeDuration,
          reliquary.surgeAge + delta,
        );
        const surgeProgress = THREE.MathUtils.clamp(
          reliquary.surgeAge / Math.max(0.001, reliquary.surgeDuration),
          0,
          1,
        );
        const surgeAttack = THREE.MathUtils.smoothstep(
          surgeProgress,
          0,
          0.12,
        );
        const surgeDecay =
          1 -
          THREE.MathUtils.smoothstep(
            surgeProgress,
            0.34,
            1,
          );
        const surge = reliquary.surgeStrength * surgeAttack * surgeDecay;
        if (surgeProgress >= 1) reliquary.surgeStrength = 0;

        this.updatePongThunderPlasma(reliquary, 1 + surge * 1.25);
        reliquary.orb.rotation.y += delta * 1.4;
        reliquary.orb.rotation.x += delta * 0.55;
        reliquary.halo.rotation.z += delta * (0.9 + surge * 3.8);
        const pulse = this.reduceMotion
          ? 1
          : 1 + Math.sin(this.elapsed * 5.2) * 0.1;
        reliquary.orb.scale.setScalar(
          1 +
            (this.reduceMotion
              ? 0
              : Math.sin(this.elapsed * 8.7) * 0.08) +
            surge * 0.62,
        );
        reliquary.halo.scale.setScalar(pulse * (1 + surge * 0.82));
        reliquary.halo.material.opacity = THREE.MathUtils.clamp(
          0.56 + surge * 0.3,
          0,
          0.96,
        );
        reliquary.globe.scale.setScalar(1 + surge * 0.11);
        reliquary.globe.material.opacity =
          0.15 +
          (this.reduceMotion ? 0 : Math.sin(this.elapsed * 4.6) * 0.025) +
          surge * 0.12;
        reliquary.globe.material.emissiveIntensity =
          0.42 + surge * 1.15;
        reliquary.orb.material.emissiveIntensity =
          3.4 + surge * 4.2;
        reliquary.light.intensity =
          0.9 +
          (this.reduceMotion ? 0 : Math.sin(this.elapsed * 7.4) * 0.28) +
          surge * 4.8;
        for (
          let index = 0;
          index < reliquary.cagePieces.length;
          index += 1
        ) {
          const piece = reliquary.cagePieces[index];
          if (!piece) continue;
          piece.object.position.copy(piece.origin);
          piece.object.rotation.copy(piece.originRotation);
          piece.object.scale.setScalar(1);
          if (this.reduceMotion || surge <= 0.001) continue;
          const shake = surge * 0.026;
          piece.object.position.x +=
            Math.sin(this.elapsed * 37 + index * 1.9) * shake;
          piece.object.position.y +=
            Math.cos(this.elapsed * 33 + index * 2.3) * shake;
          piece.object.position.z +=
            Math.sin(this.elapsed * 41 + index * 1.4) * shake;
          piece.object.rotation.y +=
            Math.sin(this.elapsed * 29 + index) * shake * 0.8;
        }
      }
      return;
    }

    reliquary.releaseAge += delta;
    const progress = THREE.MathUtils.clamp(
      reliquary.releaseAge / reliquary.releaseDuration,
      0,
      1,
    );
    const breakProgress = THREE.MathUtils.smoothstep(progress, 0.1, 0.62);
    this.updatePongThunderPlasma(
      reliquary,
      1 + Math.sin(progress * Math.PI) * 1.35,
    );
    const shakeStrength = (1 - breakProgress) * 0.035;
    for (let index = 0; index < reliquary.cagePieces.length; index += 1) {
      const piece = reliquary.cagePieces[index];
      if (!piece) continue;
      const travel = breakProgress * (1.45 + (index % 3) * 0.15);
      piece.object.position
        .copy(piece.origin)
        .addScaledVector(piece.direction, travel);
      piece.object.position.x +=
        Math.sin(this.elapsed * 34 + index * 1.7) * shakeStrength;
      piece.object.position.y +=
        Math.cos(this.elapsed * 31 + index * 2.1) * shakeStrength -
        breakProgress * breakProgress * 0.38;
      piece.object.position.z +=
        Math.cos(this.elapsed * 37 + index * 1.3) * shakeStrength;
      piece.object.rotation.set(
        piece.originRotation.x + piece.spin.x * breakProgress,
        piece.originRotation.y + piece.spin.y * breakProgress,
        piece.originRotation.z + piece.spin.z * breakProgress,
      );
      piece.object.scale.setScalar(
        Math.max(0.16, 1 - breakProgress * 0.58),
      );
      piece.object.visible = progress < 0.76;
    }

    reliquary.orb.rotation.y += delta * (3.5 + progress * 7);
    reliquary.orb.rotation.x += delta * (1.4 + progress * 3);
    reliquary.orb.scale.setScalar(1 + Math.sin(progress * Math.PI) * 0.65);
    reliquary.halo.rotation.z += delta * 4.8;
    reliquary.halo.scale.setScalar(1 + breakProgress * 2.8);
    reliquary.halo.material.opacity = Math.max(
      0,
      0.82 - breakProgress * 0.56,
    );
    reliquary.globe.material.opacity =
      0.18 + Math.sin(progress * Math.PI) * 0.16;
    reliquary.light.intensity =
      1.2 + Math.sin(progress * Math.PI) * 5.4;

    const beamActive = progress > 0.24 && progress < 0.9;
    reliquary.beam.visible = beamActive;
    reliquary.transferPulse.visible = beamActive;
    if (beamActive) {
      this.host.getPlayerGroup().getWorldPosition(this.tempWorld);
      this.tempWorld.y += 0.92;
      reliquary.group.worldToLocal(this.tempWorld);
      const endX = this.tempWorld.x;
      const endY = this.tempWorld.y;
      const endZ = this.tempWorld.z;
      const startX = reliquary.orb.position.x;
      const startY = reliquary.orb.position.y;
      const startZ = reliquary.orb.position.z;
      const pointCount = reliquary.beamPositions.length / 3;
      for (let point = 0; point < pointCount; point += 1) {
        const t = point / (pointCount - 1);
        const envelope = Math.sin(t * Math.PI);
        const jitter =
          Math.sin(this.elapsed * 42 + point * 2.47) *
          envelope *
          (this.reduceMotion ? 0.025 : 0.11);
        const offset = point * 3;
        reliquary.beamPositions[offset] =
          THREE.MathUtils.lerp(startX, endX, t) + jitter;
        reliquary.beamPositions[offset + 1] =
          THREE.MathUtils.lerp(startY, endY, t) -
          jitter * 0.35 +
          Math.cos(this.elapsed * 35 + point * 1.81) * envelope * 0.055;
        reliquary.beamPositions[offset + 2] =
          THREE.MathUtils.lerp(startZ, endZ, t) - jitter * 0.72;
      }
      const position = reliquary.beam.geometry.getAttribute("position");
      position.needsUpdate = true;
      reliquary.beam.material.opacity =
        0.62 + Math.sin(this.elapsed * 38) * 0.28;
      reliquary.transferPulse.position.copy(this.tempWorld);
      reliquary.transferPulse.material.opacity =
        0.34 + Math.sin(this.elapsed * 25) * 0.18;
      reliquary.transferPulse.scale.setScalar(
        1.1 + Math.sin(this.elapsed * 18) * 0.32,
      );
    }

    if (progress < 1) return;
    reliquary.releasing = false;
    reliquary.released = true;
    reliquary.orb.visible = false;
    reliquary.halo.visible = false;
    reliquary.plasmaArcs.visible = false;
    reliquary.beam.visible = false;
    reliquary.transferPulse.visible = false;
    reliquary.globe.scale.setScalar(1);
    reliquary.globe.material.opacity = 0.075;
    reliquary.globe.material.emissiveIntensity = 0.1;
    reliquary.orb.material.emissiveIntensity = 0.18;
    reliquary.light.color.setHex(this.host.colors.amber);
    reliquary.light.intensity = 0.22;
    for (const piece of reliquary.cagePieces) piece.object.visible = false;
    this.host.updateInteractionLabel(
      "thunder-reliquary",
      "Inspect the discharged glass engine",
    );
  }

  getIdleInteractionLabel(): string {
    if (this.cleanPongVictoryComplete) {
      return "Replay Pong · DAEMON SLAYER recorded";
    }
    if (this.pongChallengeComplete) return "Replay Pong (victory recorded)";
    return "Accept the Daemon Controller’s challenge";
  }

  toggle(): void {
    if (!this.pong) return;
    this.cancelPointerDrags();
    this.host.cancelOtherPointerDrags();
    this.pong.active = !this.pong.active;
    if (this.pong.active && this.pong.roguePacket) {
      this.pong.interferenceUsed = true;
      this.pong.roguePacketUsed = true;
    }
    this.pong.offCourtKickUntil = 0;
    this.pong.offCourtInterferenceSource = null;
    this.pong.intrusionAnnounced = false;
    this.pong.daemonReactionCooldown = 0;
    this.pong.daemonTarget = 0;
    this.pong.cyanDefeatUntil = 0;
    this.pong.leftPaddle.visible = true;
    this.pong.leftPaddle.scale.set(1, 1, 1);
    if (!this.pong.active) {
      this.pong.paddleGlitchUntil = 0;
      this.pong.rightPaddle.visible = true;
      this.pong.rightPaddle.scale.z = 1;
    }
    this.host.updateInteractionLabel(
      "pong",
      this.pong.active
        ? "Leave the Pong table"
        : this.getIdleInteractionLabel(),
    );
    this.host.onPongChange(
      this.pong.active,
      this.pong.playerScore,
      this.pong.daemonScore,
    );
    if (this.pong.active) {
      this.host.onStatus(
        this.pong.roguePacket
          ? "Cyan paddle linked. First to three. Wrong Address holds the packet rail now; weight has already entered the argument."
          : this.packetInterferenceUnlocked && this.spellStage !== "spark"
            ? "Cyan paddle linked. First to three. A violet hitch now fractures the Controller’s prediction line."
            : "Cyan paddle linked. First to three. Across the table, the Controller moves his coral hand toward the packet’s predicted future.",
      );
    } else {
      this.releaseRoguePacket("leave");
      this.host.onStatus(
        `The Controller releases the table. Score ${this.pong.playerScore}:${this.pong.daemonScore}.`,
      );
    }
  }

  update(delta: number, playerInput: number): void {
    const pong = this.pong;
    if (!pong) return;
    pong.kickCooldown = Math.max(0, pong.kickCooldown - delta);
    this.updatePongThunderReliquary(delta);
    this.updateDisplacedPongPacket(delta);

    const borderFollow = this.reduceMotion ? 1 : 1 - Math.exp(-delta * 9);
    const borderTarget = pong.active
      ? 0.72 + Math.sin(this.elapsed * 4.8) * 0.12
      : 0;
    pong.activeBorderMaterial.opacity = THREE.MathUtils.lerp(
      pong.activeBorderMaterial.opacity,
      borderTarget,
      borderFollow,
    );
    pong.activeBorder.visible =
      pong.active || pong.activeBorderMaterial.opacity > 0.015;

    if (pong.cleanReward.visible) {
      pong.cleanReward.rotation.y += delta * 0.72;
      pong.cleanReward.position.y =
        0.43 + (this.reduceMotion ? 0 : Math.sin(this.elapsed * 2.8) * 0.045);
    }

    const pointerDragging = pong.active && this.pongPointerId !== null;
    const ballHeld = this.pongBallHold !== null;
    const cyanDefeated = this.elapsed < pong.cyanDefeatUntil;
    const leftTarget = pong.active
      ? pointerDragging
        ? this.pongPointerTargetZ
        : pong.leftPaddle.position.z + playerInput * delta * 4.4
      : pong.ball.position.z;
    const daemonGlitched =
      pong.active && this.elapsed < pong.paddleGlitchUntil;
    let rightTarget = pong.ball.position.z;
    if (daemonGlitched) {
      rightTarget =
        pong.ball.position.z + Math.sin(this.elapsed * 14.5) * 1.15;
    } else if (pong.active) {
      pong.daemonReactionCooldown -= delta;
      if (pong.daemonReactionCooldown <= 0) {
        pong.daemonReactionCooldown =
          0.16 + (pong.rallyHits % 3) * 0.025;
        if (pong.velocity.x > 0.05) {
          const travelTime = Math.max(
            0,
            (2.42 - pong.ball.position.x) / pong.velocity.x,
          );
          // Deliberately linear: skilled bank shots can invalidate the clean
          // predictor before its next reaction, while Interference remains easier.
          const predictedZ =
            pong.ball.position.z + pong.velocity.y * travelTime;
          const predictionError =
            Math.sin(
              (pong.rallyHits + 1) * 1.91 +
                pong.playerScore * 2.37 +
                pong.daemonScore * 0.83,
            ) *
            (0.1 + Math.min(0.16, Math.abs(pong.velocity.y) * 0.025));
          pong.daemonTarget = THREE.MathUtils.clamp(
            predictedZ + predictionError,
            -1.65,
            1.65,
          );
        } else {
          pong.daemonTarget = 0;
        }
      }
      rightTarget = pong.daemonTarget;
    } else {
      pong.daemonTarget = pong.ball.position.z;
    }

    const previousLeftZ = pong.leftPaddle.position.z;
    const previousRightZ = pong.rightPaddle.position.z;
    pong.leftPaddle.position.z = cyanDefeated
      ? pong.leftPaddle.position.z
      : pong.active
      ? pointerDragging
        ? this.followPongPaddle(
            pong.leftPaddle.position.z,
            leftTarget,
            8.4,
            delta,
          )
        : THREE.MathUtils.clamp(leftTarget, -1.65, 1.65)
      : this.followPongPaddle(pong.leftPaddle.position.z, leftTarget, 2.35, delta);
    const directFollow = this.reduceMotion ? 1 : 1 - Math.exp(-delta * 18);
    pong.leftPaddle.position.y = THREE.MathUtils.lerp(
      pong.leftPaddle.position.y,
      pointerDragging && !cyanDefeated ? 0.49 : 0.4,
      directFollow,
    );
    const cyanDefeatPhase = THREE.MathUtils.clamp(
      (pong.cyanDefeatUntil - this.elapsed) / 1.15,
      0,
      1,
    );
    const cyanDefeatScale = cyanDefeated
      ? 0.24 + Math.abs(Math.sin(this.elapsed * 23)) * 0.28 * cyanDefeatPhase
      : 1;
    pong.leftPaddle.scale.x = THREE.MathUtils.lerp(
      pong.leftPaddle.scale.x,
      cyanDefeated ? 0.72 : pointerDragging ? 1.12 : 1,
      directFollow,
    );
    pong.leftPaddle.scale.y = THREE.MathUtils.lerp(
      pong.leftPaddle.scale.y,
      cyanDefeated ? 0.78 : pointerDragging ? 1.06 : 1,
      directFollow,
    );
    pong.leftPaddle.scale.z = THREE.MathUtils.lerp(
      pong.leftPaddle.scale.z,
      cyanDefeatScale,
      directFollow,
    );
    pong.leftPaddle.visible =
      !cyanDefeated || Math.sin(this.elapsed * 31) > -0.55;
    pong.rightPaddle.position.z = this.followPongPaddle(
      pong.rightPaddle.position.z,
      rightTarget,
      daemonGlitched ? 0.72 : pong.active ? 2.4 : 2.65,
      delta,
    );
    pong.leftPaddleVelocity = THREE.MathUtils.clamp(
      (pong.leftPaddle.position.z - previousLeftZ) / Math.max(delta, 0.001),
      -4.4,
      4.4,
    );
    pong.rightPaddleVelocity = THREE.MathUtils.clamp(
      (pong.rightPaddle.position.z - previousRightZ) / Math.max(delta, 0.001),
      -3,
      3,
    );
    pong.rightPaddle.visible =
      !daemonGlitched || Math.sin(this.elapsed * 27) > -0.72;
    pong.rightPaddle.scale.z = THREE.MathUtils.lerp(
      pong.rightPaddle.scale.z,
      daemonGlitched ? 0.7 : 1,
      1 - Math.exp(-delta * 12),
    );
    pong.ball.position.y = THREE.MathUtils.lerp(
      pong.ball.position.y,
      ballHeld ? 0.68 : 0.42,
      this.reduceMotion ? 1 : 1 - Math.exp(-delta * 16),
    );
    const heldBallScale = THREE.MathUtils.lerp(
      pong.ball.scale.x,
      ballHeld ? 1.28 : 1,
      this.reduceMotion ? 1 : 1 - Math.exp(-delta * 16),
    );
    pong.ball.scale.setScalar(heldBallScale);
    if (ballHeld) {
      this.syncPongRoguePacketVisual(delta);
      return;
    }

    pong.ball.position.x += pong.velocity.x * delta;
    pong.ball.position.z += pong.velocity.y * delta;
    if (!pong.active) {
      const kickedRecently = this.elapsed < pong.offCourtKickUntil;
      if (
        kickedRecently &&
        pong.ball.position.x > 1.55 &&
        !pong.intrusionAnnounced
      ) {
        pong.intrusionAnnounced = true;
        this.host.onServerRackFlicker(
          this.spellStage === "thunder" ? "thunder" : "surge",
        );
        this.grumblePongInterference(
          pong.offCourtInterferenceSource ?? "kick",
        );
      } else if (!kickedRecently || pong.ball.position.x < 0.45) {
        pong.intrusionAnnounced = false;
      }
    }

    const railLimit = 2.38 - this.getPongPacketRadius();
    if (Math.abs(pong.ball.position.z) > railLimit) {
      pong.ball.position.z = Math.sign(pong.ball.position.z) * railLimit;
      pong.velocity.y *= -1;
      if (pong.active && pong.velocity.x > 0 && !daemonGlitched) {
        // A bank invalidates the daemon's last straight-line intercept. Keeping
        // that stale commitment briefly is the deliberate clean-play opening.
        pong.daemonReactionCooldown = Math.max(
          pong.daemonReactionCooldown,
          0.34,
        );
      }
    }

    this.hitPongPaddle(pong.leftPaddle, -1);
    this.hitPongPaddle(pong.rightPaddle, 1);

    const goalLimit =
      3.55 - Math.max(0, this.getPongPacketRadius() - 0.24);
    if (pong.ball.position.x < -goalLimit) {
      const kickedRecently = this.elapsed < pong.offCourtKickUntil;
      if (pong.active) pong.daemonScore += 1;
      this.resetPongBall(-1);
      if (pong.active) {
        this.host.onPongChange(true, pong.playerScore, pong.daemonScore);
        if (!this.resolvePongMatch()) {
          this.host.onStatus(
            `Pong ${pong.playerScore}:${pong.daemonScore}. The Controller approves.`,
          );
        }
      } else if (kickedRecently) {
        this.host.onStatus(
          "The Controller returns the loose packet through cyan, perfectly unamused.",
        );
      }
    } else if (pong.ball.position.x > goalLimit) {
      const kickedRecently = this.elapsed < pong.offCourtKickUntil;
      if (pong.active) pong.playerScore += 1;
      this.resetPongBall(1);
      this.host.onPongChange(pong.active, pong.playerScore, pong.daemonScore);
      if (pong.active) {
        if (!this.resolvePongMatch()) {
          this.host.onStatus(`Pong ${pong.playerScore}:${pong.daemonScore}. Human signal confirmed.`);
        }
      } else if (kickedRecently) {
        this.host.onServerRackFlicker(
          this.spellStage === "thunder" ? "thunder" : "surge",
        );
      }
    }
    this.syncPongRoguePacketVisual(delta);
  }

  unmount(): void {
    this.releaseRoguePacket("teardown");
    this.cancelPointerDrags();
    this.pong = null;
  }

  isMounted(): boolean {
    return this.pong !== null;
  }

  isActive(): boolean {
    return this.pong?.active ?? false;
  }

  hasPointerDrag(): boolean {
    return this.pongPointerId !== null || this.pongBallHold !== null;
  }

  hasRoguePacket(object?: THREE.Object3D): boolean {
    const rogue = this.pong?.roguePacket;
    return object ? rogue?.object === object : rogue !== null && rogue !== undefined;
  }

  getCourtFocus(target: THREE.Vector3): boolean {
    const group = this.pong?.group;
    if (!group) return false;
    group.getWorldPosition(target);
    target.y = 0.38;
    return true;
  }

  getReachTarget(target: THREE.Vector3): boolean {
    const pong = this.pong;
    if (!pong) return false;
    if (this.pongBallHold) {
      pong.ball.getWorldPosition(target);
      return true;
    }
    if (pong.active && this.pongPointerId !== null) {
      pong.leftPaddle.getWorldPosition(target);
      return true;
    }
    return false;
  }

  isPointingAtBall(event: PointerEvent): boolean {
    return this.isPointingAtPongBall(event);
  }

  isPointingAtPaddle(event: PointerEvent): boolean {
    return this.isPointingAtPongPaddle(event);
  }

  beginBallDrag(event: PointerEvent): boolean {
    return this.beginPongBallTelekinesis(event);
  }

  updateBallDrag(event: PointerEvent): boolean {
    return this.updatePongBallTelekinesis(event);
  }

  releaseBallDrag(event: PointerEvent): boolean {
    return this.releasePongBallTelekinesis(event);
  }

  beginPaddleDrag(event: PointerEvent): boolean {
    return this.beginPongPaddleDrag(event);
  }

  updatePaddleDrag(event: PointerEvent): boolean {
    return this.updatePongPaddleDrag(event);
  }

  releasePaddleDrag(event: PointerEvent): boolean {
    return this.releasePongPaddleDrag(event);
  }

  cancelPointerDrags(): void {
    this.cancelPongPaddleDrag();
    this.cancelPongBallTelekinesis();
  }

  stopForWorldCollapse(): void {
    const pong = this.pong;
    if (!pong?.active) return;
    pong.active = false;
    this.host.onPongChange(
      false,
      pong.playerScore,
      pong.daemonScore,
    );
  }

  reactToWorldCollapse(
    delta: number,
    instability: number,
    progress: number,
  ): void {
    const pong = this.pong;
    if (!pong) return;
    pong.group.rotation.y +=
      delta * instability * (0.8 + progress * 1.3);
    pong.leftPaddle.rotation.x += delta * instability * 2.7;
    pong.rightPaddle.rotation.z -= delta * instability * 3.12;
    pong.ball.rotation.x += delta * instability * 9.6;
    pong.ball.rotation.z -= delta * instability * 6.6;
    this.syncPongRoguePacketVisual(0);
  }

  forEachDynamicObject(
    visit: (object: THREE.Object3D) => void,
  ): void {
    const pong = this.pong;
    if (!pong) return;
    visit(pong.leftPaddle);
    visit(pong.rightPaddle);
    visit(pong.ball);
    visit(pong.displacedBall);
    visit(pong.cleanReward);
    visit(pong.activeBorder);
    visit(pong.thunderReliquary.group);
  }

  private getPongPacketRadius(): number {
    return this.pong?.roguePacket?.radius ?? 0.24;
  }

  private updateDisplacedPongPacket(delta: number): void {
    const pong = this.pong;
    if (!pong?.displacedBall.visible) return;
    pong.displacedBallAge += delta;
    pong.displacedBallVelocity.y -= 8.4 * delta;
    pong.displacedBall.position.addScaledVector(
      pong.displacedBallVelocity,
      delta,
    );
    pong.displacedBall.rotation.x +=
      pong.displacedBallVelocity.z * delta * 2.4;
    pong.displacedBall.rotation.z -=
      pong.displacedBallVelocity.x * delta * 2.4;
    const material = pong.displacedBall
      .material as THREE.MeshStandardMaterial;
    material.opacity =
      1 - THREE.MathUtils.smoothstep(
        pong.displacedBallAge,
        0.45,
        1.05,
      );
    pong.displacedBall.scale.setScalar(
      Math.max(0.05, 1 - THREE.MathUtils.smoothstep(
        pong.displacedBallAge,
        0.62,
        1.08,
      )),
    );
    if (pong.displacedBallAge >= 1.08) {
      pong.displacedBall.visible = false;
      material.opacity = 1;
    }
  }

  private syncPongRoguePacketVisual(delta: number): void {
    const pong = this.pong;
    const rogue = pong?.roguePacket;
    if (!pong || !rogue) return;
    this.tempWorld.copy(pong.ball.position);
    this.tempWorld.y += Math.max(
      0,
      rogue.restingY * 0.82 - 0.21,
    );
    pong.group.localToWorld(this.tempWorld);
    if (rogue.object.parent) {
      rogue.object.parent.worldToLocal(this.tempWorld);
    }
    rogue.object.position.copy(this.tempWorld);
    rogue.object.rotation.x += pong.velocity.y * delta * 0.92;
    rogue.object.rotation.z -= pong.velocity.x * delta * 0.92;
    rogue.object.visible = true;
    pong.group.getWorldQuaternion(this.tempQuaternion);
    this.tempDirection
      .set(pong.velocity.x, 0, pong.velocity.y)
      .applyQuaternion(this.tempQuaternion);
    rogue.sync(this.tempDirection);
  }

  releaseRoguePacket(
    reason: "match" | "leave" | "teardown",
  ): void {
    const pong = this.pong;
    const rogue = pong?.roguePacket;
    if (!pong || !rogue) return;
    this.cancelPongBallTelekinesis();
    this.syncPongRoguePacketVisual(0);
    pong.group.getWorldQuaternion(this.tempQuaternion);
    this.tempDirection
      .set(pong.velocity.x, 0, pong.velocity.y)
      .applyQuaternion(this.tempQuaternion)
      .multiplyScalar(reason === "teardown" ? 1 : 0.78);
    rogue.release(this.tempDirection, reason);
    rogue.object.userData.pongRoguePacket = false;
    pong.roguePacket = null;
    pong.roguePacketCooldownUntil =
      this.elapsed + (reason === "teardown" ? 0 : 0.9);
    pong.ball.visible = true;
    pong.displacedBall.visible = false;
  }

  activateInterference(): boolean {
    const pong = this.pong;
    if (
      !pong?.active ||
      !this.packetInterferenceUnlocked ||
      this.spellStage === "spark"
    ) {
      return false;
    }
    pong.paddleGlitchUntil =
      this.elapsed + (this.spellStage === "thunder" ? 8 : 6.2);
    pong.interferenceUsed = true;
    this.grumblePongInterference("spell");
    return true;
  }

  private resolvePongMatch(): boolean {
    const pong = this.pong;
    if (!pong || (pong.playerScore < 3 && pong.daemonScore < 3)) return false;

    if (pong.daemonScore >= 3) {
      const finalPlayerScore = pong.playerScore;
      const finalDaemonScore = pong.daemonScore;
      this.cancelPongPaddleDrag();
      this.cancelPongBallTelekinesis();
      pong.active = false;
      pong.paddleGlitchUntil = 0;
      pong.cyanDefeatUntil = this.elapsed + 1.15;
      pong.rightPaddle.visible = true;
      pong.rightPaddle.scale.z = 1;
      this.host.updateInteractionLabel(
        "pong",
        this.getIdleInteractionLabel(),
      );
      this.host.onPongChange(
        false,
        finalPlayerScore,
        finalDaemonScore,
      );
      pong.playerScore = 0;
      pong.daemonScore = 0;
      pong.interferenceUsed = false;
      pong.roguePacketUsed = false;
      this.releaseRoguePacket("match");
      this.host.onDaemonSpeech(
        "Three packets to thy failure. I sever the cyan link; let its broken shape cast thee from my table.",
      );
      return true;
    }

    const usedInterference = pong.interferenceUsed;
    const usedRoguePacket = pong.roguePacketUsed;
    const controlledMatch = pong.active;
    const cleanVictory = controlledMatch && !usedInterference;
    const rewards = this.host.onVictory(cleanVictory);
    const { cleanAchievementUnlocked } = rewards;
    this.cancelPongPaddleDrag();
    this.cancelPongBallTelekinesis();
    pong.active = false;
    pong.paddleGlitchUntil = 0;
    pong.cyanDefeatUntil = 0;
    pong.leftPaddle.visible = true;
    pong.leftPaddle.scale.set(1, 1, 1);
    pong.rightPaddle.visible = true;
    pong.rightPaddle.scale.z = 1;
    if (cleanAchievementUnlocked) {
      pong.cleanReward.visible = true;
      this.host.onServerRackFlicker(
        this.spellStage === "thunder" ? "thunder" : "surge",
      );
    }
    this.host.updateInteractionLabel(
      "pong",
      this.getIdleInteractionLabel(),
    );
    this.host.onPongChange(false, pong.playerScore, pong.daemonScore);
    pong.playerScore = 0;
    pong.daemonScore = 0;
    pong.interferenceUsed = false;
    pong.roguePacketUsed = false;
    this.releaseRoguePacket("match");
    const victoryMessage = cleanAchievementUnlocked
      ? "The Controller’s coral hand falls without Packet Interference. The amber seal beneath the glass engine beside him kindles and records the clean victory."
      : cleanVictory
        ? "The Controller concedes another clean match; the amber seal still bears witness."
        : usedInterference
          ? usedRoguePacket
            ? "Wrong Address breaks packet from its rail and batters through the Controller’s prediction. He objects, but the played match and its victory stand."
            : "Violet interference breaks the Controller’s prediction. He objects, but the played match and its victory stand."
          : "The Controller calls the breach unlawful, yet the played match and its victory stand.";
    const progressionMessage = this.highestSpellStage === "thunder"
        ? " The Controller’s mark still burns within Thunder."
        : this.highestSpellStage === "spark"
          ? " He withholds the greater mark: Spark cannot bear it. Return when the spell has deepened into violet Surge."
        : rewards.thunderReady
          ? " Both circuits now answer. An amber summons asks you to speak with the Controller."
        : !this.archivePinballChallengeComplete
          ? " One circuit remains dark somewhere beyond the Grid."
          : " The completed circuits wait upon the Controller’s word.";
    this.host.onStatus(
      `${victoryMessage}${progressionMessage}`,
      {
        kind: "achievement",
        title: cleanVictory ? "DAEMON SLAYER" : "PACKET LOSS",
      },
    );
    return true;
  }

  private followPongPaddle(
    current: number,
    target: number,
    speed: number,
    delta: number,
  ): number {
    const maximumStep = speed * delta;
    return THREE.MathUtils.clamp(
      current + THREE.MathUtils.clamp(target - current, -maximumStep, maximumStep),
      -1.65,
      1.65,
    );
  }

  private hitPongPaddle(paddle: THREE.Mesh, side: -1 | 1): void {
    const pong = this.pong;
    if (!pong) return;
    const ballX = pong.ball.position.x;
    const packetRadius = this.getPongPacketRadius();
    const radiusAllowance = packetRadius - 0.24;
    const inStrikeZone =
      side < 0
        ? ballX <= -2.42 + radiusAllowance &&
          ballX >= -2.92 - radiusAllowance &&
          pong.velocity.x < 0
        : ballX >= 2.42 - radiusAllowance &&
          ballX <= 2.92 + radiusAllowance &&
          pong.velocity.x > 0;
    if (!inStrikeZone) return;
    const offset = pong.ball.position.z - paddle.position.z;
    const strikeLimit =
      side < 0
        ? 1.02 + radiusAllowance
        : this.elapsed < pong.paddleGlitchUntil
          ? 0.5 + radiusAllowance
          : 0.86 + radiusAllowance;
    if (Math.abs(offset) > strikeLimit) return;
    pong.ball.position.x =
      side * (2.42 - radiusAllowance);
    const horizontalSpeed = Math.min(
      5.6,
      Math.abs(pong.velocity.x) * 1.075 + 0.06,
    );
    const normalizedOffset = THREE.MathUtils.clamp(
      offset / strikeLimit,
      -1,
      1,
    );
    const paddleVelocity =
      side < 0 ? pong.leftPaddleVelocity : pong.rightPaddleVelocity;
    pong.velocity.x = -side * horizontalSpeed;
    pong.velocity.y = THREE.MathUtils.clamp(
      pong.velocity.y * 0.4 +
        normalizedOffset * 3.4 +
        paddleVelocity * 0.27,
      -4.8,
      4.8,
    );
    pong.rallyHits += 1;
    if (side < 0 && pong.active && this.elapsed >= pong.paddleGlitchUntil) {
      pong.daemonReactionCooldown = Math.max(
        pong.daemonReactionCooldown,
        0.19,
      );
    }
  }

  private resetPongBall(direction: -1 | 1): void {
    if (!this.pong) return;
    this.pong.ball.position.set(0, 0.42, 0);
    this.syncPongRoguePacketVisual(0);
    this.pong.offCourtKickUntil = 0;
    this.pong.offCourtInterferenceSource = null;
    this.pong.intrusionAnnounced = false;
    this.pong.rallyHits = 0;
    this.pong.daemonReactionCooldown = 0;
    this.pong.daemonTarget = 0;
    this.pong.velocity.set(
      direction * 2.65,
      (this.pong.playerScore + this.pong.daemonScore) % 2 ? 1.3 : -1.3,
    );
  }

  private projectPointerToPongCourt(event: PointerEvent): boolean {
    const pong = this.pong;
    if (!pong) return false;
    pong.leftPaddle.getWorldPosition(this.tempWorld);
    this.pongPointerPlane.set(up, -this.tempWorld.y);
    this.host.updatePointerRay(event);
    if (
      !this.host.pointerRaycaster.ray.intersectPlane(
        this.pongPointerPlane,
        this.pongPointerPoint,
      )
    ) {
      return false;
    }
    pong.group.worldToLocal(this.pongPointerPoint);
    return true;
  }

  private isPointingAtPongBall(event: PointerEvent): boolean {
    const pong = this.pong;
    if (!pong || !this.projectPointerToPongCourt(event)) return false;
    return (
      Math.hypot(
        this.pongPointerPoint.x - pong.ball.position.x,
        this.pongPointerPoint.z - pong.ball.position.z,
      ) <= Math.max(0.48, this.getPongPacketRadius() + 0.2)
    );
  }

  private beginPongBallTelekinesis(event: PointerEvent): boolean {
    const pong = this.pong;
    if (
      !pong ||
      this.pongBallHold !== null ||
      this.pongPointerId === event.pointerId ||
      !this.isPointingAtPongBall(event)
    ) {
      return false;
    }

    this.pongBallHold = {
      pointerId: event.pointerId,
      grabOffset: new THREE.Vector2(
        pong.ball.position.x - this.pongPointerPoint.x,
        pong.ball.position.z - this.pongPointerPoint.z,
      ),
      previousPoint: new THREE.Vector2(
        pong.ball.position.x,
        pong.ball.position.z,
      ),
      velocity: new THREE.Vector2(),
      previousTime: event.timeStamp,
      moved: false,
    };
    pong.velocity.set(0, 0);
    pong.intrusionAnnounced = false;
    if (pong.active) {
      pong.interferenceUsed = true;
      pong.daemonReactionCooldown = 0;
      pong.daemonTarget = pong.ball.position.z;
    } else {
      pong.offCourtKickUntil = this.elapsed + 4.5;
      pong.offCourtInterferenceSource = "grab";
    }
    this.host.onServerRackFlicker(
      this.spellStage === "thunder" ? "thunder" : "surge",
    );
    this.grumblePongInterference("grab");
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = "grabbing";
    event.preventDefault();
    return true;
  }

  private updatePongBallTelekinesis(event: PointerEvent): boolean {
    const hold = this.pongBallHold;
    if (!hold || hold.pointerId !== event.pointerId) return false;
    const pong = this.pong;
    if (!pong || !this.projectPointerToPongCourt(event)) {
      this.cancelPongBallTelekinesis();
      return true;
    }

    const targetX = THREE.MathUtils.clamp(
      this.pongPointerPoint.x + hold.grabOffset.x,
      -3.32,
      3.32,
    );
    const targetZ = THREE.MathUtils.clamp(
      this.pongPointerPoint.z + hold.grabOffset.y,
      -2.08,
      2.08,
    );
    const deltaTime = Math.max(
      1 / 120,
      Math.min(0.08, (event.timeStamp - hold.previousTime) / 1000),
    );
    hold.velocity.set(
      (targetX - hold.previousPoint.x) / deltaTime,
      (targetZ - hold.previousPoint.y) / deltaTime,
    );
    hold.velocity.clampLength(0, 7.4);
    if (
      (targetX - hold.previousPoint.x) ** 2 +
        (targetZ - hold.previousPoint.y) ** 2 >
      0.0004
    ) {
      hold.moved = true;
    }
    pong.ball.position.x = targetX;
    pong.ball.position.z = targetZ;
    pong.velocity.copy(hold.velocity);
    hold.previousPoint.set(targetX, targetZ);
    hold.previousTime = event.timeStamp;
    event.preventDefault();
    return true;
  }

  private releasePongBallTelekinesis(event: PointerEvent): boolean {
    const hold = this.pongBallHold;
    if (!hold || hold.pointerId !== event.pointerId) return false;
    const pong = this.pong;
    if (pong) {
      const staleVelocity = event.timeStamp - hold.previousTime > 110;
      if (staleVelocity) hold.velocity.set(0, 0);
      if (pong.active) {
        if (!hold.moved || hold.velocity.lengthSq() < 1.2 * 1.2) {
          hold.velocity.set(2.65, pong.ball.position.z >= 0 ? -1.05 : 1.05);
        }
        hold.velocity.clampLength(0, 7.4);
        pong.velocity.copy(hold.velocity);
        pong.interferenceUsed = true;
        pong.daemonReactionCooldown = 0;
        pong.daemonTarget = pong.ball.position.z;
      } else {
        pong.velocity.copy(hold.velocity);
        if (pong.velocity.lengthSq() < 0.2 * 0.2) pong.velocity.set(0, 0);
        pong.offCourtKickUntil = this.elapsed + 4.5;
        pong.offCourtInterferenceSource = "grab";
      }
      pong.kickCooldown = 0.35;
      pong.intrusionAnnounced = false;
    }
    this.cancelPongBallTelekinesis();
    event.preventDefault();
    return true;
  }

  private cancelPongBallTelekinesis(): void {
    const hold = this.pongBallHold;
    this.pongBallHold = null;
    if (this.pong) {
      this.pong.ball.position.y = 0.42;
      this.pong.ball.scale.setScalar(1);
    }
    if (
      hold &&
      this.canvas.hasPointerCapture(hold.pointerId)
    ) {
      this.canvas.releasePointerCapture(hold.pointerId);
    }
    this.host.syncPointerCursor();
  }

  private isPointingAtPongPaddle(event: PointerEvent): boolean {
    const pong = this.pong;
    if (!pong?.active || !this.projectPointerToPongCourt(event)) return false;
    return (
      Math.abs(this.pongPointerPoint.x - pong.leftPaddle.position.x) <= 0.72 &&
      Math.abs(this.pongPointerPoint.z - pong.leftPaddle.position.z) <= 1.08
    );
  }

  private beginPongPaddleDrag(event: PointerEvent): boolean {
    const pong = this.pong;
    if (
      !pong?.active ||
      this.pongPointerId !== null ||
      !this.isPointingAtPongPaddle(event)
    ) {
      return false;
    }
    this.pongPointerId = event.pointerId;
    this.pongPointerGrabOffsetZ =
      pong.leftPaddle.position.z - this.pongPointerPoint.z;
    this.pongPointerTargetZ = pong.leftPaddle.position.z;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = "grabbing";
    event.preventDefault();
    return true;
  }

  private updatePongPaddleDrag(event: PointerEvent): boolean {
    if (this.pongPointerId !== event.pointerId) return false;
    const pong = this.pong;
    if (!pong?.active) {
      this.cancelPongPaddleDrag();
      return true;
    }
    if (this.projectPointerToPongCourt(event)) {
      this.pongPointerTargetZ = THREE.MathUtils.clamp(
        this.pongPointerPoint.z + this.pongPointerGrabOffsetZ,
        -1.65,
        1.65,
      );
    }
    event.preventDefault();
    return true;
  }

  private releasePongPaddleDrag(event: PointerEvent): boolean {
    if (this.pongPointerId !== event.pointerId) return false;
    this.cancelPongPaddleDrag();
    event.preventDefault();
    return true;
  }

  private cancelPongPaddleDrag(): void {
    const pointerId = this.pongPointerId;
    this.pongPointerId = null;
    if (
      pointerId !== null &&
      this.canvas.hasPointerCapture(pointerId)
    ) {
      this.canvas.releasePointerCapture(pointerId);
    }
    this.host.syncPointerCursor();
  }
}
