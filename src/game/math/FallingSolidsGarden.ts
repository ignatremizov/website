import * as THREE from "three";
import type {
  MathQualityTier,
  MathTravelingBody,
  MightymaticaZoneContext,
} from "./types";

interface FallingSolid {
  type: number;
  slot: number;
  color: number;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: number;
  speed: number;
  phase: number;
  held: boolean;
  releaseAge: number;
  releaseVelocity: THREE.Vector3;
  dissolveAge: number;
  dissolveDuration: number;
  rematerializeAge: number;
  relocationAge: number;
  relocationDuration: number;
  relocationArc: number;
  relocationStart: THREE.Vector3;
  relocationTarget: THREE.Vector3;
  relocationStartRotation: THREE.Euler;
  relocationTargetRotation: THREE.Euler;
}

interface GlitchFragment {
  active: boolean;
  age: number;
  lifetime: number;
  phase: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

const bucketColors = [
  0x55dce8,
  0xff7183,
  0xffbd55,
  0x8bd77c,
  0xa889ff,
] as const;
const maximumPerType = 8;
const maximumGlitchFragments = 72;
const rematerializeDuration = 0.24;
const escapeHalfWidth = 8.2;
const escapeHalfDepth = 7.2;
const solidPickLayer = 6;
const solidPickRadius = 0.58;
const solidPickBroadPhaseRadius = 24;
const waveRelocationBaseDuration = 0.86;

export class FallingSolidsGarden {
  private readonly context: MightymaticaZoneContext;
  private readonly getTravelingOrb: () => MathTravelingBody | null;
  private readonly group = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly outlineMeshes: THREE.InstancedMesh[] = [];
  private readonly pickMeshes: THREE.InstancedMesh[] = [];
  private readonly solids: FallingSolid[] = [];
  private readonly glitchMesh: THREE.InstancedMesh<
    THREE.BoxGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly glitchFragments: GlitchFragment[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly dragLocalPoint = new THREE.Vector3();
  private readonly orbLocalPoint = new THREE.Vector3();
  private readonly orbPreviousLocalPoint = new THREE.Vector3();
  private readonly glitchColor = new THREE.Color();
  private activePerType = 5;
  private activeGlitchFragments = 0;
  private glitchCursor = 0;
  private wave = 0;
  private orbSweepReady = false;

  constructor(
    context: MightymaticaZoneContext,
    getTravelingOrb: () => MathTravelingBody | null,
  ) {
    this.context = context;
    this.getTravelingOrb = getTravelingOrb;
    this.group.name = "falling-solids-garden";
    this.group.position.set(8.2, 0, -4.6);
    context.root.add(this.group);

    const gardenFloor = new THREE.Mesh(
      new THREE.CylinderGeometry(5.3, 5.7, 0.34, 18),
      new THREE.MeshStandardMaterial({
        color: 0x15252a,
        roughness: 0.94,
        metalness: 0.04,
      }),
    );
    gardenFloor.position.y = -0.15;
    gardenFloor.receiveShadow = true;
    this.group.add(gardenFloor);

    this.glitchMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      maximumGlitchFragments,
    );
    this.glitchMesh.name = "falling-solids-glitch-fragments";
    this.glitchMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.glitchMesh.frustumCulled = false;
    this.glitchMesh.renderOrder = 5;
    this.glitchMesh.visible = false;
    for (let index = 0; index < maximumGlitchFragments; index += 1) {
      this.glitchFragments.push({
        active: false,
        age: 0,
        lifetime: 0,
        phase: index * 0.61,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        rotation: new THREE.Euler(),
        scale: new THREE.Vector3(),
      });
      this.dummy.position.set(0, -100, 0);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.glitchMesh.setMatrixAt(index, this.dummy.matrix);
      this.glitchMesh.setColorAt(index, new THREE.Color(0x55dce8));
    }
    this.glitchMesh.instanceMatrix.needsUpdate = true;
    if (this.glitchMesh.instanceColor) {
      this.glitchMesh.instanceColor.needsUpdate = true;
    }
    this.group.add(this.glitchMesh);

    const geometries: THREE.BufferGeometry[] = [
      new THREE.TetrahedronGeometry(0.42, 0),
      new THREE.BoxGeometry(0.67, 0.67, 0.67),
      new THREE.OctahedronGeometry(0.46, 0),
      new THREE.DodecahedronGeometry(0.42, 0),
      new THREE.IcosahedronGeometry(0.43, 0),
    ];
    const pickGeometry = new THREE.IcosahedronGeometry(
      solidPickRadius,
      0,
    );
    const pickMaterial = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      toneMapped: false,
    });
    for (const [type, geometry] of geometries.entries()) {
      const typeColor = bucketColors[type] ?? bucketColors[0];
      const mesh = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: typeColor,
          toneMapped: false,
          side: THREE.DoubleSide,
        }),
        maximumPerType,
      );
      mesh.name = `falling-platonic-type-${type}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = context.quality !== "low";
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.meshes.push(mesh);

      const outline = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(typeColor).lerp(new THREE.Color(0xffffff), 0.56),
          wireframe: true,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          toneMapped: false,
        }),
        maximumPerType,
      );
      outline.name = `falling-platonic-facets-${type}`;
      outline.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      outline.frustumCulled = false;
      outline.renderOrder = 3;
      this.group.add(outline);
      this.outlineMeshes.push(outline);

      const pickMesh = new THREE.InstancedMesh(
        pickGeometry,
        pickMaterial,
        maximumPerType,
      );
      pickMesh.name = `falling-platonic-pick-volume-${type}`;
      pickMesh.layers.set(solidPickLayer);
      pickMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      pickMesh.frustumCulled = false;
      // InstancedMesh computes this once on first raycast. The solids continue
      // falling afterward, so use a stable garden-wide broad phase instead of
      // allowing each color to retain a different stale spawn-time boundary.
      pickMesh.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(),
        solidPickBroadPhaseRadius,
      );
      this.group.add(pickMesh);
      this.pickMeshes.push(pickMesh);

      for (let slot = 0; slot < maximumPerType; slot += 1) {
        const solid: FallingSolid = {
          type,
          slot,
          color: type,
          position: new THREE.Vector3(),
          rotation: new THREE.Euler(),
          scale: 0.72 + ((slot * 17 + type * 11) % 7) * 0.055,
          speed: 0.75,
          phase: slot * 0.73 + type * 1.17,
          held: false,
          releaseAge: 0,
          releaseVelocity: new THREE.Vector3(),
          dissolveAge: -1,
          dissolveDuration: 0,
          rematerializeAge: rematerializeDuration,
          relocationAge: 0,
          relocationDuration: 0,
          relocationArc: 0,
          relocationStart: new THREE.Vector3(),
          relocationTarget: new THREE.Vector3(),
          relocationStartRotation: new THREE.Euler(),
          relocationTargetRotation: new THREE.Euler(),
        };
        this.solids.push(solid);
        this.resetSolid(solid, true);
      }

      context.registerInstanceDrag({
        object: pickMesh,
        getWorldPosition: (instanceId, target) => {
          const solid = this.getSolid(type, instanceId);
          if (!solid) return target.set(0, -100, 0);
          target.copy(solid.position);
          return this.group.localToWorld(target);
        },
        onStart: (instanceId) => {
          const solid = this.getSolid(type, instanceId);
          if (!solid) return;
          solid.held = true;
          solid.releaseAge = 0;
          solid.dissolveAge = -1;
          solid.rematerializeAge = rematerializeDuration;
          solid.relocationDuration = 0;
          solid.releaseVelocity.set(0, 0, 0);
        },
        onMove: (instanceId, worldPosition, worldVelocity) => {
          const solid = this.getSolid(type, instanceId);
          if (!solid || solid.dissolveAge >= 0) return;
          this.dragLocalPoint.copy(worldPosition);
          this.group.worldToLocal(this.dragLocalPoint);
          solid.position.copy(this.dragLocalPoint);
          solid.releaseVelocity.copy(worldVelocity);
          if (this.isOutsideEscapeBounds(solid.position)) {
            this.beginGlitchDissolve(solid);
          }
          this.updateMatrices();
        },
        onEnd: (instanceId, worldVelocity) => {
          const solid = this.getSolid(type, instanceId);
          if (!solid || solid.dissolveAge >= 0) return;
          solid.held = false;
          const planarSpeed = Math.hypot(
            worldVelocity.x,
            worldVelocity.z,
          );
          solid.releaseVelocity.copy(worldVelocity);
          solid.releaseVelocity.y =
            0.9 + Math.min(2.8, planarSpeed * 0.2);
          solid.releaseAge = 2.8;
          if (this.isOutsideEscapeBounds(solid.position)) {
            this.beginGlitchDissolve(solid);
          }
        },
      });
    }

    for (const [index, color] of bucketColors.entries()) {
      const x = -4.2 + index * 2.1;
      const bucketMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.74,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const bucket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.88, 0.62, 0.9, 14, 1, true),
        bucketMaterial,
      );
      bucket.position.set(x, 0.52, 2.85);
      this.group.add(bucket);
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.88, 0.075, 5, 18),
        new THREE.MeshBasicMaterial({ color, toneMapped: false }),
      );
      rim.position.set(x, 0.98, 2.85);
      rim.rotation.x = Math.PI / 2;
      this.group.add(rim);
    }

    const canopy = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(9.8, 8.2, 9.2)),
      new THREE.LineBasicMaterial({
        color: 0x79dce7,
        transparent: true,
        opacity: 0.28,
      }),
    );
    canopy.position.y = 4.25;
    this.group.add(canopy);

    context.addInteraction({
      id: "math-falling-solids",
      label: "Release a gentle solids wave",
      x: this.group.position.x,
      z: this.group.position.z,
      radius: 3.7,
      action: () => this.triggerWave(true),
    });
    this.setQuality(context.quality);
  }

  update(delta: number, elapsed: number): void {
    const travelingOrb = this.getTravelingOrb();
    const orbEnabled = travelingOrb?.enabled === true;
    const orbBucketIndex =
      orbEnabled && travelingOrb
        ? this.getOrbBucketIndex(travelingOrb)
        : -1;
    const orbCollisionActive =
      orbEnabled &&
      (travelingOrb?.held === true || orbBucketIndex >= 0);
    if (!orbEnabled) {
      this.orbSweepReady = false;
    } else if (!this.orbSweepReady) {
      this.orbPreviousLocalPoint.copy(this.orbLocalPoint);
      this.orbSweepReady = true;
    }
    for (const solid of this.solids) {
      if (solid.slot >= this.activePerType) continue;
      solid.rematerializeAge = Math.min(
        rematerializeDuration,
        solid.rematerializeAge + delta,
      );
      if (solid.dissolveAge >= 0) {
        solid.dissolveAge = Math.min(
          solid.dissolveDuration,
          solid.dissolveAge + delta,
        );
        solid.position.addScaledVector(
          solid.releaseVelocity,
          delta * 0.28,
        );
        solid.releaseVelocity.multiplyScalar(Math.exp(-delta * 4.8));
        solid.rotation.x += delta * 3.4;
        solid.rotation.y += delta * 5.1;
        solid.rotation.z += delta * 2.7;
        if (solid.dissolveAge >= solid.dissolveDuration) {
          this.resetSolid(solid, false);
        }
        continue;
      }
      if (solid.relocationDuration > 0) {
        this.updateSolidRelocation(solid, delta);
        continue;
      }
      if (solid.held) {
        if (!this.context.reducedMotion) {
          solid.rotation.y += delta * 1.4;
          solid.rotation.z += delta * 0.52;
        }
        continue;
      }
      if (solid.releaseAge > 0) {
        solid.releaseAge = Math.max(0, solid.releaseAge - delta);
        solid.position.addScaledVector(solid.releaseVelocity, delta);
        solid.releaseVelocity.y -= 5.6 * delta;
        const releaseDamping = Math.exp(-delta * 1.35);
        solid.releaseVelocity.x *= releaseDamping;
        solid.releaseVelocity.z *= releaseDamping;
        solid.rotation.x += delta * (1.2 + Math.abs(solid.releaseVelocity.z));
        solid.rotation.y += delta * (1.4 + Math.abs(solid.releaseVelocity.x));
        if (
          solid.position.y < 0.58 ||
          solid.releaseAge <= 0 ||
          this.isOutsideEscapeBounds(solid.position)
        ) {
          this.beginGlitchDissolve(solid);
        }
        continue;
      }
      if (
        orbCollisionActive &&
        travelingOrb &&
        this.resolveOrbCollision(solid, travelingOrb)
      ) {
        continue;
      }
      if (this.context.reducedMotion) continue;
      const targetX = -4.2 + solid.color * 2.1;
      solid.position.y -= solid.speed * delta;
      const sorting = THREE.MathUtils.smoothstep(6.3 - solid.position.y, 0.8, 5.8);
      solid.position.x = THREE.MathUtils.lerp(
        solid.position.x,
        targetX,
        Math.min(1, delta * (0.35 + sorting * 1.45)),
      );
      solid.position.z = THREE.MathUtils.lerp(
        solid.position.z,
        2.85,
        Math.min(1, delta * (0.22 + sorting * 1.2)),
      );
      solid.position.x += Math.sin(elapsed * 0.85 + solid.phase) * delta * 0.09;
      solid.rotation.x += delta * (0.45 + solid.type * 0.08);
      solid.rotation.y += delta * (0.62 + solid.slot * 0.025);
      solid.rotation.z += delta * 0.28;
      if (solid.position.y < 1.05) this.resetSolid(solid, false);
    }
    if (orbEnabled) {
      this.orbPreviousLocalPoint.copy(this.orbLocalPoint);
    }
    this.updateMatrices();
    this.updateGlitchFragments(delta, elapsed);
  }

  setQuality(quality: MathQualityTier): void {
    this.activePerType = quality === "low" ? 3 : quality === "medium" ? 5 : 8;
    for (const mesh of this.meshes) {
      mesh.count = this.activePerType;
      mesh.castShadow = quality === "high";
    }
    for (const outline of this.outlineMeshes) {
      outline.count = this.activePerType;
    }
    for (const pickMesh of this.pickMeshes) {
      pickMesh.count = this.activePerType;
    }
    this.updateMatrices();
  }

  hasActiveMotion(): boolean {
    return (
      this.activeGlitchFragments > 0 ||
      this.solids.some(
        (solid) =>
          solid.slot < this.activePerType &&
          (solid.held ||
            solid.releaseAge > 0 ||
            solid.dissolveAge >= 0 ||
            solid.relocationDuration > 0 ||
            solid.rematerializeAge < rematerializeDuration),
      )
    );
  }

  triggerWave(announce: boolean): void {
    this.wave += 1;
    this.clearGlitchFragments();
    for (const solid of this.solids) {
      if (solid.slot >= this.activePerType) {
        this.resetSolid(solid, false);
        solid.rematerializeAge = rematerializeDuration;
        continue;
      }
      if (solid.held) continue;
      if (this.context.reducedMotion) {
        this.resetSolid(solid, false);
      } else {
        this.beginSolidRelocation(solid);
      }
    }
    this.updateMatrices();
    if (announce) {
      this.context.onStatus(
        this.context.reducedMotion
          ? "The Platonic solids settle directly into their colored vessels. Ambient falling is paused by reduced-motion preference."
          : "The solids lift into a new seeded wave. Color draws each one toward a matching vessel; there is no timer and no failure state.",
      );
    }
  }

  triggerGlitchWave(): void {
    this.wave += 1;
    this.clearGlitchFragments();
    for (const solid of this.solids) {
      if (solid.slot >= this.activePerType) {
        this.resetSolid(solid, false);
        solid.rematerializeAge = rematerializeDuration;
        continue;
      }
      if (solid.held) continue;
      const seed = this.getSolidSeed(solid);
      const direction = seed * 0.117 + solid.phase;
      solid.relocationDuration = 0;
      solid.dissolveAge = -1;
      solid.releaseVelocity.set(
        Math.cos(direction) * (0.28 + (solid.slot % 3) * 0.08),
        0.34 + (solid.type % 3) * 0.09,
        Math.sin(direction) * (0.24 + (solid.type % 2) * 0.08),
      );
      this.beginGlitchDissolve(solid);
    }
    this.updateMatrices();
  }

  private resetSolid(solid: FallingSolid, initial: boolean): void {
    const seed = this.getSolidSeed(solid);
    this.writeSpawnPosition(solid, initial, solid.position);
    this.writeSpawnRotation(seed, solid.rotation);
    solid.speed = this.getSolidSpeed(seed);
    solid.releaseAge = 0;
    solid.dissolveAge = -1;
    solid.dissolveDuration = 0;
    solid.rematerializeAge =
      initial || this.context.reducedMotion ? rematerializeDuration : 0;
    solid.relocationAge = 0;
    solid.relocationDuration = 0;
    solid.relocationArc = 0;
    solid.releaseVelocity.set(0, 0, 0);
  }

  private beginSolidRelocation(solid: FallingSolid): void {
    const seed = this.getSolidSeed(solid);
    solid.relocationStart.copy(solid.position);
    solid.relocationStartRotation.copy(solid.rotation);
    this.writeSpawnPosition(solid, false, solid.relocationTarget);
    this.writeSpawnRotation(seed, solid.relocationTargetRotation);
    solid.relocationAge =
      -((solid.slot * 3 + solid.type * 2) % 6) * 0.035;
    solid.relocationDuration =
      waveRelocationBaseDuration +
      ((seed * 19) % 7) * 0.045;
    solid.relocationArc =
      0.9 + ((seed * 23) % 9) * 0.11;
    solid.speed = this.getSolidSpeed(seed);
    solid.releaseAge = 0;
    solid.dissolveAge = -1;
    solid.dissolveDuration = 0;
    solid.rematerializeAge = rematerializeDuration;
    solid.releaseVelocity.set(0, 0, 0);
  }

  private updateSolidRelocation(
    solid: FallingSolid,
    delta: number,
  ): void {
    solid.relocationAge += delta;
    if (solid.relocationAge < 0) return;
    const progress = THREE.MathUtils.clamp(
      solid.relocationAge / solid.relocationDuration,
      0,
      1,
    );
    const eased = THREE.MathUtils.smoothstep(progress, 0, 1);
    solid.position.lerpVectors(
      solid.relocationStart,
      solid.relocationTarget,
      eased,
    );
    const arc = Math.sin(progress * Math.PI);
    solid.position.y += arc * solid.relocationArc;
    const travelX =
      solid.relocationTarget.x - solid.relocationStart.x;
    const travelZ =
      solid.relocationTarget.z - solid.relocationStart.z;
    const inverseTravel = 1 / Math.max(0.001, Math.hypot(travelX, travelZ));
    const sideways =
      arc *
      (solid.slot % 2 === 0 ? 1 : -1) *
      (0.22 + solid.type * 0.035);
    solid.position.x += -travelZ * inverseTravel * sideways;
    solid.position.z += travelX * inverseTravel * sideways;
    solid.rotation.set(
      THREE.MathUtils.lerp(
        solid.relocationStartRotation.x,
        solid.relocationTargetRotation.x,
        eased,
      ) + arc * (0.72 + solid.type * 0.08),
      THREE.MathUtils.lerp(
        solid.relocationStartRotation.y,
        solid.relocationTargetRotation.y,
        eased,
      ) + arc * (solid.slot % 2 === 0 ? 1.2 : -1.2),
      THREE.MathUtils.lerp(
        solid.relocationStartRotation.z,
        solid.relocationTargetRotation.z,
        eased,
      ) + arc * 0.54,
    );
    if (progress < 1) return;
    solid.position.copy(solid.relocationTarget);
    solid.rotation.copy(solid.relocationTargetRotation);
    solid.relocationDuration = 0;
    solid.relocationAge = 0;
  }

  private getSolidSeed(solid: FallingSolid): number {
    return this.wave * 97 + solid.type * 31 + solid.slot * 17;
  }

  private writeSpawnPosition(
    solid: FallingSolid,
    initial: boolean,
    target: THREE.Vector3,
  ): void {
    const seed = this.getSolidSeed(solid);
    const spread = ((seed * 47) % 101) / 100;
    target.set(
      -4.1 + spread * 8.2,
      this.context.reducedMotion
        ? 1.14 + solid.slot * 0.12
        : (initial ? 2.2 : 7.6) + ((seed * 29) % 41) * 0.11,
      -2.7 + (((seed * 67) % 101) / 100) * 3.3,
    );
    if (this.context.reducedMotion) {
      target.x = -4.2 + solid.color * 2.1;
      target.z = 2.85;
    }
  }

  private writeSpawnRotation(seed: number, target: THREE.Euler): void {
    target.set(seed * 0.07, seed * 0.11, seed * 0.05);
  }

  private getSolidSpeed(seed: number): number {
    return 0.72 + ((seed * 13) % 19) * 0.038;
  }

  private isOutsideEscapeBounds(position: THREE.Vector3): boolean {
    return (
      Math.abs(position.x) > escapeHalfWidth ||
      Math.abs(position.z) > escapeHalfDepth
    );
  }

  private getOrbBucketIndex(orb: MathTravelingBody): number {
    this.orbLocalPoint.copy(orb.position);
    this.group.worldToLocal(this.orbLocalPoint);
    const bucketIndex = Math.round((this.orbLocalPoint.x + 4.2) / 2.1);
    if (bucketIndex < 0 || bucketIndex >= bucketColors.length) return -1;
    const bucketX = -4.2 + bucketIndex * 2.1;
    return Math.abs(this.orbLocalPoint.x - bucketX) <= 0.78 &&
      Math.abs(this.orbLocalPoint.z - 2.85) <= 0.78 &&
      this.orbLocalPoint.y >= 0.32 &&
      this.orbLocalPoint.y <= 1.78
      ? bucketIndex
      : -1;
  }

  private resolveOrbCollision(
    solid: FallingSolid,
    orb: MathTravelingBody,
  ): boolean {
    const solidRadius = solid.scale * 0.46;
    let contactX = this.orbLocalPoint.x;
    let contactY = this.orbLocalPoint.y;
    let contactZ = this.orbLocalPoint.z;
    const sweepX = this.orbLocalPoint.x - this.orbPreviousLocalPoint.x;
    const sweepY = this.orbLocalPoint.y - this.orbPreviousLocalPoint.y;
    const sweepZ = this.orbLocalPoint.z - this.orbPreviousLocalPoint.z;
    if (orb.held && this.orbSweepReady) {
      const sweepLengthSquared =
        sweepX * sweepX + sweepY * sweepY + sweepZ * sweepZ;
      if (sweepLengthSquared > 0.0001) {
        const projected =
          ((solid.position.x - this.orbPreviousLocalPoint.x) * sweepX +
            (solid.position.y - this.orbPreviousLocalPoint.y) * sweepY +
            (solid.position.z - this.orbPreviousLocalPoint.z) * sweepZ) /
          sweepLengthSquared;
        const sweepProgress = THREE.MathUtils.clamp(projected, 0, 1);
        contactX = this.orbPreviousLocalPoint.x + sweepX * sweepProgress;
        contactY = this.orbPreviousLocalPoint.y + sweepY * sweepProgress;
        contactZ = this.orbPreviousLocalPoint.z + sweepZ * sweepProgress;
      }
    }
    const dx = solid.position.x - contactX;
    const dy = solid.position.y - contactY;
    const dz = solid.position.z - contactZ;
    const contact = orb.radius + solidRadius + (orb.held ? 0.12 : 0);
    if (dx * dx + dy * dy + dz * dz > contact * contact) return false;

    const planarDistance = Math.hypot(dx, dz);
    const sweepPlanarDistance = Math.hypot(sweepX, sweepZ);
    const fallbackAngle = solid.phase + solid.slot * 0.61;
    const directionX =
      planarDistance > 0.04
        ? dx / planarDistance
        : sweepPlanarDistance > 0.04
          ? sweepX / sweepPlanarDistance
          : Math.cos(fallbackAngle);
    const directionZ =
      planarDistance > 0.04
        ? dz / planarDistance
        : sweepPlanarDistance > 0.04
          ? sweepZ / sweepPlanarDistance
          : Math.sin(fallbackAngle);
    solid.position.y = Math.max(
      solid.position.y,
      contactY + orb.radius + solidRadius * 0.72,
    );
    solid.releaseVelocity.set(
      directionX * (1.35 + solid.scale * 0.8),
      2.65 + solid.scale * 0.85,
      directionZ * (1.35 + solid.scale * 0.8),
    );
    // Let the solid visibly ricochet before the garden's existing checksum
    // dissolve takes over. This preserves one bounded effect path instead of
    // adding a second fragment system just for the wisdom orb.
    solid.releaseAge = this.context.reducedMotion ? 0.14 : 0.42;
    solid.relocationDuration = 0;
    return true;
  }

  private beginGlitchDissolve(solid: FallingSolid): void {
    if (solid.dissolveAge >= 0) return;
    solid.held = false;
    solid.releaseAge = 0;
    solid.relocationDuration = 0;
    solid.dissolveAge = 0;
    solid.dissolveDuration = this.context.reducedMotion ? 0.2 : 0.58;
    this.emitGlitchFragments(solid);
  }

  private emitGlitchFragments(solid: FallingSolid): void {
    const requestedCount =
      this.activePerType <= 3 ? 7 : this.activePerType <= 5 ? 11 : 16;
    for (let emitted = 0; emitted < requestedCount; emitted += 1) {
      const index = this.glitchCursor;
      this.glitchCursor =
        (this.glitchCursor + 1) % maximumGlitchFragments;
      const fragment = this.glitchFragments[index];
      if (!fragment) continue;
      if (!fragment.active) this.activeGlitchFragments += 1;
      const phase =
        solid.phase +
        emitted * 2.39996 +
        this.wave * 0.71 +
        solid.type * 0.43;
      const stripe = emitted % 3 !== 0;
      fragment.active = true;
      fragment.age = 0;
      fragment.lifetime =
        (this.context.reducedMotion ? 0.2 : 0.34) +
        (emitted % 5) * 0.055;
      fragment.phase = phase;
      fragment.position.set(
        solid.position.x +
          Math.sin(phase * 1.7) * solid.scale * 0.36,
        solid.position.y +
          ((emitted % 6) - 2.5) * solid.scale * 0.13,
        solid.position.z +
          Math.cos(phase * 1.3) * solid.scale * 0.24,
      );
      fragment.velocity.set(
        solid.releaseVelocity.x * 0.14 +
          Math.cos(phase) * (0.32 + (emitted % 4) * 0.09),
        0.12 + (emitted % 5) * 0.1,
        solid.releaseVelocity.z * 0.14 +
          Math.sin(phase) * (0.24 + (emitted % 3) * 0.08),
      );
      fragment.rotation.set(
        stripe ? 0 : phase * 0.17,
        solid.rotation.y + phase * 0.11,
        stripe ? 0 : phase * 0.09,
      );
      fragment.scale.set(
        solid.scale *
          (stripe ? 0.24 + (emitted % 4) * 0.13 : 0.1),
        solid.scale *
          (stripe ? 0.035 + (emitted % 3) * 0.018 : 0.1),
        solid.scale *
          (stripe ? 0.045 + (emitted % 2) * 0.025 : 0.1),
      );
      const color =
        emitted % 4 === 0
          ? 0x55dce8
          : emitted % 4 === 1
            ? 0xff4fc8
            : emitted % 4 === 2
              ? (bucketColors[solid.type] ?? 0xffffff)
              : 0xffffff;
      this.glitchMesh.setColorAt(index, this.glitchColor.setHex(color));
    }
    if (this.glitchMesh.instanceColor) {
      this.glitchMesh.instanceColor.needsUpdate = true;
    }
    this.glitchMesh.visible = this.activeGlitchFragments > 0;
  }

  private updateGlitchFragments(delta: number, elapsed: number): void {
    if (this.activeGlitchFragments <= 0) {
      this.glitchMesh.visible = false;
      return;
    }
    for (const [index, fragment] of this.glitchFragments.entries()) {
      if (!fragment.active) continue;
      fragment.age += delta;
      if (fragment.age >= fragment.lifetime) {
        fragment.active = false;
        this.activeGlitchFragments = Math.max(
          0,
          this.activeGlitchFragments - 1,
        );
        this.dummy.position.set(0, -100, 0);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.glitchMesh.setMatrixAt(index, this.dummy.matrix);
        continue;
      }
      const progress = fragment.age / fragment.lifetime;
      const remaining =
        1 - THREE.MathUtils.smoothstep(progress, 0.34, 1);
      const flicker =
        Math.sin(fragment.age * 66 + fragment.phase * 3.1) > -0.42
          ? 1
          : 0.16;
      fragment.position.addScaledVector(fragment.velocity, delta);
      fragment.velocity.multiplyScalar(Math.exp(-delta * 2.6));
      fragment.rotation.y += delta * 2.8;
      this.dummy.position.copy(fragment.position);
      this.dummy.position.x +=
        Math.sin(elapsed * 31 + fragment.phase) * 0.045 * remaining;
      this.dummy.rotation.copy(fragment.rotation);
      this.dummy.scale.copy(fragment.scale);
      this.dummy.scale.x *=
        remaining *
        flicker *
        (1 + Math.sin(fragment.age * 43 + fragment.phase) * 0.28);
      this.dummy.scale.y *= remaining * flicker;
      this.dummy.scale.z *= remaining * flicker;
      this.dummy.updateMatrix();
      this.glitchMesh.setMatrixAt(index, this.dummy.matrix);
    }
    this.glitchMesh.instanceMatrix.needsUpdate = true;
    this.glitchMesh.visible = this.activeGlitchFragments > 0;
  }

  private clearGlitchFragments(): void {
    for (const [index, fragment] of this.glitchFragments.entries()) {
      fragment.active = false;
      this.dummy.position.set(0, -100, 0);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.glitchMesh.setMatrixAt(index, this.dummy.matrix);
    }
    this.activeGlitchFragments = 0;
    this.glitchMesh.visible = false;
    this.glitchMesh.instanceMatrix.needsUpdate = true;
  }

  private getSolid(type: number, slot: number): FallingSolid | undefined {
    return this.solids[type * maximumPerType + slot];
  }

  private updateMatrices(): void {
    for (const solid of this.solids) {
      if (solid.slot >= this.activePerType) continue;
      const mesh = this.meshes[solid.type];
      if (!mesh) continue;
      this.dummy.position.copy(solid.position);
      this.dummy.rotation.copy(solid.rotation);
      if (solid.dissolveAge >= 0 && solid.dissolveDuration > 0) {
        const progress = solid.dissolveAge / solid.dissolveDuration;
        const remaining =
          1 - THREE.MathUtils.smoothstep(progress, 0.08, 1);
        const flicker =
          Math.sin(progress * 74 + solid.phase * 4.1) > -0.48
            ? 1
            : 0.08;
        this.dummy.position.x +=
          Math.sin(progress * 39 + solid.phase) * 0.11 * remaining;
        this.dummy.scale.set(
          solid.scale *
            remaining *
            flicker *
            (1 + Math.sin(progress * 51) * 0.22),
          solid.scale * remaining * flicker,
          solid.scale *
            remaining *
            flicker *
            (1 - Math.sin(progress * 37) * 0.12),
        );
      } else {
        const rematerialize = THREE.MathUtils.smoothstep(
          solid.rematerializeAge,
          0,
          rematerializeDuration,
        );
        this.dummy.scale.setScalar(solid.scale * rematerialize);
      }
      this.dummy.updateMatrix();
      mesh.setMatrixAt(solid.slot, this.dummy.matrix);
      const pickMesh = this.pickMeshes[solid.type];
      if (pickMesh) {
        pickMesh.setMatrixAt(solid.slot, this.dummy.matrix);
      }
      const outline = this.outlineMeshes[solid.type];
      if (outline) {
        this.dummy.scale.multiplyScalar(1.035);
        this.dummy.updateMatrix();
        outline.setMatrixAt(solid.slot, this.dummy.matrix);
      }
    }
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
    for (const pickMesh of this.pickMeshes) {
      pickMesh.instanceMatrix.needsUpdate = true;
    }
    for (const outline of this.outlineMeshes) {
      outline.instanceMatrix.needsUpdate = true;
    }
  }
}
