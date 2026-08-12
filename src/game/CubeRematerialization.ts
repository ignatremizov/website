import * as THREE from "three";

export interface CubeOpacityChannel {
  material: THREE.Material;
  opacity: number;
}

interface CubeRematerializationOptions {
  parent: THREE.Object3D;
  target: THREE.Object3D;
  channels: readonly CubeOpacityChannel[];
  extent: number;
  colors: readonly [
    THREE.ColorRepresentation,
    THREE.ColorRepresentation,
    THREE.ColorRepresentation,
  ];
}

const fragmentCount = 16;

function rematerializationScale(progress: number): number {
  const assembly = THREE.MathUtils.smoothstep(progress, 0, 0.72);
  const overshoot =
    Math.sin(assembly * Math.PI) * (1 - assembly) * 0.22;
  return 0.06 + assembly * 0.94 + overshoot;
}

/**
 * One bounded arrival effect shared by both faces of the Mightymatica cube.
 * It animates existing portal visuals and adds only transient wireframes plus
 * one instanced fragment batch; inactive effects stay hidden.
 */
export class CubeRematerialization {
  private readonly target: THREE.Object3D;
  private readonly channels: readonly CubeOpacityChannel[];
  private readonly baseScale: THREE.Vector3;
  private readonly effectRoot = new THREE.Group();
  private readonly frames: THREE.LineSegments<
    THREE.EdgesGeometry,
    THREE.LineBasicMaterial
  >[] = [];
  private readonly fragments: THREE.InstancedMesh<
    THREE.BoxGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly fragmentStarts: THREE.Vector3[] = [];
  private readonly fragmentTargets: THREE.Vector3[] = [];
  private readonly dummy = new THREE.Object3D();
  private age = 1;
  private duration = 1;
  private active = false;
  private reducedMotion = false;

  constructor(options: CubeRematerializationOptions) {
    this.target = options.target;
    this.channels = options.channels;
    this.baseScale = options.target.scale.clone();
    this.effectRoot.name = "cube-rematerialization-effect";
    this.effectRoot.position.copy(options.target.position);
    this.effectRoot.quaternion.copy(options.target.quaternion);
    this.effectRoot.visible = false;
    options.parent.add(this.effectRoot);

    const frameSource = new THREE.BoxGeometry(
      options.extent,
      options.extent,
      options.extent,
    );
    const frameGeometry = new THREE.EdgesGeometry(frameSource);
    frameSource.dispose();
    for (let index = 0; index < 3; index += 1) {
      const frame = new THREE.LineSegments(
        frameGeometry,
        new THREE.LineBasicMaterial({
          color: options.colors[index],
          transparent: true,
          opacity: 0,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      frame.name = `cube-rematerialization-frame-${index}`;
      frame.scale.setScalar(0.72 + index * 0.18);
      frame.visible = false;
      frame.renderOrder = 7;
      this.effectRoot.add(frame);
      this.frames.push(frame);
    }

    this.fragments = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.11, 0.045, 0.34),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      fragmentCount,
    );
    this.fragments.name = "cube-rematerialization-scanline-fragments";
    this.fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fragments.visible = false;
    this.fragments.frustumCulled = false;
    this.fragments.renderOrder = 8;
    for (let index = 0; index < fragmentCount; index += 1) {
      const side = index % 4;
      const layer = Math.floor(index / 4);
      const angle = side * (Math.PI / 2) + layer * 0.17;
      const radial = options.extent * (0.8 + layer * 0.16);
      this.fragmentStarts.push(
        new THREE.Vector3(
          Math.cos(angle) * radial,
          (layer - 1.5) * options.extent * 0.54,
          Math.sin(angle) * radial,
        ),
      );
      const targetRadius = options.extent * (0.3 + layer * 0.075);
      this.fragmentTargets.push(
        new THREE.Vector3(
          Math.cos(angle) * targetRadius,
          (layer - 1.5) * options.extent * 0.15,
          Math.sin(angle) * targetRadius,
        ),
      );
      const color =
        options.colors[index % options.colors.length] ?? options.colors[0];
      this.fragments.setColorAt(
        index,
        new THREE.Color(color),
      );
    }
    this.fragments.instanceMatrix.needsUpdate = true;
    if (this.fragments.instanceColor) {
      this.fragments.instanceColor.needsUpdate = true;
    }
    this.effectRoot.add(this.fragments);
  }

  get isActive(): boolean {
    return this.active;
  }

  start(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
    this.duration = reducedMotion ? 0.22 : 1.18;
    this.age = 0;
    this.active = true;
    this.target.scale.copy(this.baseScale).multiplyScalar(0.06);
    for (const channel of this.channels) channel.material.opacity = 0;
    this.effectRoot.visible = !reducedMotion;
    for (const frame of this.frames) frame.visible = !reducedMotion;
    this.fragments.visible = !reducedMotion;
    this.update(0, 0);
  }

  update(delta: number, elapsed: number): void {
    if (!this.active) return;
    this.age = Math.min(this.duration, this.age + delta);
    const progress = this.age / this.duration;
    const assembly = THREE.MathUtils.smoothstep(progress, 0.04, 0.72);
    const dissolve =
      1 - THREE.MathUtils.smoothstep(progress, 0.62, 1);
    const scale = this.reducedMotion
      ? THREE.MathUtils.lerp(0.7, 1, assembly)
      : rematerializationScale(progress);
    this.target.scale.copy(this.baseScale).multiplyScalar(scale);
    for (const channel of this.channels) {
      channel.material.opacity = channel.opacity * assembly;
    }

    if (!this.reducedMotion) {
      for (const [index, frame] of this.frames.entries()) {
        frame.material.opacity =
          dissolve * (0.72 - index * 0.12);
        frame.rotation.x =
          elapsed * (0.72 + index * 0.16) * (index % 2 === 0 ? 1 : -1);
        frame.rotation.y =
          elapsed * (0.98 + index * 0.14) * (index % 2 === 0 ? -1 : 1);
        const frameScale =
          (0.35 + assembly * (0.78 + index * 0.15)) *
          (1 + Math.sin(progress * Math.PI) * 0.08);
        frame.scale.setScalar(frameScale);
      }

      this.fragments.material.opacity = dissolve * 0.92;
      for (let index = 0; index < fragmentCount; index += 1) {
        const start = this.fragmentStarts[index];
        const target = this.fragmentTargets[index];
        if (!start || !target) continue;
        this.dummy.position.lerpVectors(start, target, assembly);
        this.dummy.rotation.set(
          index * 0.31 + progress * 1.7,
          index * 0.23 - progress * 2.1,
          index * 0.17,
        );
        this.dummy.scale.set(
          1 + (index % 3) * 0.38,
          1,
          Math.max(0.08, dissolve),
        );
        this.dummy.updateMatrix();
        this.fragments.setMatrixAt(index, this.dummy.matrix);
      }
      this.fragments.instanceMatrix.needsUpdate = true;
    }

    if (progress >= 1) this.finish();
  }

  private finish(): void {
    this.active = false;
    this.target.scale.copy(this.baseScale);
    for (const channel of this.channels) {
      channel.material.opacity = channel.opacity;
    }
    for (const frame of this.frames) frame.visible = false;
    this.fragments.visible = false;
    this.fragments.material.opacity = 0;
    this.effectRoot.visible = false;
  }
}
