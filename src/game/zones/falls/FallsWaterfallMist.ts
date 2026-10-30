import * as THREE from "three";

import type { QualityTier } from "../../../world/WorldContracts";
import { disposeObjectTree } from "../../sceneResources";

/** Impact position in the mounted root's local coordinates, not the fall crest. */
export interface FallsMistSource {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly height: number;
  /** Defaults to a pool impact. A lip throws spray down into the void. */
  readonly kind?: "impact" | "lip";
  /** Circular island radius for a lip; source.z is its crest at source.x. */
  readonly edgeRadius?: number;
}

// The upper curtain lands in the raised wet basin; the apron spill lands in
// the lower river. Override these at mount when the terrain author moves them.
const defaultSources: readonly FallsMistSource[] = [
  { x: -5.5, y: 2.66, z: -5.3, radius: 1.05, height: 1.15 },
  { x: -5.5, y: 0.22, z: -3.9, radius: 0.8, height: 0.85 },
];
const maximumSources = 6;
const maximumParticlesPerSource = 32;
const maximumParticles = maximumSources * maximumParticlesPerSource;
const particlesPerSource = { low: 10, medium: 20, high: 32 } as const;
const foamPerSource = { low: 12, medium: 22, high: 32 } as const;

interface MistLayer {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  positions: Float32Array;
  colors: Float32Array;
}

interface MistState {
  group: THREE.Group;
  sources: readonly FallsMistSource[];
  haze: MistLayer;
  spray: MistLayer;
  foam: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  glimmer: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  count: number;
}

/**
 * Two point draws and two static instanced draws, with no lights or timers.
 * This controller exclusively owns its subtree and the texture shared by its
 * particle/glimmer materials. Unmount BEFORE generic zone-tree disposal.
 * Keep this subtree out of static zone batching.
 */
export class FallsWaterfallMist {
  private state: MistState | null = null;
  private quality: QualityTier = "medium";
  private time = 0;

  mount(root: THREE.Group, sources: readonly FallsMistSource[] = defaultSources): void {
    // Validate before replacing a live effect; empty sources intentionally
    // disable it. Copy the accepted records so host mutation cannot move spray.
    if (
      sources.length > maximumSources ||
      sources.some((source) =>
        !Number.isFinite(source.x) || !Number.isFinite(source.y) ||
        !Number.isFinite(source.z) || !Number.isFinite(source.radius) ||
        !Number.isFinite(source.height) || source.radius <= 0 || source.height <= 0 ||
        (source.kind !== undefined && source.kind !== "impact" && source.kind !== "lip") ||
        (source.edgeRadius !== undefined &&
          (!Number.isFinite(source.edgeRadius) ||
            source.edgeRadius <= Math.abs(source.x) + source.radius))
      )
    ) {
      throw new RangeError("Falls mist needs at most six finite, positive-sized sources and a valid optional lip radius");
    }
    this.unmount();
    if (sources.length === 0) return;

    const group = new THREE.Group();
    group.name = "falls-waterfall-impact-mist";
    // A small analytic alpha mask needs no external asset or canvas context.
    // Kept private to this owned effect; particles and glimmers share one texture.
    const pixels = new Uint8Array(32 * 32 * 4);
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        const radius = Math.hypot((x - 15.5) / 15.5, (y - 15.5) / 15.5);
        const alpha = Math.max(0, 1 - radius * radius);
        const offset = (y * 32 + x) * 4;
        pixels[offset] = 255;
        pixels[offset + 1] = 255;
        pixels[offset + 2] = 255;
        pixels[offset + 3] = Math.round(alpha * alpha * alpha * 255);
      }
    }
    const texture = new THREE.DataTexture(pixels, 32, 32);
    texture.name = "falls-impact-soft-particle";
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;

    const createLayer = (name: string, size: number, opacity: number): MistLayer => {
      const positions = new Float32Array(maximumParticles * 3);
      const colors = new Float32Array(maximumParticles * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3)
        .setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3)
        .setUsage(THREE.DynamicDrawUsage));
      const points = new THREE.Points(geometry, new THREE.PointsMaterial({
        map: texture,
        size,
        // Explicit CSS-pixel sizes also work with the orthographic world camera.
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity,
        depthTest: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: true,
      }));
      points.name = name;
      points.frustumCulled = false;
      points.renderOrder = 3;
      group.add(points);
      return { points, positions, colors };
    };
    const haze = createLayer("falls-impact-haze", 34, 0.3);
    const spray = createLayer("falls-impact-droplets", 5, 0.9);
    // Short, tapered, irregular ribbons read as torn surface froth, never a
    // complete ring. They are built once and shared by every impact/crest.
    const foamPositions: number[] = [];
    const foamColors: number[] = [];
    const foamIndices: number[] = [];
    for (let segment = 0; segment <= 12; segment += 1) {
      const t = segment / 12;
      const bend = Math.sin(t * Math.PI) * 0.18 + Math.sin(t * 11) * 0.022;
      const width = Math.sin(t * Math.PI) * (0.032 + 0.014 * Math.sin(t * 19));
      for (const side of [-1, 1]) {
        foamPositions.push(t - 0.5, bend + side * width, 0);
        foamColors.push(1, 1, 1, Math.sin(t * Math.PI));
      }
      if (segment < 12) {
        const vertex = segment * 2;
        foamIndices.push(vertex, vertex + 2, vertex + 1, vertex + 1, vertex + 2, vertex + 3);
      }
    }
    const foamGeometry = new THREE.BufferGeometry();
    foamGeometry.setAttribute("position", new THREE.Float32BufferAttribute(foamPositions, 3));
    foamGeometry.setAttribute("color", new THREE.Float32BufferAttribute(foamColors, 4));
    foamGeometry.setIndex(foamIndices);
    const foam = new THREE.InstancedMesh(foamGeometry, new THREE.MeshBasicMaterial({
      color: 0xcff8ed, vertexColors: true, transparent: true, opacity: 0.88,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      // Flat ribbons have no rear volume to sort in a separate draw.
      forceSinglePass: true,
    }), maximumParticles);
    foam.name = "falls-broken-foam-seams";
    const glimmer = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: texture, transparent: true, opacity: 0.44, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
      forceSinglePass: true,
    }), maximumParticles);
    glimmer.name = "falls-foam-magical-glimmer";
    for (const mesh of [foam, glimmer]) {
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      mesh.userData.clickNavigationPassThrough = true;
      group.add(mesh);
    }
    // Mount-only scratch objects: quality switches change counts, not matrices.
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let ordinal = 0; ordinal < maximumParticlesPerSource; ordinal += 1) {
      for (const [sourceIndex, source] of sources.entries()) {
        const index = ordinal * sources.length + sourceIndex;
        const phase = (ordinal * 0.61803398875 + sourceIndex * 0.27) % 1;
        const dx = (phase * 2 - 1) * source.radius * 0.84;
        const lip = source.kind === "lip";
        const crest = this.crestOffset(source, dx);
        const lane = (ordinal % 3) / 3;
        dummy.position.set(
          source.x + dx,
          source.y + 0.025 + lane * 0.006,
          source.z + crest + (lip ? -0.045 - lane * 0.32 : 0.08 + lane * source.radius * 0.48),
        );
        dummy.rotation.set(-Math.PI / 2, 0, lip ? -dx * 0.06 : Math.sin(ordinal * 2.4) * 0.75);
        dummy.scale.set(
          source.radius * (0.3 + (ordinal % 4) * 0.075),
          0.65 + phase * 0.7, 1,
        );
        dummy.updateMatrix();
        foam.setMatrixAt(index, dummy.matrix);
        // Small diffuse pools of emissive color mingle with the white froth.
        // Sparse warm accents keep the dominant read cyan water, not fire.
        color.setHex(ordinal % 7 === 0 ? 0xffd994 : 0x72e9ed);
        glimmer.setColorAt(index, color);
        dummy.position.y += 0.018;
        dummy.scale.set(source.radius * 0.34, source.radius * 0.2, 1);
        dummy.updateMatrix();
        glimmer.setMatrixAt(index, dummy.matrix);
      }
    }
    foam.instanceMatrix.needsUpdate = true;
    glimmer.instanceMatrix.needsUpdate = true;
    if (glimmer.instanceColor) glimmer.instanceColor.needsUpdate = true;
    root.add(group);
    this.state = {
      group, sources: sources.map((source) => ({ ...source })), haze, spray, foam, glimmer, count: 0,
    };
    this.time = 0;
    this.setQuality(this.quality);
  }

  setQuality(quality: QualityTier): void {
    this.quality = quality;
    const state = this.state;
    if (!state) return;
    state.count = state.sources.length * particlesPerSource[quality];
    state.haze.points.geometry.setDrawRange(0, state.count);
    state.spray.points.geometry.setDrawRange(0, state.count);
    state.foam.count = state.sources.length * foamPerSource[quality];
    state.glimmer.count = state.foam.count;
    state.foam.material.opacity = quality === "low" ? 0.94 : quality === "medium" ? 0.84 : 0.74;
    // Density changes, not shader defines or the set of visible impact sites.
    state.haze.points.material.opacity =
      quality === "low" ? 0.36 : quality === "medium" ? 0.3 : 0.24;
    this.writeParticles();
  }

  update(delta: number, _elapsed: number, reduceMotion: boolean): void {
    if (!this.state || reduceMotion) return;
    // Integrate bounded local time: tab suspension cannot cause a large jump,
    // and reduced motion freezes a populated field without a phase reset.
    if (!Number.isFinite(delta) || delta <= 0) return;
    this.time = (this.time + Math.min(delta, 0.05)) % 120;
    this.writeParticles();
  }

  private crestOffset(source: FallsMistSource, dx: number): number {
    if (source.kind !== "lip" || source.edgeRadius === undefined) return 0;
    const radiusSquared = source.edgeRadius * source.edgeRadius;
    return Math.sqrt(Math.max(0, radiusSquared - (source.x + dx) ** 2)) -
      Math.sqrt(radiusSquared - source.x ** 2);
  }

  private writeParticles(): void {
    const state = this.state;
    if (!state) return;
    for (let index = 0; index < state.count; index += 1) {
      // Interleave sources so every quality tier retains every waterfall.
      const source = state.sources[index % state.sources.length]!;
      const ordinal = Math.floor(index / state.sources.length);
      const phase = (ordinal * 0.61803398875 + (index % state.sources.length) * 0.27) % 1;
      const angle = ordinal * 2.39996322973 + (index % state.sources.length) * 1.7;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const offset = index * 3;
      const age = (this.time * 0.25 + phase) % 1;
      const spread = source.radius * (0.35 + age * 0.9);
      const hazeFade = Math.sin(age * Math.PI) * 0.72;
      state.haze.positions[offset] = source.x + dx * spread + age * source.radius * 0.18;
      state.haze.positions[offset + 1] = source.y + 0.08 + age * source.height;
      state.haze.positions[offset + 2] = source.z + dz * spread * 0.65;
      // Additive RGB fades avoid per-particle materials or shader recompiles.
      state.haze.colors[offset] = hazeFade * 0.38;
      state.haze.colors[offset + 1] = hazeFade * 0.82;
      state.haze.colors[offset + 2] = hazeFade;

      const flight = (this.time * 0.75 + phase) % 1;
      const reach = source.radius * (0.18 + flight * 0.95);
      const sprayFade = Math.sin(flight * Math.PI);
      state.spray.positions[offset] = source.x + dx * reach;
      state.spray.positions[offset + 1] =
        source.y + 0.06 + 4 * flight * (1 - flight) * source.height * 0.72;
      state.spray.positions[offset + 2] = source.z + dz * reach * 0.7;
      state.spray.colors[offset] = sprayFade * 0.7;
      state.spray.colors[offset + 1] = sprayFade * 0.94;
      state.spray.colors[offset + 2] = sprayFade;
      if (ordinal % 7 === 0) {
        state.spray.colors[offset] = sprayFade;
        state.spray.colors[offset + 1] = sprayFade * 0.83;
        state.spray.colors[offset + 2] = sprayFade * 0.48;
      }
      if (source.kind === "lip") {
        const across = dx * source.radius * 0.84;
        const crest = this.crestOffset(source, across);
        state.haze.positions[offset] = source.x + across;
        state.haze.positions[offset + 1] = source.y - age * source.height * 0.6;
        state.haze.positions[offset + 2] = source.z + crest + 0.08 + age * 0.35;
        state.spray.positions[offset] = source.x + across;
        state.spray.positions[offset + 1] = source.y + 0.08 - flight * flight * source.height;
        state.spray.positions[offset + 2] = source.z + crest + 0.06 + flight * 0.45;
      }
    }
    state.haze.points.geometry.attributes.position!.needsUpdate = true;
    state.haze.points.geometry.attributes.color!.needsUpdate = true;
    state.spray.points.geometry.attributes.position!.needsUpdate = true;
    state.spray.points.geometry.attributes.color!.needsUpdate = true;
  }

  unmount(): void {
    if (!this.state) return;
    this.state.group.removeFromParent();
    // Shared texture is collected once by the existing resource helper.
    disposeObjectTree(this.state.group);
    this.state = null;
    this.time = 0;
  }

  dispose(): void {
    this.unmount();
  }
}
