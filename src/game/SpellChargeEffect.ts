import * as THREE from "three";
import type { QualityTier, SpellStage } from "../world/WorldContracts";

export interface SpellChargeEffectFrame {
  charging: boolean;
  charge: number;
  castAge: number;
  castCharge: number;
  stage: SpellStage;
  packetInterferenceUnlocked: boolean;
  elapsed: number;
  reducedMotion: boolean;
  quality: QualityTier;
}

interface HandEffect {
  anchor: THREE.Group;
  core: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>;
  aura: THREE.Sprite;
  sparks: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  positions: Float32Array;
  phases: Float32Array;
}

const maximumHandSparks = 10;
const maximumArcBolts = 12;
const arcSegmentsPerBolt = 3;
const maximumArcVertices =
  maximumArcBolts * arcSegmentsPerBolt * 2;
const orbLocalY = 3.48;
const gloveBaseColor = new THREE.Color(0x11171a);
const gloveBaseRoughness = 0.9;

function createGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(48, 48, 2, 48, 48, 46);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.18, "rgba(124,242,255,.96)");
    gradient.addColorStop(0.52, "rgba(68,187,255,.34)");
    gradient.addColorStop(1, "rgba(32,116,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 96, 96);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function hash(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function setRenderLayer(root: THREE.Object3D, layer: number): void {
  root.traverse((object) => object.layers.set(layer));
}

export class SpellChargeEffect {
  private readonly leftHand: HandEffect;
  private readonly rightHand: HandEffect;
  private readonly orbGroup = new THREE.Group();
  private readonly handCoreGeometry = new THREE.IcosahedronGeometry(0.095, 1);
  private readonly handCoreMaterial = new THREE.MeshBasicMaterial({
    color: 0x61eaff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly glowTexture = createGlowTexture();
  private readonly handAuraMaterial = new THREE.SpriteMaterial({
    color: 0x62eaff,
    map: this.glowTexture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly handSparkMaterial = new THREE.PointsMaterial({
    color: 0x9cf8ff,
    size: 0.055,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly orbCoreGeometry = new THREE.IcosahedronGeometry(0.23, 2);
  private readonly orbCoreMaterial = new THREE.MeshBasicMaterial({
    color: 0x70efff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly orbCore = new THREE.Mesh(
    this.orbCoreGeometry,
    this.orbCoreMaterial,
  );
  private readonly orbShellGeometry = new THREE.IcosahedronGeometry(0.31, 1);
  private readonly orbShellMaterial = new THREE.MeshBasicMaterial({
    color: 0xc2faff,
    wireframe: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly orbShell = new THREE.Mesh(
    this.orbShellGeometry,
    this.orbShellMaterial,
  );
  private readonly orbAuraMaterial = new THREE.SpriteMaterial({
    color: 0x6bdfff,
    map: this.glowTexture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly orbAura = new THREE.Sprite(this.orbAuraMaterial);
  private readonly ringGeometry = new THREE.TorusGeometry(
    0.39,
    0.016,
    4,
    36,
  );
  private readonly ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xa576ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly rings: THREE.Mesh<
    THREE.TorusGeometry,
    THREE.MeshBasicMaterial
  >[] = [];
  private readonly packetGeometry = new THREE.BufferGeometry();
  private readonly packetPositions = new Float32Array(12 * 3);
  private readonly packetMaterial = new THREE.PointsMaterial({
    color: 0xc28cff,
    size: 0.065,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly packetPoints: THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  >;
  private readonly arcGeometry = new THREE.BufferGeometry();
  private readonly arcPositions = new Float32Array(maximumArcVertices * 3);
  private readonly arcMaterial = new THREE.LineBasicMaterial({
    color: 0xe4fcff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly arcs: THREE.LineSegments<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >;
  private readonly light = new THREE.PointLight(0x65e9ff, 0, 5.5, 2);
  private lastArcTick = -1;
  private lastStage: SpellStage | null = null;

  constructor(
    player: THREE.Group,
    leftArm: THREE.Group,
    rightArm: THREE.Group,
    private readonly gloveMaterial: THREE.MeshStandardMaterial,
    renderLayer: number,
  ) {
    this.leftHand = this.createHandEffect(leftArm, -1);
    this.rightHand = this.createHandEffect(rightArm, 1);

    this.orbGroup.name = "spell-charge-orb";
    this.orbGroup.userData.terminalTraversalSnapshot = false;
    this.orbGroup.position.y = orbLocalY;
    this.orbGroup.visible = false;
    this.orbCore.frustumCulled = false;
    this.orbShell.frustumCulled = false;
    this.orbAura.scale.setScalar(1);
    this.orbGroup.add(this.orbAura, this.orbCore, this.orbShell);

    for (let index = 0; index < 3; index += 1) {
      const ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
      ring.rotation.set(
        index === 0 ? Math.PI / 2 : index === 1 ? 0.72 : -0.62,
        index * 0.88,
        index === 2 ? Math.PI / 2 : 0,
      );
      ring.frustumCulled = false;
      ring.visible = false;
      this.rings.push(ring);
      this.orbGroup.add(ring);
    }

    this.packetGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.packetPositions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.packetPoints = new THREE.Points(
      this.packetGeometry,
      this.packetMaterial,
    );
    this.packetPoints.frustumCulled = false;
    this.packetPoints.visible = false;
    this.orbGroup.add(this.packetPoints);

    this.arcGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.arcPositions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.arcGeometry.setDrawRange(0, 0);
    this.arcs = new THREE.LineSegments(this.arcGeometry, this.arcMaterial);
    this.arcs.name = "spell-charge-thunder-arcs";
    this.arcs.userData.terminalTraversalSnapshot = false;
    this.arcs.frustumCulled = false;
    this.arcs.visible = false;
    player.add(this.arcs);

    this.light.castShadow = false;
    this.light.position.y = orbLocalY;
    this.light.layers.set(0);
    this.light.layers.enable(renderLayer);
    player.add(this.orbGroup, this.light);

    setRenderLayer(this.leftHand.anchor, renderLayer);
    setRenderLayer(this.rightHand.anchor, renderLayer);
    this.leftHand.anchor.userData.terminalTraversalSnapshot = false;
    this.rightHand.anchor.userData.terminalTraversalSnapshot = false;
    setRenderLayer(this.orbGroup, renderLayer);
    this.arcs.layers.set(renderLayer);
  }

  update(delta: number, frame: SpellChargeEffectFrame): void {
    const releaseEnvelope =
      frame.castAge < 0.58
        ? 1 - THREE.MathUtils.smoothstep(frame.castAge, 0.12, 0.58)
        : 0;
    const chargingStrength = frame.charging
      ? 0.16 + frame.charge * 0.84
      : 0;
    const releaseStrength =
      releaseEnvelope * (0.38 + frame.castCharge * 0.62);
    const strength = Math.max(chargingStrength, releaseStrength);
    const effectiveCharge = frame.charging
      ? frame.charge
      : frame.castCharge * releaseEnvelope;
    const fullCharge = THREE.MathUtils.smoothstep(
      effectiveCharge,
      0.72,
      0.995,
    );
    const orbStrength =
      THREE.MathUtils.smoothstep(effectiveCharge, 0.4, 0.92) *
      Math.min(1, strength * 1.35);
    const stageRank =
      frame.stage === "thunder" ? 2 : frame.stage === "surge" ? 1 : 0;

    this.syncStageColors(frame.stage);
    this.updateGloveSurface(strength, stageRank, frame);
    this.updateHand(
      this.leftHand,
      -1,
      strength,
      stageRank,
      delta,
      frame,
    );
    this.updateHand(
      this.rightHand,
      1,
      strength,
      stageRank,
      delta,
      frame,
    );
    this.updateOrb(
      orbStrength,
      fullCharge,
      stageRank,
      delta,
      frame,
    );

    const thunderStrength =
      stageRank === 2
        ? THREE.MathUtils.smoothstep(effectiveCharge, 0.54, 0.98) *
          Math.min(1, strength * 1.2)
        : 0;
    this.updateThunderArcs(thunderStrength, frame);

    const pulse = frame.reducedMotion
      ? 1
      : 0.9 + Math.sin(frame.elapsed * (8 + stageRank * 2)) * 0.1;
    this.light.visible = this.orbGroup.visible;
    this.light.intensity = this.light.visible
      ? orbStrength *
        pulse *
        (stageRank === 2 ? 7.5 : stageRank === 1 ? 5.2 : 3.4)
      : 0;
    this.light.distance =
      4.2 + orbStrength * (stageRank === 2 ? 3.1 : 1.8);
  }

  dispose(): void {
    this.leftHand.anchor.removeFromParent();
    this.rightHand.anchor.removeFromParent();
    this.orbGroup.removeFromParent();
    this.arcs.removeFromParent();
    this.light.removeFromParent();

    this.leftHand.sparks.geometry.dispose();
    this.rightHand.sparks.geometry.dispose();
    this.handCoreGeometry.dispose();
    this.orbCoreGeometry.dispose();
    this.orbShellGeometry.dispose();
    this.ringGeometry.dispose();
    this.packetGeometry.dispose();
    this.arcGeometry.dispose();

    this.handCoreMaterial.dispose();
    this.handAuraMaterial.dispose();
    this.handSparkMaterial.dispose();
    this.orbCoreMaterial.dispose();
    this.orbShellMaterial.dispose();
    this.orbAuraMaterial.dispose();
    this.ringMaterial.dispose();
    this.packetMaterial.dispose();
    this.arcMaterial.dispose();
    this.glowTexture.dispose();

    this.gloveMaterial.color.copy(gloveBaseColor);
    this.gloveMaterial.emissive.setHex(0x000000);
    this.gloveMaterial.emissiveIntensity = 0;
    this.gloveMaterial.roughness = gloveBaseRoughness;
  }

  private createHandEffect(
    arm: THREE.Group,
    side: -1 | 1,
  ): HandEffect {
    const anchor = new THREE.Group();
    anchor.name = side < 0 ? "left-spell-hand" : "right-spell-hand";
    anchor.position.set(0, -0.83, 0.025);

    const core = new THREE.Mesh(
      this.handCoreGeometry,
      this.handCoreMaterial,
    );
    core.frustumCulled = false;
    const aura = new THREE.Sprite(this.handAuraMaterial);
    aura.scale.setScalar(0.42);

    const positions = new Float32Array(maximumHandSparks * 3);
    const phases = new Float32Array(maximumHandSparks);
    for (let index = 0; index < maximumHandSparks; index += 1) {
      phases[index] = index * 2.39996 + (side < 0 ? 0.4 : 1.2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    geometry.setDrawRange(0, 0);
    const sparks = new THREE.Points(geometry, this.handSparkMaterial);
    sparks.frustumCulled = false;
    anchor.add(aura, core, sparks);
    arm.add(anchor);
    return { anchor, core, aura, sparks, positions, phases };
  }

  private updateGloveSurface(
    strength: number,
    stageRank: number,
    frame: SpellChargeEffectFrame,
  ): void {
    const surfaceStrength =
      strength > 0.01 ? 0.38 + strength * 0.62 : 0;
    const pulse = frame.reducedMotion
      ? 1
      : 0.92 + Math.sin(frame.elapsed * (10 + stageRank * 1.5)) * 0.08;
    const colorMix = Math.min(0.74, surfaceStrength * (0.58 + stageRank * 0.08));

    this.gloveMaterial.color
      .copy(gloveBaseColor)
      .lerp(this.handCoreMaterial.color, colorMix);
    this.gloveMaterial.emissiveIntensity =
      surfaceStrength *
      pulse *
      (stageRank === 2 ? 4.4 : stageRank === 1 ? 3.4 : 2.7);
    this.gloveMaterial.roughness = THREE.MathUtils.lerp(
      gloveBaseRoughness,
      0.34,
      surfaceStrength,
    );
  }

  private updateHand(
    hand: HandEffect,
    side: -1 | 1,
    strength: number,
    stageRank: number,
    delta: number,
    frame: SpellChargeEffectFrame,
  ): void {
    hand.anchor.visible = strength > 0.01;
    if (!hand.anchor.visible) return;

    const pulse = frame.reducedMotion
      ? 1
      : 0.9 + Math.sin(frame.elapsed * 12 + side) * 0.1;
    hand.core.scale.setScalar((0.62 + strength * 1.12) * pulse);
    hand.aura.scale.setScalar(0.24 + strength * (0.44 + stageRank * 0.08));
    this.handCoreMaterial.opacity = Math.min(0.96, strength * 1.12);
    this.handAuraMaterial.opacity = Math.min(0.82, strength * 0.72);
    this.handSparkMaterial.opacity = Math.min(0.92, strength * 0.95);

    const qualityLimit =
      frame.quality === "low"
        ? 4
        : frame.quality === "medium"
          ? 7
          : maximumHandSparks;
    const count = Math.min(
      qualityLimit,
      Math.max(2, Math.ceil(strength * qualityLimit)),
    );
    const speed = frame.reducedMotion ? 0.45 : 2.1 + stageRank * 0.48;
    for (let index = 0; index < count; index += 1) {
      const phase =
        (hand.phases[index] ?? 0) + frame.elapsed * speed * (index % 2 ? -1 : 1);
      const radius =
        0.06 + strength * (0.09 + (index % 3) * 0.018);
      const offset = index * 3;
      hand.positions[offset] = Math.cos(phase) * radius;
      hand.positions[offset + 1] =
        Math.sin(phase * 1.7) * radius * 0.72 +
        Math.sin(frame.elapsed * 4 + index) * strength * 0.018;
      hand.positions[offset + 2] =
        Math.sin(phase) * radius * (0.72 + stageRank * 0.08);
    }
    hand.sparks.geometry.setDrawRange(0, count);
    (
      hand.sparks.geometry.getAttribute("position") as THREE.BufferAttribute
    ).needsUpdate = true;
    hand.sparks.rotation.y +=
      delta * (frame.reducedMotion ? 0.08 : 0.42 + stageRank * 0.12);
  }

  private updateOrb(
    orbStrength: number,
    fullCharge: number,
    stageRank: number,
    delta: number,
    frame: SpellChargeEffectFrame,
  ): void {
    this.orbGroup.visible = orbStrength > 0.01;
    if (!this.orbGroup.visible) {
      for (const ring of this.rings) ring.visible = false;
      this.packetPoints.visible = false;
      return;
    }

    const pulse = frame.reducedMotion
      ? 1
      : 0.94 + Math.sin(frame.elapsed * (7 + stageRank * 1.5)) * 0.06;
    const scale = (0.42 + orbStrength * 0.82 + fullCharge * 0.2) * pulse;
    this.orbCore.scale.setScalar(scale);
    this.orbShell.scale.setScalar(scale * (1.18 + fullCharge * 0.1));
    this.orbAura.scale.setScalar(0.42 + orbStrength * 0.88 + fullCharge * 0.24);
    this.orbCoreMaterial.opacity = Math.min(1, 0.24 + orbStrength * 0.78);
    this.orbShellMaterial.opacity = 0.12 + orbStrength * 0.5;
    this.orbAuraMaterial.opacity = 0.12 + orbStrength * 0.52;
    this.orbCore.rotation.y +=
      delta * (frame.reducedMotion ? 0.12 : 0.9 + stageRank * 0.24);
    this.orbShell.rotation.x +=
      delta * (frame.reducedMotion ? 0.08 : 0.62);
    this.orbShell.rotation.z -=
      delta * (frame.reducedMotion ? 0.06 : 0.48 + stageRank * 0.12);

    const ringStrength = stageRank >= 1 ? orbStrength : 0;
    this.ringMaterial.opacity = ringStrength * (0.42 + fullCharge * 0.42);
    for (const [index, ring] of this.rings.entries()) {
      ring.visible =
        ringStrength > 0.02 &&
        (index < 2 || frame.packetInterferenceUnlocked || stageRank === 2);
      if (!ring.visible) continue;
      const ringScale =
        0.62 +
        ringStrength * (0.52 + index * 0.08) +
        fullCharge * 0.12;
      ring.scale.setScalar(ringScale);
      const direction = index % 2 === 0 ? 1 : -1;
      ring.rotation.z +=
        delta *
        direction *
        (frame.reducedMotion ? 0.1 : 0.8 + index * 0.22);
      ring.rotation.y +=
        delta *
        direction *
        (frame.reducedMotion ? 0.06 : 0.36 + index * 0.16);
    }

    const packetVisible =
      ringStrength > 0.05 &&
      (frame.packetInterferenceUnlocked || stageRank === 2);
    this.packetPoints.visible = packetVisible;
    if (packetVisible) {
      const packetCount = frame.quality === "low" ? 6 : 12;
      for (let index = 0; index < packetCount; index += 1) {
        const angle =
          frame.elapsed *
            (frame.reducedMotion ? 0.18 : index % 2 === 0 ? 1.1 : -0.82) +
          (index / packetCount) * Math.PI * 2;
        const radius = 0.31 + (index % 3) * 0.055 + fullCharge * 0.09;
        const offset = index * 3;
        this.packetPositions[offset] = Math.cos(angle) * radius;
        this.packetPositions[offset + 1] =
          Math.sin(angle * 2 + index) * (0.09 + fullCharge * 0.04);
        this.packetPositions[offset + 2] = Math.sin(angle) * radius;
      }
      this.packetGeometry.setDrawRange(0, packetCount);
      (
        this.packetGeometry.getAttribute("position") as THREE.BufferAttribute
      ).needsUpdate = true;
      this.packetMaterial.opacity = ringStrength * (0.52 + fullCharge * 0.4);
    }
  }

  private updateThunderArcs(
    strength: number,
    frame: SpellChargeEffectFrame,
  ): void {
    this.arcs.visible = strength > 0.025;
    if (!this.arcs.visible) {
      this.arcGeometry.setDrawRange(0, 0);
      return;
    }

    const tickRate = frame.reducedMotion ? 4 : 18;
    const tick = Math.floor(frame.elapsed * tickRate);
    if (tick !== this.lastArcTick) {
      this.lastArcTick = tick;
      const qualityLimit =
        frame.quality === "low"
          ? 6
          : frame.quality === "medium"
            ? 9
            : maximumArcBolts;
      const boltCount = Math.max(
        3,
        Math.min(qualityLimit, Math.ceil(strength * qualityLimit)),
      );
      let vertexCursor = 0;
      for (let bolt = 0; bolt < boltCount; bolt += 1) {
        const reachesPlayer = bolt >= Math.max(4, boltCount - 4);
        const angle =
          (bolt / Math.max(1, boltCount - 4)) * Math.PI * 2 +
          hash(tick * 31 + bolt) * 0.45;
        const startX = Math.cos(angle) * 0.12;
        const startY = orbLocalY + (hash(tick * 19 + bolt) - 0.5) * 0.12;
        const startZ = Math.sin(angle) * 0.12;
        const targetIndex = bolt % 4;
        const targetX = reachesPlayer
          ? targetIndex % 2 === 0
            ? -0.62
            : 0.62
          : Math.cos(angle) * (0.48 + hash(bolt * 7 + tick) * 0.34);
        const targetY = reachesPlayer
          ? targetIndex < 2
            ? 2.05
            : 1.28
          : orbLocalY + (hash(bolt * 11 + tick) - 0.5) * 0.72;
        const targetZ = reachesPlayer
          ? (hash(bolt * 17 + tick) - 0.5) * 0.36
          : Math.sin(angle) * (0.48 + hash(bolt * 13 + tick) * 0.34);

        let previousX = startX;
        let previousY = startY;
        let previousZ = startZ;
        for (let segment = 1; segment <= arcSegmentsPerBolt; segment += 1) {
          const progress = segment / arcSegmentsPerBolt;
          const taper = Math.sin(progress * Math.PI);
          const seed = tick * 97 + bolt * 17 + segment * 5;
          const nextX =
            THREE.MathUtils.lerp(startX, targetX, progress) +
            (hash(seed) - 0.5) * 0.18 * taper;
          const nextY =
            THREE.MathUtils.lerp(startY, targetY, progress) +
            (hash(seed + 1) - 0.5) * 0.16 * taper;
          const nextZ =
            THREE.MathUtils.lerp(startZ, targetZ, progress) +
            (hash(seed + 2) - 0.5) * 0.18 * taper;
          const offset = vertexCursor * 3;
          this.arcPositions[offset] = previousX;
          this.arcPositions[offset + 1] = previousY;
          this.arcPositions[offset + 2] = previousZ;
          this.arcPositions[offset + 3] = nextX;
          this.arcPositions[offset + 4] = nextY;
          this.arcPositions[offset + 5] = nextZ;
          vertexCursor += 2;
          previousX = nextX;
          previousY = nextY;
          previousZ = nextZ;
        }
      }
      this.arcGeometry.setDrawRange(0, vertexCursor);
      (
        this.arcGeometry.getAttribute("position") as THREE.BufferAttribute
      ).needsUpdate = true;
    }

    const flicker = frame.reducedMotion
      ? 0.82
      : 0.62 + Math.abs(Math.sin(frame.elapsed * 43)) * 0.38;
    this.arcMaterial.opacity = strength * flicker;
  }

  private syncStageColors(stage: SpellStage): void {
    if (stage === this.lastStage) return;
    this.lastStage = stage;
    const handColor =
      stage === "thunder"
        ? 0xc9fbff
        : stage === "surge"
          ? 0x72e7ff
          : 0x58dcff;
    const coreColor =
      stage === "thunder"
        ? 0xf1feff
        : stage === "surge"
          ? 0x82eaff
          : 0x62e5ff;
    this.handCoreMaterial.color.setHex(handColor);
    this.handAuraMaterial.color.setHex(handColor);
    this.handSparkMaterial.color.setHex(
      stage === "thunder" ? 0xffffff : handColor,
    );
    this.gloveMaterial.emissive.setHex(handColor);
    this.orbCoreMaterial.color.setHex(coreColor);
    this.orbAuraMaterial.color.setHex(coreColor);
    this.orbShellMaterial.color.setHex(
      stage === "thunder" ? 0xffffff : 0xb8f8ff,
    );
    this.ringMaterial.color.setHex(
      stage === "thunder" ? 0x9c8bff : 0xa76fff,
    );
    this.packetMaterial.color.setHex(
      stage === "thunder" ? 0xd5bcff : 0xc28cff,
    );
    this.arcMaterial.color.setHex(0xe8fdff);
    this.light.color.setHex(coreColor);
  }
}
