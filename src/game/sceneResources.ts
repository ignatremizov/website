import * as THREE from "three";

type MaterialOwnership = (material: THREE.Material) => boolean;

function collectMaterialTextures(
  material: THREE.Material,
  textures: Set<THREE.Texture>,
): void {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) textures.add(value);
  }
  if (!(material instanceof THREE.ShaderMaterial)) return;
  for (const uniform of Object.values(material.uniforms)) {
    const value: unknown = uniform.value;
    if (value instanceof THREE.Texture) textures.add(value);
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry instanceof THREE.Texture) textures.add(entry);
      }
    }
  }
}

/**
 * Releases unique GPU resources reachable from an object subtree.
 * The ownership predicate keeps shared palette materials alive across zone swaps.
 */
export function disposeObjectTree(
  root: THREE.Object3D,
  ownsMaterial: MaterialOwnership = () => true,
): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) &&
      !(object instanceof THREE.Points) &&
      !(object instanceof THREE.Line) &&
      !(object instanceof THREE.Sprite)
    ) {
      return;
    }
    // Instance transforms/colours belong to the mesh, not its geometry.
    // Disposing geometry alone leaves their renderer buffers unreleased.
    if (object instanceof THREE.InstancedMesh) object.dispose();
    geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of objectMaterials) {
      if (ownsMaterial(material)) materials.add(material);
    }
  });

  for (const material of materials) {
    collectMaterialTextures(material, textures);
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
}
