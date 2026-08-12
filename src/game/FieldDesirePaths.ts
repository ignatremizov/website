import * as THREE from "three";

type PathPoint = readonly [number, number];

interface DesirePathRoute {
  points: readonly PathPoint[];
  width: number;
  phase: number;
}

export const fieldMapTablePosition = {
  x: -3.1,
  z: -4.25,
} as const;

const fieldDesirePathRoutes: readonly DesirePathRoute[] = [
  // Tent entrance to the atlas table.
  {
    points: [
      [-6.4, 3.18],
      [-5.5, 3.86],
      [-3.72, 3.54],
      [-3.48, 1.62],
      [-3.62, 0.08],
      [-3.25, -1.55],
      [-3.1, -3.05],
    ],
    width: 0.92,
    phase: 0.4,
  },
  // Atlas table to the Archive portal.
  {
    points: [
      [-3.1, -3.05],
      [-4.16, -3.38],
      [-5.55, -4.08],
      [-7.05, -4.88],
      [-8.32, -5.84],
    ],
    width: 0.82,
    phase: 1.7,
  },
  // Atlas table to the Grid portal.
  {
    points: [
      [-3.1, -3.05],
      [-1.82, -3.36],
      [-0.18, -3.82],
      [2.16, -3.72],
      [4.78, -3.24],
      [7.28, -3.38],
      [9.28, -3.78],
    ],
    width: 0.84,
    phase: 3.1,
  },
  // Tent entrance to the Falls portal.
  {
    points: [
      [-6.28, 3.15],
      [-5.38, 4.18],
      [-3.62, 5.1],
      [-2.08, 6.55],
      [-0.72, 8.02],
      [0, 9.05],
    ],
    width: 0.78,
    phase: 4.8,
  },
] as const;

/**
 * Builds the entire Field Station footpath network as one ribbon geometry.
 * UV distance follows each route, allowing one feathered texture to provide
 * irregular edges and compacted-soil grain across every path.
 */
export function createFieldDesirePathGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  for (const route of fieldDesirePathRoutes) {
    const curve = new THREE.CatmullRomCurve3(
      route.points.map(
        ([x, z]) => new THREE.Vector3(x, 0.138, z),
      ),
      false,
      "centripetal",
      0.5,
    );
    const routeLength = curve.getLength();
    const segmentCount = Math.max(14, Math.ceil(routeLength * 2.8));
    const lateral = new THREE.Vector3();
    const previous = new THREE.Vector3();
    let travelled = 0;

    for (let segment = 0; segment <= segmentCount; segment += 1) {
      const progress = segment / segmentCount;
      const point = curve.getPointAt(progress);
      const tangent = curve.getTangentAt(progress);
      if (segment > 0) travelled += point.distanceTo(previous);
      previous.copy(point);
      lateral.set(-tangent.z, 0, tangent.x).normalize();
      const width =
        route.width *
        (0.94 +
          Math.sin(progress * Math.PI * 5.2 + route.phase) * 0.055 +
          Math.sin(progress * Math.PI * 11.4 - route.phase) * 0.025);
      const halfWidth = width / 2;
      positions.push(
        point.x + lateral.x * halfWidth,
        point.y,
        point.z + lateral.z * halfWidth,
        point.x - lateral.x * halfWidth,
        point.y,
        point.z - lateral.z * halfWidth,
      );
      const textureDistance = travelled / 3.6 + route.phase * 0.17;
      uvs.push(0, textureDistance, 1, textureDistance);

      if (segment === segmentCount) continue;
      const current = vertexOffset + segment * 2;
      indices.push(
        current,
        current + 2,
        current + 1,
        current + 2,
        current + 3,
        current + 1,
      );
    }
    vertexOffset += (segmentCount + 1) * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
