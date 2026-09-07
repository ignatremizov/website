import * as THREE from "three";
import type { QualityTier } from "../world/WorldContracts";

const circlePointCount = 81;
const circleSegmentCount = 64;
const pillarCount = 14;

const glyphSegments = [
  [-0.56, 0, 0, 0, 0, -0.66],
  [0, 0, -0.66, 0.56, 0, 0],
  [0.56, 0, 0, 0, 0, 0.66],
  [0, 0, 0.66, -0.56, 0, 0],
  [-0.34, 0, -0.34, 0.34, 0, 0.34],
  [0.34, 0, -0.34, -0.34, 0, 0.34],
  [0, 0, -0.92, 0, 0, -0.66],
  [0.92, 0, 0, 0.56, 0, 0],
  [0, 0, 0.66, 0, 0, 0.92],
  [-0.92, 0, 0, -0.56, 0, 0],
  [-0.16, 0, -0.08, 0, 0, -0.34],
  [0, 0, -0.34, 0.16, 0, -0.08],
  [0.16, 0, -0.08, 0, 0, 0.06],
  [0, 0, 0.06, -0.16, 0, -0.08],
  [-0.15, 0, -0.82, 0, 0, -1.02],
  [0, 0, -1.02, 0.15, 0, -0.82],
  [-0.1, 0, -0.9, 0.1, 0, -0.9],
  [0.82, 0, -0.15, 1.02, 0, 0],
  [1.02, 0, 0, 0.82, 0, 0.15],
  [0.9, 0, -0.1, 0.9, 0, 0.1],
  [0.15, 0, 0.82, 0, 0, 1.02],
  [0, 0, 1.02, -0.15, 0, 0.82],
  [0.1, 0, 0.9, -0.1, 0, 0.9],
  [-0.82, 0, 0.15, -1.02, 0, 0],
  [-1.02, 0, 0, -0.82, 0, -0.15],
  [-0.9, 0, 0.1, -0.9, 0, -0.1],
] as const;

function smoothRange(value: number, start: number, end: number): number {
  return THREE.MathUtils.smoothstep(value, start, end);
}

export class PencilTeleportRitual {
  readonly group = new THREE.Group();

  private readonly circle: THREE.Line<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >;
  private readonly circleStroke: THREE.Mesh<
    THREE.RingGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly glyph: THREE.LineSegments<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >;
  private readonly glyphStrokes: THREE.InstancedMesh<
    THREE.BoxGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly aura: THREE.Mesh<
    THREE.RingGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly sigilGround: THREE.Mesh<
    THREE.CircleGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly flashDisc: THREE.Mesh<
    THREE.CircleGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly beam: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly waveColumn: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.ShaderMaterial
  >;
  private readonly pillarSegments: THREE.InstancedMesh<
    THREE.CylinderGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly tracer: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly handTrace: THREE.Line<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >;
  private readonly light = new THREE.PointLight(0x8ff7ff, 0, 9, 2);
  private readonly circlePositions: Float32Array;
  private readonly glyphPositions: Float32Array;
  private readonly handTracePositions = new Float32Array(6);
  private readonly dummy = new THREE.Object3D();
  private readonly circleStrokeIndexCount: number;
  private phase: "idle" | "drawing" | "departing" = "idle";
  private age = 0;
  private phaseDuration = 1;
  private progress = 0;
  private reducedMotion = false;
  private disposed = false;
  private lightingEnabled = true;

  constructor(scene: THREE.Scene) {
    this.group.name = "cyan-pencil-teleport-ritual";
    this.group.visible = false;

    this.circlePositions = new Float32Array(circlePointCount * 3);
    for (let index = 0; index < circlePointCount; index += 1) {
      const angle = (index / (circlePointCount - 1)) * Math.PI * 2;
      const offset = index * 3;
      this.circlePositions[offset] = Math.cos(angle) * 1.24;
      this.circlePositions[offset + 1] = 0.064;
      this.circlePositions[offset + 2] = Math.sin(angle) * 1.24;
    }
    const circleGeometry = new THREE.BufferGeometry();
    circleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.circlePositions, 3),
    );
    circleGeometry.setDrawRange(0, 0);
    this.circle = new THREE.Line(
      circleGeometry,
      new THREE.LineBasicMaterial({
        color: 0xe7feff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.circle.renderOrder = 9;

    const circleStrokeGeometry = new THREE.RingGeometry(
      1.17,
      1.31,
      circleSegmentCount,
    );
    circleStrokeGeometry.setDrawRange(0, 0);
    this.circleStrokeIndexCount =
      circleStrokeGeometry.index?.count ??
      circleStrokeGeometry.getAttribute("position").count;
    this.circleStroke = new THREE.Mesh(
      circleStrokeGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x55dce8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    this.circleStroke.rotation.x = -Math.PI / 2;
    this.circleStroke.position.y = 0.034;
    this.circleStroke.renderOrder = 8;

    this.glyphPositions = new Float32Array(glyphSegments.length * 6);
    for (const [index, segment] of glyphSegments.entries()) {
      const offset = index * 6;
      this.glyphPositions.set(segment, offset);
      this.glyphPositions[offset + 1] = 0.068;
      this.glyphPositions[offset + 4] = 0.068;
    }
    const glyphGeometry = new THREE.BufferGeometry();
    glyphGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.glyphPositions, 3),
    );
    glyphGeometry.setDrawRange(0, 0);
    this.glyph = new THREE.LineSegments(
      glyphGeometry,
      new THREE.LineBasicMaterial({
        color: 0xe7feff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.glyph.renderOrder = 10;

    this.glyphStrokes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.024, 0.075),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      glyphSegments.length,
    );
    this.glyphStrokes.name = "teleport-ritual-thick-glyph-strokes";
    this.glyphStrokes.count = 0;
    this.glyphStrokes.frustumCulled = false;
    this.glyphStrokes.renderOrder = 9;
    for (const [index, segment] of glyphSegments.entries()) {
      const startX = segment[0];
      const startZ = segment[2];
      const endX = segment[3];
      const endZ = segment[5];
      const deltaX = endX - startX;
      const deltaZ = endZ - startZ;
      this.dummy.position.set(
        (startX + endX) / 2,
        0.054,
        (startZ + endZ) / 2,
      );
      this.dummy.rotation.set(0, -Math.atan2(deltaZ, deltaX), 0);
      this.dummy.scale.set(Math.hypot(deltaX, deltaZ), 1, 1);
      this.dummy.updateMatrix();
      this.glyphStrokes.setMatrixAt(index, this.dummy.matrix);
      this.glyphStrokes.setColorAt(
        index,
        new THREE.Color(index >= 10 ? 0xffd985 : 0x55dce8),
      );
    }
    this.glyphStrokes.instanceMatrix.needsUpdate = true;
    if (this.glyphStrokes.instanceColor) {
      this.glyphStrokes.instanceColor.needsUpdate = true;
    }

    this.aura = new THREE.Mesh(
      new THREE.RingGeometry(0.78, 1.39, 64),
      new THREE.MeshBasicMaterial({
        color: 0x55dce8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.position.y = 0.02;
    this.aura.renderOrder = 7;

    this.sigilGround = new THREE.Mesh(
      new THREE.CircleGeometry(1.42, 64),
      new THREE.MeshBasicMaterial({
        color: 0x082b31,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    this.sigilGround.name = "teleport-ritual-sigil-ground";
    this.sigilGround.rotation.x = -Math.PI / 2;
    this.sigilGround.position.y = 0.018;
    this.sigilGround.renderOrder = 6;

    this.flashDisc = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshBasicMaterial({
        color: 0xdffcff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.flashDisc.name = "teleport-ritual-departure-flash";
    this.flashDisc.rotation.x = -Math.PI / 2;
    this.flashDisc.position.y = 0.075;
    this.flashDisc.visible = false;
    this.flashDisc.renderOrder = 11;

    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.88, 5.4, 18, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x8ff7ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.beam.name = "teleport-ritual-light-column";
    this.beam.position.y = 2.7;
    this.beam.visible = false;
    this.beam.frustumCulled = false;
    this.beam.renderOrder = 10;

    this.waveColumn = new THREE.Mesh(
      new THREE.CylinderGeometry(1.04, 1.18, 3.5, 32, 24, true),
      new THREE.ShaderMaterial({
        name: "teleport-ritual-wavy-column",
        uniforms: {
          uTime: { value: 0 },
          uStrength: { value: 0 },
          uOpacity: { value: 0 },
        },
        vertexShader: `
          uniform float uTime;
          uniform float uStrength;
          varying vec2 vUv;
          varying float vWave;

          void main() {
            vUv = uv;
            vec3 displaced = position;
            float angle = atan(position.z, position.x);
            float primary = sin(
              position.y * 5.1 + uTime * 4.7 + angle * 2.0
            );
            float secondary = sin(
              position.y * 8.7 - uTime * 3.2 - angle * 3.0
            );
            float wave = primary + secondary * 0.42;
            float radialScale = 1.0 + wave * 0.052 * uStrength;
            displaced.xz *= radialScale;
            displaced.x +=
              sin(position.y * 2.35 + uTime * 2.1) *
              0.055 *
              uStrength;
            displaced.z +=
              cos(position.y * 2.65 - uTime * 1.8) *
              0.045 *
              uStrength;
            vWave = wave;
            gl_Position =
              projectionMatrix *
              modelViewMatrix *
              vec4(displaced, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uOpacity;
          varying vec2 vUv;
          varying float vWave;

          void main() {
            float endFade =
              smoothstep(0.0, 0.13, vUv.y) *
              (1.0 - smoothstep(0.84, 1.0, vUv.y));
            float brokenBand = 0.5 + 0.5 * sin(
              vUv.y * 48.0 -
              uTime * 6.2 +
              sin(vUv.x * 19.0 + uTime * 1.7) * 1.5
            );
            brokenBand = pow(brokenBand, 6.0);
            float broadBand = 0.5 + 0.5 * sin(
              vUv.y * 18.0 +
              uTime * 2.7 -
              vUv.x * 6.28318
            );
            broadBand = pow(broadBand, 3.0);
            float shimmer = 0.72 + abs(vWave) * 0.16;
            float alpha =
              (0.025 + brokenBand * 0.24 + broadBand * 0.075) *
              endFade *
              uOpacity *
              shimmer;
            vec3 color = mix(
              vec3(0.28, 0.86, 0.94),
              vec3(0.91, 1.0, 1.0),
              brokenBand * 0.72 + broadBand * 0.18
            );
            if (alpha < 0.005) discard;
            gl_FragColor = vec4(color, alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.waveColumn.name = "teleport-ritual-wavy-column";
    this.waveColumn.position.y = 1.76;
    this.waveColumn.visible = false;
    this.waveColumn.frustumCulled = false;
    this.waveColumn.renderOrder = 9;

    this.pillarSegments = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.055, 0.085, 0.62, 6, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x8ff7ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      pillarCount,
    );
    this.pillarSegments.name = "teleport-ritual-rising-pillar-segments";
    this.pillarSegments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pillarSegments.frustumCulled = false;
    this.pillarSegments.visible = false;
    this.pillarSegments.renderOrder = 10;

    this.tracer = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.tracer.renderOrder = 12;

    const handTraceGeometry = new THREE.BufferGeometry();
    const handTraceAttribute = new THREE.BufferAttribute(
      this.handTracePositions,
      3,
    );
    handTraceAttribute.setUsage(THREE.DynamicDrawUsage);
    handTraceGeometry.setAttribute("position", handTraceAttribute);
    this.handTrace = new THREE.Line(
      handTraceGeometry,
      new THREE.LineBasicMaterial({
        color: 0xc9fbff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.handTrace.renderOrder = 11;

    this.light.position.y = 0.42;
    this.light.castShadow = false;
    this.group.add(
      this.sigilGround,
      this.aura,
      this.circleStroke,
      this.circle,
      this.glyphStrokes,
      this.glyph,
      this.flashDisc,
      this.waveColumn,
      this.beam,
      this.pillarSegments,
      this.tracer,
      this.handTrace,
      this.light,
    );
    scene.add(this.group);
  }

  get active(): boolean {
    return this.phase !== "idle";
  }

  get poseBlend(): number {
    if (!this.active) return 0;
    return (
      smoothRange(this.progress, 0.02, 0.2) *
      (1 - smoothRange(this.progress, 0.93, 1))
    );
  }

  get avatarSpin(): number {
    if (!this.active || this.reducedMotion) return 0;
    const drawingTurn = smoothRange(this.progress, 0.015, 0.34);
    const departureTurn = smoothRange(this.progress, 0.82, 1);
    return -(drawingTurn + departureTurn) * Math.PI * 2;
  }

  setQuality(quality: QualityTier): void {
    this.lightingEnabled = quality !== "low";
    this.light.visible = this.lightingEnabled;
    if (!this.lightingEnabled) this.light.intensity = 0;
  }

  start(
    position: THREE.Vector3,
    heading: number,
    drawingDuration: number,
    reducedMotion = false,
  ): void {
    this.group.position.copy(position);
    this.group.rotation.y = heading;
    this.group.visible = true;
    this.phase = "drawing";
    this.age = 0;
    this.phaseDuration = Math.max(0.05, drawingDuration);
    this.progress = 0;
    this.reducedMotion = reducedMotion;
    this.circle.geometry.setDrawRange(0, 0);
    this.circleStroke.geometry.setDrawRange(0, 0);
    this.glyph.geometry.setDrawRange(0, 0);
    this.glyphStrokes.count = 0;
    this.circle.rotation.y = 0;
    this.circleStroke.rotation.z = 0;
    this.glyph.rotation.y = 0;
    this.glyphStrokes.rotation.y = 0;
    this.circle.material.opacity = 0;
    this.circleStroke.material.opacity = 0;
    this.glyph.material.opacity = 0;
    this.glyphStrokes.material.opacity = 0;
    this.aura.material.opacity = 0;
    this.sigilGround.material.opacity = 0;
    this.flashDisc.material.opacity = 0;
    this.flashDisc.visible = false;
    this.beam.material.opacity = 0;
    this.beam.visible = false;
    this.waveColumn.material.uniforms.uTime!.value = 0;
    this.waveColumn.material.uniforms.uStrength!.value = 0;
    this.waveColumn.material.uniforms.uOpacity!.value = 0;
    this.waveColumn.visible = false;
    this.pillarSegments.material.opacity = 0;
    this.pillarSegments.visible = false;
    this.tracer.material.opacity = 0;
    this.handTrace.material.opacity = 0;
    this.light.intensity = 0;
  }

  depart(duration: number): void {
    if (!this.active) return;
    this.phase = "departing";
    this.age = 0;
    this.phaseDuration = Math.max(0.05, duration);
    this.progress = Math.max(this.progress, 0.82);
  }

  update(delta: number): void {
    if (!this.active) return;
    this.age += delta;
    if (this.phase === "drawing") {
      this.progress = Math.min(0.82, (this.age / this.phaseDuration) * 0.82);
    } else {
      this.progress =
        0.82 + Math.min(1, this.age / this.phaseDuration) * 0.18;
    }

    const fadeIn = smoothRange(this.progress, 0, 0.075);
    const departureProgress = smoothRange(this.progress, 0.82, 1);
    const departureFade =
      1 - smoothRange(departureProgress, 0.68, 1);
    const opacity = fadeIn * departureFade;
    const circleProgress = smoothRange(this.progress, 0.015, 0.34);
    const glyphProgress = smoothRange(this.progress, 0.31, 0.7);
    const sealPulse =
      glyphProgress *
      (0.78 + Math.sin(this.age * 8.5) * 0.22);
    const circleCount = Math.max(
      0,
      Math.min(
        circlePointCount,
        Math.ceil(circleProgress * circlePointCount),
      ),
    );
    const circleStrokeSegments = Math.min(
      circleSegmentCount,
      Math.ceil(circleProgress * circleSegmentCount),
    );
    const circleStrokeCount = Math.min(
      this.circleStrokeIndexCount,
      circleStrokeSegments * 6,
    );
    const glyphVertexCount = this.glyphPositions.length / 3;
    const glyphCount = Math.max(
      0,
      Math.min(
        glyphVertexCount,
        Math.ceil(glyphProgress * glyphVertexCount / 2) * 2,
      ),
    );
    this.circle.geometry.setDrawRange(0, circleCount);
    this.circleStroke.geometry.setDrawRange(0, circleStrokeCount);
    this.glyph.geometry.setDrawRange(0, glyphCount);
    this.glyphStrokes.count = Math.min(
      glyphSegments.length,
      Math.ceil(glyphProgress * glyphSegments.length),
    );
    this.circle.material.opacity =
      opacity * (0.9 + sealPulse * 0.1);
    this.circleStroke.material.opacity =
      opacity * (0.5 + sealPulse * 0.32);
    this.glyph.material.opacity =
      opacity * (0.76 + glyphProgress * 0.24);
    this.glyphStrokes.material.opacity =
      opacity * (0.42 + glyphProgress * 0.46);
    this.aura.material.opacity =
      opacity * (0.07 + glyphProgress * 0.2);
    this.sigilGround.material.opacity =
      opacity * (0.055 + glyphProgress * 0.105);
    this.aura.scale.setScalar(
      0.94 + glyphProgress * 0.08 + sealPulse * 0.025,
    );

    const departureSpin =
      this.reducedMotion ? 0 : departureProgress * Math.PI * 0.72;
    this.glyph.rotation.y = departureSpin;
    this.glyphStrokes.rotation.y = departureSpin;
    this.circleStroke.rotation.z =
      this.reducedMotion ? 0 : -departureProgress * 0.32;

    const drawingCircle = circleProgress < 0.999;
    let traceX = 0;
    let traceY = 0.082;
    let traceZ = 0;
    if (drawingCircle) {
      const pointIndex = Math.min(
        circlePointCount - 1,
        Math.max(0, circleCount - 1),
      );
      traceX = this.circlePositions[pointIndex * 3] ?? 0;
      traceZ = this.circlePositions[pointIndex * 3 + 2] ?? 0;
    } else if (glyphCount > 0) {
      const pointIndex = Math.min(
        this.glyphPositions.length / 3 - 1,
        glyphCount - 1,
      );
      traceX = this.glyphPositions[pointIndex * 3] ?? 0;
      traceZ = this.glyphPositions[pointIndex * 3 + 2] ?? 0;
    }
    this.tracer.position.set(traceX, traceY, traceZ);
    this.tracer.material.opacity =
      this.progress < 0.82 ? opacity : 0;
    this.tracer.scale.setScalar(
      0.84 + Math.sin(this.age * 20) * 0.2,
    );

    const avatarSpin = this.avatarSpin;
    const handBaseX = 0.98;
    const handBaseZ = 0.12;
    this.handTracePositions[0] =
      Math.cos(avatarSpin) * handBaseX +
      Math.sin(avatarSpin) * handBaseZ;
    this.handTracePositions[1] = 0.16;
    this.handTracePositions[2] =
      -Math.sin(avatarSpin) * handBaseX +
      Math.cos(avatarSpin) * handBaseZ;
    this.handTracePositions[3] = traceX;
    this.handTracePositions[4] = traceY;
    this.handTracePositions[5] = traceZ;
    (
      this.handTrace.geometry.getAttribute("position") as THREE.BufferAttribute
    ).needsUpdate = true;
    this.handTrace.material.opacity =
      this.progress < 0.82 ? opacity * 0.34 : 0;

    this.updatePillars(glyphProgress, departureProgress);
    this.updateWaveColumn(glyphProgress, departureProgress, opacity);
    this.updateDepartureFlash(departureProgress);
  }

  private updateWaveColumn(
    glyphProgress: number,
    departureProgress: number,
    opacity: number,
  ): void {
    const activation = smoothRange(glyphProgress, 0.32, 0.92);
    const departureSurge =
      Math.sin(Math.min(1, departureProgress) * Math.PI);
    const strength =
      activation *
      (0.42 + departureSurge * 0.58) *
      (1 - smoothRange(departureProgress, 0.78, 1));
    this.waveColumn.visible = strength > 0.002;
    this.waveColumn.material.uniforms.uTime!.value =
      this.reducedMotion ? 0 : this.age;
    this.waveColumn.material.uniforms.uStrength!.value =
      this.reducedMotion ? 0.18 : strength;
    this.waveColumn.material.uniforms.uOpacity!.value =
      opacity *
      strength *
      (this.reducedMotion ? 0.34 : 1);
    this.waveColumn.rotation.y =
      this.reducedMotion ? 0 : -this.age * 0.16;
    this.waveColumn.scale.set(
      0.94 + departureSurge * 0.08,
      0.86 + departureProgress * 0.16,
      0.94 + departureSurge * 0.08,
    );
  }

  private updatePillars(
    glyphProgress: number,
    departureProgress: number,
  ): void {
    if (this.reducedMotion) {
      this.pillarSegments.visible = false;
      this.pillarSegments.material.opacity = 0;
      return;
    }
    const pillarActivation = smoothRange(glyphProgress, 0.48, 1);
    this.pillarSegments.visible =
      pillarActivation > 0.001 || departureProgress > 0.001;
    const pillarFade =
      1 - smoothRange(departureProgress, 0.58, 1);
    this.pillarSegments.material.opacity =
      (0.18 + pillarActivation * 0.42) * pillarFade;

    for (let index = 0; index < pillarCount; index += 1) {
      const sequence = index / pillarCount;
      const rise = smoothRange(
        pillarActivation,
        sequence * 0.58,
        0.3 + sequence * 0.58,
      );
      const angle =
        sequence * Math.PI * 2 +
        departureProgress * (index % 2 === 0 ? 0.28 : -0.28);
      const radius = 1.43 + (index % 2) * 0.08;
      const segmentHeight = 0.5 + (index % 4) * 0.11;
      const departureLift =
        departureProgress * (1.65 + (index % 5) * 0.42);
      this.dummy.position.set(
        Math.cos(angle) * radius,
        0.08 + rise * (0.28 + (index % 3) * 0.08) + departureLift,
        Math.sin(angle) * radius,
      );
      this.dummy.rotation.set(
        (index % 2 === 0 ? 0.12 : -0.12) * rise,
        -angle,
        (index % 3 - 1) * 0.08 * rise,
      );
      const visibleScale = Math.max(0.001, rise);
      this.dummy.scale.set(
        visibleScale * (0.8 + (index % 2) * 0.18),
        visibleScale *
          (segmentHeight + departureProgress * (0.8 + (index % 3) * 0.22)),
        visibleScale * (0.8 + ((index + 1) % 2) * 0.18),
      );
      this.dummy.updateMatrix();
      this.pillarSegments.setMatrixAt(index, this.dummy.matrix);
    }
    this.pillarSegments.instanceMatrix.needsUpdate = true;
  }

  private updateDepartureFlash(departureProgress: number): void {
    if (departureProgress <= 0) {
      this.flashDisc.visible = false;
      this.beam.visible = false;
      this.flashDisc.material.opacity = 0;
      this.beam.material.opacity = 0;
      this.light.intensity = this.lightingEnabled
        ? 1.1 + smoothRange(this.progress, 0.28, 0.72) * 3.6
        : 0;
      return;
    }

    const flashEnvelope =
      Math.sin(Math.min(1, departureProgress) * Math.PI);
    const flashFade =
      1 - smoothRange(departureProgress, 0.7, 1);
    this.flashDisc.visible = true;
    this.flashDisc.scale.setScalar(
      0.38 + departureProgress * (this.reducedMotion ? 1.7 : 3.7),
    );
    this.flashDisc.material.opacity =
      flashEnvelope * (this.reducedMotion ? 0.2 : 0.74);
    this.beam.visible = !this.reducedMotion;
    this.beam.scale.set(
      0.72 + flashEnvelope * 0.38,
      0.72 + departureProgress * 0.34,
      0.72 + flashEnvelope * 0.38,
    );
    this.beam.material.opacity =
      flashEnvelope * flashFade * 0.3;
    this.light.intensity = this.lightingEnabled
      ? flashFade *
        (this.reducedMotion
          ? 2.8 + flashEnvelope * 2.2
          : 4.2 + flashEnvelope * 13.5)
      : 0;
  }

  stop(): void {
    if (this.disposed) return;
    this.phase = "idle";
    this.progress = 0;
    this.group.visible = false;
    this.flashDisc.visible = false;
    this.beam.visible = false;
    this.waveColumn.visible = false;
    this.pillarSegments.visible = false;
    this.light.intensity = 0;
  }

  dispose(scene: THREE.Scene): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    scene.remove(this.group);
    this.glyphStrokes.dispose();
    this.pillarSegments.dispose();
    this.circle.geometry.dispose();
    this.circle.material.dispose();
    this.circleStroke.geometry.dispose();
    this.circleStroke.material.dispose();
    this.glyph.geometry.dispose();
    this.glyph.material.dispose();
    this.glyphStrokes.geometry.dispose();
    this.glyphStrokes.material.dispose();
    this.aura.geometry.dispose();
    this.aura.material.dispose();
    this.sigilGround.geometry.dispose();
    this.sigilGround.material.dispose();
    this.flashDisc.geometry.dispose();
    this.flashDisc.material.dispose();
    this.beam.geometry.dispose();
    this.beam.material.dispose();
    this.waveColumn.geometry.dispose();
    this.waveColumn.material.dispose();
    this.pillarSegments.geometry.dispose();
    this.pillarSegments.material.dispose();
    this.tracer.geometry.dispose();
    this.tracer.material.dispose();
    this.handTrace.geometry.dispose();
    this.handTrace.material.dispose();
    this.light.dispose();
  }
}
