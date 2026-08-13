import * as THREE from "three";
import { addBox } from "../scenePrimitives";
import type {
  MathQualityTier,
  MathSpellStage,
  MightymaticaZoneContext,
} from "./types";

interface NeedleSample {
  index: number;
  x: number;
  z: number;
  y: number;
  targetY: number;
  angle: number;
  tumble: number;
  fallSpeed: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  crosses: boolean;
  settled: boolean;
  cellKey: string | null;
}

interface TapeSegment {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  restingY: number;
  phase: number;
}

const maximumNeedles = 720;
const needleLength = 1.04;
const lineSpacing = 1;
const buttonLocalX = -3.92;
const buttonLocalZ = 2.92;
const buttonSurfaceY = 1.18;
const buttonBaseY = buttonSurfaceY - 0.08;
const buttonPressDuration = 0.34;
const asteroidButtonRadius = 0.43;
const asteroidButtonReleaseRadius = 0.58;
const tableHalfWidth = 2.8;
const tableHalfDepth = 2.25;
const cordonHalfWidth = 3.12;
const cordonHalfDepth = 2.58;
const cordonClearHeight = 0.9;
const needleCellSize = 0.72;
const disturbanceRadius = 1.05;

function createHazardTapeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    drawing.fillStyle = "#f5bd24";
    drawing.fillRect(0, 0, canvas.width, canvas.height);
    drawing.fillStyle = "#16120b";
    for (let x = -48; x < canvas.width + 48; x += 64) {
      drawing.beginPath();
      drawing.moveTo(x, canvas.height);
      drawing.lineTo(x + 30, canvas.height);
      drawing.lineTo(x + 78, 0);
      drawing.lineTo(x + 48, 0);
      drawing.closePath();
      drawing.fill();
    }
    drawing.fillStyle = "rgba(255, 238, 156, 0.34)";
    drawing.fillRect(0, 4, canvas.width, 5);
    drawing.fillStyle = "rgba(58, 36, 4, 0.36)";
    drawing.fillRect(0, canvas.height - 8, canvas.width, 5);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = "buffon-animated-hazard-tape";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(8, 1);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

function createSaggingTapeGeometry(length: number): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(length, 0.2, 8, 1);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const normalized = positions.getX(index) / length + 0.5;
    const sag = Math.sin(normalized * Math.PI) * 0.09;
    positions.setY(index, positions.getY(index) - sag);
  }
  positions.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export class BuffonNeedleExhibit {
  private readonly context: MightymaticaZoneContext;
  private readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly samples: NeedleSample[] = [];
  private readonly displayCanvas = document.createElement("canvas");
  private readonly displayTexture: THREE.CanvasTexture;
  private readonly tapeTexture: THREE.CanvasTexture;
  private readonly tapeSegments: TapeSegment[] = [];
  private readonly tapeCollisionRemovers: Array<() => void> = [];
  private readonly remoteButton: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.MeshStandardMaterial
  >;
  private readonly remoteHitTarget: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly playerWorldPosition = new THREE.Vector3();
  private readonly asteroidPreviousPosition = new THREE.Vector3();
  private readonly movingNeedles = new Set<number>();
  private readonly dirtyNeedles = new Set<number>();
  private readonly settledCells = new Map<string, Set<number>>();
  private readonly spellBlastQueue: number[] = [];
  private randomState = 0x19731117;
  private qualityCap = 480;
  private cap = 480;
  private emitted = 0;
  private settled = 0;
  private crossings = 0;
  private rainActive = false;
  private rainAge = 0;
  private accelerationBoost = 0;
  private emissionCarry = 0;
  private displayAge = 0;
  private displayDirty = true;
  private completionAnnounced = false;
  private tapeAge = 0;
  private tapeDeployment = 0;
  private tapeDeployed = false;
  private buttonPressAge = buttonPressDuration;
  private buttonWeightBlend = 0;
  private interferenceCooldown = 0;
  private playerInsideExperiment = false;
  private interferenceAnchorX = 0;
  private interferenceAnchorZ = 0;
  private sampleContaminated = false;
  private disturbanceEvents = 0;
  private spellBlastCursor = 0;
  private spellBlastStrength = 0;
  private spellBlastOriginX = 0;
  private spellBlastOriginZ = 0;
  private spellBlastStage: Exclude<MathSpellStage, "spark"> | null = null;
  private spellBlastDelay = 0;
  private completionAnnouncementDelay = 0;
  private asteroidPositionKnown = false;
  private asteroidInsideExperiment = false;
  private asteroidInterferenceCooldown = 0;
  private asteroidHoldingButton = false;

  constructor(context: MightymaticaZoneContext) {
    this.context = context;
    this.group.name = "buffon-needle-table";
    this.group.position.set(7.25, 0, 6.1);
    context.root.add(this.group);

    const tabletop = addBox(
      this.group,
      [5.6, 0.52, 4.5],
      [0, 0.42, 0],
      new THREE.MeshStandardMaterial({
        color: 0x17383e,
        emissive: 0x071e24,
        emissiveIntensity: 0.72,
        roughness: 0.68,
        metalness: 0.24,
      }),
    );
    tabletop.castShadow = false;
    const stripeMaterial = new THREE.MeshBasicMaterial({
      color: 0xf3ead4,
      toneMapped: false,
    });
    for (let line = -2; line <= 2; line += 1) {
      const stripe = addBox(
        this.group,
        [0.035, 0.025, 4.05],
        [line, 0.705, 0],
        stripeMaterial,
      );
      stripe.castShadow = false;
    }

    this.tapeTexture = createHazardTapeTexture();
    const remote = this.createCordon();
    this.remoteButton = remote.button;
    this.remoteHitTarget = remote.hitTarget;

    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.038, 0.038, needleLength),
      new THREE.MeshBasicMaterial({
        color: 0xffc25c,
        toneMapped: false,
      }),
      maximumNeedles,
    );
    this.mesh.name = "buffon-progressive-needles";
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);

    this.displayCanvas.width = 768;
    this.displayCanvas.height = 288;
    this.displayTexture = new THREE.CanvasTexture(this.displayCanvas);
    this.displayTexture.name = "buffon-live-estimate";
    this.displayTexture.colorSpace = THREE.SRGBColorSpace;
    this.displayTexture.minFilter = THREE.LinearFilter;
    this.displayTexture.generateMipmaps = false;
    const display = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.displayTexture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    display.name = "buffon-live-scoreboard";
    display.position.set(-1.23, 2.97, -1.4);
    display.scale.set(4.55, 1.7, 1);
    display.renderOrder = 8;
    this.group.add(display);

    context.addStaticBox(
      this.group.position.x,
      0.44,
      this.group.position.z,
      2.8,
      0.55,
      2.25,
      0.7,
    );
    context.addJumpSurface(
      "math-buffon-tabletop",
      this.group.position.x,
      this.group.position.z,
      2.7,
      2.15,
      0.76,
    );
    const buttonWorldX = this.group.position.x + buttonLocalX;
    const buttonWorldZ = this.group.position.z + buttonLocalZ;
    context.addJumpSurface(
      "math-buffon-pressure-button",
      buttonWorldX,
      buttonWorldZ,
      0.29,
      0.29,
      buttonSurfaceY,
      undefined,
      () => this.startOrAccelerate(),
    );
    context.addInteraction({
      id: "math-buffon",
      label: "Press the red needle-rain button",
      x: buttonWorldX,
      z: buttonWorldZ,
      radius: 1.8,
      action: () => this.startOrAccelerate(),
    });
    context.registerPointerAction(
      this.remoteHitTarget,
      () => this.startOrAccelerate(),
      8.5,
    );
    this.setQuality(context.quality);
    this.renderDisplay();
  }

  private createCordon(): {
    button: THREE.Mesh<
      THREE.CylinderGeometry,
      THREE.MeshStandardMaterial
    >;
    hitTarget: THREE.Mesh<
      THREE.CylinderGeometry,
      THREE.MeshBasicMaterial
    >;
  } {
    const tapeMaterial = new THREE.MeshBasicMaterial({
      map: this.tapeTexture,
      transparent: true,
      opacity: 0.98,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const segmentConfigs = [
      {
        length: cordonHalfWidth * 2,
        x: 0,
        z: -cordonHalfDepth,
        rotationY: 0,
        phase: 0,
      },
      {
        length: cordonHalfWidth * 2,
        x: 0,
        z: cordonHalfDepth,
        rotationY: Math.PI,
        phase: 1.3,
      },
      {
        length: cordonHalfDepth * 2,
        x: -cordonHalfWidth,
        z: 0,
        rotationY: Math.PI / 2,
        phase: 2.6,
      },
      {
        length: cordonHalfDepth * 2,
        x: cordonHalfWidth,
        z: 0,
        rotationY: -Math.PI / 2,
        phase: 3.9,
      },
    ] as const;
    for (const config of segmentConfigs) {
      const tape = new THREE.Mesh(
        createSaggingTapeGeometry(config.length),
        tapeMaterial,
      );
      tape.name = "buffon-jumpable-hazard-tape";
      tape.position.set(config.x, 1.02, config.z);
      tape.rotation.y = config.rotationY;
      tape.renderOrder = 4;
      tape.visible = false;
      tape.scale.y = 0.04;
      this.group.add(tape);
      this.tapeSegments.push({
        mesh: tape,
        restingY: tape.position.y,
        phase: config.phase,
      });
    }

    const postGeometry = new THREE.CylinderGeometry(0.105, 0.14, 1.18, 8);
    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0x191b1a,
      emissive: 0x2c2104,
      emissiveIntensity: 0.34,
      roughness: 0.58,
      metalness: 0.58,
    });
    const capGeometry = new THREE.CylinderGeometry(0.17, 0.17, 0.08, 8);
    const capMaterial = new THREE.MeshBasicMaterial({
      color: 0xf4bd27,
      toneMapped: false,
    });
    for (const x of [-cordonHalfWidth, cordonHalfWidth]) {
      for (const z of [-cordonHalfDepth, cordonHalfDepth]) {
        const post = new THREE.Mesh(postGeometry, postMaterial);
        post.position.set(x, 0.59, z);
        post.castShadow = false;
        post.receiveShadow = true;
        this.group.add(post);
        const cap = new THREE.Mesh(capGeometry, capMaterial);
        cap.position.set(x, 1.2, z);
        cap.castShadow = false;
        this.group.add(cap);
      }
    }

    const remotePost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.22, 0.9, 8),
      postMaterial,
    );
    remotePost.position.set(buttonLocalX, 0.45, buttonLocalZ);
    remotePost.castShadow = false;
    remotePost.receiveShadow = true;
    this.group.add(remotePost);
    const remotePlate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.46, 0.14, 10),
      new THREE.MeshStandardMaterial({
        color: 0x29241a,
        emissive: 0x372404,
        emissiveIntensity: 0.42,
        roughness: 0.52,
        metalness: 0.48,
      }),
    );
    remotePlate.position.set(buttonLocalX, 0.94, buttonLocalZ);
    remotePlate.castShadow = false;
    this.group.add(remotePlate);
    const button = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.29, 0.16, 14),
      new THREE.MeshStandardMaterial({
        color: 0xe93d35,
        emissive: 0x8f0905,
        emissiveIntensity: 1.1,
        roughness: 0.3,
        metalness: 0.24,
      }),
    );
    button.name = "buffon-remote-red-start-button";
    button.position.set(buttonLocalX, buttonBaseY, buttonLocalZ);
    button.castShadow = false;
    this.group.add(button);

    const hitMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    hitMaterial.colorWrite = false;
    const hitTarget = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.52, 0.5, 12),
      hitMaterial,
    );
    hitTarget.name = "buffon-remote-button-pointer-target";
    hitTarget.position.set(buttonLocalX, buttonBaseY, buttonLocalZ);
    this.group.add(hitTarget);

    this.context.addStaticBox(
      this.group.position.x + buttonLocalX,
      0.55,
      this.group.position.z + buttonLocalZ,
      0.35,
      0.55,
      0.35,
      buttonSurfaceY,
    );
    return { button, hitTarget };
  }

  update(delta: number): void {
    this.updateCordon(delta);
    this.completionAnnouncementDelay = Math.max(
      0,
      this.completionAnnouncementDelay - delta,
    );

    if (this.rainActive && this.emitted < this.cap) {
      this.rainAge += delta;
      const ramp = THREE.MathUtils.smoothstep(
        this.rainAge + this.accelerationBoost,
        0,
        12,
      );
      const emissionRate = THREE.MathUtils.lerp(6, 96, ramp);
      this.emissionCarry += emissionRate * delta;
      const spawnCount = Math.min(
        this.cap - this.emitted,
        Math.floor(this.emissionCarry),
        12,
      );
      if (spawnCount > 0) {
        this.emissionCarry -= spawnCount;
        for (let index = 0; index < spawnCount; index += 1) this.spawnNeedle();
      }
      if (this.emitted >= this.cap) this.rainActive = false;
    }

    this.updateSpellBlast(delta);
    this.updatePlayerInterference(delta);
    this.updateAsteroidInterference(delta);

    for (const index of this.movingNeedles) {
      const sample = this.samples[index];
      if (!sample || sample.settled) continue;
      if (this.context.reducedMotion) {
        this.settleNeedle(sample);
      } else {
        const nextX = sample.x + sample.velocityX * delta;
        const nextZ = sample.z + sample.velocityZ * delta;
        sample.x = THREE.MathUtils.clamp(nextX, -2.42, 2.42);
        sample.z = THREE.MathUtils.clamp(nextZ, -1.86, 1.86);
        if (sample.x !== nextX) sample.velocityX *= -0.34;
        if (sample.z !== nextZ) sample.velocityZ *= -0.34;
        const drag = Math.exp(-delta * 2.4);
        sample.velocityX *= drag;
        sample.velocityZ *= drag;
        if (Math.abs(sample.velocityY) > 0.0001) {
          sample.y += sample.velocityY * delta;
          sample.velocityY -= 7.2 * delta;
        } else {
          sample.y -= sample.fallSpeed * delta;
        }
        sample.y = Math.max(sample.targetY, sample.y);
        sample.tumble += delta * (2.6 + sample.fallSpeed * 0.38);
        if (sample.y <= sample.targetY + 0.0001) this.settleNeedle(sample);
      }
      this.dirtyNeedles.add(index);
    }

    this.flushNeedleMatrices();

    if (this.displayDirty) {
      this.displayAge += delta;
      if (this.displayAge >= 0.08) this.renderDisplay();
    }

    if (
      !this.completionAnnounced &&
      this.emitted >= this.cap &&
      this.settled >= this.emitted &&
      this.completionAnnouncementDelay <= 0
    ) {
      this.completionAnnounced = true;
      const estimate = this.estimatePi();
      this.context.updateInteractionLabel(
        "math-buffon",
        this.sampleContaminated
          ? `Reset contaminated sample · ${this.disturbanceEvents} breaches`
          : `Replay needle rain · π ≈ ${this.formatEstimate(estimate, 3)}`,
      );
      if (this.sampleContaminated) {
        this.context.onStatus(
          `The last displaced needle settles at π ≈ ${this.formatEstimate(estimate, 4)}. The display preserves the number, then stamps the ${this.disturbanceEvents}-breach sample INVALID.`,
        );
      } else {
        this.context.onStatus(
          `${this.settled} needles have settled; ${this.crossings} cross a ruled line. Buffon’s estimate rests at π ≈ ${this.formatEstimate(estimate, 4)}.`,
          { kind: "achievement", title: "NEEDLE DROP" },
        );
      }
    }
  }

  private updateCordon(delta: number): void {
    this.buttonPressAge = Math.min(
      buttonPressDuration,
      this.buttonPressAge + delta,
    );
    const buttonProgress = this.context.reducedMotion
      ? 1
      : this.buttonPressAge / buttonPressDuration;
    const weightFollow = this.context.reducedMotion
      ? 1
      : 1 - Math.exp(-delta * 18);
    this.buttonWeightBlend = THREE.MathUtils.lerp(
      this.buttonWeightBlend,
      this.asteroidHoldingButton ? 1 : 0,
      weightFollow,
    );
    if (Math.abs(this.buttonWeightBlend) < 0.002) {
      this.buttonWeightBlend = 0;
    } else if (Math.abs(this.buttonWeightBlend - 1) < 0.002) {
      this.buttonWeightBlend = 1;
    }
    const transientPress =
      buttonProgress < 1 ? Math.sin(buttonProgress * Math.PI) : 0;
    const press = Math.max(transientPress, this.buttonWeightBlend);
    this.remoteButton.position.y = buttonBaseY - press * 0.095;
    this.remoteButton.material.emissiveIntensity = 1.1 + press * 2.8;

    const experimentActive =
      this.rainActive || (this.emitted > 0 && this.settled < this.emitted);
    const deploymentFollow = this.context.reducedMotion
      ? 1
      : 1 - Math.exp(-delta * 11);
    this.tapeDeployment = THREE.MathUtils.lerp(
      this.tapeDeployment,
      this.tapeDeployed ? 1 : 0,
      deploymentFollow,
    );
    if (
      Math.abs(this.tapeDeployment - (this.tapeDeployed ? 1 : 0)) <
      0.002
    ) {
      this.tapeDeployment = this.tapeDeployed ? 1 : 0;
    }
    if (experimentActive && !this.context.reducedMotion) {
      this.tapeAge += delta;
      this.tapeTexture.offset.x = (this.tapeTexture.offset.x + delta * 0.34) % 1;
    }
    const deployedEase = THREE.MathUtils.smoothstep(
      this.tapeDeployment,
      0,
      1,
    );
    for (const segment of this.tapeSegments) {
      segment.mesh.visible = deployedEase > 0.012;
      segment.mesh.position.y =
        THREE.MathUtils.lerp(0.28, segment.restingY, deployedEase) +
        (experimentActive && !this.context.reducedMotion
          ? Math.sin(this.tapeAge * 4.2 + segment.phase) *
            0.025 *
            deployedEase
          : 0);
      segment.mesh.scale.y = Math.max(0.04, deployedEase);
      segment.mesh.material.opacity = 0.98 * deployedEase;
      segment.mesh.material.color.setHex(
        this.sampleContaminated ? 0xff9d61 : 0xffffff,
      );
    }
  }

  private updatePlayerInterference(delta: number): boolean {
    const experimentActive =
      this.rainActive || (this.emitted > 0 && this.settled < this.emitted);
    if (!experimentActive) {
      this.playerInsideExperiment = false;
      this.interferenceCooldown = 0;
      return false;
    }

    this.interferenceCooldown = Math.max(
      0,
      this.interferenceCooldown - delta,
    );
    this.context.copyPlayerPosition(this.playerWorldPosition);
    const localX = this.playerWorldPosition.x - this.group.position.x;
    const localZ = this.playerWorldPosition.z - this.group.position.z;
    const feetHeight = this.context.getPlayerFeetHeight();
    const inside =
      Math.abs(localX) <= tableHalfWidth - 0.08 &&
      Math.abs(localZ) <= tableHalfDepth - 0.08 &&
      feetHeight >= 0.48 &&
      feetHeight <= 3.1;
    if (!inside) {
      this.playerInsideExperiment = false;
      return false;
    }

    const firstEntry = !this.playerInsideExperiment;
    this.playerInsideExperiment = true;
    if (firstEntry) {
      this.interferenceAnchorX = localX;
      this.interferenceAnchorZ = localZ;
    }
    const movementSquared =
      (localX - this.interferenceAnchorX) ** 2 +
      (localZ - this.interferenceAnchorZ) ** 2;
    if (
      !firstEntry &&
      movementSquared < 0.012 * 0.012 &&
      this.movingNeedles.size === 0
    ) {
      return false;
    }
    if (!firstEntry && this.interferenceCooldown > 0) return false;
    this.interferenceCooldown = firstEntry ? 0.08 : 0.15;
    const disturbed = this.disturbNeedles(
      this.interferenceAnchorX,
      this.interferenceAnchorZ,
      localX,
      localZ,
      feetHeight,
    );
    this.interferenceAnchorX = localX;
    this.interferenceAnchorZ = localZ;
    if (disturbed === 0) return false;

    const firstBreach = !this.sampleContaminated;
    this.sampleContaminated = true;
    if (firstBreach) {
      this.disturbanceEvents = 1;
      this.context.onStatus(
        "The striped boundary snaps behind you. Needles ricochet, settled counts reverse, and the live estimate marks itself contaminated.",
      );
    } else if (disturbed > 0) {
      this.disturbanceEvents += 1;
    }
    this.displayDirty = true;
    return disturbed > 0;
  }

  private updateAsteroidInterference(delta: number): boolean {
    const asteroid = this.context.getTravelingBody();
    if (!asteroid?.enabled) {
      this.asteroidPositionKnown = false;
      this.asteroidInsideExperiment = false;
      this.asteroidHoldingButton = false;
      this.asteroidInterferenceCooldown = 0;
      return false;
    }

    const localX = asteroid.position.x - this.group.position.x;
    const localZ = asteroid.position.z - this.group.position.z;
    const horizontalButtonDistance = Math.hypot(
      localX - buttonLocalX,
      localZ - buttonLocalZ,
    );
    const asteroidBottom = asteroid.position.y - asteroid.restingY;
    const restingOnButton =
      !asteroid.held &&
      Math.abs(asteroidBottom - buttonSurfaceY) <= 0.24 &&
      horizontalButtonDistance <=
        (this.asteroidHoldingButton
          ? asteroidButtonReleaseRadius
          : asteroidButtonRadius);
    if (restingOnButton && !this.asteroidHoldingButton) {
      this.startOrAccelerate("asteroid");
    }
    this.asteroidHoldingButton = restingOnButton;

    const experimentActive =
      this.rainActive ||
      (this.emitted > 0 && this.settled < this.emitted);
    this.asteroidInterferenceCooldown = Math.max(
      0,
      this.asteroidInterferenceCooldown - delta,
    );
    const bodyHeight = asteroid.position.y;
    const inside =
      experimentActive &&
      Math.abs(localX) <= tableHalfWidth - 0.08 + asteroid.radius &&
      Math.abs(localZ) <= tableHalfDepth - 0.08 + asteroid.radius &&
      bodyHeight + asteroid.radius >= 0.48 &&
      bodyHeight - asteroid.radius <= 3.1;
    if (!inside) {
      this.asteroidInsideExperiment = false;
      this.asteroidPreviousPosition.set(
        localX,
        bodyHeight,
        localZ,
      );
      this.asteroidPositionKnown = true;
      return false;
    }

    const firstEntry = !this.asteroidInsideExperiment;
    this.asteroidInsideExperiment = true;
    const previousX = this.asteroidPositionKnown
      ? this.asteroidPreviousPosition.x
      : localX;
    const previousZ = this.asteroidPositionKnown
      ? this.asteroidPreviousPosition.z
      : localZ;
    const movementSquared =
      (localX - previousX) ** 2 + (localZ - previousZ) ** 2;
    this.asteroidPreviousPosition.set(
      localX,
      bodyHeight,
      localZ,
    );
    this.asteroidPositionKnown = true;
    if (
      !firstEntry &&
      movementSquared < 0.008 * 0.008 &&
      this.movingNeedles.size === 0
    ) {
      return false;
    }
    if (!firstEntry && this.asteroidInterferenceCooldown > 0) {
      return false;
    }
    this.asteroidInterferenceCooldown = firstEntry ? 0.06 : 0.12;
    const disturbed = this.disturbNeedles(
      previousX,
      previousZ,
      localX,
      localZ,
      asteroidBottom,
      Math.max(
        disturbanceRadius,
        asteroid.radius + needleLength * 0.5 + 0.14,
      ),
      1.34,
    );
    if (disturbed === 0) return false;

    const firstBreach = !this.sampleContaminated;
    this.sampleContaminated = true;
    if (firstBreach) {
      this.disturbanceEvents = 1;
      this.context.onStatus(
        "The wrong-address stone enters the sample. Needles scatter from its path, and the live estimate marks the run INVALID.",
      );
    } else {
      this.disturbanceEvents += 1;
    }
    this.displayDirty = true;
    return true;
  }

  private disturbNeedles(
    previousPlayerX: number,
    previousPlayerZ: number,
    playerX: number,
    playerZ: number,
    feetHeight: number,
    radius = disturbanceRadius,
    impulseScale = 1,
  ): number {
    const candidates = new Map<
      number,
      { sample: NeedleSample; distanceSquared: number }
    >();
    const minimumX =
      Math.min(previousPlayerX, playerX) - radius;
    const maximumX =
      Math.max(previousPlayerX, playerX) + radius;
    const minimumZ =
      Math.min(previousPlayerZ, playerZ) - radius;
    const maximumZ =
      Math.max(previousPlayerZ, playerZ) + radius;
    const minimumCellX = this.getCellCoordinate(minimumX, tableHalfWidth);
    const maximumCellX = this.getCellCoordinate(maximumX, tableHalfWidth);
    const minimumCellZ = this.getCellCoordinate(minimumZ, tableHalfDepth);
    const maximumCellZ = this.getCellCoordinate(maximumZ, tableHalfDepth);
    for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
      for (let cellZ = minimumCellZ; cellZ <= maximumCellZ; cellZ += 1) {
        const bucket = this.settledCells.get(this.getCellKey(cellX, cellZ));
        if (!bucket) continue;
        for (const index of bucket) {
          const sample = this.samples[index];
          if (!sample?.settled) continue;
          const distanceSquared = this.distanceToPlayerSweepSquared(
            sample.x,
            sample.z,
            previousPlayerX,
            previousPlayerZ,
            playerX,
            playerZ,
          );
          if (distanceSquared <= radius * radius) {
            candidates.set(index, { sample, distanceSquared });
          }
        }
      }
    }
    for (const index of this.movingNeedles) {
      const sample = this.samples[index];
      if (!sample) continue;
      const distanceSquared = this.distanceToPlayerSweepSquared(
        sample.x,
        sample.z,
        previousPlayerX,
        previousPlayerZ,
        playerX,
        playerZ,
      );
      if (distanceSquared <= radius * radius) {
        candidates.set(index, { sample, distanceSquared });
      }
    }

    const orderedCandidates = [...candidates.values()].sort(
      (left, right) => left.distanceSquared - right.distanceSquared,
    );
    let disturbed = 0;
    const maximumDisturbed = Math.min(
      64,
      Math.max(24, Math.ceil(this.cap / 12)),
    );
    const movementX = playerX - previousPlayerX;
    const movementZ = playerZ - previousPlayerZ;
    const movementLength = Math.hypot(movementX, movementZ);
    const movementDirectionX =
      movementLength > 0.001 ? movementX / movementLength : 0;
    const movementDirectionZ =
      movementLength > 0.001 ? movementZ / movementLength : 0;
    for (const { sample } of orderedCandidates) {
      if (
        sample.y < feetHeight - 0.32 ||
        sample.y > feetHeight + 2.15
      ) {
        continue;
      }

      if (sample.settled) {
        this.removeFromSettledCell(sample);
        sample.settled = false;
        this.settled = Math.max(0, this.settled - 1);
        if (sample.crosses) {
          this.crossings = Math.max(0, this.crossings - 1);
        }
      }
      this.movingNeedles.add(sample.index);
      const dx = sample.x - playerX;
      const dz = sample.z - playerZ;
      const distanceSquared = dx * dx + dz * dz;
      const distance = Math.sqrt(Math.max(0.0001, distanceSquared));
      const fallbackAngle = this.nextRandom() * Math.PI * 2;
      const radialX =
        distance > 0.025 ? dx / distance : Math.cos(fallbackAngle);
      const radialZ =
        distance > 0.025 ? dz / distance : Math.sin(fallbackAngle);
      let directionX = radialX * 0.58 + movementDirectionX * 0.86;
      let directionZ = radialZ * 0.58 + movementDirectionZ * 0.86;
      const directionLength = Math.max(
        0.001,
        Math.hypot(directionX, directionZ),
      );
      directionX /= directionLength;
      directionZ /= directionLength;
      const impulse =
        (0.72 + this.nextRandom() * 1.38) * impulseScale;
      sample.velocityX += directionX * impulse;
      sample.velocityZ += directionZ * impulse;
      sample.x = THREE.MathUtils.clamp(
        sample.x + directionX * 0.06,
        -2.42,
        2.42,
      );
      sample.z = THREE.MathUtils.clamp(
        sample.z + directionZ * 0.06,
        -1.86,
        1.86,
      );
      sample.angle =
        (sample.angle + (this.nextRandom() - 0.5) * 1.7 + Math.PI) %
        Math.PI;
      sample.y = Math.max(
        sample.y,
        sample.targetY + 0.26 + this.nextRandom() * 0.62,
      );
      sample.velocityY = Math.max(
        sample.velocityY,
        (1.05 + this.nextRandom() * 1.45) * impulseScale,
      );
      sample.fallSpeed = 1.35 + this.nextRandom() * 1.5;
      sample.tumble += 0.8 + this.nextRandom() * 2.4;
      this.dirtyNeedles.add(sample.index);
      disturbed += 1;
      if (disturbed >= maximumDisturbed) break;
    }
    if (disturbed > 0) {
      this.completionAnnounced = false;
      this.displayDirty = true;
    }
    return disturbed;
  }

  private distanceToPlayerSweepSquared(
    x: number,
    z: number,
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
  ): number {
    const segmentX = endX - startX;
    const segmentZ = endZ - startZ;
    const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
    const progress =
      lengthSquared > 0.000001
        ? THREE.MathUtils.clamp(
            ((x - startX) * segmentX + (z - startZ) * segmentZ) /
              lengthSquared,
            0,
            1,
          )
        : 0;
    const nearestX = startX + segmentX * progress;
    const nearestZ = startZ + segmentZ * progress;
    return (x - nearestX) ** 2 + (z - nearestZ) ** 2;
  }

  private getCellCoordinate(value: number, halfExtent: number): number {
    return Math.floor((value + halfExtent) / needleCellSize);
  }

  private getCellKey(cellX: number, cellZ: number): string {
    return `${cellX}:${cellZ}`;
  }

  private addToSettledCell(sample: NeedleSample): void {
    const key = this.getCellKey(
      this.getCellCoordinate(sample.x, tableHalfWidth),
      this.getCellCoordinate(sample.z, tableHalfDepth),
    );
    let bucket = this.settledCells.get(key);
    if (!bucket) {
      bucket = new Set<number>();
      this.settledCells.set(key, bucket);
    }
    bucket.add(sample.index);
    sample.cellKey = key;
  }

  private removeFromSettledCell(sample: NeedleSample): void {
    if (sample.cellKey === null) return;
    const bucket = this.settledCells.get(sample.cellKey);
    bucket?.delete(sample.index);
    if (bucket?.size === 0) this.settledCells.delete(sample.cellKey);
    sample.cellKey = null;
  }

  private setTapeDeployed(deployed: boolean): void {
    if (this.tapeDeployed === deployed) return;
    this.tapeDeployed = deployed;
    if (deployed) {
      for (const z of [-cordonHalfDepth, cordonHalfDepth]) {
        this.tapeCollisionRemovers.push(
          this.context.addStaticBox(
            this.group.position.x,
            1.02,
            this.group.position.z + z,
            cordonHalfWidth,
            0.1,
            0.035,
            cordonClearHeight,
          ),
        );
      }
      for (const x of [-cordonHalfWidth, cordonHalfWidth]) {
        this.tapeCollisionRemovers.push(
          this.context.addStaticBox(
            this.group.position.x + x,
            1.02,
            this.group.position.z,
            0.035,
            0.1,
            cordonHalfDepth,
            cordonClearHeight,
          ),
        );
      }
      return;
    }
    for (const remove of this.tapeCollisionRemovers.splice(0)) remove();
  }

  setQuality(quality: MathQualityTier): void {
    this.qualityCap =
      quality === "low" ? 240 : quality === "medium" ? 480 : maximumNeedles;
    if (this.emitted === 0) {
      this.cap = this.qualityCap;
    } else if (this.rainActive) {
      this.cap = Math.max(this.emitted, this.qualityCap);
    }
    this.renderDisplay();
  }

  reactToSpell(stage: MathSpellStage, charge: number): number {
    if (stage === "spark" || this.emitted === 0) return 0;
    this.context.copyPlayerPosition(this.playerWorldPosition);
    this.spellBlastOriginX =
      this.playerWorldPosition.x - this.group.position.x;
    this.spellBlastOriginZ =
      this.playerWorldPosition.z - this.group.position.z;
    this.spellBlastQueue.length = 0;
    for (let index = 0; index < this.emitted; index += 1) {
      this.spellBlastQueue.push(index);
    }
    this.spellBlastCursor = 0;
    this.spellBlastStage = stage;
    this.spellBlastDelay = this.context.reducedMotion ? 0.2 : 0.9;
    // The workshop-wide spell description is intentionally dense. Keep the
    // result from replacing it until there has been time to read it, even
    // when a high-quality batch rematerializes all 720 needles very quickly.
    this.completionAnnouncementDelay = Math.max(
      this.completionAnnouncementDelay,
      5.6,
    );
    this.spellBlastStrength =
      (stage === "thunder" ? 4.9 : 3.45) * (0.72 + charge * 0.42);
    this.completionAnnounced = false;
    this.sampleContaminated = true;
    this.disturbanceEvents += 1;
    this.displayDirty = true;
    this.setTapeDeployed(true);
    return this.spellBlastQueue.length;
  }

  hasActiveMotion(): boolean {
    return (
      !this.context.reducedMotion &&
      (this.rainActive ||
        this.settled < this.emitted ||
        this.spellBlastCursor < this.spellBlastQueue.length ||
        this.buttonPressAge < buttonPressDuration)
    );
  }

  dispose(): void {
    this.setTapeDeployed(false);
    this.displayTexture.dispose();
    this.tapeTexture.dispose();
  }

  private startOrAccelerate(
    source: "direct" | "asteroid" = "direct",
  ): void {
    this.buttonPressAge = 0;
    this.setTapeDeployed(true);
    if (
      this.emitted >= this.cap &&
      this.settled >= this.emitted
    ) {
      this.resetRun();
    }

    if (this.rainActive) {
      this.accelerationBoost = Math.min(9, this.accelerationBoost + 2.5);
      this.context.onStatus(
        source === "asteroid"
          ? "The wrong-address stone bears down on the red switch. The feed answers its weight with a faster rain."
          : "The red button sinks again. The feed accelerates while every new drop remains visible.",
      );
      return;
    }

    if (this.emitted < this.cap) {
      this.rainActive = true;
      this.completionAnnounced = false;
      this.context.updateInteractionLabel(
        "math-buffon",
        `Press again to increase feed · ${this.settled}/${this.cap}`,
      );
      this.context.onStatus(
        source === "asteroid"
          ? `The wrong-address stone settles on the switch. The post yields beneath it, releasing a ${this.cap}-needle rain.`
          : this.context.reducedMotion
          ? `Needles begin arriving in a progressive ${this.cap}-drop sample. Reduced motion settles each new needle without a fall.`
          : `The remote post releases a slow rain toward a ${this.cap}-needle sample. Striped tape snaps upward around the table.`,
      );
      return;
    }

    this.context.onStatus(
      `The final needles are still settling: ${this.settled} of ${this.emitted} have reached the table.`,
    );
  }

  private resetRun(): void {
    this.samples.length = 0;
    this.mesh.count = 0;
    this.emitted = 0;
    this.settled = 0;
    this.crossings = 0;
    this.movingNeedles.clear();
    this.dirtyNeedles.clear();
    this.settledCells.clear();
    this.cap = this.qualityCap;
    this.rainAge = 0;
    this.accelerationBoost = 0;
    this.emissionCarry = 0;
    this.completionAnnounced = false;
    this.interferenceCooldown = 0;
    this.playerInsideExperiment = false;
    this.interferenceAnchorX = 0;
    this.interferenceAnchorZ = 0;
    this.sampleContaminated = false;
    this.disturbanceEvents = 0;
    this.spellBlastQueue.length = 0;
    this.spellBlastCursor = 0;
    this.spellBlastStage = null;
    this.spellBlastDelay = 0;
    this.completionAnnouncementDelay = 0;
    this.displayDirty = true;
    this.renderDisplay();
  }

  private updateSpellBlast(delta: number): void {
    const stage = this.spellBlastStage;
    if (
      !stage ||
      this.spellBlastCursor >= this.spellBlastQueue.length
    ) {
      return;
    }
    if (this.spellBlastDelay > 0) {
      this.spellBlastDelay = Math.max(0, this.spellBlastDelay - delta);
      return;
    }
    const qualityBatch =
      this.qualityCap <= 240 ? 24 : this.qualityCap <= 480 ? 40 : 56;
    const batchSize =
      stage === "thunder"
        ? Math.ceil(qualityBatch * 1.35)
        : qualityBatch;
    const end = Math.min(
      this.spellBlastQueue.length,
      this.spellBlastCursor + batchSize,
    );
    for (; this.spellBlastCursor < end; this.spellBlastCursor += 1) {
      const index = this.spellBlastQueue[this.spellBlastCursor];
      const sample = index === undefined ? undefined : this.samples[index];
      if (sample) this.launchNeedleFromSpell(sample);
    }
    if (this.spellBlastCursor >= this.spellBlastQueue.length) {
      this.spellBlastQueue.length = 0;
      this.spellBlastCursor = 0;
      this.spellBlastStage = null;
      this.spellBlastDelay = 0;
    }
  }

  private launchNeedleFromSpell(sample: NeedleSample): void {
    if (sample.settled) {
      this.removeFromSettledCell(sample);
      sample.settled = false;
      this.settled = Math.max(0, this.settled - 1);
      if (sample.crosses) {
        this.crossings = Math.max(0, this.crossings - 1);
      }
    }
    this.movingNeedles.add(sample.index);
    let directionX = sample.x - this.spellBlastOriginX;
    let directionZ = sample.z - this.spellBlastOriginZ;
    let directionLength = Math.hypot(directionX, directionZ);
    if (directionLength < 0.04) {
      const fallbackAngle = this.nextRandom() * Math.PI * 2;
      directionX = Math.cos(fallbackAngle);
      directionZ = Math.sin(fallbackAngle);
      directionLength = 1;
    }
    directionX /= directionLength;
    directionZ /= directionLength;
    const tangentX = -directionZ;
    const tangentZ = directionX;
    const curl = (this.nextRandom() - 0.5) * 0.84;
    const impulse =
      this.spellBlastStrength * (0.62 + this.nextRandom() * 0.58);
    sample.velocityX += (directionX + tangentX * curl) * impulse;
    sample.velocityZ += (directionZ + tangentZ * curl) * impulse;
    sample.velocityY = Math.max(
      sample.velocityY,
      2.25 + this.nextRandom() * 2.65 + this.spellBlastStrength * 0.2,
    );
    sample.y = Math.max(sample.y, sample.targetY + 0.04);
    sample.angle =
      (sample.angle + (this.nextRandom() - 0.5) * Math.PI) %
      Math.PI;
    sample.tumble += 1.4 + this.nextRandom() * 3.8;
    sample.fallSpeed = 1.65 + this.nextRandom() * 1.65;
    this.dirtyNeedles.add(sample.index);
  }

  private spawnNeedle(): void {
    const x = -2.28 + this.nextRandom() * 4.56;
    const z = -1.72 + this.nextRandom() * 3.44;
    const angle = this.nextRandom() * Math.PI;
    const targetY = 0.735 + (this.emitted % 11) * 0.0034;
    const index = this.emitted;
    const sample: NeedleSample = {
      index,
      x,
      z,
      y: this.context.reducedMotion ? 0.77 : 4.1 + this.nextRandom() * 3.2,
      targetY,
      angle,
      tumble: this.nextRandom() * Math.PI * 2,
      fallSpeed: 2.25 + this.nextRandom() * 1.55,
      velocityX: 0,
      velocityY: 0,
      velocityZ: 0,
      crosses: this.doesNeedleCross(x, angle),
      settled: false,
      cellKey: null,
    };
    this.samples.push(sample);
    this.movingNeedles.add(index);
    this.dirtyNeedles.add(index);
    this.emitted += 1;
    this.mesh.count = this.emitted;
    this.displayDirty = true;
    if (this.context.reducedMotion) this.settleNeedle(sample);
  }

  private settleNeedle(sample: NeedleSample): void {
    if (sample.settled) return;
    sample.y = sample.targetY;
    sample.tumble = 0;
    sample.velocityX = 0;
    sample.velocityY = 0;
    sample.velocityZ = 0;
    sample.crosses = this.doesNeedleCross(sample.x, sample.angle);
    sample.settled = true;
    this.movingNeedles.delete(sample.index);
    this.addToSettledCell(sample);
    this.dirtyNeedles.add(sample.index);
    this.settled += 1;
    if (sample.crosses) this.crossings += 1;
    this.displayDirty = true;
  }

  private flushNeedleMatrices(): void {
    if (this.dirtyNeedles.size === 0) return;
    for (const index of this.dirtyNeedles) {
      const sample = this.samples[index];
      if (!sample) continue;
      this.dummy.position.set(sample.x, sample.y, sample.z);
      this.dummy.rotation.set(
        sample.settled ? 0 : sample.tumble,
        sample.angle,
        sample.settled ? 0 : sample.tumble * 0.63,
      );
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(index, this.dummy.matrix);
    }
    this.dirtyNeedles.clear();
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private renderDisplay(): void {
    const drawing = this.displayCanvas.getContext("2d");
    if (!drawing) return;
    drawing.clearRect(0, 0, this.displayCanvas.width, this.displayCanvas.height);
    const gradient = drawing.createLinearGradient(0, 0, 768, 288);
    gradient.addColorStop(0, "rgba(6, 22, 28, 0.96)");
    gradient.addColorStop(1, "rgba(21, 15, 45, 0.94)");
    drawing.fillStyle = gradient;
    drawing.fillRect(0, 0, 768, 288);
    drawing.strokeStyle = this.sampleContaminated ? "#ff7168" : "#55dce8";
    drawing.lineWidth = 8;
    drawing.strokeRect(5, 5, 758, 278);
    drawing.textAlign = "left";
    drawing.textBaseline = "middle";
    drawing.fillStyle = this.sampleContaminated ? "#ff7168" : "#55dce8";
    drawing.font = "700 48px Georgia, serif";
    drawing.fillText("NEEDLE RAIN", 42, 58);
    drawing.fillStyle = "#f1ead8";
    drawing.font = "600 31px ui-monospace, monospace";
    drawing.fillText(
      `${this.settled} / ${this.cap} settled   ·   ${this.crossings} crossings`,
      42,
      126,
    );
    if (this.sampleContaminated) {
      drawing.fillStyle = "#ff7168";
      drawing.font = "800 27px ui-monospace, monospace";
      drawing.fillText(
        `CONTROL BREACH × ${this.disturbanceEvents}   ·   RESULT INVALID`,
        42,
        178,
      );
    }
    drawing.fillStyle = this.sampleContaminated ? "#ffd16b" : "#ffbd55";
    drawing.font = `${
      this.sampleContaminated ? "700 39px" : "700 46px"
    } ui-monospace, monospace`;
    drawing.fillText(
      `π ≈ ${this.formatEstimate(this.estimatePi(), 4)}${
        this.sampleContaminated ? "   // ?" : ""
      }`,
      42,
      this.sampleContaminated ? 235 : 213,
    );
    this.displayTexture.needsUpdate = true;
    this.displayDirty = false;
    this.displayAge = 0;

    if (!this.completionAnnounced) {
      this.context.updateInteractionLabel(
        "math-buffon",
        this.rainActive
          ? `Increase feed at red button · ${this.settled}/${this.cap}${
              this.sampleContaminated ? " · INVALID" : ""
            }`
          : this.emitted > this.settled
            ? `Needles settling · ${this.settled}/${this.emitted}${
                this.sampleContaminated ? " · INVALID" : ""
              }`
            : "Press the red needle-rain button",
      );
    }
  }

  private doesNeedleCross(x: number, angle: number): boolean {
    const nearestLine = THREE.MathUtils.clamp(Math.round(x), -2, 2);
    const halfProjection = (needleLength / 2) * Math.abs(Math.sin(angle));
    return Math.abs(x - nearestLine) <= halfProjection;
  }

  private estimatePi(): number {
    return this.crossings > 0
      ? (2 * needleLength * this.settled) /
          (lineSpacing * this.crossings)
      : Number.NaN;
  }

  private formatEstimate(value: number, digits: number): string {
    return Number.isFinite(value) ? value.toFixed(digits) : "…";
  }

  private nextRandom(): number {
    this.randomState = (this.randomState * 1664525 + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }
}
