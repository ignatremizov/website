import * as THREE from "three";

export interface AvatarRig {
  group: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  gloveMaterial: THREE.MeshStandardMaterial;
  compassMount: THREE.Group;
  pencilMount: THREE.Group;
  lantern: THREE.Group;
  lanternCore: THREE.Mesh<
    THREE.CylinderGeometry,
    THREE.MeshStandardMaterial
  >;
}

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  castShadow = true,
): THREE.Mesh {
  const item = new THREE.Mesh(geometry, material);
  item.castShadow = castShadow;
  item.receiveShadow = castShadow;
  return item;
}

export function createAvatar(): AvatarRig {
  const group = new THREE.Group();
  group.name = "field-operator";

  const teal = new THREE.MeshStandardMaterial({
    color: 0x0f5960,
    roughness: 0.82,
    metalness: 0.02,
  });
  const tealDark = new THREE.MeshStandardMaterial({
    color: 0x07383e,
    roughness: 0.88,
  });
  const charcoal = new THREE.MeshStandardMaterial({
    color: 0x11171a,
    roughness: 0.9,
  });
  const gloveMaterial = new THREE.MeshStandardMaterial({
    color: 0x11171a,
    emissive: 0x58dcff,
    emissiveIntensity: 0,
    roughness: 0.9,
  });
  const leather = new THREE.MeshStandardMaterial({
    color: 0x4a2d1d,
    roughness: 0.9,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: 0xb47a32,
    roughness: 0.42,
    metalness: 0.62,
  });
  const skin = new THREE.MeshStandardMaterial({
    color: 0xc98c67,
    roughness: 0.9,
  });
  const amber = new THREE.MeshStandardMaterial({
    color: 0xffb342,
    emissive: 0xff7b17,
    emissiveIntensity: 2.1,
    roughness: 0.3,
  });
  const lanternAmber = new THREE.MeshStandardMaterial({
    color: 0xffb342,
    emissive: 0xff6717,
    emissiveIntensity: 0.16,
    roughness: 0.28,
  });

  const coat = mesh(new THREE.CylinderGeometry(0.48, 0.67, 1.25, 7), teal);
  coat.position.y = 1.55;
  group.add(coat);

  const mantle = mesh(new THREE.CylinderGeometry(0.59, 0.53, 0.32, 7), tealDark);
  mantle.position.y = 2.09;
  group.add(mantle);

  const belt = mesh(new THREE.CylinderGeometry(0.51, 0.51, 0.16, 7), leather, false);
  belt.position.y = 1.34;
  group.add(belt);

  const buckle = mesh(new THREE.BoxGeometry(0.18, 0.16, 0.08), brass, false);
  buckle.position.set(0, 1.34, 0.5);
  group.add(buckle);

  const head = mesh(new THREE.DodecahedronGeometry(0.36, 0), skin);
  head.position.y = 2.43;
  group.add(head);

  const hatBrim = mesh(new THREE.CylinderGeometry(0.49, 0.49, 0.09, 10), tealDark);
  hatBrim.position.y = 2.71;
  group.add(hatBrim);

  const hatCrown = mesh(new THREE.CylinderGeometry(0.34, 0.39, 0.25, 7), teal);
  hatCrown.position.y = 2.83;
  group.add(hatCrown);

  const hatBand = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.07, 10), brass, false);
  hatBand.position.y = 2.75;
  group.add(hatBand);

  const crystal = mesh(new THREE.OctahedronGeometry(0.1, 0), amber, false);
  crystal.position.set(0, 2.85, 0.37);
  group.add(crystal);

  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  for (const [leg, x] of [
    [leftLeg, -0.22],
    [rightLeg, 0.22],
  ] as const) {
    const upper = mesh(new THREE.BoxGeometry(0.27, 0.68, 0.3), charcoal);
    upper.position.y = -0.34;
    leg.add(upper);
    const boot = mesh(new THREE.BoxGeometry(0.32, 0.36, 0.46), leather, false);
    boot.position.set(0, -0.77, 0.07);
    leg.add(boot);
    leg.position.set(x, 0.96, 0);
    group.add(leg);
  }

  const leftArm = new THREE.Group();
  const rightArm = new THREE.Group();
  for (const [arm, x] of [
    [leftArm, -0.57],
    [rightArm, 0.57],
  ] as const) {
    const sleeve = mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.78, 7), teal);
    sleeve.position.y = -0.38;
    arm.add(sleeve);
    const glove = mesh(
      new THREE.DodecahedronGeometry(0.15, 0),
      gloveMaterial,
      false,
    );
    glove.position.y = -0.81;
    arm.add(glove);
    arm.position.set(x, 2.05, 0);
    arm.rotation.z = x < 0 ? -0.17 : 0.17;
    group.add(arm);
  }

  const compassMount = new THREE.Group();
  compassMount.name = "right-belt-compass-mount";
  compassMount.position.set(0.57, 1.39, 0.04);
  const compassClip = mesh(
    new THREE.BoxGeometry(0.07, 0.3, 0.14),
    leather,
    false,
  );
  compassClip.position.set(-0.025, 0.17, 0);
  compassMount.add(compassClip);
  group.add(compassMount);

  const satchel = mesh(new THREE.BoxGeometry(0.46, 0.52, 0.24), leather);
  satchel.position.set(-0.56, 1.38, -0.12);
  satchel.rotation.z = 0.06;
  group.add(satchel);

  const pencilMount = new THREE.Group();
  pencilMount.name = "left-satchel-pencil-mount";
  pencilMount.position.set(-0.62, 1.62, -0.31);
  pencilMount.rotation.z = -0.04;
  const pencilLoopTop = mesh(
    new THREE.TorusGeometry(0.09, 0.025, 4, 8),
    leather,
    false,
  );
  pencilLoopTop.rotation.y = Math.PI / 2;
  pencilLoopTop.position.y = 0.16;
  pencilMount.add(pencilLoopTop);
  const pencilLoopBottom = pencilLoopTop.clone();
  pencilLoopBottom.position.y = -0.14;
  pencilMount.add(pencilLoopBottom);
  group.add(pencilMount);

  const lantern = new THREE.Group();
  const lanternBody = mesh(
    new THREE.CylinderGeometry(0.16, 0.2, 0.4, 6),
    brass,
    false,
  );
  lanternBody.position.y = -0.18;
  lantern.add(lanternBody);
  const lanternCore = mesh(
    new THREE.CylinderGeometry(0.1, 0.12, 0.28, 6),
    lanternAmber,
    false,
  ) as THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
  lanternCore.position.y = -0.18;
  lantern.add(lanternCore);
  const lanternTop = mesh(new THREE.ConeGeometry(0.21, 0.18, 6), brass, false);
  lanternTop.position.y = 0.11;
  lantern.add(lanternTop);
  lantern.position.set(-0.76, 1.05, 0.03);
  group.add(lantern);

  group.scale.setScalar(0.78);
  group.traverse((object) => {
    object.frustumCulled = true;
  });

  return {
    group,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    gloveMaterial,
    compassMount,
    pencilMount,
    lantern,
    lanternCore,
  };
}
