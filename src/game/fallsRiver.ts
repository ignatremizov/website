import * as THREE from "three";

const fallsRiverControlPoints = [
  new THREE.Vector3(0, 0, -12.4),
  new THREE.Vector3(0, 0, -9.5),
  // Keep this bend shallow enough that the variable-width ribbon offsets
  // remain non-self-intersecting on both banks.
  new THREE.Vector3(0.65, 0, -6.7),
  new THREE.Vector3(-1.35, 0, -2.1),
  new THREE.Vector3(0, 0, 2.4),
  new THREE.Vector3(3.2, 0, 5.9),
  new THREE.Vector3(4.4, 0, 9.2),
  new THREE.Vector3(4, 0, 11),
];

export const fallsRiverCurve = new THREE.CatmullRomCurve3(
  fallsRiverControlPoints,
  false,
  "catmullrom",
  0.45,
);

export const fallsRiverPath = fallsRiverCurve.getSpacedPoints(36);

export function getFallsRiverHalfWidth(progress: number): number {
  return (
    1.88 +
    Math.sin(progress * Math.PI) * 0.2 +
    Math.sin(progress * Math.PI * 3) * 0.08
  );
}

export function isInsideFallsRiver(x: number, z: number): boolean {
  if (z < -12.4 || z > 11) return false;
  for (let index = 0; index < fallsRiverPath.length - 1; index += 1) {
    const start = fallsRiverPath[index];
    const end = fallsRiverPath[index + 1];
    if (!start || !end) continue;
    const segmentX = end.x - start.x;
    const segmentZ = end.z - start.z;
    const segmentLengthSq = segmentX * segmentX + segmentZ * segmentZ;
    if (segmentLengthSq <= 0.0001) continue;
    const along = THREE.MathUtils.clamp(
      ((x - start.x) * segmentX + (z - start.z) * segmentZ) /
        segmentLengthSq,
      0,
      1,
    );
    const closestX = start.x + segmentX * along;
    const closestZ = start.z + segmentZ * along;
    const dx = x - closestX;
    const dz = z - closestZ;
    const progress = (index + along) / (fallsRiverPath.length - 1);
    const halfWidth = getFallsRiverHalfWidth(progress);
    if (dx * dx + dz * dz <= halfWidth * halfWidth) return true;
  }
  return false;
}

export function createFallsRiverRibbonGeometry(
  y: number,
  bankPadding: number,
): THREE.BufferGeometry {
  const positions = new Float32Array(fallsRiverPath.length * 2 * 3);
  const uvs = new Float32Array(fallsRiverPath.length * 2 * 2);
  const indices: number[] = [];

  for (let index = 0; index < fallsRiverPath.length; index += 1) {
    const point = fallsRiverPath[index];
    const previous = fallsRiverPath[Math.max(0, index - 1)];
    const next =
      fallsRiverPath[Math.min(fallsRiverPath.length - 1, index + 1)];
    if (!point || !previous || !next) continue;

    const tangentX = next.x - previous.x;
    const tangentZ = next.z - previous.z;
    const tangentLength = Math.max(0.0001, Math.hypot(tangentX, tangentZ));
    const normalX = -tangentZ / tangentLength;
    const normalZ = tangentX / tangentLength;
    const progress = index / (fallsRiverPath.length - 1);
    const halfWidth = getFallsRiverHalfWidth(progress) + bankPadding;
    const positionOffset = index * 6;

    positions[positionOffset] = point.x + normalX * halfWidth;
    positions[positionOffset + 1] = y;
    positions[positionOffset + 2] = point.z + normalZ * halfWidth;
    positions[positionOffset + 3] = point.x - normalX * halfWidth;
    positions[positionOffset + 4] = y;
    positions[positionOffset + 5] = point.z - normalZ * halfWidth;

    const uvOffset = index * 4;
    uvs[uvOffset] = 0;
    uvs[uvOffset + 1] = progress;
    uvs[uvOffset + 2] = 1;
    uvs[uvOffset + 3] = progress;

    if (index >= fallsRiverPath.length - 1) continue;
    const base = index * 2;
    const nextBase = base + 2;
    indices.push(
      base,
      nextBase,
      base + 1,
      base + 1,
      nextBase,
      nextBase + 1,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
