import * as THREE from "three";
import { isTraversalSnapshotMeshEligible } from "./TraversalSnapshotEligibility";

type TraversalPhase = "idle" | "departing" | "departed" | "arriving";
type TraversalQuality = "low" | "medium" | "high";

const maximumFragmentCount = 56;
const maximumScanSliceCount = 13;

const snapshotVertexShader = `
  uniform float uTime;
  uniform float uDistortion;
  uniform float uChannelOffset;
  uniform float uOriginY;
  uniform float uDirection;
  varying vec3 vWorldPosition;
  varying float vSliceNoise;

  float hashValue(float value) {
    return fract(sin(value * 91.173 + 17.917) * 43758.5453);
  }

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    float slice = floor((worldPosition.y - uOriginY) * 11.5);
    float noise = hashValue(slice + floor(uTime * 22.0) * 0.037);
    float secondaryNoise = hashValue(slice + 31.73);
    float centeredY = worldPosition.y - uOriginY - 1.15;

    worldPosition.x +=
      centeredY * 0.13 * uDistortion * uDirection +
      (noise - 0.5) * 0.42 * uDistortion;
    worldPosition.z +=
      (secondaryNoise - 0.5) * 0.24 * uDistortion;
    worldPosition.y +=
      sin(slice * 1.71 + uTime * 31.0) *
      step(0.62, noise) *
      0.055 *
      uDistortion;

    float quantize = uDistortion * 0.32;
    worldPosition.x = mix(
      worldPosition.x,
      floor(worldPosition.x * 19.0 + 0.5) / 19.0,
      quantize
    );
    worldPosition.y = mix(
      worldPosition.y,
      floor(worldPosition.y * 24.0 + 0.5) / 24.0,
      quantize * 0.7
    );

    vec4 viewPosition = viewMatrix * worldPosition;
    viewPosition.x +=
      uChannelOffset * (0.45 + uDistortion * 0.9);
    gl_Position = projectionMatrix * viewPosition;
    vWorldPosition = worldPosition.xyz;
    vSliceNoise = noise;
  }
`;

const snapshotFragmentShader = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uVisibleFraction;
  uniform float uDistortion;
  uniform float uTime;
  varying vec3 vWorldPosition;
  varying float vSliceNoise;

  float hashPosition(vec3 value) {
    return fract(
      sin(dot(value, vec3(12.9898, 78.233, 37.719))) *
      43758.5453
    );
  }

  void main() {
    if (uVisibleFraction < 0.004) discard;
    vec3 cell = floor(
      vWorldPosition * vec3(10.0, 14.0, 9.0)
    );
    float dissolve = hashPosition(cell);
    if (dissolve > uVisibleFraction) discard;

    float scanline =
      0.58 +
      0.42 *
      step(
        0.34,
        fract(vWorldPosition.y * 17.0 - uTime * 4.2)
      );
    float flickerNoise = hashPosition(
      cell + vec3(floor(uTime * 29.0), vSliceNoise * 7.0, 0.0)
    );
    float flicker = mix(
      1.0,
      step(0.2 + uDistortion * 0.24, flickerNoise),
      uDistortion
    );
    float edgeFlash = smoothstep(
      uVisibleFraction - 0.11,
      uVisibleFraction,
      dissolve
    );
    float alpha =
      uOpacity *
      scanline *
      flicker *
      (0.72 + edgeFlash * 0.48);
    if (alpha < 0.012) discard;
    gl_FragColor = vec4(
      mix(uColor, vec3(1.0), edgeFlash * 0.34),
      alpha
    );
  }
`;

function smoothRange(value: number, start: number, end: number): number {
  return THREE.MathUtils.smoothstep(value, start, end);
}

function deterministicUnit(index: number, salt: number): number {
  const value =
    Math.sin(index * 91.173 + salt * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Short-lived shell traversal effect. It snapshots the current avatar pose,
 * fractures that snapshot in world space, and uses two offset color channels
 * plus one wireframe channel to create an anaglyph dissolve. All expensive
 * meshes remain hidden while no `cd` traversal is active.
 */
export class TerminalTraversalEffect {
  private readonly effectRoot = new THREE.Group();
  private readonly snapshotRoot = new THREE.Group();
  private readonly snapshotMaterials: THREE.ShaderMaterial[];
  private readonly fragments: THREE.InstancedMesh<
    THREE.BoxGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly scanSlices: THREE.InstancedMesh<
    THREE.BoxGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly fragmentStarts: THREE.Vector3[] = [];
  private readonly fragmentVelocities: THREE.Vector3[] = [];
  private readonly fragmentScales: THREE.Vector3[] = [];
  private readonly origin = new THREE.Vector3();
  private readonly dummy = new THREE.Object3D();
  private phase: TraversalPhase = "idle";
  private age = 0;
  private duration = 1;
  private reducedMotion = false;
  private quality: TraversalQuality = "high";
  private activeFragmentCount = maximumFragmentCount;
  private activeScanSliceCount = maximumScanSliceCount;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    private readonly target: THREE.Object3D,
    private readonly shadow: THREE.Object3D,
  ) {
    this.effectRoot.name = "terminal-cd-traversal-effect";
    this.effectRoot.visible = false;
    this.snapshotRoot.name = "terminal-cd-avatar-snapshot";
    this.effectRoot.add(this.snapshotRoot);

    this.snapshotMaterials = [
      this.createSnapshotMaterial(0x53efff, 0.038, false, 0.4),
      this.createSnapshotMaterial(0xff4fbd, -0.042, false, 0.34),
      this.createSnapshotMaterial(0xeaffff, 0, true, 0.72),
    ];

    this.fragments = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      maximumFragmentCount,
    );
    this.fragments.name = "terminal-cd-digital-fragments";
    this.fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fragments.frustumCulled = false;
    this.fragments.visible = false;
    this.fragments.renderOrder = 14;

    this.scanSlices = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      maximumScanSliceCount,
    );
    this.scanSlices.name = "terminal-cd-sheared-scan-slices";
    this.scanSlices.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scanSlices.frustumCulled = false;
    this.scanSlices.visible = false;
    this.scanSlices.renderOrder = 13;

    const fragmentColors = [0x55efff, 0xff4fbd, 0xf5ffff, 0x638cff];
    for (let index = 0; index < maximumFragmentCount; index += 1) {
      this.fragments.setColorAt(
        index,
        new THREE.Color(
          fragmentColors[index % fragmentColors.length] ?? 0xffffff,
        ),
      );
      this.fragmentStarts.push(new THREE.Vector3());
      this.fragmentVelocities.push(new THREE.Vector3());
      this.fragmentScales.push(new THREE.Vector3());
    }
    if (this.fragments.instanceColor) {
      this.fragments.instanceColor.needsUpdate = true;
    }

    const sliceColors = [0xeaffff, 0x55efff, 0xff4fbd];
    for (let index = 0; index < maximumScanSliceCount; index += 1) {
      this.scanSlices.setColorAt(
        index,
        new THREE.Color(
          sliceColors[index % sliceColors.length] ?? 0xffffff,
        ),
      );
    }
    if (this.scanSlices.instanceColor) {
      this.scanSlices.instanceColor.needsUpdate = true;
    }

    this.effectRoot.add(this.scanSlices, this.fragments);
    scene.add(this.effectRoot);
  }

  get active(): boolean {
    return this.phase !== "idle";
  }

  startDeparture(
    reducedMotion: boolean,
    quality: TraversalQuality,
  ): number {
    this.reducedMotion = reducedMotion;
    this.quality = quality;
    this.duration = reducedMotion ? 0.16 : 0.82;
    this.age = 0;
    this.phase = "departing";
    this.configureQuality();
    this.captureTarget();
    this.target.visible = true;
    this.shadow.visible = true;
    this.effectRoot.visible = true;
    this.update(0, 0);
    return Math.ceil(this.duration * 1000);
  }

  holdDissolved(): void {
    if (this.phase === "idle") return;
    this.phase = "departed";
    this.target.visible = false;
    this.shadow.visible = false;
    this.snapshotRoot.visible = false;
    this.fragments.visible = false;
    this.scanSlices.visible = false;
  }

  startArrival(
    reducedMotion: boolean,
    quality: TraversalQuality,
  ): number {
    this.reducedMotion = reducedMotion;
    this.quality = quality;
    this.duration = reducedMotion ? 0.18 : 0.74;
    this.age = 0;
    this.phase = "arriving";
    this.configureQuality();
    this.captureTarget();
    this.target.visible = false;
    this.shadow.visible = false;
    this.effectRoot.visible = true;
    this.update(0, 0);
    return Math.ceil(this.duration * 1000);
  }

  update(delta: number, elapsed: number): void {
    if (this.phase === "idle" || this.phase === "departed") return;
    this.age = Math.min(this.duration, this.age + delta);
    const progress = THREE.MathUtils.clamp(
      this.age / Math.max(0.001, this.duration),
      0,
      1,
    );
    const departing = this.phase === "departing";
    const visibleFraction = departing
      ? 1 - smoothRange(progress, 0.07, 0.95)
      : smoothRange(progress, 0.03, 0.88);
    const distortion = this.reducedMotion
      ? 0.12
      : departing
        ? smoothRange(progress, 0.035, 0.82)
        : 1 - smoothRange(progress, 0.08, 0.94);
    const snapshotEnvelope = departing
      ? smoothRange(progress, 0.015, 0.13) *
        (1 - smoothRange(progress, 0.84, 1))
      : smoothRange(progress, 0.015, 0.1) *
        (1 - smoothRange(progress, 0.76, 1));

    for (const material of this.snapshotMaterials) {
      material.uniforms.uTime!.value = elapsed;
      material.uniforms.uDistortion!.value = distortion;
      material.uniforms.uVisibleFraction!.value = visibleFraction;
      material.uniforms.uDirection!.value = departing ? 1 : -1;
      material.uniforms.uOpacity!.value =
        (material.userData.opacityScale as number) * snapshotEnvelope;
    }
    this.snapshotRoot.visible = snapshotEnvelope > 0.002;

    if (departing) {
      const earlyFlicker =
        progress > 0.07 &&
        progress < 0.2 &&
        Math.sin(elapsed * 93) > -0.18;
      this.target.visible = progress < 0.075 || earlyFlicker;
      this.shadow.visible = progress < 0.18;
    } else {
      const lateFlicker =
        progress > 0.72 &&
        progress < 0.9 &&
        Math.sin(elapsed * 88) > -0.25;
      this.target.visible = progress >= 0.9 || lateFlicker;
      this.shadow.visible = progress > 0.68;
    }

    this.updateFragments(progress, elapsed, departing);
    this.updateScanSlices(progress, elapsed, departing);

    if (progress < 1) return;
    if (departing) {
      this.holdDissolved();
    } else {
      this.stop();
    }
  }

  stop(): void {
    if (this.disposed) return;
    this.phase = "idle";
    this.target.visible = true;
    this.shadow.visible = true;
    this.effectRoot.visible = false;
    this.snapshotRoot.visible = false;
    this.fragments.visible = false;
    this.scanSlices.visible = false;
    this.fragments.material.opacity = 0;
    this.scanSlices.material.opacity = 0;
    this.clearSnapshot();
  }

  dispose(scene: THREE.Scene): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    scene.remove(this.effectRoot);
    for (const material of this.snapshotMaterials) material.dispose();
    this.fragments.geometry.dispose();
    this.fragments.material.dispose();
    this.scanSlices.geometry.dispose();
    this.scanSlices.material.dispose();
  }

  private createSnapshotMaterial(
    color: THREE.ColorRepresentation,
    channelOffset: number,
    wireframe: boolean,
    opacityScale: number,
  ): THREE.ShaderMaterial {
    const material = new THREE.ShaderMaterial({
      name: `terminal-cd-${wireframe ? "wire" : "anaglyph"}-snapshot`,
      uniforms: {
        uTime: { value: 0 },
        uDistortion: { value: 0 },
        uChannelOffset: { value: channelOffset },
        uOriginY: { value: 0 },
        uDirection: { value: 1 },
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: 0 },
        uVisibleFraction: { value: 1 },
      },
      vertexShader: snapshotVertexShader,
      fragmentShader: snapshotFragmentShader,
      wireframe,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    });
    material.userData.opacityScale = opacityScale;
    return material;
  }

  private configureQuality(): void {
    this.activeFragmentCount =
      this.quality === "low"
        ? 24
        : this.quality === "medium"
          ? 40
          : maximumFragmentCount;
    this.activeScanSliceCount =
      this.quality === "low"
        ? 6
        : this.quality === "medium"
          ? 9
          : maximumScanSliceCount;
    this.fragments.count = this.activeFragmentCount;
    this.scanSlices.count = this.activeScanSliceCount;
  }

  private captureTarget(): void {
    this.clearSnapshot();
    this.target.updateWorldMatrix(true, true);
    this.target.getWorldPosition(this.origin);
    for (const material of this.snapshotMaterials) {
      material.uniforms.uOriginY!.value = this.origin.y;
    }

    const materialCount = this.quality === "low" ? 2 : 3;
    this.target.traverse((object) => {
      if (!isTraversalSnapshotMeshEligible(object, this.target)) return;
      for (let channel = 0; channel < materialCount; channel += 1) {
        const material = this.snapshotMaterials[channel];
        if (!material) continue;
        const snapshot = new THREE.Mesh(object.geometry, material);
        snapshot.name = `terminal-cd-snapshot-${object.name || object.id}-${channel}`;
        snapshot.matrixAutoUpdate = false;
        snapshot.matrix.copy(object.matrixWorld);
        snapshot.frustumCulled = false;
        snapshot.renderOrder = 12 + channel;
        this.snapshotRoot.add(snapshot);
      }
    });
    this.snapshotRoot.visible = true;
    this.initializeFragments();
  }

  private clearSnapshot(): void {
    for (const child of [...this.snapshotRoot.children]) {
      this.snapshotRoot.remove(child);
    }
  }

  private initializeFragments(): void {
    for (let index = 0; index < maximumFragmentCount; index += 1) {
      const start = this.fragmentStarts[index];
      const velocity = this.fragmentVelocities[index];
      const scale = this.fragmentScales[index];
      if (!start || !velocity || !scale) continue;
      const x = (deterministicUnit(index, 1.7) - 0.5) * 0.9;
      const y = 0.12 + deterministicUnit(index, 3.1) * 2.45;
      const z = (deterministicUnit(index, 5.3) - 0.5) * 0.72;
      start.set(
        this.origin.x + x,
        this.origin.y + y,
        this.origin.z + z,
      );
      const outward = Math.sign(x || (index % 2 === 0 ? 1 : -1));
      velocity.set(
        outward * (0.38 + deterministicUnit(index, 7.9) * 0.85),
        -0.18 + deterministicUnit(index, 11.3) * 0.72,
        (deterministicUnit(index, 13.7) - 0.5) * 0.72,
      );
      const stripe = index % 3 !== 0;
      scale.set(
        stripe
          ? 0.16 + deterministicUnit(index, 17.1) * 0.48
          : 0.07 + deterministicUnit(index, 17.1) * 0.12,
        stripe
          ? 0.018 + deterministicUnit(index, 19.9) * 0.045
          : 0.07 + deterministicUnit(index, 19.9) * 0.11,
        stripe
          ? 0.035 + deterministicUnit(index, 23.3) * 0.11
          : 0.07 + deterministicUnit(index, 23.3) * 0.12,
      );
    }
  }

  private updateFragments(
    progress: number,
    elapsed: number,
    departing: boolean,
  ): void {
    const assembly = smoothRange(progress, 0.02, 0.92);
    const displacement = departing ? assembly : 1 - assembly;
    const visibility = departing
      ? smoothRange(progress, 0.035, 0.2) *
        (1 - smoothRange(progress, 0.76, 1))
      : smoothRange(progress, 0.015, 0.12) *
        (1 - smoothRange(progress, 0.65, 1));
    this.fragments.visible = visibility > 0.002 && !this.reducedMotion;
    this.fragments.material.opacity = visibility * 0.92;

    for (let index = 0; index < this.activeFragmentCount; index += 1) {
      const start = this.fragmentStarts[index];
      const velocity = this.fragmentVelocities[index];
      const baseScale = this.fragmentScales[index];
      if (!start || !velocity || !baseScale) continue;
      const phase = deterministicUnit(index, 29.7) * Math.PI * 2;
      const flicker =
        Math.sin(elapsed * 67 + phase) > -0.46 ? 1 : 0.12;
      this.dummy.position
        .copy(start)
        .addScaledVector(velocity, displacement * 1.25);
      this.dummy.position.x +=
        Math.sin(elapsed * 31 + phase) *
        0.055 *
        displacement;
      this.dummy.position.y +=
        Math.sin(progress * 24 + phase) * 0.035 * displacement;
      this.dummy.rotation.set(
        phase * 0.13,
        phase + displacement * (index % 2 === 0 ? 1.7 : -1.4),
        phase * 0.09,
      );
      const scaleEnvelope = departing
        ? 1 - smoothRange(progress, 0.58, 1)
        : smoothRange(progress, 0.02, 0.64);
      this.dummy.scale.copy(baseScale);
      this.dummy.scale.x *=
        flicker *
        Math.max(0.001, scaleEnvelope) *
        (1 + displacement * (index % 4) * 0.32);
      this.dummy.scale.y *= flicker * Math.max(0.001, scaleEnvelope);
      this.dummy.scale.z *= flicker * Math.max(0.001, scaleEnvelope);
      this.dummy.updateMatrix();
      this.fragments.setMatrixAt(index, this.dummy.matrix);
    }
    this.fragments.instanceMatrix.needsUpdate = true;
  }

  private updateScanSlices(
    progress: number,
    elapsed: number,
    departing: boolean,
  ): void {
    const assembly = smoothRange(progress, 0.02, 0.94);
    const displacement = departing ? assembly : 1 - assembly;
    const visibility = departing
      ? smoothRange(progress, 0.02, 0.14) *
        (1 - smoothRange(progress, 0.72, 1))
      : smoothRange(progress, 0.01, 0.1) *
        (1 - smoothRange(progress, 0.7, 1));
    this.scanSlices.visible = visibility > 0.002 && !this.reducedMotion;
    this.scanSlices.material.opacity = visibility * 0.24;
    for (let index = 0; index < this.activeScanSliceCount; index += 1) {
      const sequence =
        (index + 0.5) / Math.max(1, this.activeScanSliceCount);
      const wave =
        Math.sin(elapsed * 34 + index * 2.17) *
        0.055 *
        displacement;
      this.dummy.position.set(
        this.origin.x +
          (sequence - 0.5) * displacement * 1.05 +
          wave,
        this.origin.y + 0.08 + sequence * 2.58,
        this.origin.z +
          Math.cos(elapsed * 27 + index) * 0.028 * displacement,
      );
      this.dummy.rotation.set(
        0,
        (sequence - 0.5) * displacement * 0.32,
        (sequence - 0.5) * displacement * 0.18,
      );
      const pulse =
        Math.sin(elapsed * 52 + index * 1.9) > -0.4 ? 1 : 0.16;
      this.dummy.scale.set(
        (0.92 + (index % 4) * 0.13 + displacement * 0.5) * pulse,
        0.012 + (index % 3) * 0.006,
        (0.58 + (index % 2) * 0.12) * pulse,
      );
      this.dummy.updateMatrix();
      this.scanSlices.setMatrixAt(index, this.dummy.matrix);
    }
    this.scanSlices.instanceMatrix.needsUpdate = true;
  }
}
