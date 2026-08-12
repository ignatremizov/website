import * as THREE from "three";
import { CubeRematerialization } from "../CubeRematerialization";
import type { MightymaticaZoneContext } from "./types";

export class CubeReturnAperture {
  private readonly context: MightymaticaZoneContext;
  private readonly rematerialization: CubeRematerialization;
  private readonly coreShell: THREE.LineSegments;
  private readonly innerCore: THREE.Mesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;

  constructor(context: MightymaticaZoneContext) {
    this.context = context;
    const group = new THREE.Group();
    group.name = "cube-native-return-aperture";
    group.position.set(0, 0, 14.35);
    group.rotation.y = Math.PI;
    context.root.add(group);

    const step = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 0.16, 1.85),
      new THREE.MeshStandardMaterial({
        color: 0x261d3d,
        emissive: 0x10091f,
        emissiveIntensity: 0.7,
        roughness: 0.78,
        metalness: 0.18,
      }),
    );
    step.position.set(0, 0.02, 0.45);
    step.receiveShadow = true;
    group.add(step);

    const visualRoot = new THREE.Group();
    visualRoot.name = "cube-native-return-visuals";
    visualRoot.position.y = 2.05;
    group.add(visualRoot);

    const outerMaterial = new THREE.LineBasicMaterial({
      color: 0xffbd55,
      transparent: true,
      opacity: 0.78,
      toneMapped: false,
    });
    const outerShell = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(3.75, 3.75, 1.55)),
      outerMaterial,
    );
    visualRoot.add(outerShell);

    const insetMaterial = new THREE.LineBasicMaterial({
      color: 0xa487ff,
      transparent: true,
      opacity: 0.72,
      toneMapped: false,
    });
    const insetShell = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2.95, 2.95, 0.9)),
      insetMaterial,
    );
    insetShell.rotation.z = Math.PI / 4;
    visualRoot.add(insetShell);

    const insideFaceMaterial = new THREE.MeshBasicMaterial({
      color: 0x241442,
      transparent: true,
      opacity: 0.66,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const insideFace = new THREE.Mesh(
      new THREE.PlaneGeometry(2.72, 2.72),
      insideFaceMaterial,
    );
    insideFace.name = "reconstructed-cube-inside-face";
    insideFace.position.z = 0.28;
    visualRoot.add(insideFace);

    const core = new THREE.Group();
    core.name = "cube-return-collapse-core";
    core.position.z = 0.02;
    visualRoot.add(core);

    const coreShellMaterial = new THREE.LineBasicMaterial({
      color: 0xffd46e,
      transparent: true,
      opacity: 0.96,
      toneMapped: false,
    });
    this.coreShell = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.52, 1.52, 1.52)),
      coreShellMaterial,
    );
    this.coreShell.rotation.set(0.42, 0.38, 0.2);
    core.add(this.coreShell);

    const innerCoreMaterial = new THREE.MeshBasicMaterial({
      color: 0xa889ff,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      toneMapped: false,
    });
    this.innerCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.73, 0),
      innerCoreMaterial,
    );
    this.innerCore.rotation.set(0.2, 0.35, 0.1);
    core.add(this.innerCore);

    const amberCoreMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc356,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      toneMapped: false,
    });
    const amberCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.31, 0),
      amberCoreMaterial,
    );
    amberCore.rotation.y = Math.PI / 4;
    core.add(amberCore);

    this.rematerialization = new CubeRematerialization({
      parent: group,
      target: visualRoot,
      channels: [
        { material: outerMaterial, opacity: 0.78 },
        { material: insetMaterial, opacity: 0.72 },
        { material: insideFaceMaterial, opacity: 0.66 },
        { material: coreShellMaterial, opacity: 0.96 },
        { material: innerCoreMaterial, opacity: 0.8 },
        { material: amberCoreMaterial, opacity: 0.96 },
      ],
      extent: 3.75,
      colors: [0xffbd55, 0xa487ff, 0x55dce8],
    });
    if (context.rematerializeOnArrival) {
      this.rematerialization.start(context.reducedMotion);
    }

    context.registerReturnAperture(
      group.position.x,
      group.position.z,
      core,
      "Fold through the reconstructed cube face to Signal Grid",
    );
  }

  update(delta: number, elapsed: number): void {
    const motionScale = this.context.reducedMotion ? 0.22 : 1;
    this.coreShell.rotation.x += delta * 0.22 * motionScale;
    this.coreShell.rotation.y -= delta * 0.31 * motionScale;
    this.innerCore.rotation.x -= delta * 0.28 * motionScale;
    this.innerCore.rotation.y += delta * 0.42 * motionScale;
    const pulse =
      0.76 + Math.sin(elapsed * 1.8 * motionScale) * 0.08 * motionScale;
    const material = this.innerCore.material;
    material.opacity = pulse;
    this.rematerialization.update(delta, elapsed);
  }

  hasActiveMotion(): boolean {
    return this.rematerialization.isActive;
  }
}
