import * as THREE from "three";

export type Vector3Tuple = readonly [number, number, number];

export interface ScenePrimitiveOptions {
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export function addBox(
  parent: THREE.Object3D,
  size: Vector3Tuple,
  position: Vector3Tuple,
  material: THREE.Material,
  options: ScenePrimitiveOptions = {},
): THREE.Mesh<THREE.BoxGeometry, THREE.Material> {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  parent.add(mesh);
  return mesh;
}

export function addCylinder(
  parent: THREE.Object3D,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments: number,
  position: Vector3Tuple,
  material: THREE.Material,
  options: ScenePrimitiveOptions = {},
): THREE.Mesh<THREE.CylinderGeometry, THREE.Material> {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(
      radiusTop,
      radiusBottom,
      height,
      segments,
    ),
    material,
  );
  mesh.position.set(...position);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  parent.add(mesh);
  return mesh;
}
