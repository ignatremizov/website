import * as THREE from "three";

import type { QualityTier } from "../world/WorldContracts";

const maximumFragmentCount = 14;
const groundTickCount = 12;
const scanRingCount = 3;

interface PortalThresholdChargeOptions {
  parent: THREE.Object3D;
  swirl: THREE.Object3D;
  color: THREE.ColorRepresentation;
  centerY: number;
  phase: number;
}

function createAdditiveMaterial(
  color: THREE.ColorRepresentation,
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

/**
 * Bounded dwell feedback for the ordinary round portal kit.
 *
 * The effect owns only transparent meshes beneath the portal hierarchy, so zone
 * teardown disposes it with the rest of the threshold. The cube apertures keep
 * their separate collapse/rematerialization language.
 */
export class PortalThresholdCharge {
  private readonly root = new THREE.Group();
  private readonly planeRoot = new THREE.Group();
  private readonly groundRoot = new THREE.Group();
  private readonly arcs: THREE.Mesh<
    THREE.TorusGeometry,
    THREE.MeshBasicMaterial
  >[] = [];
  private readonly scanRings: THREE.Mesh<
    THREE.TorusGeometry,
    THREE.MeshBasicMaterial
  >[] = [];
  private readonly groundHalo: THREE.Mesh<
    THREE.RingGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly groundTicks: THREE.InstancedMesh<
    THREE.BoxGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly veil: THREE.Mesh<
    THREE.CircleGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly lockFlash: THREE.Mesh<
    THREE.RingGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly fragments: THREE.InstancedMesh<
    THREE.BoxGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly dummy = new THREE.Object3D();
  private readonly swirl: THREE.Object3D;
  private readonly phase: number;
  private visualCharge = 0;

  constructor(options: PortalThresholdChargeOptions) {
    this.swirl = options.swirl;
    this.phase = options.phase;
    this.root.name = "round-portal-threshold-charge";
    this.root.visible = false;
    options.parent.add(this.root);

    const brightColor = new THREE.Color(options.color).lerp(
      new THREE.Color(0xffffff),
      0.34,
    );
    const paleColor = brightColor
      .clone()
      .lerp(new THREE.Color(0xffffff), 0.48);

    this.planeRoot.position.set(0, options.centerY, -0.065);
    this.root.add(this.planeRoot);

    const arcRadii = [1.37, 1.07, 0.78] as const;
    const arcLengths = [
      Math.PI * 1.56,
      Math.PI * 1.08,
      Math.PI * 0.7,
    ] as const;
    for (let index = 0; index < arcRadii.length; index += 1) {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(
          arcRadii[index],
          0.022 + (arcRadii.length - index) * 0.006,
          4,
          32,
          arcLengths[index],
        ),
        createAdditiveMaterial(
          index === 2 ? paleColor : brightColor,
        ),
      );
      arc.name = `round-portal-lock-arc-${index}`;
      arc.rotation.z =
        this.phase + index * (Math.PI * 0.63);
      arc.castShadow = false;
      arc.receiveShadow = false;
      this.planeRoot.add(arc);
      this.arcs.push(arc);
    }

    this.veil = new THREE.Mesh(
      new THREE.CircleGeometry(1.42, 32),
      createAdditiveMaterial(options.color),
    );
    this.veil.name = "round-portal-charge-veil";
    this.veil.material.side = THREE.DoubleSide;
    this.veil.position.z = -0.015;
    this.planeRoot.add(this.veil);

    this.lockFlash = new THREE.Mesh(
      new THREE.RingGeometry(0.54, 1.43, 36),
      createAdditiveMaterial(paleColor),
    );
    this.lockFlash.name = "round-portal-lock-flash";
    this.lockFlash.material.side = THREE.DoubleSide;
    this.lockFlash.position.z = 0.012;
    this.planeRoot.add(this.lockFlash);

    this.fragments = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.2, 0.035, 0.055),
      createAdditiveMaterial(paleColor),
      maximumFragmentCount,
    );
    this.fragments.name = "round-portal-inward-fragments";
    this.fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fragments.count = 0;
    this.fragments.visible = false;
    this.fragments.frustumCulled = false;
    this.planeRoot.add(this.fragments);

    this.groundRoot.name = "round-portal-ground-seal";
    this.groundRoot.position.set(0, 0.216, 0.18);
    this.root.add(this.groundRoot);

    this.groundHalo = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 1.42, 40),
      createAdditiveMaterial(options.color),
    );
    this.groundHalo.name = "round-portal-ground-halo";
    this.groundHalo.rotation.x = -Math.PI / 2;
    this.groundHalo.material.side = THREE.DoubleSide;
    this.groundRoot.add(this.groundHalo);

    this.groundTicks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.31, 0.018, 0.048),
      createAdditiveMaterial(brightColor),
      groundTickCount,
    );
    this.groundTicks.name = "round-portal-ground-seal-ticks";
    this.groundTicks.frustumCulled = false;
    for (let index = 0; index < groundTickCount; index += 1) {
      const angle =
        (index / groundTickCount) * Math.PI * 2;
      this.dummy.position.set(
        Math.cos(angle) * 1.13,
        0.014,
        Math.sin(angle) * 1.13,
      );
      this.dummy.rotation.set(0, -angle, 0);
      this.dummy.scale.set(
        index % 3 === 0 ? 1.32 : 0.82,
        1,
        1,
      );
      this.dummy.updateMatrix();
      this.groundTicks.setMatrixAt(index, this.dummy.matrix);
    }
    this.groundTicks.instanceMatrix.needsUpdate = true;
    this.groundRoot.add(this.groundTicks);

    for (let index = 0; index < scanRingCount; index += 1) {
      const scan = new THREE.Mesh(
        new THREE.TorusGeometry(
          0.82 + index * 0.12,
          0.018 + index * 0.004,
          4,
          28,
        ),
        createAdditiveMaterial(
          index === scanRingCount - 1
            ? paleColor
            : brightColor,
        ),
      );
      scan.name = `round-portal-scan-ring-${index}`;
      scan.rotation.x = Math.PI / 2;
      scan.visible = false;
      this.root.add(scan);
      this.scanRings.push(scan);
    }
  }

  get isActive(): boolean {
    return this.visualCharge > 0.002;
  }

  update(
    targetCharge: number,
    delta: number,
    elapsed: number,
    reducedMotion: boolean,
    quality: QualityTier,
  ): void {
    const target = THREE.MathUtils.clamp(targetCharge, 0, 1);
    const follow = reducedMotion
      ? 1
      : 1 -
        Math.exp(
          -delta * (target > this.visualCharge ? 13 : 7),
        );
    this.visualCharge = THREE.MathUtils.lerp(
      this.visualCharge,
      target,
      follow,
    );

    if (target === 0 && this.visualCharge < 0.002) {
      this.visualCharge = 0;
      this.root.visible = false;
      this.fragments.count = 0;
      this.fragments.visible = false;
      for (const scan of this.scanRings) scan.visible = false;
      this.swirl.scale.setScalar(1);
      return;
    }

    this.root.visible = true;
    const charge = this.visualCharge;
    const appear = THREE.MathUtils.smoothstep(
      charge,
      0,
      0.16,
    );
    const lock = THREE.MathUtils.smoothstep(
      charge,
      0.72,
      1,
    );
    const motionScale = reducedMotion ? 0 : 1;
    const pulse =
      reducedMotion
        ? 0
        : Math.sin(elapsed * (5.2 + charge * 4.4)) *
          charge;

    for (const [index, arc] of this.arcs.entries()) {
      arc.material.opacity =
        appear *
        (0.24 + charge * (0.3 + index * 0.055));
      arc.rotation.z +=
        delta *
        motionScale *
        (index % 2 === 0 ? 1 : -1) *
        (0.55 + index * 0.2 + charge * 2.8);
      arc.scale.setScalar(
        1.11 -
          charge * 0.1 +
          pulse * (0.006 + index * 0.003),
      );
    }

    this.veil.material.opacity =
      appear * (0.055 + charge * 0.15 + lock * 0.08);
    this.veil.scale.setScalar(
      0.84 + charge * 0.16 + pulse * 0.006,
    );
    this.lockFlash.material.opacity =
      lock * (reducedMotion ? 0.26 : 0.22 + pulse * 0.08);
    this.lockFlash.scale.setScalar(
      0.92 + lock * 0.08 + pulse * 0.012,
    );

    this.groundHalo.material.opacity =
      appear * (0.16 + charge * 0.34);
    this.groundTicks.material.opacity =
      appear * (0.24 + charge * 0.48);
    this.groundRoot.scale.setScalar(0.76 + charge * 0.24);
    this.groundRoot.rotation.y +=
      delta * motionScale * (0.34 + charge * 1.4);

    for (const [index, scan] of this.scanRings.entries()) {
      scan.visible = !reducedMotion;
      if (reducedMotion) continue;
      const travel =
        (elapsed * (0.36 + charge * 0.72) +
          index / scanRingCount +
          this.phase * 0.07) %
        1;
      const envelope = Math.sin(travel * Math.PI);
      scan.position.set(
        0,
        0.24 + travel * 3.56,
        0.18,
      );
      scan.scale.setScalar(
        0.7 + envelope * (0.22 + charge * 0.16),
      );
      scan.material.opacity =
        appear *
        envelope *
        (0.12 + charge * 0.34);
    }

    const fragmentCount = reducedMotion
      ? 0
      : quality === "high"
        ? maximumFragmentCount
        : quality === "medium"
          ? 9
          : 5;
    this.fragments.count = fragmentCount;
    this.fragments.visible = fragmentCount > 0;
    this.fragments.material.opacity =
      appear * (0.28 + charge * 0.62);
    for (let index = 0; index < fragmentCount; index += 1) {
      const travel =
        (elapsed * (0.23 + charge * 0.76) +
          index / fragmentCount +
          this.phase * 0.11) %
        1;
      const inward = THREE.MathUtils.smoothstep(
        travel,
        0,
        1,
      );
      const angle =
        this.phase +
        index * 2.39996 +
        elapsed * (0.48 + charge * 2.4) +
        travel * 1.7;
      const radius = THREE.MathUtils.lerp(
        1.5,
        0.1,
        inward,
      );
      const lane =
        fragmentCount <= 1
          ? 0.5
          : (index % 7) / 6;
      this.dummy.position.set(
        Math.cos(angle) * radius,
        THREE.MathUtils.lerp(
          THREE.MathUtils.lerp(-1.34, 1.34, lane),
          Math.sin(index * 1.83) * 0.16,
          inward,
        ),
        Math.sin(angle * 1.7) * 0.08,
      );
      this.dummy.rotation.set(
        index * 0.31 + travel * 1.8,
        angle,
        index * 0.17 - travel * 2.2,
      );
      const fragmentScale =
        0.56 +
        Math.sin(travel * Math.PI) * 0.78 +
        charge * 0.22;
      this.dummy.scale.set(
        fragmentScale,
        1,
        0.7 + (1 - inward) * 0.8,
      );
      this.dummy.updateMatrix();
      this.fragments.setMatrixAt(index, this.dummy.matrix);
    }
    if (fragmentCount > 0) {
      this.fragments.instanceMatrix.needsUpdate = true;
    }

    this.swirl.rotation.z +=
      delta * motionScale * charge * (1.2 + charge * 3.6);
    this.swirl.scale.setScalar(
      1 + charge * 0.13 + pulse * 0.018,
    );
  }
}
