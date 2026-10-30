import * as THREE from "three";

import type { QualityTier } from "../../../world/WorldContracts";
import { getFallsPointLightBudget } from "./FallsLightBudget";
import { fallsLandmarks } from "./FallsLayout";

interface FallsFireflyState {
  group: THREE.Group;
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  groundPools: THREE.InstancedMesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  >;
  texture: THREE.CanvasTexture;
  positions: Float32Array;
  lights: [THREE.PointLight, THREE.PointLight];
  activeCount: number;
}

const maximumFireflyCount = 48;
const poolOpacity = { low: 0.28, medium: 0.34, high: 0.38 } as const;
// Each swarm belongs to a terrace instead of lighting the buried old field.
const fireflyClusters = [
  fallsLandmarks.npcs.archivist,
  fallsLandmarks.npcs.keeper,
  fallsLandmarks.sockets.moon,
  fallsLandmarks.cache,
  fallsLandmarks.sockets.ember,
  fallsLandmarks.sockets.tide,
  fallsLandmarks.bridge,
  fallsLandmarks.npcs.tinkerer,
].map(({ x, y, z }) => [x, y, z] as const);

function randomSequence(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createFireflyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  if (context) {
    const glow = context.createRadialGradient(16, 16, 1, 16, 16, 15);
    glow.addColorStop(0, "rgba(255,255,238,1)");
    glow.addColorStop(0.18, "rgba(255,231,157,.98)");
    glow.addColorStop(0.48, "rgba(255,181,83,.52)");
    glow.addColorStop(1, "rgba(255,148,55,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, 32, 32);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = "falls-firefly-soft-glow";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

/**
 * One dynamic points draw and a quality-bounded light pool provide ambient
 * life across the Falls without creating a mesh or light per insect.
 */
export class FallsFireflyField {
  private readonly origins = new Float32Array(maximumFireflyCount * 3);
  private readonly phases = new Float32Array(maximumFireflyCount);
  private readonly radii = new Float32Array(maximumFireflyCount);
  private state: FallsFireflyState | null = null;
  private quality: QualityTier = "medium";
  private motionTime = 0;
  private lastElapsed: number | null = null;
  private frameDirty = true;

  constructor() {
    const random = randomSequence(0xf1e5f117);
    for (let index = 0; index < maximumFireflyCount; index += 1) {
      const cluster = fireflyClusters[index % fireflyClusters.length]!;
      const offset = index * 3;
      this.origins[offset] = cluster[0] + (random() - 0.5) * 2.8;
      this.origins[offset + 1] = cluster[1] + 1.35 + (random() - 0.5) * 1.15;
      this.origins[offset + 2] = cluster[2] + (random() - 0.5) * 2.6;
      this.phases[index] = random() * Math.PI * 2;
      this.radii[index] = 0.22 + random() * 0.52;
    }
  }

  mount(parent: THREE.Group): void {
    this.unmount();
    const group = new THREE.Group();
    group.name = "falls-firefly-light-field";
    const positions = new Float32Array(maximumFireflyCount * 3);
    positions.set(this.origins);
    const colors = new Float32Array(maximumFireflyCount * 3);
    const palette = [
      new THREE.Color(0xffe7ac),
      new THREE.Color(0xffca77),
      new THREE.Color(0xffefc5),
      new THREE.Color(0xffd995),
      new THREE.Color(0xe1c4ff),
    ] as const;
    for (let index = 0; index < maximumFireflyCount; index += 1) {
      const color = palette[index % palette.length]!;
      const offset = index * 3;
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const texture = createFireflyTexture();
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        // PointsMaterial does not attenuate size for the orthographic camera:
        // fractional world-like sizes were actually subpixel, even up close.
        size: 12,
        sizeAttenuation: false,
        map: texture,
        vertexColors: true,
        transparent: true,
        opacity: 0.96,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: true,
      }),
    );
    points.name = "falls-batched-fireflies";
    points.frustumCulled = false;
    points.renderOrder = 4;
    group.add(points);

    // A single instanced draw lets every authored swarm leave a soft pool on
    // the terrain. Point sprites alone read as decoration, while the one
    // Medium-tier point light could only illuminate whichever cluster it was
    // currently visiting.
    const groundPoolMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: texture,
      transparent: true,
      opacity: 0.1,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: true,
      side: THREE.DoubleSide,
      // These are planar decals; a back-face prepass contributes no volume.
      forceSinglePass: true,
    });
    const groundPools = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      groundPoolMaterial,
      fireflyClusters.length,
    );
    groundPools.name = "falls-firefly-ground-pools";
    groundPools.frustumCulled = false;
    groundPools.renderOrder = 1;
    const poolDummy = new THREE.Object3D();
    const poolPalette = [
      new THREE.Color(0xffb14f),
      new THREE.Color(0xffca66),
      new THREE.Color(0xff9f43),
      new THREE.Color(0xffce89),
      new THREE.Color(0xffbd58),
      new THREE.Color(0xffa84d),
      new THREE.Color(0xffdba0),
      new THREE.Color(0xffc265),
    ] as const;
    for (const [index, cluster] of fireflyClusters.entries()) {
      poolDummy.position.set(cluster[0], cluster[1] + 0.025, cluster[2]);
      // Keep the narrow bridge ellipse aligned to its deck, not across the
      // gorge; the remaining pools stay inside their authored terrace tops.
      poolDummy.rotation.set(-Math.PI / 2, 0, index === 6 ? 0 : index * 0.47);
      const poolSize = 3.4;
      poolDummy.scale.set(poolSize, index === 6 ? 1.6 : poolSize * 0.82, 1);
      poolDummy.updateMatrix();
      groundPools.setMatrixAt(index, poolDummy.matrix);
      groundPools.setColorAt(index, poolPalette[index]!);
    }
    groundPools.instanceMatrix.needsUpdate = true;
    if (groundPools.instanceColor) {
      groundPools.instanceColor.needsUpdate = true;
    }
    group.add(groundPools);

    const warmLight = new THREE.PointLight(0xffb24f, 0, 8.2, 2);
    warmLight.name = "falls-warm-firefly-swarm-light";
    warmLight.castShadow = false;
    group.add(warmLight);
    const fantasyLight = new THREE.PointLight(0xffce91, 0, 7.2, 2);
    fantasyLight.name = "falls-amber-firefly-nook-light";
    fantasyLight.castShadow = false;
    group.add(fantasyLight);

    parent.add(group);
    this.state = {
      group,
      points,
      groundPools,
      texture,
      positions,
      lights: [warmLight, fantasyLight],
      activeCount: 0,
    };
    this.setQuality(this.quality);
    this.update(0, true);
  }

  unmount(): void {
    const state = this.state;
    if (!state) return;
    state.group.removeFromParent();
    state.points.geometry.dispose();
    state.points.material.dispose();
    state.groundPools.dispose();
    state.groundPools.geometry.dispose();
    state.groundPools.material.dispose();
    state.texture.dispose();
    for (const light of state.lights) light.dispose();
    this.state = null;
    this.motionTime = 0;
    this.lastElapsed = null;
    this.frameDirty = true;
  }

  setQuality(quality: QualityTier): void {
    this.quality = quality;
    const state = this.state;
    if (!state) return;
    this.frameDirty = true;
    state.activeCount =
      quality === "low" ? 18 : quality === "medium" ? 34 : maximumFireflyCount;
    state.points.geometry.setDrawRange(0, state.activeCount);
    state.points.material.size =
      quality === "low" ? 10 : quality === "medium" ? 12 : 14;
    // Eight tiny instances are still one draw on Low. Keep both banks and the
    // workshop readable where that tier has no real firefly lights.
    state.groundPools.count = fireflyClusters.length;
    state.groundPools.material.opacity = poolOpacity[quality];
    state.lights[0].distance = quality === "medium" ? 22 : 18;
    state.lights[0].decay = 1.25;
    state.lights[1].distance = 14;
    state.lights[1].decay = 1.5;
    const { fireflyVisibleSlots } = getFallsPointLightBudget(quality);
    for (const [index, light] of state.lights.entries()) {
      // Visibility changes only with the explicit quality tier. Medium keeps
      // one primary swarm light; the nook fill is a high-only extra.
      light.visible = index < fireflyVisibleSlots;
    }
  }

  update(elapsed: number, reducedMotion: boolean): void {
    const state = this.state;
    if (!state) return;
    const previousMotionTime = this.motionTime;
    if (this.lastElapsed !== null && !reducedMotion) {
      this.motionTime += Math.max(0, Math.min(elapsed - this.lastElapsed, 0.05));
    }
    this.lastElapsed = elapsed;
    // Reduced motion (or a repeated timestamp) leaves every output unchanged.
    // Still consume elapsed time so resuming does not catch up frozen frames.
    // Mount and quality changes must populate newly visible particles/lights.
    if (!this.frameDirty && this.motionTime === previousMotionTime) return;
    this.frameDirty = false;
    // Freeze in place when reduced motion changes rather than snapping every
    // swarm and light back to its starting phase.
    elapsed = this.motionTime;
    for (let index = 0; index < state.activeCount; index += 1) {
      const offset = index * 3;
      const phase = this.phases[index]!;
      const radius = this.radii[index]!;
      state.positions[offset] =
        this.origins[offset]! +
        Math.sin(elapsed * (0.62 + (index % 5) * 0.07) + phase) *
          radius;
      state.positions[offset + 1] =
        this.origins[offset + 1]! +
        Math.sin(elapsed * (1.05 + (index % 7) * 0.06) + phase) *
          radius *
          0.72;
      state.positions[offset + 2] =
        this.origins[offset + 2]! +
        Math.cos(elapsed * (0.56 + (index % 4) * 0.08) + phase) *
          radius;
    }
    state.points.geometry.attributes.position!.needsUpdate = true;

    const qualityIntensity =
      this.quality === "high" ? 1 : this.quality === "medium" ? 0.84 : 0;
    state.groundPools.material.opacity =
      poolOpacity[this.quality] *
      (0.96 + Math.sin(elapsed * 0.8) * 0.04);
    const warm = state.lights[0];
    // A restrained drift around the bridge lights both banks continuously.
    // The old wide orbit spent much of its time lighting the river below.
    const bridge = fallsLandmarks.bridge;
    warm.position.set(
      bridge.x + Math.sin(elapsed * 0.23) * 0.65,
      bridge.y + 2.5 + Math.sin(elapsed * 0.71) * 0.12,
      bridge.z - 0.6 + Math.cos(elapsed * 0.19) * 0.45,
    );
    warm.intensity =
      qualityIntensity *
      (8.4 + Math.sin(elapsed * 1.1) * 0.25);
    const fantasy = state.lights[1];
    const nook = fallsLandmarks.npcs.tinkerer;
    fantasy.position.set(
      nook.x - 1.2 + Math.cos(elapsed * 0.2) * 0.45,
      nook.y + 1.9 + Math.sin(elapsed * 0.63 + 1.4) * 0.12,
      nook.z + 0.4 + Math.sin(elapsed * 0.18) * 0.4,
    );
    fantasy.intensity =
      qualityIntensity *
      (5.2 + Math.sin(elapsed * 0.9 + 0.8) * 0.18);
  }
}
