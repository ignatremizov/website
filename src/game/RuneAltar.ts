import * as THREE from "three";
import { addCylinder } from "./scenePrimitives.ts";
import type { QualityTier } from "../world/WorldContracts";

export interface RuneAltarMaterials {
  stone: THREE.Material;
  moss: THREE.Material;
  brass: THREE.Material;
  cyan: THREE.MeshBasicMaterial;
  amber: THREE.MeshBasicMaterial;
}

export interface RuneAltarHooks {
  onStatus: (message: string) => void;
  getRevealTarget: (target: THREE.Vector3) => THREE.Vector3;
  onPreparePortfolio: () => void;
  onRevealPortfolio: () => void;
}

type RuneAltarPhase =
  | "idle"
  | "opening"
  | "transmitting"
  | "holding"
  | "closing";

export class RuneAltar {
  readonly object = new THREE.Group();

  private readonly hooks: RuneAltarHooks;
  private readonly rotor = new THREE.Group();
  private readonly crystal: THREE.Mesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly outerRing: THREE.Group;
  private readonly innerRing: THREE.Group;
  private readonly glowMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly beacon: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly flare: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly informationBeam: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly informationCore: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly informationPackets: THREE.InstancedMesh<
    THREE.BoxGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly informationTargetFlare: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly informationTargetLight: THREE.PointLight;
  private readonly informationPacketDummy = new THREE.Object3D();
  private readonly informationSourceWorld = new THREE.Vector3();
  private readonly informationTargetWorld = new THREE.Vector3();
  private readonly informationSourceLocal = new THREE.Vector3();
  private readonly informationTargetLocal = new THREE.Vector3();
  private readonly informationReachedTargetLocal = new THREE.Vector3();
  private readonly informationMidpoint = new THREE.Vector3();
  private readonly informationDirection = new THREE.Vector3();
  private readonly informationUp = new THREE.Vector3(0, 1, 0);
  private readonly light: THREE.PointLight;
  private phase: RuneAltarPhase = "idle";
  private hasRevealed = false;
  private age = 0;
  private duration = 1.5;
  private lightingEnabled = true;
  private visualWarmupFrames = 2;
  private readonly warmupVisuals: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  >[];
  private readonly warmedVisuals: {
    mesh: THREE.Mesh;
    frustumCulled: boolean;
  }[] = [];

  constructor(
    materials: RuneAltarMaterials,
    hooks: RuneAltarHooks,
  ) {
    this.hooks = hooks;
    addCylinder(
      this.object,
      1.25,
      1.5,
      0.4,
      10,
      [0, 0.2, 0],
      materials.stone,
    );
    addCylinder(
      this.rotor,
      0.95,
      1.1,
      0.42,
      10,
      [0, 0.6, 0],
      materials.moss,
    );
    for (let index = 0; index < 3; index += 1) {
      const angle = (index / 3) * Math.PI * 2;
      const tooth = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.08, 0.32),
        materials.brass,
      );
      tooth.position.set(
        Math.cos(angle) * 0.78,
        0.83,
        Math.sin(angle) * 0.78,
      );
      tooth.rotation.y = -angle;
      this.rotor.add(tooth);
    }
    this.object.add(this.rotor);

    this.crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.32, 0),
      materials.cyan,
    );
    this.crystal.position.y = 1.3;
    this.crystal.castShadow = true;
    this.rotor.add(this.crystal);

    this.outerRing = this.createOrbitRing(
      0.88,
      0.92,
      materials.cyan.color,
      3,
    );
    this.innerRing = this.createOrbitRing(
      0.59,
      1.06,
      materials.amber.color,
      4,
    );

    const beaconMaterial = new THREE.MeshBasicMaterial({
      color: materials.cyan.color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.82, 3.4, 12, 1, true),
      beaconMaterial,
    );
    this.beacon.position.y = 3.05;
    this.beacon.visible = false;
    this.beacon.renderOrder = 4;
    this.object.add(this.beacon);

    const flareMaterial = new THREE.MeshBasicMaterial({
      color: 0xbffaff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.flare = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 12, 8),
      flareMaterial,
    );
    this.flare.position.y = this.crystal.position.y;
    this.flare.visible = false;
    this.flare.renderOrder = 5;
    this.object.add(this.flare);

    const informationBeamMaterial = new THREE.MeshBasicMaterial({
      color: 0x65efff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.informationBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.13, 1, 8, 1, true),
      informationBeamMaterial,
    );
    this.informationBeam.visible = false;
    this.informationBeam.frustumCulled = false;
    this.informationBeam.renderOrder = 6;
    this.object.add(this.informationBeam);

    this.informationCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.034, 1, 6, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xe8ffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    this.informationCore.visible = false;
    this.informationCore.frustumCulled = false;
    this.informationCore.renderOrder = 7;
    this.object.add(this.informationCore);

    const informationPacketCount = 9;
    this.informationPackets = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.075, 0.16, 0.028),
      new THREE.MeshBasicMaterial({
        color: 0xbffaff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      informationPacketCount,
    );
    this.informationPackets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.informationPackets.visible = false;
    this.informationPackets.frustumCulled = false;
    this.informationPackets.renderOrder = 8;
    this.object.add(this.informationPackets);

    this.informationTargetFlare = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 10, 7),
      new THREE.MeshBasicMaterial({
        color: 0xdfffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    this.informationTargetFlare.visible = false;
    this.informationTargetFlare.frustumCulled = false;
    this.informationTargetFlare.renderOrder = 9;
    this.object.add(this.informationTargetFlare);

    this.informationTargetLight = new THREE.PointLight(
      materials.cyan.color,
      0,
      4.5,
      2,
    );
    this.object.add(this.informationTargetLight);

    this.light = new THREE.PointLight(materials.cyan.color, 0, 7.5, 2);
    this.light.position.y = 2;
    this.object.add(this.light);
    this.warmupVisuals = [
      this.beacon,
      this.flare,
      this.informationBeam,
      this.informationCore,
      this.informationPackets,
      this.informationTargetFlare,
    ];
  }

  setQuality(quality: QualityTier): void {
    this.visualWarmupFrames = 2;
    this.lightingEnabled = quality !== "low";
    this.light.visible = this.lightingEnabled;
    // Light visibility determines NUM_POINT_LIGHTS, even at zero intensity.
    // Adding the beam's target light at the flash recompiles the Falls' lit
    // materials in that frame. Keep both slots stable for the quality tier;
    // the animation owns intensity, never light registration.
    this.informationTargetLight.visible = this.lightingEnabled;
    if (!this.lightingEnabled) {
      this.light.intensity = 0;
      this.informationTargetLight.intensity = 0;
    }
  }

  hasActiveMotion(): boolean {
    // The held portal still turns at the normal 30 FPS overlay cadence.
    // Only its short opening and closing transitions request 60 FPS.
    return (
      this.phase === "opening" ||
      this.phase === "transmitting" ||
      this.phase === "closing"
    );
  }

  activate(reducedMotion: boolean): void {
    if (this.phase !== "idle") {
      this.hooks.onStatus(
        "Stone rings gather speed beneath the river-song. The crown is nearly awake.",
      );
      return;
    }
    this.hooks.onPreparePortfolio();
    this.phase = "opening";
    this.age = 0;
    this.duration = reducedMotion ? 0.42 : this.hasRevealed ? 0.95 : 1.5;
    this.hooks.onStatus(
      this.hasRevealed
        ? "The monument remembers the path. Cyan light gathers quickly between its turning rings."
        : "Something catches beneath the moss. The monument's crown begins to turn.",
    );
  }

  releasePortfolio(reducedMotion: boolean): void {
    if (this.phase !== "holding") return;
    this.phase = "closing";
    this.age = 0;
    this.duration = reducedMotion ? 0.24 : 1.05;
  }

  update(delta: number, elapsed: number, reducedMotion: boolean): void {
    for (const { mesh, frustumCulled } of this.warmedVisuals) {
      mesh.visible = false;
      mesh.frustumCulled = frustumCulled;
    }
    this.warmedVisuals.length = 0;
    this.updateAnimation(delta, elapsed, reducedMotion);

    if (this.visualWarmupFrames <= 0) return;
    this.visualWarmupFrames -= 1;
    // Submit the actual effect buffers during entry, not their first flash.
    // Zero opacity/depthWrite and zero packet instances make these frames
    // invisible while Three initializes programs and buffer bindings. Restore
    // hidden-idle state before the next animation update, even if activated
    // immediately after mounting or while changing quality.
    for (const mesh of this.warmupVisuals) {
      if (mesh.visible) continue;
      this.warmedVisuals.push({ mesh, frustumCulled: mesh.frustumCulled });
      mesh.frustumCulled = false;
      mesh.visible = true;
      mesh.material.opacity = 0;
      if (mesh === this.informationPackets) this.informationPackets.count = 0;
    }
  }

  private updateAnimation(
    delta: number,
    elapsed: number,
    reducedMotion: boolean,
  ): void {
    const motionScale = reducedMotion ? 0.22 : 1;
    if (this.phase === "idle") {
      this.updateIdle(delta, elapsed, motionScale);
      return;
    }
    if (this.phase === "holding") {
      this.updateSustainedActive(delta, elapsed, motionScale, 1);
      this.updateInformationBeam(elapsed, motionScale, 0.48, 0, 1);
      return;
    }
    if (this.phase === "transmitting") {
      this.age = Math.min(this.duration, this.age + delta);
      const progress = THREE.MathUtils.clamp(this.age / this.duration, 0, 1);
      const strength = THREE.MathUtils.smoothstep(progress, 0, 0.18);
      const surge = Math.exp(-Math.pow((progress - 0.76) / 0.17, 2));
      const reach = THREE.MathUtils.smoothstep(progress, 0.04, 0.84);
      this.updateSustainedActive(delta, elapsed, motionScale, 1);
      this.updateInformationBeam(
        elapsed,
        motionScale,
        strength,
        reducedMotion ? surge * 0.42 : surge,
        reach,
      );
      if (progress >= 0.9) {
        this.phase = "holding";
        this.hooks.onRevealPortfolio();
      }
      return;
    }
    if (this.phase === "closing") {
      this.age = Math.min(this.duration, this.age + delta);
      const progress = THREE.MathUtils.clamp(this.age / this.duration, 0, 1);
      const strength =
        1 - THREE.MathUtils.smoothstep(progress, 0.02, 0.98);
      this.updateSustainedActive(
        delta,
        elapsed,
        motionScale,
        strength,
      );
      this.updateInformationBeam(
        elapsed,
        motionScale,
        strength * 0.48,
        0,
        1,
      );
      if (progress >= 1) {
        this.phase = "idle";
        this.hideInformationBeam();
      }
      return;
    }

    this.age = Math.min(this.duration, this.age + delta);
    const progress = THREE.MathUtils.clamp(this.age / this.duration, 0, 1);
    const spinUp = THREE.MathUtils.smoothstep(progress, 0.02, 0.68);
    const fadeOut = 1 - THREE.MathUtils.smoothstep(progress, 0.78, 1);
    const glow =
      THREE.MathUtils.smoothstep(progress, 0, 0.2) * Math.max(0, fadeOut);
    const flash = Math.exp(-Math.pow((progress - 0.72) / 0.105, 2));

    this.rotor.rotation.y += delta * (0.8 + spinUp * 13) * motionScale;
    this.outerRing.rotation.y +=
      delta * (2.4 + spinUp * 17) * motionScale;
    this.innerRing.rotation.y -=
      delta * (1.8 + spinUp * 13) * motionScale;
    this.crystal.rotation.y += delta * (2.2 + spinUp * 11) * motionScale;
    this.crystal.rotation.x += delta * spinUp * 2.2 * motionScale;
    this.crystal.position.y =
      1.3 +
      spinUp * 0.56 +
      Math.sin(elapsed * 12 * motionScale) * 0.045 * motionScale;
    this.crystal.scale.setScalar(1 + spinUp * 0.08 + flash * 0.34);

    this.glowMaterials.forEach((material, index) => {
      material.opacity = glow * (index === 0 ? 0.9 : 0.74) + flash * 0.2;
    });
    this.beacon.visible = glow > 0.01;
    this.beacon.material.opacity = glow * 0.1 + flash * 0.13;
    this.beacon.scale.set(
      0.78 + spinUp * 0.22,
      0.82 + spinUp * 0.18,
      0.78 + spinUp * 0.22,
    );
    this.flare.visible = glow > 0.01;
    this.flare.position.y = this.crystal.position.y;
    this.flare.scale.setScalar(0.55 + spinUp * 0.7 + flash * 1.8);
    this.flare.material.opacity = glow * 0.08 + flash * 0.32;
    this.light.intensity = this.lightingEnabled
      ? glow * 2.4 + flash * 7.5
      : 0;

    if (progress >= 0.72) {
      const returningLink = this.hasRevealed;
      this.phase = "transmitting";
      this.hasRevealed = true;
      this.age = 0;
      this.duration = reducedMotion ? 0.14 : returningLink ? 0.42 : 0.64;
      this.hooks.onStatus(
        "At the crown's apex, a cipher-stream leaps toward your eyes.",
      );
    }
  }

  private createOrbitRing(
    radius: number,
    y: number,
    color: THREE.ColorRepresentation,
    markerCount: number,
  ): THREE.Group {
    const ring = new THREE.Group();
    ring.position.y = y;
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.045,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.glowMaterials.push(material);
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.025, 4, 24),
      material,
    );
    band.rotation.x = Math.PI / 2;
    ring.add(band);
    for (let index = 0; index < markerCount; index += 1) {
      const angle = (index / markerCount) * Math.PI * 2;
      const marker = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.075, 0),
        material,
      );
      marker.position.set(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius,
      );
      ring.add(marker);
    }
    this.object.add(ring);
    return ring;
  }

  private updateSustainedActive(
    delta: number,
    elapsed: number,
    motionScale: number,
    strength: number,
  ): void {
    const active = THREE.MathUtils.clamp(strength, 0, 1);
    const idleWave =
      Math.sin(elapsed * 1.8 * motionScale + 2) * 0.12 * motionScale;
    const activeWave =
      Math.sin(elapsed * 8 * motionScale) * 0.045 * motionScale;

    this.rotor.rotation.y +=
      delta * THREE.MathUtils.lerp(0.035, 13.6, active) * motionScale;
    this.outerRing.rotation.y +=
      delta * THREE.MathUtils.lerp(0.05, 19.4, active) * motionScale;
    this.innerRing.rotation.y -=
      delta * THREE.MathUtils.lerp(0.04, 14.8, active) * motionScale;
    this.crystal.rotation.y +=
      delta * THREE.MathUtils.lerp(0.55, 12.2, active) * motionScale;
    this.crystal.rotation.x += delta * active * 2.2 * motionScale;
    this.crystal.position.y =
      1.3 +
      THREE.MathUtils.lerp(idleWave, 0.56 + activeWave, active);
    this.crystal.scale.setScalar(1 + active * 0.1);

    this.glowMaterials.forEach((material, index) => {
      material.opacity = THREE.MathUtils.lerp(
        0.045,
        index === 0 ? 0.9 : 0.74,
        active,
      );
    });
    this.beacon.visible = active > 0.01;
    this.beacon.material.opacity = active * 0.11;
    this.beacon.scale.set(
      0.78 + active * 0.22,
      0.82 + active * 0.18,
      0.78 + active * 0.22,
    );
    this.flare.visible = active > 0.01;
    this.flare.position.y = this.crystal.position.y;
    this.flare.scale.setScalar(
      0.55 +
        active *
          (0.86 +
            (motionScale < 1 ? 0 : Math.sin(elapsed * 4.2) * 0.08)),
    );
    this.flare.material.opacity = active * 0.13;
    this.light.intensity = this.lightingEnabled ? active * 2.8 : 0;
  }

  private updateIdle(
    delta: number,
    elapsed: number,
    motionScale: number,
  ): void {
    this.crystal.position.y =
      1.3 + Math.sin(elapsed * 1.8 * motionScale + 2) * 0.12 * motionScale;
    this.crystal.rotation.y += delta * 0.55 * motionScale;
    this.rotor.rotation.y += delta * 0.035 * motionScale;
    this.outerRing.rotation.y += delta * 0.05 * motionScale;
    this.innerRing.rotation.y -= delta * 0.04 * motionScale;
    this.crystal.scale.setScalar(1);
    for (const material of this.glowMaterials) material.opacity = 0.045;
    this.beacon.visible = false;
    this.beacon.material.opacity = 0;
    this.flare.visible = false;
    this.flare.material.opacity = 0;
    this.light.intensity = 0;
    this.hideInformationBeam();
  }

  private updateInformationBeam(
    elapsed: number,
    motionScale: number,
    strength: number,
    surge: number,
    reach: number,
  ): void {
    const active = THREE.MathUtils.clamp(strength, 0, 1);
    if (active <= 0.002) {
      this.hideInformationBeam();
      return;
    }

    this.informationSourceWorld.set(0, 0.22, 0);
    this.crystal.localToWorld(this.informationSourceWorld);
    this.hooks.getRevealTarget(this.informationTargetWorld);
    this.object.worldToLocal(
      this.informationSourceLocal.copy(this.informationSourceWorld),
    );
    this.object.worldToLocal(
      this.informationTargetLocal.copy(this.informationTargetWorld),
    );
    this.informationReachedTargetLocal.lerpVectors(
      this.informationSourceLocal,
      this.informationTargetLocal,
      THREE.MathUtils.clamp(reach, 0, 1),
    );

    const length = this.informationDirection
      .subVectors(
        this.informationReachedTargetLocal,
        this.informationSourceLocal,
      )
      .length();
    if (length < 0.05) {
      this.hideInformationBeam();
      return;
    }
    this.informationDirection.multiplyScalar(1 / length);
    this.informationMidpoint
      .addVectors(
        this.informationSourceLocal,
        this.informationReachedTargetLocal,
      )
      .multiplyScalar(0.5);

    this.informationBeam.visible = true;
    this.informationBeam.position.copy(this.informationMidpoint);
    this.informationBeam.quaternion.setFromUnitVectors(
      this.informationUp,
      this.informationDirection,
    );
    this.informationBeam.scale.set(1 + surge * 0.75, length, 1 + surge * 0.75);
    this.informationBeam.material.opacity =
      active * (0.16 + surge * 0.24);

    this.informationCore.visible = true;
    this.informationCore.position.copy(this.informationMidpoint);
    this.informationCore.quaternion.copy(this.informationBeam.quaternion);
    this.informationCore.scale.set(1 + surge * 0.45, length, 1 + surge * 0.45);
    this.informationCore.material.opacity =
      active * (0.58 + surge * 0.34);

    this.informationPackets.visible = true;
    this.informationPackets.material.opacity =
      active * (0.62 + surge * 0.3);
    // Entry warmup submits a zero-instance draw. Transmission restores the
    // existing buffer's capacity before writing packets or calculating travel.
    const packetCount = this.informationPackets.instanceMatrix.count;
    this.informationPackets.count = packetCount;
    const travelSpeed = 0.72 + motionScale * 1.18;
    for (let index = 0; index < packetCount; index += 1) {
      const travel =
        (elapsed * travelSpeed + index / packetCount) % 1;
      const streamPosition = 0.05 + travel * 0.9;
      this.informationPacketDummy.position.lerpVectors(
        this.informationSourceLocal,
        this.informationReachedTargetLocal,
        streamPosition,
      );
      this.informationPacketDummy.quaternion.copy(
        this.informationBeam.quaternion,
      );
      const packetPulse =
        0.72 +
        Math.sin(elapsed * 15 * motionScale + index * 2.4) * 0.22;
      this.informationPacketDummy.scale.setScalar(
        active * packetPulse * (1 + surge * 0.5),
      );
      this.informationPacketDummy.updateMatrix();
      this.informationPackets.setMatrixAt(
        index,
        this.informationPacketDummy.matrix,
      );
    }
    this.informationPackets.instanceMatrix.needsUpdate = true;

    this.informationTargetFlare.visible = true;
    this.informationTargetFlare.position.copy(
      this.informationReachedTargetLocal,
    );
    this.informationTargetFlare.scale.setScalar(
      0.72 + active * 0.38 + surge * 1.05,
    );
    this.informationTargetFlare.material.opacity =
      active * (0.08 + surge * 0.25);

    this.informationTargetLight.position.copy(
      this.informationReachedTargetLocal,
    );
    this.informationTargetLight.intensity = this.lightingEnabled
      ? active * (1.2 + surge * 7.2)
      : 0;
  }

  private hideInformationBeam(): void {
    this.informationBeam.visible = false;
    this.informationBeam.material.opacity = 0;
    this.informationCore.visible = false;
    this.informationCore.material.opacity = 0;
    this.informationPackets.visible = false;
    this.informationPackets.material.opacity = 0;
    this.informationTargetFlare.visible = false;
    this.informationTargetFlare.material.opacity = 0;
    this.informationTargetLight.intensity = 0;
  }
}
