import * as THREE from "three";
import type {
  MathQualityTier,
  MathSpellStage,
  MightymaticaZoneContext,
} from "./types";

interface GlyphMark {
  home: THREE.Vector3;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Euler;
  waveStart: THREE.Vector3;
  waveStartRotation: THREE.Euler;
  held: boolean;
  releaseAge: number;
  dissolveAge: number;
  dissolveDuration: number;
  rematerializeAge: number;
  waveAge: number;
  waveDuration: number;
  waveHeight: number;
  waveGlow: number;
  opacity: number;
  glow: number;
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

export interface MindReaderGlyphFieldOptions {
  parent: THREE.Group;
  atlas: THREE.Texture;
  atlasColumns: number;
  atlasRows: number;
  markCount: number;
  chartCenter: Readonly<THREE.Vector3>;
  chartHalfWidth: number;
  chartHalfDepth: number;
  chartY: number;
  floorY: number;
}

const glyphPickLayer = 6;
const glyphPickBroadPhaseRadius = 13;
const maximumGlitchFragments = 72;
const rematerializeDuration = 0.28;
const releasedLifetime = 5;
const escapeMargin = 1.7;
const exhibitSpellReach = 9;
const restingRotationX = -Math.PI / 2;
const hiddenPositionY = -100;

/**
 * Owns the Mind Reader chart's physical marks. Puzzle generation remains in
 * MindReaderExhibit; this controller only handles instanced rendering,
 * telekinetic motion, spell waves, and bounded glitch rematerialization.
 */
export class MindReaderGlyphField {
  private readonly context: MightymaticaZoneContext;
  private readonly parent: THREE.Group;
  private readonly atlas: THREE.Texture;
  private readonly chartCenter: THREE.Vector3;
  private readonly chartHalfWidth: number;
  private readonly chartHalfDepth: number;
  private readonly chartY: number;
  private readonly floorY: number;
  private readonly marks: GlyphMark[] = [];
  private readonly markMesh: THREE.InstancedMesh<
    THREE.PlaneGeometry,
    THREE.ShaderMaterial
  >;
  private readonly pickMesh: THREE.InstancedMesh<
    THREE.BoxGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly glitchMesh: THREE.InstancedMesh<
    THREE.BoxGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly glitchFragments: GlitchFragment[] = [];
  private readonly symbolIndexAttribute: THREE.InstancedBufferAttribute;
  private readonly opacityAttribute: THREE.InstancedBufferAttribute;
  private readonly glowAttribute: THREE.InstancedBufferAttribute;
  private readonly dummy = new THREE.Object3D();
  private readonly dragLocalPoint = new THREE.Vector3();
  private readonly playerWorldPosition = new THREE.Vector3();
  private readonly spellLocalPosition = new THREE.Vector3();
  private readonly chartWorldPosition = new THREE.Vector3();
  private readonly velocityWorldOrigin = new THREE.Vector3();
  private readonly velocityWorldEnd = new THREE.Vector3();
  private readonly glitchColor = new THREE.Color();
  private activeGlitchFragments = 0;
  private maximumActiveGlitchFragments = maximumGlitchFragments;
  private glitchCursor = 0;
  private wave = 0;

  constructor(
    context: MightymaticaZoneContext,
    options: MindReaderGlyphFieldOptions,
  ) {
    this.context = context;
    this.parent = options.parent;
    this.atlas = options.atlas;
    this.chartCenter = new THREE.Vector3().copy(options.chartCenter);
    this.chartHalfWidth = options.chartHalfWidth;
    this.chartHalfDepth = options.chartHalfDepth;
    this.chartY = options.chartY;
    this.floorY = options.floorY;

    const markGeometry = new THREE.PlaneGeometry(0.3, 0.3);
    this.symbolIndexAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(options.markCount),
      1,
    );
    this.opacityAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(options.markCount),
      1,
    );
    this.glowAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(options.markCount),
      1,
    );
    this.symbolIndexAttribute.setUsage(THREE.DynamicDrawUsage);
    this.opacityAttribute.setUsage(THREE.DynamicDrawUsage);
    this.glowAttribute.setUsage(THREE.DynamicDrawUsage);
    markGeometry.setAttribute(
      "instanceSymbolIndex",
      this.symbolIndexAttribute,
    );
    markGeometry.setAttribute("instanceOpacity", this.opacityAttribute);
    markGeometry.setAttribute("instanceGlow", this.glowAttribute);

    const markMaterial = new THREE.ShaderMaterial({
      name: "mind-reader-instanced-glyph-material",
      uniforms: {
        uAtlas: { value: this.atlas },
        uAtlasGrid: {
          value: new THREE.Vector2(
            options.atlasColumns,
            options.atlasRows,
          ),
        },
      },
      vertexShader: `
        uniform vec2 uAtlasGrid;
        attribute float instanceSymbolIndex;
        attribute float instanceOpacity;
        attribute float instanceGlow;
        varying vec2 vAtlasUv;
        varying float vOpacity;
        varying float vGlow;

        void main() {
          float atlasColumn = mod(instanceSymbolIndex, uAtlasGrid.x);
          float atlasRowFromTop =
            floor(instanceSymbolIndex / uAtlasGrid.x);
          float atlasRow = uAtlasGrid.y - atlasRowFromTop - 1.0;
          vAtlasUv =
            (uv + vec2(atlasColumn, atlasRow)) / uAtlasGrid;
          vOpacity = instanceOpacity;
          vGlow = instanceGlow;
          vec4 instancePosition = instanceMatrix * vec4(position, 1.0);
          gl_Position =
            projectionMatrix * modelViewMatrix * instancePosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D uAtlas;
        varying vec2 vAtlasUv;
        varying float vOpacity;
        varying float vGlow;

        void main() {
          float mask = texture2D(uAtlas, vAtlasUv).a;
          if (mask < 0.055 || vOpacity < 0.01) discard;
          vec3 ink = vec3(0.09, 0.055, 0.12);
          vec3 surge = vec3(0.45, 0.22, 0.95);
          vec3 thunder = vec3(0.35, 0.92, 1.0);
          vec3 color = mix(ink, surge, min(1.0, vGlow * 1.25));
          color = mix(color, thunder, max(0.0, vGlow - 0.55));
          gl_FragColor = vec4(color, mask * vOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.markMesh = new THREE.InstancedMesh(
      markGeometry,
      markMaterial,
      options.markCount,
    );
    this.markMesh.name = "mind-reader-physical-symbols";
    this.markMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.markMesh.frustumCulled = false;
    this.markMesh.renderOrder = 4;
    this.parent.add(this.markMesh);

    this.pickMesh = new THREE.InstancedMesh(
      // A cell-shaped target avoids overlapping spherical pick volumes in
      // these tightly packed rows, especially from the isometric camera.
      new THREE.BoxGeometry(0.3, 0.18, 0.27),
      new THREE.MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
        toneMapped: false,
      }),
      options.markCount,
    );
    this.pickMesh.name = "mind-reader-symbol-pick-volumes";
    this.pickMesh.layers.set(glyphPickLayer);
    this.pickMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pickMesh.frustumCulled = false;
    // InstancedMesh caches its first raycast broad phase. Marks can leave the
    // chart, so retain a stable exhibit-wide volume instead of a stale layout.
    this.pickMesh.boundingSphere = new THREE.Sphere(
      this.chartCenter,
      glyphPickBroadPhaseRadius,
    );
    this.parent.add(this.pickMesh);

    this.glitchMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.86,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      maximumGlitchFragments,
    );
    this.glitchMesh.name = "mind-reader-symbol-glitch-fragments";
    this.glitchMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.glitchMesh.frustumCulled = false;
    this.glitchMesh.renderOrder = 6;
    this.glitchMesh.visible = false;
    this.parent.add(this.glitchMesh);

    for (let index = 0; index < options.markCount; index += 1) {
      const home = new THREE.Vector3(
        this.chartCenter.x,
        this.chartY,
        this.chartCenter.z,
      );
      this.marks.push({
        home,
        position: home.clone(),
        velocity: new THREE.Vector3(),
        rotation: new THREE.Euler(restingRotationX, 0, 0),
        waveStart: home.clone(),
        waveStartRotation: new THREE.Euler(restingRotationX, 0, 0),
        held: false,
        releaseAge: 0,
        dissolveAge: -1,
        dissolveDuration: 0,
        rematerializeAge: rematerializeDuration,
        waveAge: 0,
        waveDuration: 0,
        waveHeight: 0,
        waveGlow: 0,
        opacity: 1,
        glow: 0,
      });
      this.symbolIndexAttribute.setX(index, 0);
      this.opacityAttribute.setX(index, 1);
      this.glowAttribute.setX(index, 0);
    }
    for (let index = 0; index < maximumGlitchFragments; index += 1) {
      this.glitchFragments.push({
        active: false,
        age: 0,
        lifetime: 0,
        phase: index * 0.71,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        rotation: new THREE.Euler(),
        scale: new THREE.Vector3(),
      });
      this.hideGlitchFragment(index);
      this.glitchMesh.setColorAt(index, this.glitchColor.setHex(0x55dce8));
    }
    this.glitchMesh.instanceMatrix.needsUpdate = true;
    this.glitchMesh.instanceColor!.needsUpdate = true;

    context.registerInstanceDrag({
      object: this.pickMesh,
      getWorldPosition: (instanceId, target) => {
        const mark = this.marks[instanceId];
        if (!mark) return target.set(0, hiddenPositionY, 0);
        target.copy(mark.position);
        return this.parent.localToWorld(target);
      },
      onStart: (instanceId) => this.beginDrag(instanceId),
      onMove: (instanceId, worldPosition, worldVelocity) =>
        this.moveDrag(instanceId, worldPosition, worldVelocity),
      onEnd: (instanceId, worldVelocity) =>
        this.endDrag(instanceId, worldVelocity),
    });

    this.setQuality(context.quality);
    this.updateInstances();
  }

  setMark(
    index: number,
    home: Readonly<THREE.Vector3>,
    symbolIndex: number,
  ): void {
    const mark = this.marks[index];
    if (!mark) return;
    mark.home.copy(home);
    mark.position.copy(home);
    mark.velocity.set(0, 0, 0);
    mark.rotation.set(restingRotationX, 0, 0);
    mark.waveStart.copy(home);
    mark.waveStartRotation.copy(mark.rotation);
    mark.held = false;
    mark.releaseAge = 0;
    mark.dissolveAge = -1;
    mark.dissolveDuration = 0;
    mark.rematerializeAge = rematerializeDuration;
    mark.waveAge = 0;
    mark.waveDuration = 0;
    mark.waveHeight = 0;
    mark.waveGlow = 0;
    mark.opacity = 1;
    mark.glow = 0;
    this.symbolIndexAttribute.setX(index, symbolIndex);
  }

  commitLayout(): void {
    this.symbolIndexAttribute.needsUpdate = true;
    this.updateInstances();
  }

  update(delta: number, elapsed: number): void {
    let marksChanged = false;
    for (const mark of this.marks) {
      if (mark.dissolveAge >= 0) {
        this.updateDissolve(mark, delta);
        marksChanged = true;
        continue;
      }
      if (mark.rematerializeAge < rematerializeDuration) {
        mark.rematerializeAge = Math.min(
          rematerializeDuration,
          mark.rematerializeAge + delta,
        );
        const progress = THREE.MathUtils.smoothstep(
          mark.rematerializeAge,
          0,
          rematerializeDuration,
        );
        mark.opacity = progress;
        mark.glow = (1 - progress) * 0.9;
        marksChanged = true;
        continue;
      }
      if (mark.waveDuration > 0) {
        this.updateWave(mark, delta);
        marksChanged = true;
        continue;
      }
      if (mark.held) {
        if (!this.context.reducedMotion) {
          mark.rotation.y += delta * 0.65;
        }
        mark.glow = 0.72;
        marksChanged = true;
        continue;
      }
      if (mark.releaseAge > 0) {
        this.updateReleasedMark(mark, delta);
        marksChanged = true;
      }
    }
    if (marksChanged) this.updateInstances();
    this.updateGlitchFragments(delta, elapsed);
  }

  setQuality(quality: MathQualityTier): void {
    this.maximumActiveGlitchFragments =
      quality === "low" ? 24 : quality === "medium" ? 48 : 72;
    this.glitchCursor %= this.maximumActiveGlitchFragments;
    for (
      let index = this.maximumActiveGlitchFragments;
      index < this.glitchFragments.length;
      index += 1
    ) {
      const fragment = this.glitchFragments[index];
      if (!fragment?.active) continue;
      fragment.active = false;
      this.hideGlitchFragment(index);
    }
    this.recountActiveGlitchFragments();
    this.glitchMesh.instanceMatrix.needsUpdate = true;
    this.glitchMesh.visible = this.activeGlitchFragments > 0;
  }

  reactToSpell(stage: MathSpellStage, charge: number): number {
    if (stage === "spark") return 0;
    this.chartWorldPosition.copy(this.chartCenter);
    this.parent.localToWorld(this.chartWorldPosition);
    this.context.copyPlayerPosition(this.playerWorldPosition);
    if (
      Math.hypot(
        this.playerWorldPosition.x - this.chartWorldPosition.x,
        this.playerWorldPosition.z - this.chartWorldPosition.z,
      ) > exhibitSpellReach
    ) {
      return 0;
    }
    this.wave += 1;
    this.spellLocalPosition.copy(this.playerWorldPosition);
    this.parent.worldToLocal(this.spellLocalPosition);
    let lifted = 0;
    for (const mark of this.marks) {
      if (mark.held) continue;
      lifted += 1;
      if (this.context.reducedMotion) {
        this.restoreMark(mark);
        continue;
      }
      mark.waveStart.copy(mark.position);
      mark.waveStartRotation.copy(mark.rotation);
      mark.velocity.set(0, 0, 0);
      mark.releaseAge = 0;
      mark.dissolveAge = -1;
      mark.dissolveDuration = 0;
      mark.rematerializeAge = rematerializeDuration;
      const distanceFromCaster = Math.hypot(
        mark.home.x - this.spellLocalPosition.x,
        mark.home.z - this.spellLocalPosition.z,
      );
      // Delay by radial distance from the actual cast point. This makes the
      // chart behave like a struck surface: the symbols beneath the player
      // rise first and a circular front expands through the surrounding rows.
      mark.waveAge =
        -distanceFromCaster * (stage === "thunder" ? 0.065 : 0.085);
      mark.waveDuration = stage === "thunder" ? 0.92 : 0.76;
      const chargeScale = 0.72 + THREE.MathUtils.clamp(charge, 0, 1) * 0.42;
      mark.waveHeight =
        (stage === "thunder" ? 1.28 : 0.76) * chargeScale;
      mark.waveGlow = stage === "thunder" ? 1 : 0.68;
      mark.opacity = 1;
      mark.glow = mark.waveGlow;
    }
    this.updateInstances();
    return lifted;
  }

  hasActiveMotion(): boolean {
    return (
      this.activeGlitchFragments > 0 ||
      this.marks.some(
        (mark) =>
          mark.held ||
          mark.releaseAge > 0 ||
          mark.dissolveAge >= 0 ||
          mark.rematerializeAge < rematerializeDuration ||
          mark.waveDuration > 0,
      )
    );
  }

  dispose(): void {
    this.parent.remove(this.markMesh, this.pickMesh, this.glitchMesh);
    this.atlas.dispose();
    this.markMesh.geometry.dispose();
    this.markMesh.material.dispose();
    this.pickMesh.geometry.dispose();
    this.pickMesh.material.dispose();
    this.glitchMesh.geometry.dispose();
    this.glitchMesh.material.dispose();
  }

  private beginDrag(index: number): void {
    const mark = this.marks[index];
    if (!mark || mark.dissolveAge >= 0) return;
    mark.held = true;
    mark.releaseAge = 0;
    mark.waveDuration = 0;
    mark.rematerializeAge = rematerializeDuration;
    mark.velocity.set(0, 0, 0);
    mark.opacity = 1;
    mark.glow = 0.72;
    this.updateInstances();
  }

  private moveDrag(
    index: number,
    worldPosition: THREE.Vector3,
    worldVelocity: THREE.Vector3,
  ): void {
    const mark = this.marks[index];
    if (!mark || !mark.held || mark.dissolveAge >= 0) return;
    this.dragLocalPoint.copy(worldPosition);
    this.parent.worldToLocal(this.dragLocalPoint);
    mark.position.copy(this.dragLocalPoint);
    this.copyWorldVelocityToLocal(worldVelocity, mark.velocity);
    mark.rotation.x =
      restingRotationX +
      THREE.MathUtils.clamp(mark.velocity.z * 0.045, -0.32, 0.32);
    mark.rotation.z = THREE.MathUtils.clamp(
      -mark.velocity.x * 0.055,
      -0.42,
      0.42,
    );
    if (this.isBeyondEscape(mark.position)) {
      this.beginDissolve(mark);
    }
    this.updateInstances();
  }

  private endDrag(index: number, worldVelocity: THREE.Vector3): void {
    const mark = this.marks[index];
    if (!mark || mark.dissolveAge >= 0) return;
    mark.held = false;
    this.copyWorldVelocityToLocal(worldVelocity, mark.velocity);
    const planarSpeed = Math.hypot(mark.velocity.x, mark.velocity.z);
    mark.velocity.y = 0.52 + Math.min(1.8, planarSpeed * 0.22);
    mark.releaseAge = releasedLifetime;
    mark.glow = 0.48;
    if (this.isBeyondEscape(mark.position)) {
      this.beginDissolve(mark);
    }
  }

  private copyWorldVelocityToLocal(
    worldVelocity: Readonly<THREE.Vector3>,
    target: THREE.Vector3,
  ): void {
    this.velocityWorldOrigin.set(0, 0, 0);
    this.parent.localToWorld(this.velocityWorldOrigin);
    this.velocityWorldEnd
      .copy(this.velocityWorldOrigin)
      .add(worldVelocity);
    this.parent.worldToLocal(this.velocityWorldEnd);
    target.copy(this.velocityWorldEnd);
  }

  private updateReleasedMark(mark: GlyphMark, delta: number): void {
    mark.releaseAge = Math.max(0, mark.releaseAge - delta);
    mark.position.addScaledVector(mark.velocity, delta);
    mark.velocity.y -= 4.9 * delta;
    const damping = Math.exp(-delta * 1.15);
    mark.velocity.x *= damping;
    mark.velocity.z *= damping;
    mark.rotation.x += delta * (1.2 + Math.abs(mark.velocity.z) * 0.55);
    mark.rotation.y += delta * (0.9 + Math.abs(mark.velocity.x) * 0.4);
    mark.rotation.z += delta * 1.45;
    mark.glow = THREE.MathUtils.lerp(
      0.18,
      mark.glow,
      Math.exp(-delta * 2.8),
    );

    if (this.isBeyondEscape(mark.position)) {
      this.beginDissolve(mark);
      return;
    }

    const overChart = this.isOverChart(mark.position);
    const restingY = overChart ? this.chartY : this.floorY;
    if (mark.position.y > restingY || mark.velocity.y > 0) return;
    mark.position.y = restingY;
    if (!overChart) {
      // Dark ink disappears against the workshop floor. Treat that contact as
      // an invalid address instead: the mark visibly checksum-sizzles out and
      // rematerializes in its authored chart cell.
      mark.velocity.y = 0;
      this.beginDissolve(mark);
      return;
    }
    if (Math.abs(mark.velocity.y) > 0.72) {
      mark.velocity.y = Math.abs(mark.velocity.y) * 0.18;
      mark.velocity.x *= 0.72;
      mark.velocity.z *= 0.72;
      return;
    }
    mark.releaseAge = 0;
    mark.velocity.set(0, 0, 0);
    mark.rotation.set(restingRotationX, 0, 0);
    mark.glow = mark.position.distanceToSquared(mark.home) > 0.02 ? 0.2 : 0;
  }

  private updateWave(mark: GlyphMark, delta: number): void {
    mark.waveAge += delta;
    if (mark.waveAge < 0) return;
    const progress = THREE.MathUtils.clamp(
      mark.waveAge / mark.waveDuration,
      0,
      1,
    );
    const eased = THREE.MathUtils.smootherstep(progress, 0, 1);
    const arc = Math.sin(progress * Math.PI);
    mark.position.lerpVectors(mark.waveStart, mark.home, eased);
    mark.position.y += arc * mark.waveHeight;
    mark.rotation.set(
      THREE.MathUtils.lerp(
        mark.waveStartRotation.x,
        restingRotationX,
        eased,
      ) +
        arc * 0.82,
      THREE.MathUtils.lerp(mark.waveStartRotation.y, 0, eased) +
        arc * (this.wave % 2 === 0 ? 0.62 : -0.62),
      THREE.MathUtils.lerp(mark.waveStartRotation.z, 0, eased) +
        arc * 0.48,
    );
    mark.opacity = 1;
    mark.glow = 0.2 + arc * mark.waveGlow;
    if (progress < 1) return;
    this.restoreMark(mark);
  }

  private beginDissolve(mark: GlyphMark): void {
    if (mark.dissolveAge >= 0) return;
    mark.held = false;
    mark.releaseAge = 0;
    mark.waveDuration = 0;
    mark.dissolveAge = 0;
    mark.dissolveDuration = this.context.reducedMotion ? 0.18 : 0.52;
    mark.opacity = 1;
    mark.glow = 1;
    this.emitGlitchFragments(mark);
  }

  private updateDissolve(mark: GlyphMark, delta: number): void {
    mark.dissolveAge = Math.min(
      mark.dissolveDuration,
      mark.dissolveAge + delta,
    );
    mark.position.addScaledVector(mark.velocity, delta * 0.24);
    mark.velocity.multiplyScalar(Math.exp(-delta * 4.4));
    mark.rotation.x += delta * 4.1;
    mark.rotation.y += delta * 5.3;
    const progress = mark.dissolveAge / mark.dissolveDuration;
    const remaining =
      1 - THREE.MathUtils.smoothstep(progress, 0.05, 1);
    const flicker =
      Math.sin(progress * 76 + mark.home.x * 3.1) > -0.5 ? 1 : 0.08;
    mark.opacity = remaining * flicker;
    mark.glow = remaining;
    if (mark.dissolveAge < mark.dissolveDuration) return;
    this.restoreMark(mark);
    mark.rematerializeAge = 0;
    mark.opacity = 0;
    mark.glow = 1;
  }

  private restoreMark(mark: GlyphMark): void {
    mark.position.copy(mark.home);
    mark.velocity.set(0, 0, 0);
    mark.rotation.set(restingRotationX, 0, 0);
    mark.held = false;
    mark.releaseAge = 0;
    mark.dissolveAge = -1;
    mark.dissolveDuration = 0;
    mark.rematerializeAge = rematerializeDuration;
    mark.waveAge = 0;
    mark.waveDuration = 0;
    mark.waveHeight = 0;
    mark.waveGlow = 0;
    mark.opacity = 1;
    mark.glow = 0;
  }

  private isBeyondEscape(position: Readonly<THREE.Vector3>): boolean {
    return (
      Math.abs(position.x - this.chartCenter.x) >
        this.chartHalfWidth + escapeMargin ||
      Math.abs(position.z - this.chartCenter.z) >
        this.chartHalfDepth + escapeMargin ||
      position.y > 5.2
    );
  }

  private isOverChart(position: Readonly<THREE.Vector3>): boolean {
    return (
      Math.abs(position.x - this.chartCenter.x) <= this.chartHalfWidth &&
      Math.abs(position.z - this.chartCenter.z) <= this.chartHalfDepth
    );
  }

  private emitGlitchFragments(mark: GlyphMark): void {
    const requestedCount =
      this.maximumActiveGlitchFragments <= 24
        ? 7
        : this.maximumActiveGlitchFragments <= 48
          ? 10
          : 14;
    for (let emitted = 0; emitted < requestedCount; emitted += 1) {
      const index = this.glitchCursor;
      this.glitchCursor =
        (this.glitchCursor + 1) % this.maximumActiveGlitchFragments;
      const fragment = this.glitchFragments[index];
      if (!fragment) continue;
      if (!fragment.active) this.activeGlitchFragments += 1;
      const phase =
        mark.home.x * 2.7 +
        mark.home.z * 1.9 +
        emitted * 2.39996 +
        this.wave * 0.73;
      fragment.active = true;
      fragment.age = 0;
      fragment.lifetime =
        (this.context.reducedMotion ? 0.16 : 0.31) +
        (emitted % 5) * 0.045;
      fragment.phase = phase;
      fragment.position.set(
        mark.position.x + Math.sin(phase * 1.7) * 0.14,
        mark.position.y + ((emitted % 5) - 2) * 0.045,
        mark.position.z + Math.cos(phase * 1.3) * 0.12,
      );
      fragment.velocity.set(
        mark.velocity.x * 0.12 + Math.cos(phase) * 0.38,
        0.12 + (emitted % 4) * 0.1,
        mark.velocity.z * 0.12 + Math.sin(phase) * 0.32,
      );
      fragment.rotation.set(phase * 0.07, phase * 0.13, phase * 0.09);
      fragment.scale.set(
        emitted % 3 === 0 ? 0.16 : 0.08 + (emitted % 4) * 0.035,
        emitted % 3 === 0 ? 0.018 : 0.045,
        emitted % 3 === 0 ? 0.028 : 0.045,
      );
      const color =
        emitted % 4 === 0
          ? 0x55dce8
          : emitted % 4 === 1
            ? 0xff4fc8
            : emitted % 4 === 2
              ? 0xa889ff
              : 0xffffff;
      this.glitchMesh.setColorAt(index, this.glitchColor.setHex(color));
    }
    this.glitchMesh.instanceColor!.needsUpdate = true;
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
        this.hideGlitchFragment(index);
        continue;
      }
      const progress = fragment.age / fragment.lifetime;
      const remaining =
        1 - THREE.MathUtils.smoothstep(progress, 0.28, 1);
      const flicker =
        Math.sin(fragment.age * 68 + fragment.phase * 3.1) > -0.45
          ? 1
          : 0.14;
      fragment.position.addScaledVector(fragment.velocity, delta);
      fragment.velocity.multiplyScalar(Math.exp(-delta * 2.8));
      fragment.rotation.y += delta * 3.4;
      this.dummy.position.copy(fragment.position);
      this.dummy.position.x +=
        Math.sin(elapsed * 33 + fragment.phase) * 0.04 * remaining;
      this.dummy.rotation.copy(fragment.rotation);
      this.dummy.scale.copy(fragment.scale);
      this.dummy.scale.multiplyScalar(remaining * flicker);
      this.dummy.scale.x *=
        1 + Math.sin(fragment.age * 47 + fragment.phase) * 0.32;
      this.dummy.updateMatrix();
      this.glitchMesh.setMatrixAt(index, this.dummy.matrix);
    }
    this.glitchMesh.instanceMatrix.needsUpdate = true;
    this.glitchMesh.visible = this.activeGlitchFragments > 0;
  }

  private recountActiveGlitchFragments(): void {
    this.activeGlitchFragments = this.glitchFragments.reduce(
      (count, fragment) => count + (fragment.active ? 1 : 0),
      0,
    );
  }

  private hideGlitchFragment(index: number): void {
    this.dummy.position.set(0, hiddenPositionY, 0);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    this.glitchMesh.setMatrixAt(index, this.dummy.matrix);
  }

  private updateInstances(): void {
    for (const [index, mark] of this.marks.entries()) {
      const dissolving =
        mark.dissolveAge >= 0 && mark.dissolveDuration > 0;
      let visibleScale = 1;
      if (dissolving) {
        const progress = mark.dissolveAge / mark.dissolveDuration;
        const remaining =
          1 - THREE.MathUtils.smoothstep(progress, 0.06, 1);
        visibleScale =
          remaining *
          (1 + Math.sin(progress * 51 + index * 0.7) * 0.24);
      }

      this.dummy.position.copy(mark.position);
      if (dissolving) {
        const progress = mark.dissolveAge / mark.dissolveDuration;
        this.dummy.position.x +=
          Math.sin(progress * 41 + index) * 0.09 * visibleScale;
      }
      this.dummy.rotation.copy(mark.rotation);
      this.dummy.scale.setScalar(Math.max(0, visibleScale));
      this.dummy.updateMatrix();
      this.markMesh.setMatrixAt(index, this.dummy.matrix);
      this.opacityAttribute.setX(index, mark.opacity);
      this.glowAttribute.setX(index, mark.glow);

      const pickable =
        !dissolving &&
        mark.rematerializeAge >= rematerializeDuration * 0.82;
      this.dummy.position.copy(mark.position);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(pickable ? 1 : 0);
      this.dummy.updateMatrix();
      this.pickMesh.setMatrixAt(index, this.dummy.matrix);
    }
    this.markMesh.instanceMatrix.needsUpdate = true;
    this.pickMesh.instanceMatrix.needsUpdate = true;
    this.opacityAttribute.needsUpdate = true;
    this.glowAttribute.needsUpdate = true;
  }
}
