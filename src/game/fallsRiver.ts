import * as THREE from "three";

const fallsRiverControlPoints = [
  new THREE.Vector3(-5.5, 0, -6.1),
  new THREE.Vector3(-5.5, 0, -3.4),
  new THREE.Vector3(-4.2, 0, -0.6),
  new THREE.Vector3(-1.6, 0, 2.4),
  new THREE.Vector3(1.65, 0, 5.8),
  new THREE.Vector3(3.85, 0, 9.3),
  new THREE.Vector3(4, 0, 11),
];

export const fallsRiverCurve = new THREE.CatmullRomCurve3(
  fallsRiverControlPoints,
  false,
  "catmullrom",
  0.45,
);

// One continuous basin/gorge contour connects all three outlets. A variable
// width curve offset folded back into itself around the broad upper basin;
// a single triangulated polygon gives water, splashes, and fish one footprint.
// The foundation has radius 18 (the playable disk is smaller). Keep the lip
// just outside its silhouette; the fish route above stays inside the old mouth.
const fallsRiverLip = Array.from({ length: 9 }, (_, index) => {
  const x = 2.1 + 3.8 * index / 8;
  return [x, Math.sqrt(18.06 ** 2 - x ** 2)] as const;
});
const fallsRiverBank = [
  [-6.72, -6.18], [-8, -5], [-10.95, -4.95], [-12, -3.2],
  [-10.9, -1.9], [-7.8, -1.5], [-6.1, 0], [-4.6, 2.5],
  [-3.2, 3.8], [-0.2, 5.8], [1.8, 8.9], [2.1, 11],
  ...fallsRiverLip,
  [5.9, 11], [6, 8.9], [4.3, 5.2], [2.5, 2.8],
  [0.1, 0.6], [1, -1.2], [1, -4.15], [0.35, -5.65],
  [-2.1, -4.7], [-4.25, -5.2], [-4.25, -6.18],
] as const;

export function isInsideFallsRiver(x: number, z: number): boolean {
  if (z < -6.18 || z > 18.06 || x < -12 || x > 6) return false;
  let inside = false;
  for (let index = 0, previous = fallsRiverBank.length - 1; index < fallsRiverBank.length; previous = index++) {
    const [ax, az] = fallsRiverBank[index]!;
    const [bx, bz] = fallsRiverBank[previous]!;
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) {
      inside = !inside;
    }
  }
  return inside;
}

export function createFallsRiverRibbonGeometry(
  y: number,
  bankPadding: number,
): THREE.BufferGeometry {
  const count = fallsRiverBank.length;
  const contour = fallsRiverBank.map(([x, z], index) => {
    const [px, pz] = fallsRiverBank[(index + count - 1) % count]!;
    const [nx, nz] = fallsRiverBank[(index + 1) % count]!;
    const previousLength = Math.hypot(x - px, z - pz);
    const nextLength = Math.hypot(nx - x, nz - z);
    const normalX = -(z - pz) / previousLength - (nz - z) / nextLength;
    const normalZ = (x - px) / previousLength + (nx - x) / nextLength;
    const scale = bankPadding / Math.max(0.5, Math.hypot(normalX, normalZ));
    const paddedX = x + normalX * scale;
    let paddedZ = z + normalZ * scale;
    // Only the curved outlet vertices lie beyond z=11. Pull the bank's
    // terminal edge under the water instead of padding a dam over the lip.
    if (bankPadding > 0 && z > 11) {
      paddedZ = Math.min(paddedZ, Math.sqrt(17.9 ** 2 - paddedX ** 2));
    }
    // ShapeGeometry is XY; negate Z before rotating so its front faces up.
    return new THREE.Vector2(paddedX, -paddedZ);
  });
  const geometry = new THREE.ShapeGeometry(new THREE.Shape(contour));
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  const positions = geometry.getAttribute("position");
  const uvs = geometry.getAttribute("uv");
  for (let index = 0; index < positions.count; index += 1) {
    uvs.setXY(index, positions.getX(index) / 5, (positions.getZ(index) + 6.18) / 17.18);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Static curtain sharing the ribbon's curved perimeter and animated flow map.
 * Use a cloned water material with vertexColors=true, transparent=true and
 * depthWrite=false: RGBA vertex colors dissolve the tails without an updater.
 * Coordinates are already world-local: add without a position/rotation offset.
 * The caller owns the mesh/material and normal scene-resource disposal.
 */
export function createFallsRiverSpillGeometry(
  y = 0.205,
  bottom = -10.8,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const rows = 16;
  const columns = fallsRiverLip.length;
  for (let row = 0; row <= rows; row += 1) {
    const progress = row / rows;
    for (const [column, [x, z]] of fallsRiverLip.entries()) {
      const variation = Math.sin(column * 2.17) * 0.5 + 0.5;
      const drop = (y - bottom) * (0.82 + variation * 0.18) * progress;
      const spread = progress * progress;
      positions.push(
        x + (x - 4) * spread * 0.12,
        y - drop,
        z + progress * 0.28 + spread * 0.48,
      );
      uvs.push(x / 5, (z + 6.18 + drop) / 17.18);
      // Uneven strands become transparent well before their staggered ends.
      // Smooth interpolation keeps this bounded grid from reading as a panel.
      const fadeStart = 0.24 + variation * 0.18;
      const fade = THREE.MathUtils.smoothstep(progress, fadeStart, 1);
      const edgeFade = column === 0 || column === columns - 1
        ? 1 - THREE.MathUtils.smoothstep(progress, 0.05, 0.7)
        : 1;
      colors.push(1, 1, 1, (1 - fade) * edgeFade);
      if (row === rows || column === columns - 1) continue;
      const vertex = row * columns + column;
      indices.push(
        vertex, vertex + columns, vertex + 1,
        vertex + 1, vertex + columns, vertex + columns + 1,
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
