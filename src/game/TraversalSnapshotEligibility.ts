import * as THREE from "three";

const minimumVisibleOpacity = 0.001;

function materialContributesColor(material: THREE.Material): boolean {
  if (!material.visible || !material.colorWrite) return false;
  return !material.transparent || material.opacity > minimumVisibleOpacity;
}

/**
 * Decides whether a mesh belongs in a traversal snapshot.
 *
 * Visibility is evaluated relative to `snapshotRoot`: arrival deliberately
 * captures while that root is hidden, but an invisible child assembly must
 * remain absent. Transient effects can opt an entire branch out through
 * `userData.terminalTraversalSnapshot = false`.
 */
export function isTraversalSnapshotMeshEligible(
  object: THREE.Object3D,
  snapshotRoot: THREE.Object3D,
): object is THREE.Mesh {
  if (
    !(object instanceof THREE.Mesh) ||
    object instanceof THREE.InstancedMesh ||
    object.userData.playerOcclusionOutline === true
  ) {
    return false;
  }

  let branch: THREE.Object3D | null = object;
  while (branch && branch !== snapshotRoot) {
    if (
      !branch.visible ||
      branch.userData.terminalTraversalSnapshot === false
    ) {
      return false;
    }
    branch = branch.parent;
  }
  if (branch !== snapshotRoot) return false;

  const materials = Array.isArray(object.material)
    ? object.material
    : [object.material];
  return materials.some(materialContributesColor);
}
