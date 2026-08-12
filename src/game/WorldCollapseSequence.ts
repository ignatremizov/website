import * as THREE from "three";
import { disposeObjectTree } from "./sceneResources";
import type { QualityTier, ZoneId } from "../world/WorldContracts";

interface CollapseParticipant {
  object: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  axis: THREE.Vector3;
  angle: number;
  radius: number;
  delay: number;
  turns: number;
  lift: number;
  large: boolean;
  rockLike: boolean;
}

interface TerrainFragment {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  axis: THREE.Vector3;
  size: THREE.Vector3;
  angle: number;
  radius: number;
  delay: number;
  turns: number;
  lift: number;
}

interface TerrainFracture {
  source: THREE.Mesh;
  fragments: TerrainFragment[];
  mesh: THREE.InstancedMesh<
    THREE.CylinderGeometry,
    THREE.MeshStandardMaterial
  >;
  dummy: THREE.Object3D;
}

interface GlassShard {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  axis: THREE.Vector3;
  size: THREE.Vector3;
  angle: number;
  radius: number;
  delay: number;
  turns: number;
  lift: number;
}

interface GlassFracture {
  source: THREE.Mesh;
  shards: GlassShard[];
  mesh: THREE.InstancedMesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  >;
  dummy: THREE.Object3D;
}

export interface WorldCollapseFrame {
  age: number;
  progress: number;
  instability: number;
  cameraBlend: number;
  pull: number;
  collisionRelease: boolean;
  farewell: boolean;
  lastEmber: boolean;
  blackout: boolean;
  complete: boolean;
}

export interface WorldCollapseOptions {
  scene: THREE.Scene;
  zoneRoot: THREE.Group;
  playerStart: THREE.Vector3;
  zone: ZoneId;
  quality: QualityTier;
  reducedMotion: boolean;
}

const qualityCounts: Readonly<
  Record<
    QualityTier,
    {
      particles: number;
      debris: number;
      participants: number;
      terrainGrid: number;
      glassColumns: number;
      glassRows: number;
    }
  >
> = {
  low: {
    particles: 36,
    debris: 24,
    participants: 28,
    terrainGrid: 3,
    glassColumns: 3,
    glassRows: 2,
  },
  medium: {
    particles: 84,
    debris: 52,
    participants: 56,
    terrainGrid: 4,
    glassColumns: 4,
    glassRows: 3,
  },
  high: {
    particles: 168,
    debris: 96,
    participants: 96,
    terrainGrid: 5,
    glassColumns: 5,
    glassRows: 4,
  },
};

const zoneSeed: Readonly<Record<ZoneId, number>> = {
  field: 0x1f1e1d,
  falls: 0xfa115,
  grid: 0x6a1d,
  archive: 0xa7c41,
  math: 0x5a7,
};

const terrainFractureColors: Readonly<
  Record<ZoneId, { foundation: number; surface: number; emissive: number }>
> = {
  field: {
    foundation: 0x2f3c36,
    surface: 0x6b5331,
    emissive: 0x100b05,
  },
  falls: {
    foundation: 0x17271f,
    surface: 0x34483a,
    emissive: 0x07100b,
  },
  grid: {
    foundation: 0x080d10,
    surface: 0x294044,
    emissive: 0x071719,
  },
  archive: {
    foundation: 0x080d10,
    surface: 0x1a2528,
    emissive: 0x081419,
  },
  math: {
    foundation: 0x100c22,
    surface: 0x17142b,
    emissive: 0x09051a,
  },
};

function smoothRange(value: number, start: number, end: number): number {
  if (end <= start) return value >= end ? 1 : 0;
  return THREE.MathUtils.smoothstep(
    THREE.MathUtils.clamp(value, start, end),
    start,
    end,
  );
}

function createAccretionMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      intensity: { value: 0 },
      flare: { value: 0 },
    },
    vertexShader: `
      varying vec2 vDiskPosition;
      void main() {
        vDiskPosition = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float intensity;
      uniform float flare;
      varying vec2 vDiskPosition;

      void main() {
        float radius = length(vDiskPosition);
        float angle = atan(vDiskPosition.y, vDiskPosition.x);
        float inner = smoothstep(1.12, 1.58, radius);
        float outer = 1.0 - smoothstep(3.72, 4.58, radius);
        float edge = inner * outer;
        float lane = sin(angle * 9.0 - time * 3.6 + radius * 5.2);
        float laneFine = sin(angle * 21.0 + time * 2.1 - radius * 8.0);
        float streak = 0.34 + 0.38 * lane + 0.28 * laneFine;
        streak = pow(clamp(streak, 0.0, 1.0), 1.7);
        vec3 amber = vec3(1.0, 0.47, 0.08);
        vec3 cyan = vec3(0.18, 0.82, 0.94);
        vec3 violet = vec3(0.48, 0.24, 0.94);
        float colorTurn = 0.5 + 0.5 * sin(angle * 2.0 + time * 0.55);
        vec3 color = mix(violet, cyan, colorTurn);
        color = mix(color, amber, smoothstep(2.1, 4.35, radius));
        color = mix(color, vec3(1.0, 0.9, 0.7), flare * 0.72);
        float alpha = edge * intensity * (0.22 + streak * 0.8);
        gl_FragColor = vec4(color * (0.7 + streak + flare), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

export class WorldCollapseSequence {
  readonly origin = new THREE.Vector3(0, 3.65, 0);
  readonly duration: number;

  private readonly scene: THREE.Scene;
  private readonly zoneRoot: THREE.Group;
  private readonly zone: ZoneId;
  private readonly quality: QualityTier;
  private readonly reducedMotion: boolean;
  private readonly group = new THREE.Group();
  private readonly core: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly corona: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly accretion: THREE.Mesh<
    THREE.RingGeometry,
    THREE.ShaderMaterial
  >;
  private readonly halo: THREE.Mesh<
    THREE.TorusGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly flare: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly light: THREE.PointLight;
  private readonly particles: THREE.Points<
    THREE.BufferGeometry,
    THREE.PointsMaterial
  >;
  private readonly particlePositions: Float32Array;
  private readonly particleAngles: Float32Array;
  private readonly particleRadii: Float32Array;
  private readonly particleHeights: Float32Array;
  private readonly particlePhases: Float32Array;
  private readonly debris: THREE.InstancedMesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly debrisAngles: Float32Array;
  private readonly debrisRadii: Float32Array;
  private readonly debrisHeights: Float32Array;
  private readonly debrisPhases: Float32Array;
  private readonly debrisSizes: Float32Array;
  private readonly debrisDummy = new THREE.Object3D();
  private readonly fractureRoot = new THREE.Group();
  private readonly terrainFractures: TerrainFracture[];
  private readonly glassFracture: GlassFracture | null;
  private readonly participants: CollapseParticipant[];
  private readonly localOrigin = new THREE.Vector3();
  private readonly startPosition: THREE.Vector3;
  private readonly temporaryQuaternion = new THREE.Quaternion();
  private readonly participantBox = new THREE.Box3();
  private readonly participantSize = new THREE.Vector3();
  private age = 0;
  private active = true;
  private disposed = false;
  private randomState: number;

  constructor(options: WorldCollapseOptions) {
    this.scene = options.scene;
    this.zoneRoot = options.zoneRoot;
    this.zone = options.zone;
    this.quality = options.quality;
    this.reducedMotion = options.reducedMotion;
    this.duration = options.reducedMotion ? 2.4 : 14;
    this.randomState = zoneSeed[options.zone];
    this.startPosition = options.playerStart
      .clone()
      .add(new THREE.Vector3(-0.42, 1.48, -0.08));
    this.group.name = "event-horizon-world-collapse";
    this.group.position.copy(this.startPosition);
    this.group.scale.setScalar(0.001);
    this.scene.add(this.group);

    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(1.08, 24, 16),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        depthTest: false,
        fog: false,
        toneMapped: false,
      }),
    );
    this.core.name = "event-horizon-black-core";
    this.core.renderOrder = 40;
    this.group.add(this.core);

    this.corona = new THREE.Mesh(
      new THREE.SphereGeometry(1.26, 20, 14),
      new THREE.MeshBasicMaterial({
        color: 0x6edce8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        fog: false,
        toneMapped: false,
      }),
    );
    this.corona.name = "event-horizon-corona";
    this.corona.renderOrder = 38;
    this.group.add(this.corona);

    this.accretion = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 4.6, 96, 2),
      createAccretionMaterial(),
    );
    this.accretion.name = "event-horizon-accretion-disk";
    this.accretion.rotation.set(-Math.PI / 2 + 0.16, 0.08, -0.2);
    this.accretion.renderOrder = 39;
    this.group.add(this.accretion);

    this.halo = new THREE.Mesh(
      new THREE.TorusGeometry(1.34, 0.045, 5, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffd383,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        toneMapped: false,
      }),
    );
    this.halo.name = "event-horizon-photon-ring";
    this.halo.rotation.set(0.36, 0.18, -0.1);
    this.halo.renderOrder = 41;
    this.group.add(this.halo);

    this.flare = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 10),
      new THREE.MeshBasicMaterial({
        color: 0xfff6d8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        toneMapped: false,
      }),
    );
    this.flare.name = "event-horizon-final-flare";
    this.flare.renderOrder = 42;
    this.group.add(this.flare);

    this.light = new THREE.PointLight(0xffc46b, 0, 26, 1.45);
    this.light.position.y = 0.3;
    this.light.castShadow = false;
    this.group.add(this.light);

    const counts = qualityCounts[this.quality];
    this.particlePositions = new Float32Array(counts.particles * 3);
    this.particleAngles = new Float32Array(counts.particles);
    this.particleRadii = new Float32Array(counts.particles);
    this.particleHeights = new Float32Array(counts.particles);
    this.particlePhases = new Float32Array(counts.particles);
    const particleColors = new Float32Array(counts.particles * 3);
    const particlePalette = [
      new THREE.Color(0xffb34d),
      new THREE.Color(0x63dce8),
      new THREE.Color(0xa487ff),
    ] as const;
    for (let index = 0; index < counts.particles; index += 1) {
      this.particleAngles[index] = this.random() * Math.PI * 2;
      this.particleRadii[index] = 1.5 + this.random() * 4.8;
      this.particleHeights[index] = (this.random() - 0.5) * 1.25;
      this.particlePhases[index] = this.random() * Math.PI * 2;
      const color =
        particlePalette[index % particlePalette.length] ??
        particlePalette[0];
      particleColors[index * 3] = color.r;
      particleColors[index * 3 + 1] = color.g;
      particleColors[index * 3 + 2] = color.b;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.particlePositions, 3),
    );
    particleGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(particleColors, 3),
    );
    this.particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        size:
          this.quality === "low"
            ? 0.13
            : this.quality === "medium"
              ? 0.16
              : 0.19,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        fog: false,
        toneMapped: false,
      }),
    );
    this.particles.name = "event-horizon-accretion-particles";
    this.particles.frustumCulled = false;
    this.particles.renderOrder = 39;
    this.particles.visible = !this.reducedMotion;
    this.group.add(this.particles);

    this.debrisAngles = new Float32Array(counts.debris);
    this.debrisRadii = new Float32Array(counts.debris);
    this.debrisHeights = new Float32Array(counts.debris);
    this.debrisPhases = new Float32Array(counts.debris);
    this.debrisSizes = new Float32Array(counts.debris);
    this.debris = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.14, 0),
      new THREE.MeshBasicMaterial({
        color: 0xc6d4d8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
      counts.debris,
    );
    this.debris.name = "event-horizon-instanced-debris";
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debris.frustumCulled = false;
    this.debris.renderOrder = 34;
    this.debris.visible = !this.reducedMotion;
    for (let index = 0; index < counts.debris; index += 1) {
      this.debrisAngles[index] = this.random() * Math.PI * 2;
      this.debrisRadii[index] = 2.3 + this.random() * 8.5;
      this.debrisHeights[index] = (this.random() - 0.5) * 3.8;
      this.debrisPhases[index] = this.random() * Math.PI * 2;
      this.debrisSizes[index] = 0.38 + this.random() * 1.25;
    }
    this.group.add(this.debris);

    this.fractureRoot.name = "event-horizon-world-fractures";
    this.zoneRoot.add(this.fractureRoot);
    this.zoneRoot.updateWorldMatrix(true, true);
    this.localOrigin.copy(this.origin);
    this.zoneRoot.worldToLocal(this.localOrigin);
    this.terrainFractures = this.captureTerrainFractures(
      counts.terrainGrid,
    );
    this.glassFracture = this.captureGlassFracture(
      counts.glassColumns,
      counts.glassRows,
    );
    this.participants = this.captureParticipants(counts.participants);
    this.update(0, 0);
  }

  get isActive(): boolean {
    return this.active;
  }

  get progress(): number {
    return THREE.MathUtils.clamp(this.age / this.duration, 0, 1);
  }

  update(delta: number, elapsed: number): WorldCollapseFrame {
    if (!this.active) return this.createFrame();
    this.age = Math.min(this.duration, this.age + delta);
    const arrival = this.reducedMotion
      ? smoothRange(this.age, 0, 0.38)
      : smoothRange(this.age, 0.18, 2.15);
    const arrivalEase = 1 - Math.pow(1 - arrival, 3);
    this.group.position.lerpVectors(
      this.startPosition,
      this.origin,
      arrivalEase,
    );
    const visibleScale = this.reducedMotion
      ? THREE.MathUtils.lerp(0.01, 1, arrival)
      : THREE.MathUtils.lerp(0.01, 1, smoothRange(this.age, 0.2, 1.45));
    const finalGrowth = smoothRange(
      this.age,
      this.duration * 0.82,
      this.duration,
    );
    this.group.scale.setScalar(visibleScale * (1 + finalGrowth * 0.55));

    const intensity = this.reducedMotion
      ? smoothRange(this.age, 0.12, 0.72)
      : smoothRange(this.age, 0.7, 3.1);
    const flare = smoothRange(
      this.age,
      this.duration - (this.reducedMotion ? 0.62 : 1.55),
      this.duration - 0.08,
    );
    this.accretion.material.uniforms.time!.value = this.reducedMotion
      ? 0
      : elapsed;
    this.accretion.material.uniforms.intensity!.value = intensity;
    this.accretion.material.uniforms.flare!.value = flare;
    if (!this.reducedMotion) {
      this.accretion.rotation.z += delta * (0.18 + intensity * 0.38);
    }
    this.core.scale.setScalar(0.88 + intensity * 0.15 + flare * 0.44);
    this.corona.material.opacity =
      intensity * (0.08 + Math.sin(elapsed * 3.4) * 0.018) +
      flare * 0.28;
    this.corona.scale.setScalar(1 + flare * 1.1);
    this.halo.material.opacity =
      intensity * (0.42 + Math.sin(elapsed * 5.2) * 0.1) +
      flare * 0.42;
    if (!this.reducedMotion) {
      this.halo.rotation.x += delta * 0.11;
      this.halo.rotation.y -= delta * 0.16;
    }
    this.halo.scale.setScalar(1 + flare * 1.7);
    this.flare.material.opacity =
      Math.sin(flare * Math.PI) * 0.82;
    this.flare.scale.setScalar(1.2 + flare * 7.5);
    this.light.intensity =
      intensity * (2.2 + Math.sin(elapsed * 4.5) * 0.34) +
      Math.sin(flare * Math.PI) * 18;

    if (!this.reducedMotion) {
      this.updateParticles(elapsed, intensity, flare);
      this.updateDebris(elapsed, intensity, flare);
      this.updateTerrainFractures();
      this.updateGlassFracture();
      this.updateParticipants();
    }

    if (this.age >= this.duration) this.active = false;
    return this.createFrame();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    this.group.removeFromParent();
    disposeObjectTree(this.group);
    for (const fracture of this.terrainFractures) {
      fracture.source.visible = true;
    }
    if (this.glassFracture) this.glassFracture.source.visible = true;
    this.fractureRoot.removeFromParent();
    disposeObjectTree(this.fractureRoot);
  }

  private createFrame(): WorldCollapseFrame {
    return {
      age: this.age,
      progress: this.progress,
      instability: this.reducedMotion
        ? 0
        : smoothRange(this.age, 2.6, 10.5),
      cameraBlend: this.reducedMotion
        ? smoothRange(this.age, 0.2, 1.2) * 0.35
        : smoothRange(this.age, 1.1, 8.8),
      pull: this.reducedMotion
        ? 0
        : smoothRange(this.age, 8.8, 13.7),
      collisionRelease: !this.reducedMotion && this.age >= 5,
      farewell: this.age >= (this.reducedMotion ? 0.7 : 3.2),
      lastEmber:
        this.age >=
        this.duration - (this.reducedMotion ? 0.62 : 1.72),
      blackout:
        this.age >=
        this.duration - (this.reducedMotion ? 0.38 : 0.58),
      complete: this.age >= this.duration,
    };
  }

  private captureTerrainFractures(gridSize: number): TerrainFracture[] {
    const sources = [
      this.zoneRoot.getObjectByName("world-terrain-foundation"),
      this.zoneRoot.getObjectByName("world-terrain-surface"),
    ].filter((object): object is THREE.Mesh => object instanceof THREE.Mesh);
    const colors = terrainFractureColors[this.zone];
    const fractures: TerrainFracture[] = [];
    const localPoint = new THREE.Vector3();
    const worldScale = new THREE.Vector3();

    for (const source of sources) {
      source.geometry.computeBoundingBox();
      const bounds = source.geometry.boundingBox;
      if (!bounds) continue;
      const localSize = bounds.getSize(new THREE.Vector3());
      source.getWorldScale(worldScale);
      const cellWidth = localSize.x / gridSize;
      const cellDepth = localSize.z / gridSize;
      const circular = source.geometry instanceof THREE.CylinderGeometry;
      const fragments: TerrainFragment[] = [];

      for (let row = 0; row < gridSize; row += 1) {
        for (let column = 0; column < gridSize; column += 1) {
          const normalizedX = ((column + 0.5) / gridSize) * 2 - 1;
          const normalizedZ = ((row + 0.5) / gridSize) * 2 - 1;
          if (
            circular &&
            normalizedX * normalizedX + normalizedZ * normalizedZ > 1.08
          ) {
            continue;
          }
          const localX =
            THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, (column + 0.5) / gridSize) +
            (this.random() - 0.5) * cellWidth * 0.12;
          const localZ =
            THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, (row + 0.5) / gridSize) +
            (this.random() - 0.5) * cellDepth * 0.12;
          localPoint.set(localX, (bounds.min.y + bounds.max.y) * 0.5, localZ);
          source.localToWorld(localPoint);
          this.zoneRoot.worldToLocal(localPoint);
          const offsetX = localPoint.x - this.localOrigin.x;
          const offsetZ = localPoint.z - this.localOrigin.z;
          const radius = Math.hypot(offsetX, offsetZ);
          const surface = source.name.includes("surface");
          fragments.push({
            position: localPoint.clone(),
            quaternion: source.quaternion.clone().multiply(
              new THREE.Quaternion().setFromEuler(
                new THREE.Euler(
                  (this.random() - 0.5) * 0.035,
                  this.random() * Math.PI * 2,
                  (this.random() - 0.5) * 0.035,
                ),
              ),
            ),
            axis: new THREE.Vector3(
              this.random() - 0.5,
              0.35 + this.random(),
              this.random() - 0.5,
            ).normalize(),
            size: new THREE.Vector3(
              cellWidth * worldScale.x * (0.46 + this.random() * 0.07),
              Math.max(
                surface ? 0.15 : 0.28,
                localSize.y *
                  worldScale.y *
                  (surface ? 0.72 : 0.9 + this.random() * 0.12),
              ),
              cellDepth * worldScale.z * (0.46 + this.random() * 0.07),
            ),
            angle: Math.atan2(offsetZ, offsetX),
            radius,
            delay: this.random() * 1.25 + radius * 0.018,
            turns:
              (this.random() < 0.5 ? -1 : 1) *
              (0.42 + this.random() * 1.15),
            lift:
              (surface ? 1.1 : 0.62) +
              this.random() * (surface ? 2.8 : 1.75),
          });
        }
      }

      const foundation = source.name.includes("foundation");
      const material = new THREE.MeshStandardMaterial({
        color: foundation ? colors.foundation : colors.surface,
        emissive: colors.emissive,
        emissiveIntensity: foundation ? 0.18 : 0.34,
        roughness: 0.92,
        metalness: foundation ? 0.04 : 0.08,
        flatShading: true,
      });
      const mesh = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.72, 0.92, 1, 5),
        material,
        fragments.length,
      );
      mesh.name = `${source.name}-fracture-chunks`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.visible = false;
      const fracture: TerrainFracture = {
        source,
        fragments,
        mesh,
        dummy: new THREE.Object3D(),
      };
      for (let index = 0; index < fragments.length; index += 1) {
        const fragment = fragments[index];
        if (!fragment) continue;
        fracture.dummy.position.copy(fragment.position);
        fracture.dummy.quaternion.copy(fragment.quaternion);
        fracture.dummy.scale.copy(fragment.size);
        fracture.dummy.updateMatrix();
        mesh.setMatrixAt(index, fracture.dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.fractureRoot.add(mesh);
      fractures.push(fracture);
    }
    return fractures;
  }

  private captureGlassFracture(
    columns: number,
    rows: number,
  ): GlassFracture | null {
    if (this.zone !== "archive") return null;
    const source = this.zoneRoot.getObjectByName(
      "archive-orbit-traffic-glass",
    );
    if (!(source instanceof THREE.Mesh)) return null;
    source.geometry.computeBoundingBox();
    const bounds = source.geometry.boundingBox;
    if (!bounds) return null;

    const width = bounds.max.x - bounds.min.x;
    const height = bounds.max.y - bounds.min.y;
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    const triangleGeometry = new THREE.BufferGeometry();
    triangleGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          -1 / 3, -1 / 3, 0,
          2 / 3, -1 / 3, 0,
          -1 / 3, 2 / 3, 0,
        ],
        3,
      ),
    );
    triangleGeometry.computeVertexNormals();
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const shards: GlassShard[] = [];
    const localPoint = new THREE.Vector3();
    const flip = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      Math.PI,
    );

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x0 = bounds.min.x + column * cellWidth;
        const y0 = bounds.min.y + row * cellHeight;
        const centroids = [
          [x0 + cellWidth / 3, y0 + cellHeight / 3, false],
          [x0 + (cellWidth * 2) / 3, y0 + (cellHeight * 2) / 3, true],
        ] as const;
        for (const [centerX, centerY, flipped] of centroids) {
          localPoint.set(centerX, centerY, 0);
          source.localToWorld(localPoint);
          this.zoneRoot.worldToLocal(localPoint);
          const offsetX = localPoint.x - this.localOrigin.x;
          const offsetZ = localPoint.z - this.localOrigin.z;
          const quaternion = source.quaternion.clone();
          if (flipped) quaternion.multiply(flip);
          shards.push({
            position: localPoint.clone(),
            quaternion,
            axis: new THREE.Vector3(
              this.random() - 0.5,
              this.random() - 0.5,
              this.random() - 0.5,
            ).normalize(),
            size: new THREE.Vector3(
              cellWidth * 0.94,
              cellHeight * 0.94,
              1,
            ),
            angle: Math.atan2(offsetZ, offsetX),
            radius: Math.hypot(offsetX, offsetZ),
            delay: this.random() * 0.85,
            turns:
              (this.random() < 0.5 ? -1 : 1) *
              (1.4 + this.random() * 2.2),
            lift: 1.8 + this.random() * 3.4,
          });
        }
      }
    }

    const mesh = new THREE.InstancedMesh(
      triangleGeometry,
      material,
      shards.length,
    );
    mesh.name = "archive-data-glass-fracture-shards";
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;
    mesh.visible = false;
    const colors = [
      new THREE.Color(0xffc866),
      new THREE.Color(0x72e4ed),
      new THREE.Color(0xfff2bf),
    ];
    const dummy = new THREE.Object3D();
    for (let index = 0; index < shards.length; index += 1) {
      const shard = shards[index];
      if (!shard) continue;
      dummy.position.copy(shard.position);
      dummy.quaternion.copy(shard.quaternion);
      dummy.scale.copy(shard.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, colors[index % colors.length] ?? colors[0]!);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.fractureRoot.add(mesh);
    return { source, shards, mesh, dummy };
  }

  private captureParticipants(limit: number): CollapseParticipant[] {
    const candidates = this.zoneRoot.children
      .filter(
        (object) =>
          object.visible &&
          object !== this.fractureRoot &&
          !object.name.startsWith("world-terrain-") &&
          object.name !== "archive-orbit-traffic-glass",
      )
      .map((object, index) => {
        this.participantBox.setFromObject(object);
        this.participantBox.getSize(this.participantSize);
        const size = Math.max(
          this.participantSize.x,
          this.participantSize.y,
          this.participantSize.z,
        );
        const special =
          /turtle|atlas|portrait|pythagoras|portal|hanoi|pong|observability|river|waterfall|rack|monitor|glass|mind-reader|chocolate|solid|needle|sierpinski|cube|rock|stone|asteroid/i.test(
            object.name,
          );
        return {
          object,
          index,
          size,
          score: (special ? -100 : 0) + size * -0.12 + this.random() * 5,
        };
      })
      .sort((left, right) => left.score - right.score)
      .slice(0, limit)
      .sort((left, right) => left.index - right.index);

    return candidates.map(({ object, size }) => {
      const offsetX = object.position.x - this.localOrigin.x;
      const offsetZ = object.position.z - this.localOrigin.z;
      const radius = Math.hypot(offsetX, offsetZ);
      const name = object.name.toLowerCase();
      const protectedMedia =
        name.includes("portrait") ||
        name.includes("pythagoras") ||
        name.includes("mind-reader");
      const resistant =
        protectedMedia ||
        name.includes("turtle") ||
        name.includes("atlas");
      const rockLike =
        /rock|stone|asteroid/.test(name);
      const large = size > 9;
      const delay = this.reducedMotion
        ? 1.2
        : resistant
          ? 8.1 + this.random() * 1.05
          : rockLike
            ? 1.75 + this.random() * 1.2
          : large
            ? 6.7 + this.random() * 1.15
            : 2.6 + this.random() * 3.1;
      const axis = new THREE.Vector3(
        this.random() - 0.5,
        0.35 + this.random(),
        this.random() - 0.5,
      ).normalize();
      return {
        object,
        position: object.position.clone(),
        quaternion: object.quaternion.clone(),
        scale: object.scale.clone(),
        axis,
        angle: Math.atan2(offsetZ, offsetX),
        radius,
        delay,
        turns:
          (this.random() < 0.5 ? -1 : 1) *
          (rockLike
            ? 2.8 + this.random() * 3.6
            : 1.4 + this.random() * 2.8),
        lift: rockLike
          ? 2.8 + this.random() * 4.2
          : 0.35 + this.random() * 2.4,
        large,
        rockLike,
      };
    });
  }

  private updateParticipants(): void {
    const finish = this.duration - 0.18;
    for (const participant of this.participants) {
      const progress = smoothRange(
        this.age,
        participant.delay,
        finish,
      );
      if (progress <= 0) continue;
      const collapse = Math.pow(progress, 1.18);
      const radial = Math.pow(1 - collapse, 1.32);
      const launch =
        participant.rockLike
          ? Math.sin(Math.min(1, progress * 1.45) * Math.PI)
          : 0;
      const activeRadius =
        participant.radius * radial +
        launch * (1.8 + participant.radius * 0.2);
      const angle =
        participant.angle +
        participant.turns *
          collapse *
          Math.PI *
          2;
      participant.object.position.set(
        this.localOrigin.x +
          Math.cos(angle) * activeRadius,
        THREE.MathUtils.lerp(
          participant.position.y,
          this.localOrigin.y,
          Math.pow(collapse, 1.45),
        ) +
          Math.sin(collapse * Math.PI) *
            participant.lift *
            (participant.large ? 0.45 : 1) +
          launch * participant.lift * 0.58,
        this.localOrigin.z +
          Math.sin(angle) * activeRadius,
      );
      this.temporaryQuaternion.setFromAxisAngle(
        participant.axis,
        (collapse + launch * 0.72) *
          participant.turns *
          Math.PI *
          1.7,
      );
      participant.object.quaternion
        .copy(participant.quaternion)
        .multiply(this.temporaryQuaternion);
      const shrink = Math.max(
        0.001,
        1 - Math.pow(collapse, 1.8) * 0.998,
      );
      if (participant.large) {
        participant.object.scale.set(
          participant.scale.x *
            (shrink * 0.62 + Math.abs(Math.sin(collapse * 18)) * 0.18),
          participant.scale.y *
            (shrink * 0.72 + Math.abs(Math.sin(collapse * 11)) * 0.48),
          participant.scale.z *
            (shrink * 0.62 + Math.abs(Math.cos(collapse * 15)) * 0.18),
        );
      } else {
        participant.object.scale.copy(participant.scale).multiplyScalar(
          shrink,
        );
      }
    }
  }

  private updateTerrainFractures(): void {
    const fractureVisible = this.age >= 4.45;
    const sourceVisible = this.age < 5.28;
    for (const fracture of this.terrainFractures) {
      fracture.mesh.visible = fractureVisible;
      fracture.source.visible = sourceVisible;
      if (!fractureVisible) continue;
      const dummy = fracture.dummy;
      for (let index = 0; index < fracture.fragments.length; index += 1) {
        const fragment = fracture.fragments[index];
        if (!fragment) continue;
        const crumple = smoothRange(
          this.age,
          4.35 + fragment.delay,
          7.15 + fragment.delay * 0.45,
        );
        const collapse = smoothRange(
          this.age,
          6.15 + fragment.delay * 0.32,
          this.duration - 0.16,
        );
        const fold = Math.sin(crumple * Math.PI);
        const radial = Math.pow(1 - collapse, 1.28);
        const activeRadius =
          fragment.radius * radial +
          fold * (0.75 + fragment.radius * 0.055);
        const angle =
          fragment.angle +
          fragment.turns *
            (crumple * 0.16 + collapse * 1.18) *
            Math.PI *
            2;
        dummy.position.set(
          this.localOrigin.x + Math.cos(angle) * activeRadius,
          THREE.MathUtils.lerp(
            fragment.position.y,
            this.localOrigin.y,
            Math.pow(collapse, 1.42),
          ) +
            fold * fragment.lift +
            Math.sin(index * 2.17 + crumple * 8.4) * crumple * 0.22,
          this.localOrigin.z + Math.sin(angle) * activeRadius,
        );
        this.temporaryQuaternion.setFromAxisAngle(
          fragment.axis,
          (crumple * 0.7 + collapse * 2.4) *
            fragment.turns *
            Math.PI,
        );
        dummy.quaternion
          .copy(fragment.quaternion)
          .multiply(this.temporaryQuaternion);
        const shrink = Math.max(
          0.012,
          1 - Math.pow(collapse, 1.7) * 0.988,
        );
        dummy.scale.set(
          fragment.size.x * shrink,
          fragment.size.y *
            Math.max(
              0.04,
              shrink * (0.78 + Math.abs(Math.sin(crumple * 9 + index)) * 0.34),
            ),
          fragment.size.z * shrink,
        );
        dummy.updateMatrix();
        fracture.mesh.setMatrixAt(index, dummy.matrix);
      }
      fracture.mesh.instanceMatrix.needsUpdate = true;
      fracture.mesh.material.emissiveIntensity =
        0.25 + smoothRange(this.age, 5.2, 9.4) * 0.38;
    }
  }

  private updateGlassFracture(): void {
    const fracture = this.glassFracture;
    if (!fracture) return;
    const shardsVisible = this.age >= 2.9;
    fracture.mesh.visible = shardsVisible;
    fracture.source.visible = this.age < 3.42;
    if (!shardsVisible) return;
    const dummy = fracture.dummy;
    for (let index = 0; index < fracture.shards.length; index += 1) {
      const shard = fracture.shards[index];
      if (!shard) continue;
      const burst = smoothRange(
        this.age,
        2.85 + shard.delay,
        5.05 + shard.delay * 0.6,
      );
      const collapse = smoothRange(
        this.age,
        5.2 + shard.delay * 0.35,
        this.duration - 0.2,
      );
      const burstArc = Math.sin(burst * Math.PI);
      const radial = Math.pow(1 - collapse, 1.2);
      const activeRadius =
        shard.radius * radial +
        burstArc * (2.2 + shard.radius * 0.12);
      const angle =
        shard.angle +
        shard.turns *
          (burst * 0.22 + collapse * 1.1) *
          Math.PI *
          2;
      dummy.position.set(
        this.localOrigin.x + Math.cos(angle) * activeRadius,
        THREE.MathUtils.lerp(
          shard.position.y,
          this.localOrigin.y,
          Math.pow(collapse, 1.35),
        ) +
          burstArc * shard.lift +
          Math.sin(index * 1.7 + burst * 12) * 0.18,
        this.localOrigin.z + Math.sin(angle) * activeRadius,
      );
      this.temporaryQuaternion.setFromAxisAngle(
        shard.axis,
        (burst * 1.4 + collapse * 3.1) *
          shard.turns *
          Math.PI,
      );
      dummy.quaternion
        .copy(shard.quaternion)
        .multiply(this.temporaryQuaternion);
      const shrink = Math.max(
        0.015,
        1 - Math.pow(collapse, 1.65) * 0.985,
      );
      dummy.scale.copy(shard.size).multiplyScalar(shrink);
      dummy.updateMatrix();
      fracture.mesh.setMatrixAt(index, dummy.matrix);
    }
    fracture.mesh.instanceMatrix.needsUpdate = true;
    fracture.mesh.material.opacity =
      (0.62 + Math.sin(this.age * 16) * 0.12) *
      (1 - smoothRange(this.age, 11.4, this.duration) * 0.94);
  }

  private updateParticles(
    elapsed: number,
    intensity: number,
    flare: number,
  ): void {
    const count = this.particleAngles.length;
    const collapse = smoothRange(
      this.age,
      this.reducedMotion ? 0.4 : 3,
      this.duration,
    );
    for (let index = 0; index < count; index += 1) {
      const angle =
        (this.particleAngles[index] ?? 0) +
        elapsed * (0.72 + (index % 5) * 0.08) +
        collapse * 4.2;
      const radius =
        (this.particleRadii[index] ?? 1) *
        (1 - collapse * 0.76);
      const offset = index * 3;
      this.particlePositions[offset] = Math.cos(angle) * radius;
      this.particlePositions[offset + 1] =
        (this.particleHeights[index] ?? 0) *
          (1 - collapse) +
        Math.sin(elapsed * 2.1 + (this.particlePhases[index] ?? 0)) *
          0.16;
      this.particlePositions[offset + 2] = Math.sin(angle) * radius;
    }
    (
      this.particles.geometry.getAttribute(
        "position",
      ) as THREE.BufferAttribute
    ).needsUpdate = true;
    this.particles.material.opacity =
      intensity * (0.54 + flare * 0.42);
  }

  private updateDebris(
    elapsed: number,
    intensity: number,
    flare: number,
  ): void {
    const collapse = smoothRange(
      this.age,
      this.reducedMotion ? 0.72 : 3.2,
      this.duration,
    );
    const dummy = this.debrisDummy;
    for (let index = 0; index < this.debris.count; index += 1) {
      const phase = this.debrisPhases[index] ?? 0;
      const angle =
        (this.debrisAngles[index] ?? 0) +
        elapsed * (0.22 + (index % 7) * 0.025) +
        collapse * (4.2 + (index % 3));
      const radius =
        (this.debrisRadii[index] ?? 1) *
        Math.pow(1 - collapse, 1.15);
      dummy.position.set(
        Math.cos(angle) * radius,
        (this.debrisHeights[index] ?? 0) *
          (1 - collapse) +
          Math.sin(angle * 1.7 + phase) * 0.42,
        Math.sin(angle) * radius,
      );
      dummy.rotation.set(
        elapsed * (0.7 + (index % 5) * 0.12) + phase,
        -elapsed * (0.5 + (index % 4) * 0.1),
        angle,
      );
      const size =
        (this.debrisSizes[index] ?? 1) *
        Math.max(0.02, (1 - collapse) * (0.72 + intensity * 0.28));
      dummy.scale.set(size * 0.52, size, size * 0.52);
      dummy.updateMatrix();
      this.debris.setMatrixAt(index, dummy.matrix);
    }
    this.debris.instanceMatrix.needsUpdate = true;
    this.debris.material.opacity =
      intensity * (1 - flare * 0.78) * 0.72;
  }

  private random(): number {
    this.randomState = (this.randomState * 1664525 + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }
}
