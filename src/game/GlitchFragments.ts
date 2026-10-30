import * as THREE from "three";
import { disposeObjectTree } from "./sceneResources.ts";

interface GlitchFragment {
  active: boolean;
  age: number;
  lifetime: number;
  phase: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  reducedMotion: boolean;
}

/** Writes the original solids dissolve pose without changing the caller's rotation. */
export function writeGlitchDissolveTransform(
  object: THREE.Object3D,
  position: THREE.Vector3,
  scale: number,
  progress: number,
  phase: number,
  reducedMotion: boolean = false,
): void {
  const remaining = 1 - THREE.MathUtils.smoothstep(progress, 0.08, 1);
  object.position.copy(position);
  if (reducedMotion) {
    object.scale.setScalar(scale * remaining);
    return;
  }
  const flicker = Math.sin(progress * 74 + phase * 4.1) > -0.48 ? 1 : 0.08;
  object.position.x += Math.sin(progress * 39 + phase) * 0.11 * remaining;
  object.scale.set(
    scale * remaining * flicker * (1 + Math.sin(progress * 51) * 0.22),
    scale * remaining * flicker,
    scale * remaining * flicker * (1 - Math.sin(progress * 37) * 0.12),
  );
}

/** Bounded, parent-local fragments shared by the world and lazy math exhibits. */
export class GlitchFragments {
  private readonly mesh: THREE.InstancedMesh<
    THREE.BoxGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly fragments: GlitchFragment[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private activeCount = 0;
  private cursor = 0;
  private disposed = false;

  constructor(parent: THREE.Group, capacity: number, name = "glitch-fragments") {
    if (!Number.isSafeInteger(capacity) || capacity <= 0) {
      throw new RangeError("Glitch fragment capacity must be a positive safe integer");
    }
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      capacity,
    );
    this.mesh.name = name;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    for (let index = 0; index < capacity; index += 1) {
      this.fragments.push({
        active: false,
        age: 0,
        lifetime: 0,
        phase: index * 0.61,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        rotation: new THREE.Euler(),
        scale: new THREE.Vector3(),
        reducedMotion: false,
      });
      this.hideInstance(index);
      this.mesh.setColorAt(index, this.color.setHex(0x55dce8));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    // Parent-tree disposal owns the resources if explicit disposal is not used.
    // Remember that path too, so a later explicit dispose cannot release twice.
    this.mesh.addEventListener("dispose", () => {
      this.disposed = true;
      this.activeCount = 0;
    });
    parent.add(this.mesh);
  }

  emit(options: {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    scale: number;
    yaw: number;
    phase: number;
    color: number;
    count: number;
    reducedMotion: boolean;
  }): void {
    if (this.disposed) return;
    const { position, velocity, scale, yaw, reducedMotion } = options;
    // Bound emission work as well as storage, including malformed caller counts.
    const count = Number.isFinite(options.count)
      ? Math.min(this.fragments.length, Math.max(0, Math.floor(options.count)))
      : 0;
    for (let emitted = 0; emitted < count; emitted += 1) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % this.fragments.length;
      const fragment = this.fragments[index];
      if (!fragment) continue;
      if (!fragment.active) this.activeCount += 1;
      const phase = options.phase + emitted * 2.39996;
      const stripe = emitted % 3 !== 0;
      fragment.active = true;
      fragment.reducedMotion = reducedMotion;
      fragment.age = 0;
      fragment.lifetime = (reducedMotion ? 0.2 : 0.34) + (emitted % 5) * 0.055;
      fragment.phase = phase;
      fragment.position.set(
        position.x + Math.sin(phase * 1.7) * scale * 0.36,
        position.y + ((emitted % 6) - 2.5) * scale * 0.13,
        position.z + Math.cos(phase * 1.3) * scale * 0.24,
      );
      fragment.velocity.set(
        velocity.x * 0.14 + Math.cos(phase) * (0.32 + (emitted % 4) * 0.09),
        0.12 + (emitted % 5) * 0.1,
        velocity.z * 0.14 + Math.sin(phase) * (0.24 + (emitted % 3) * 0.08),
      );
      fragment.rotation.set(
        stripe ? 0 : phase * 0.17,
        yaw + phase * 0.11,
        stripe ? 0 : phase * 0.09,
      );
      fragment.scale.set(
        scale * (stripe ? 0.24 + (emitted % 4) * 0.13 : 0.1),
        scale * (stripe ? 0.035 + (emitted % 3) * 0.018 : 0.1),
        scale * (stripe ? 0.045 + (emitted % 2) * 0.025 : 0.1),
      );
      const color =
        emitted % 4 === 0
          ? 0x55dce8
          : emitted % 4 === 1
            ? 0xff4fc8
            : emitted % 4 === 2
              ? options.color
              : 0xffffff;
      this.mesh.setColorAt(index, this.color.setHex(color));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.visible = this.activeCount > 0;
  }

  update(delta: number, elapsed: number): void {
    if (this.disposed) return;
    if (this.activeCount <= 0) {
      this.mesh.visible = false;
      return;
    }
    for (let index = 0; index < this.fragments.length; index += 1) {
      const fragment = this.fragments[index];
      if (!fragment || !fragment.active) continue;
      fragment.age += delta;
      if (fragment.age >= fragment.lifetime) {
        fragment.active = false;
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.hideInstance(index);
        continue;
      }
      const progress = fragment.age / fragment.lifetime;
      const remaining = 1 - THREE.MathUtils.smoothstep(progress, 0.34, 1);
      const flicker =
        fragment.reducedMotion || Math.sin(fragment.age * 66 + fragment.phase * 3.1) > -0.42 ? 1 : 0.16;
      fragment.position.addScaledVector(fragment.velocity, delta);
      fragment.velocity.multiplyScalar(Math.exp(-delta * 2.6));
      fragment.rotation.y += delta * 2.8;
      this.dummy.position.copy(fragment.position);
      if (!fragment.reducedMotion) {
        this.dummy.position.x += Math.sin(elapsed * 31 + fragment.phase) * 0.045 * remaining;
      }
      this.dummy.rotation.copy(fragment.rotation);
      this.dummy.scale.copy(fragment.scale);
      this.dummy.scale.x *=
        remaining * flicker *
        (fragment.reducedMotion ? 1 : 1 + Math.sin(fragment.age * 43 + fragment.phase) * 0.28);
      this.dummy.scale.y *= remaining * flicker;
      this.dummy.scale.z *= remaining * flicker;
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(index, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = this.activeCount > 0;
  }

  clear(): void {
    if (this.disposed) return;
    for (let index = 0; index < this.fragments.length; index += 1) {
      const fragment = this.fragments[index];
      if (fragment) fragment.active = false;
      this.hideInstance(index);
    }
    this.activeCount = 0;
    this.mesh.visible = false;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    if (this.disposed) return;
    this.disposed = true;
    this.activeCount = 0;
    disposeObjectTree(this.mesh);
  }

  hasActiveMotion(): boolean {
    return this.activeCount > 0;
  }

  private hideInstance(index: number): void {
    this.dummy.position.set(0, -100, 0);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(index, this.dummy.matrix);
  }
}
