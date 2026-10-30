import * as THREE from "three";

interface PartRange { bounds: THREE.Box3; start: number; count: number }
interface RangeNode {
  bounds: THREE.Box3;
  parts?: readonly PartRange[];
  left?: RangeNode;
  right?: RangeNode;
}

/** Build once with the immutable static batch, not on pointer movement. */
function buildRangeTree(parts: PartRange[]): RangeNode {
  const bounds = new THREE.Box3();
  for (const part of parts) bounds.union(part.bounds);
  if (parts.length <= 8) return { bounds, parts };
  const size = bounds.getSize(new THREE.Vector3());
  const axis = size.x >= size.y && size.x >= size.z ? "x" : size.y >= size.z ? "y" : "z";
  parts.sort((a, b) =>
    a.bounds.min[axis] + a.bounds.max[axis] - b.bounds.min[axis] - b.bounds.max[axis]);
  const middle = Math.floor(parts.length / 2);
  return { bounds, left: buildRangeTree(parts.slice(0, middle)), right: buildRangeTree(parts.slice(middle)) };
}

/**
 * Keep the draw-call benefit of a static material batch without making every
 * cursor ray test every triangle across the island. Parts are the transformed
 * geometries supplied to mergeGeometries, in the same order.
 *
 * The private mesh is a CPU-only view of the batch buffers. It is never added to
 * a scene or uploaded, and owns no GPU resources. Picking changes its range,
 * never the visible geometry's range/bounds or the original prop colliders.
 */
export function accelerateStaticBatchRaycast(
  batch: THREE.Mesh<THREE.BufferGeometry, THREE.Material>,
  parts: readonly THREE.BufferGeometry[],
): void {
  if (parts.length < 2) return;
  const geometry = batch.geometry;
  const position = geometry.getAttribute("position");
  const positionBuffer = position instanceof THREE.InterleavedBufferAttribute
    ? position.data
    : position;
  const positionVersion = positionBuffer.version;
  const indexVersion = geometry.index?.version;
  const ranges: PartRange[] = [];
  let offset = 0;
  for (const part of parts) {
    part.computeBoundingBox();
    const count = part.index?.count ?? part.getAttribute("position").count;
    ranges.push({ bounds: part.boundingBox!.clone(), start: offset, count });
    offset += count;
  }
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  const tree = buildRangeTree(ranges);
  const stack: RangeNode[] = [];
  const candidates: PartRange[] = [];
  const view = new THREE.BufferGeometry();
  view.index = geometry.index;
  view.attributes = geometry.attributes;
  view.boundingSphere = geometry.boundingSphere;
  const proxy = new THREE.Mesh(view, batch.material);
  const inverse = new THREE.Matrix4();
  const localRay = new THREE.Ray();
  const originalRaycast = batch.raycast;

  batch.raycast = (raycaster, hits): void => {
    // These bounds describe the original triangles. Changed geometry or a
    // draw start that regroups their vertices uses the ordinary query.
    if (
      batch.geometry !== geometry ||
      geometry.getAttribute("position") !== position ||
      positionBuffer.version !== positionVersion ||
      geometry.index !== view.index ||
      geometry.index?.version !== indexVersion ||
      Math.max(0, geometry.drawRange.start) % 3 !== 0 ||
      Array.isArray(batch.material)
    ) {
      originalRaycast.call(batch, raycaster, hits);
      return;
    }
    inverse.copy(batch.matrixWorld).invert();
    localRay.copy(raycaster.ray).applyMatrix4(inverse);
    if (!localRay.intersectsBox(geometry.boundingBox!)) return;
    proxy.matrixWorld.copy(batch.matrixWorld);
    proxy.material = batch.material;
    const rangeStart = geometry.drawRange.start;
    const rangeEnd = rangeStart + geometry.drawRange.count;
    const firstHit = hits.length;
    stack.length = 0;
    candidates.length = 0;
    stack.push(tree);
    while (stack.length) {
      const node = stack.pop()!;
      if (!localRay.intersectsBox(node.bounds)) continue;
      if (node.parts) {
        for (const part of node.parts) {
          if (localRay.intersectsBox(part.bounds)) candidates.push(part);
        }
      } else {
        stack.push(node.right!, node.left!);
      }
    }
    // Preserve the original triangle emission order for equal-distance hits
    // (overlapping paving, for example), not the tree's spatial ordering.
    candidates.sort((a, b) => a.start - b.start);
    for (const range of candidates) {
      const start = Math.max(rangeStart, range.start);
      const end = Math.min(rangeEnd, range.start + range.count);
      if (end <= start) continue;
      view.boundingBox = range.bounds;
      view.setDrawRange(start, end - start);
      originalRaycast.call(proxy, raycaster, hits);
    }
    for (let index = firstHit; index < hits.length; index += 1) {
      hits[index]!.object = batch;
    }
  };
}
