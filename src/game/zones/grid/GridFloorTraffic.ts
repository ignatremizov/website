import * as THREE from "three";

import type { QualityTier } from "../../../world/WorldContracts";

type GridRoutePoint = readonly [x: number, z: number];

interface GridRoute {
  points: readonly GridRoutePoint[];
  cumulativeLengths: Float32Array;
  length: number;
  speed: number;
  color: THREE.Color;
}

interface GridFloorTrafficState {
  group: THREE.Group;
  bolts: THREE.LineSegments<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >;
  boltPositions: Float32Array;
  heads: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  headPositions: Float32Array;
  activePulseCount: number;
}

const segmentsPerPulse = 5;
const maximumPulseCount = 12;
const trafficY = 0.205;

const routeDefinitions = [
  {
    points: [
      [-13.2, -9.4],
      [-8.4, -9.4],
      [-8.4, -4.1],
      [-2.1, -4.1],
      [-2.1, 2.7],
      [3.2, 2.7],
      [3.2, 10.9],
    ],
    speed: 2.45,
    color: 0x64edff,
  },
  {
    points: [
      [12.8, -8.2],
      [8.1, -8.2],
      [8.1, -2.6],
      [4.7, -2.6],
      [4.7, 5.5],
      [-0.8, 5.5],
      [-0.8, 11.1],
    ],
    speed: 2.1,
    color: 0xffb448,
  },
  {
    points: [
      [-13.1, 8.6],
      [-9.4, 8.6],
      [-9.4, 4.1],
      [-4.5, 4.1],
      [-4.5, -1.3],
      [1.2, -1.3],
      [1.2, -10.9],
    ],
    speed: 2.8,
    color: 0xa98cff,
  },
  {
    points: [
      [12.9, 9.1],
      [10.2, 9.1],
      [10.2, 6.4],
      [5.9, 6.4],
      [5.9, 0.6],
      [-1.5, 0.6],
      [-1.5, -10.8],
    ],
    speed: 2.62,
    color: 0x5ad7e4,
  },
  {
    points: [
      [-12.9, -1.2],
      [-7.2, -1.2],
      [-7.2, 2.2],
      [-1.7, 2.2],
      [-1.7, 7.7],
      [7.4, 7.7],
      [7.4, 10.8],
    ],
    speed: 2.24,
    color: 0xff705f,
  },
  {
    points: [
      [12.8, 1.6],
      [9.6, 1.6],
      [9.6, -4.8],
      [2.5, -4.8],
      [2.5, -7.4],
      [-6.1, -7.4],
      [-6.1, -10.8],
    ],
    speed: 2.93,
    color: 0x7affb7,
  },
] as const satisfies ReadonlyArray<{
  points: readonly GridRoutePoint[];
  speed: number;
  color: number;
}>;

function createRoutes(): GridRoute[] {
  return routeDefinitions.map((definition) => {
    const cumulativeLengths = new Float32Array(definition.points.length);
    let length = 0;
    for (let index = 1; index < definition.points.length; index += 1) {
      const previous = definition.points[index - 1]!;
      const current = definition.points[index]!;
      length += Math.hypot(
        current[0] - previous[0],
        current[1] - previous[1],
      );
      cumulativeLengths[index] = length;
    }
    return {
      points: definition.points,
      cumulativeLengths,
      length,
      speed: definition.speed,
      color: new THREE.Color(definition.color),
    };
  });
}

/**
 * Bounded, batched signal traffic for the Grid deck. Static circuitry stays in
 * the floor texture; this controller only updates a few short traveling bolts
 * and their heads, avoiding one object or allocation per spark.
 */
export class GridFloorTraffic {
  private readonly routes = createRoutes();
  private readonly sample = new THREE.Vector3();
  private readonly ahead = new THREE.Vector3();
  private state: GridFloorTrafficState | null = null;
  private quality: QualityTier = "medium";

  mount(parent: THREE.Group): void {
    this.unmount();

    const group = new THREE.Group();
    group.name = "grid-batched-floor-signal-traffic";

    const boltPositions = new Float32Array(
      maximumPulseCount * segmentsPerPulse * 2 * 3,
    );
    const boltColors = new Float32Array(boltPositions.length);
    for (let pulse = 0; pulse < maximumPulseCount; pulse += 1) {
      const route = this.routes[pulse % this.routes.length]!;
      for (let segment = 0; segment < segmentsPerPulse; segment += 1) {
        const startBrightness = 0.16 + (segment / segmentsPerPulse) * 0.7;
        const endBrightness =
          0.16 + ((segment + 1) / segmentsPerPulse) * 0.7;
        const vertexOffset =
          (pulse * segmentsPerPulse + segment) * 2 * 3;
        boltColors[vertexOffset] = route.color.r * startBrightness;
        boltColors[vertexOffset + 1] = route.color.g * startBrightness;
        boltColors[vertexOffset + 2] = route.color.b * startBrightness;
        boltColors[vertexOffset + 3] = route.color.r * endBrightness;
        boltColors[vertexOffset + 4] = route.color.g * endBrightness;
        boltColors[vertexOffset + 5] = route.color.b * endBrightness;
      }
    }
    const boltGeometry = new THREE.BufferGeometry();
    boltGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(boltPositions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    boltGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(boltColors, 3),
    );
    const boltMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: true,
    });
    const bolts = new THREE.LineSegments(boltGeometry, boltMaterial);
    bolts.name = "grid-traveling-floor-lightning";
    bolts.frustumCulled = false;
    bolts.renderOrder = 2;
    group.add(bolts);

    const headPositions = new Float32Array(maximumPulseCount * 3);
    const headColors = new Float32Array(maximumPulseCount * 3);
    for (let pulse = 0; pulse < maximumPulseCount; pulse += 1) {
      const color = this.routes[pulse % this.routes.length]!.color;
      headColors[pulse * 3] = color.r;
      headColors[pulse * 3 + 1] = color.g;
      headColors[pulse * 3 + 2] = color.b;
    }
    const headGeometry = new THREE.BufferGeometry();
    headGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(headPositions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    headGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(headColors, 3),
    );
    const headMaterial = new THREE.PointsMaterial({
      size: 0.16,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: true,
    });
    const heads = new THREE.Points(headGeometry, headMaterial);
    heads.name = "grid-traveling-signal-heads";
    heads.frustumCulled = false;
    heads.renderOrder = 3;
    group.add(heads);

    parent.add(group);
    this.state = {
      group,
      bolts,
      boltPositions,
      heads,
      headPositions,
      activePulseCount: 0,
    };
    this.setQuality(this.quality);
  }

  unmount(): void {
    const state = this.state;
    if (!state) return;
    state.group.removeFromParent();
    state.bolts.geometry.dispose();
    state.bolts.material.dispose();
    state.heads.geometry.dispose();
    state.heads.material.dispose();
    this.state = null;
  }

  setQuality(quality: QualityTier): void {
    this.quality = quality;
    const state = this.state;
    if (!state) return;
    state.activePulseCount =
      quality === "low" ? 4 : quality === "medium" ? 8 : maximumPulseCount;
    state.bolts.geometry.setDrawRange(
      0,
      state.activePulseCount * segmentsPerPulse * 2,
    );
    state.heads.geometry.setDrawRange(0, state.activePulseCount);
    state.heads.material.size =
      quality === "low" ? 0.13 : quality === "medium" ? 0.16 : 0.18;
  }

  update(elapsed: number, reducedMotion: boolean): void {
    const state = this.state;
    if (!state) return;
    const motionScale = reducedMotion ? 0.16 : 1;
    const pulseCount = state.activePulseCount;

    for (let pulse = 0; pulse < pulseCount; pulse += 1) {
      const route = this.routes[pulse % this.routes.length]!;
      const phase = (pulse / maximumPulseCount) * route.length;
      const headDistance =
        elapsed * route.speed * motionScale + phase + pulse * 1.37;
      let previousX = 0;
      let previousY = trafficY;
      let previousZ = 0;

      for (let node = 0; node <= segmentsPerPulse; node += 1) {
        const distance =
          headDistance - (segmentsPerPulse - node) * 0.16;
        this.sampleRoute(route, distance, this.sample);
        this.sampleRoute(route, distance + 0.04, this.ahead);
        const tangentX = this.ahead.x - this.sample.x;
        const tangentZ = this.ahead.z - this.sample.z;
        const tangentLength = Math.max(0.0001, Math.hypot(tangentX, tangentZ));
        const zigzag =
          Math.sin(
            pulse * 17.17 +
              node * 8.73 +
              elapsed * 18 * motionScale,
          ) *
          0.045 *
          motionScale;
        const x = this.sample.x - (tangentZ / tangentLength) * zigzag;
        const y =
          trafficY +
          Math.sin(pulse * 4.1 + node * 2.7 + elapsed * 11 * motionScale) *
            0.006 *
            motionScale;
        const z = this.sample.z + (tangentX / tangentLength) * zigzag;

        if (node > 0) {
          const offset =
            (pulse * segmentsPerPulse + node - 1) * 2 * 3;
          state.boltPositions[offset] = previousX;
          state.boltPositions[offset + 1] = previousY;
          state.boltPositions[offset + 2] = previousZ;
          state.boltPositions[offset + 3] = x;
          state.boltPositions[offset + 4] = y;
          state.boltPositions[offset + 5] = z;
        }
        previousX = x;
        previousY = y;
        previousZ = z;
      }

      state.headPositions[pulse * 3] = previousX;
      state.headPositions[pulse * 3 + 1] = previousY + 0.006;
      state.headPositions[pulse * 3 + 2] = previousZ;
    }

    state.bolts.geometry.attributes.position!.needsUpdate = true;
    state.heads.geometry.attributes.position!.needsUpdate = true;
    state.bolts.material.opacity = reducedMotion
      ? 0.56
      : 0.82 + Math.sin(elapsed * 2.4) * 0.08;
  }

  private sampleRoute(
    route: GridRoute,
    distance: number,
    target: THREE.Vector3,
  ): void {
    const wrapped =
      ((distance % route.length) + route.length) % route.length;
    let segment = 1;
    while (
      segment < route.cumulativeLengths.length - 1 &&
      wrapped > route.cumulativeLengths[segment]!
    ) {
      segment += 1;
    }
    const startDistance = route.cumulativeLengths[segment - 1]!;
    const endDistance = route.cumulativeLengths[segment]!;
    const progress =
      (wrapped - startDistance) / Math.max(0.0001, endDistance - startDistance);
    const start = route.points[segment - 1]!;
    const end = route.points[segment]!;
    target.set(
      THREE.MathUtils.lerp(start[0], end[0], progress),
      trafficY,
      THREE.MathUtils.lerp(start[1], end[1], progress),
    );
  }
}
