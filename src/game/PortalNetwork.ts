import * as THREE from "three";

import type {
  WorldStatusOptions,
  ZoneId,
} from "../world/WorldContracts";

interface PortalAnimatedItem {
  object: THREE.Object3D;
  originY: number;
  phase: number;
  amplitude: number;
  rotationSpeed: number;
  rotationAxis?: "x" | "y" | "z";
}

interface PortalLanternReveal {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  range: number;
  isAvailable?: () => boolean;
}

interface PortalMilestoneProgress {
  unlocked: number;
  total: number;
}

export interface PortalNetworkHost {
  materials: Readonly<{
    amber: THREE.Material;
    cyan: THREE.Material;
    green: THREE.Material;
    parchment: THREE.Material;
    portalGlyph: THREE.Material;
    stone: THREE.Material;
    violet: THREE.Material;
  }>;
  colors: Readonly<{
    amber: number;
    coral: number;
    cyan: number;
    green: number;
    violet: number;
  }>;
  addInteraction: (
    id: string,
    label: string,
    x: number,
    z: number,
    radius: number,
    action: () => void | Promise<void>,
  ) => void;
  addAnimatedItem: (item: PortalAnimatedItem) => void;
  addLanternReveal: (reveal: PortalLanternReveal) => void;
  runWorldAction: (
    action: () => void | Promise<void>,
    failureMessage: string,
    onFailure?: () => void,
  ) => void;
  travelTo: (destination: ZoneId) => void | Promise<void>;
  onStatus: (message: string, options?: WorldStatusOptions) => void;
  getCurrentZone: () => ZoneId;
  getPlayerPosition: () => Readonly<THREE.Vector3>;
  getZoneMilestoneProgress: (zone: ZoneId) => PortalMilestoneProgress;
  getElapsed: () => number;
  isInputEnabled: () => boolean;
  isTransitioning: () => boolean;
  isPlayerLocked: () => boolean;
  isWorldCollapseActive: () => boolean;
  isReducedMotion: () => boolean;
}

export interface PortalHandle {
  readonly position: THREE.Vector3;
  readonly destination: ZoneId;
}

interface PortalState extends PortalHandle {
  core: THREE.Object3D;
  milestones: PortalMilestoneDisplay;
  action: () => void | Promise<void>;
  dwell: number;
  announced: boolean;
  triggered: boolean;
  chargeMode?: "pulse" | "collapse";
  lockMessage?: string;
}

interface PortalMilestoneDisplay {
  progressZone: ZoneId;
  facets: THREE.InstancedMesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  cores: THREE.InstancedMesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  completionCircuit: THREE.Mesh<
    THREE.TorusGeometry,
    THREE.MeshBasicMaterial
  >;
  dummy: THREE.Object3D;
  growth: Float32Array;
  colors: THREE.Color[];
  colorScratch: THREE.Color;
  total: number;
  targetUnlocked: number;
  completion: number;
  orbiting: boolean;
  phase: number;
}

interface PortalMilestoneOptions {
  progressZone: ZoneId;
  fragmentZone?: ZoneId;
  orbiting: boolean;
}

export interface PortalApertureOptions {
  x: number;
  z: number;
  core: THREE.Object3D;
  destination: ZoneId;
  milestoneParent: THREE.Object3D;
  signParent: THREE.Group;
  rotation: number;
  progressZone: ZoneId;
  fragmentZone?: ZoneId;
  orbiting: boolean;
  action?: () => void | Promise<void>;
  chargeMode?: "pulse" | "collapse";
  lockMessage?: string;
  interaction?: {
    id: string;
    label: string;
    radius: number;
  };
}

const zoneCollapseCommandFragments: Readonly<
  Record<ZoneId, { order: string; command: string }>
> = {
  // SUDO is the hub-level completion unlock rather than a portal fragment.
  field: { order: "01", command: "SUDO" },
  falls: { order: "02", command: "COLLAPSE" },
  grid: { order: "03", command: "WORLD" },
  archive: { order: "04", command: "--EVENT-HORIZON" },
  math: { order: "05", command: "--ARM" },
};
const portalArrivalRadius = 1.42;
const portalDwellDuration = 1.25;

function createPortalMilestoneCrystalGeometry(
  radius: number,
): THREE.OctahedronGeometry {
  const geometry = new THREE.OctahedronGeometry(radius, 0);
  const normals = geometry.getAttribute("normal");
  const faceShades = new Float32Array(normals.count * 3);
  for (let vertex = 0; vertex < normals.count; vertex += 1) {
    const shade = THREE.MathUtils.clamp(
      0.76 +
        normals.getY(vertex) * 0.16 +
        normals.getX(vertex) * 0.07 -
        normals.getZ(vertex) * 0.05,
      0.58,
      1,
    );
    faceShades[vertex * 3] = shade;
    faceShades[vertex * 3 + 1] = shade;
    faceShades[vertex * 3 + 2] = shade;
  }
  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(faceShades, 3),
  );
  return geometry;
}

export class PortalNetwork {
  private readonly portals: PortalState[] = [];
  private readonly restScale = new THREE.Vector3(1, 1, 1);
  private readonly dormantMilestoneShade = new THREE.Color(0x172227);
  private readonly zoneMilestoneColors: Readonly<
    Record<ZoneId, readonly number[]>
  >;
  private arrivalGuardUntil = 0;

  constructor(private readonly host: PortalNetworkHost) {
    this.zoneMilestoneColors = {
      field: [host.colors.amber, host.colors.green],
      falls: [
        host.colors.green,
        host.colors.cyan,
        host.colors.violet,
        host.colors.amber,
      ],
      grid: [
        host.colors.cyan,
        host.colors.coral,
        host.colors.violet,
        host.colors.amber,
      ],
      archive: [
        host.colors.violet,
        host.colors.cyan,
        host.colors.amber,
        host.colors.green,
      ],
      math: [
        host.colors.amber,
        host.colors.violet,
        host.colors.cyan,
        host.colors.green,
        host.colors.coral,
      ],
    };
  }

  clear(): void {
    this.portals.length = 0;
    this.arrivalGuardUntil = 0;
  }

  guardArrivalsUntil(elapsed: number): void {
    this.arrivalGuardUntil = elapsed;
  }

  suspendThresholds(): void {
    this.arrivalGuardUntil = Number.POSITIVE_INFINITY;
  }

  update(delta: number): void {
    this.updateThresholds(delta);
    this.updatePortalMilestones(delta);
  }

  findByDestination(destination: ZoneId): PortalHandle | null {
    return (
      this.portals.find((portal) => portal.destination === destination) ??
      null
    );
  }

  findContaining(
    x: number,
    z: number,
    radius = 1.55,
  ): PortalHandle | null {
    const radiusSquared = radius * radius;
    return (
      this.portals.find((portal) => {
        const dx = x - portal.position.x;
        const dz = z - portal.position.z;
        return dx * dx + dz * dz < radiusSquared;
      }) ?? null
    );
  }

  pulse(portal: PortalHandle, scale = 1.28): void {
    const state = this.portals.find((candidate) => candidate === portal);
    state?.core.scale.setScalar(scale);
  }

  pulseDestination(destination: ZoneId, scale = 1.28): void {
    const portal = this.portals.find(
      (candidate) => candidate.destination === destination,
    );
    portal?.core.scale.setScalar(scale);
  }

  registerAperture(options: PortalApertureOptions): PortalHandle {
    const action =
      options.action ?? (() => this.host.travelTo(options.destination));
    const milestones = this.createPortalMilestoneDisplay(
      options.milestoneParent,
      options.signParent,
      options.x,
      options.z,
      options.rotation,
      {
        progressZone: options.progressZone,
        fragmentZone: options.fragmentZone,
        orbiting: options.orbiting,
      },
    );
    const portal: PortalState = {
      position: new THREE.Vector3(options.x, 0, options.z),
      core: options.core,
      destination: options.destination,
      milestones,
      action,
      dwell: 0,
      announced: false,
      triggered: false,
      chargeMode: options.chargeMode,
      lockMessage: options.lockMessage,
    };
    this.portals.push(portal);
    if (options.interaction) {
      this.host.addInteraction(
        options.interaction.id,
        options.interaction.label,
        options.x,
        options.z,
        options.interaction.radius,
        action,
      );
    }
    return portal;
  }

  refreshMilestones(): void {
    for (const portal of this.portals) {
      const display = portal.milestones;
      const progress = this.host.getZoneMilestoneProgress(
        display.progressZone,
      );
      display.targetUnlocked = THREE.MathUtils.clamp(
        progress.unlocked,
        0,
        display.total,
      );
    }
  }

  private updateThresholds(delta: number): void {
    if (this.host.isWorldCollapseActive()) return;
    const playerPosition = this.host.getPlayerPosition();
    for (const portal of this.portals) {
      const dx = portal.position.x - playerPosition.x;
      const dz = portal.position.z - playerPosition.z;
      const inside =
        dx * dx + dz * dz <
        portalArrivalRadius * portalArrivalRadius;
      if (
        !inside ||
        !this.host.isInputEnabled() ||
        this.host.isTransitioning() ||
        this.host.isPlayerLocked() ||
        this.host.getElapsed() < this.arrivalGuardUntil
      ) {
        portal.dwell = 0;
        portal.announced = false;
        portal.triggered = false;
        portal.core.scale.lerp(
          this.restScale,
          Math.min(1, delta * 8),
        );
        continue;
      }

      portal.dwell += delta;
      const charge = Math.min(1, portal.dwell / portalDwellDuration);
      const elapsed = this.host.getElapsed();
      const pulse =
        portal.chargeMode === "collapse"
          ? 1 - charge * 0.42 + Math.sin(elapsed * 9) * 0.008
          : 1 + charge * 0.12 + Math.sin(elapsed * 9) * 0.015;
      portal.core.scale.setScalar(pulse);
      if (portal.dwell > 0.42 && !portal.announced) {
        portal.announced = true;
        this.host.onStatus(
          portal.lockMessage ?? "Portal lock forming… remain inside to travel.",
        );
      }
      if (portal.dwell >= portalDwellDuration && !portal.triggered) {
        portal.triggered = true;
        this.host.runWorldAction(
          portal.action,
          "The threshold loses its lock before the route settles. " +
            "Remain nearby and let it form again.",
          () => {
            portal.dwell = 0;
            portal.announced = false;
            portal.triggered = false;
          },
        );
        return;
      }
    }
  }

  private createPortalFragmentSign(
    parent: THREE.Group,
    x: number,
    z: number,
    rotation: number,
    destination: ZoneId,
  ): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
    const fragment = zoneCollapseCommandFragments[destination];
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 320;
    const context = canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      const wash = context.createLinearGradient(0, 0, canvas.width, 0);
      wash.addColorStop(0, "rgba(255, 171, 65, 0)");
      wash.addColorStop(0.16, "rgba(255, 171, 65, 0.13)");
      wash.addColorStop(0.84, "rgba(98, 220, 232, 0.13)");
      wash.addColorStop(1, "rgba(98, 220, 232, 0)");
      context.fillStyle = wash;
      context.fillRect(0, 42, canvas.width, canvas.height - 84);
      context.strokeStyle = "rgba(255, 194, 96, 0.52)";
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(70, 58);
      context.lineTo(34, 160);
      context.lineTo(70, 262);
      context.moveTo(canvas.width - 70, 58);
      context.lineTo(canvas.width - 34, 160);
      context.lineTo(canvas.width - 70, 262);
      context.stroke();
      context.textBaseline = "middle";
      context.textAlign = "left";
      context.fillStyle = "#ffbd55";
      context.font = "800 62px ui-monospace, SFMono-Regular, Menlo, monospace";
      context.fillText(fragment.order, 94, 160);
      context.fillStyle = "#eaffff";
      let fontSize = 66;
      const fontFamily =
        "ui-monospace, SFMono-Regular, Menlo, monospace";
      context.font = `800 ${fontSize}px ${fontFamily}`;
      while (
        fontSize > 42 &&
        context.measureText(fragment.command).width > 710
      ) {
        fontSize -= 2;
        context.font = `800 ${fontSize}px ${fontFamily}`;
      }
      context.lineWidth = 9;
      context.strokeStyle = "rgba(3, 8, 12, 0.88)";
      context.strokeText(fragment.command, 244, 160);
      context.fillText(fragment.command, 244, 160);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = `portal-collapse-fragment-${destination}`;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const width = destination === "archive" ? 6.6 : 4.5;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width * 0.3125),
      material,
    );
    sign.name = `portal-collapse-fragment-sign-${destination}`;
    const length = Math.max(0.001, Math.hypot(x, z));
    const inwardX = -x / length;
    const inwardZ = -z / length;
    sign.position.set(
      x + inwardX * 2.45,
      0.17,
      z + inwardZ * 2.45,
    );
    sign.rotation.set(-Math.PI / 2, 0, rotation);
    sign.visible = false;
    sign.renderOrder = 4;
    parent.add(sign);
    return sign;
  }

  private createPortalMilestoneDisplay(
    parent: THREE.Object3D,
    signParent: THREE.Group,
    x: number,
    z: number,
    rotation: number,
    options: PortalMilestoneOptions,
  ): PortalMilestoneDisplay {
    const { progressZone, orbiting } = options;
    const fragmentZone = options.fragmentZone ?? progressZone;
    const progress = this.host.getZoneMilestoneProgress(progressZone);
    const total = Math.max(1, progress.total);
    const root = new THREE.Group();
    root.name = `portal-milestones-${progressZone}`;
    if (!orbiting) root.position.set(0, 2.05, 0.34);
    parent.add(root);

    const facetGeometry = createPortalMilestoneCrystalGeometry(0.34);
    const facetMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      toneMapped: false,
    });

    const facets = new THREE.InstancedMesh(
      facetGeometry,
      facetMaterial,
      total,
    );
    facets.name = `portal-milestone-facets-${progressZone}`;
    facets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    facets.frustumCulled = false;
    facets.castShadow = false;
    root.add(facets);

    const cores = new THREE.InstancedMesh(
      facetGeometry.clone(),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: true,
        opacity: 0.18,
        depthTest: false,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      total,
    );
    cores.name = `portal-milestone-cores-${progressZone}`;
    cores.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    cores.frustumCulled = false;
    cores.renderOrder = 3;
    root.add(cores);

    const completionCircuit = new THREE.Mesh(
      new THREE.TorusGeometry(
        orbiting ? 1.38 : 1.86,
        orbiting ? 0.035 : 0.052,
        5,
        orbiting ? 28 : 36,
      ),
      new THREE.MeshBasicMaterial({
        color:
          this.zoneMilestoneColors[progressZone][0] ??
          this.host.colors.cyan,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    completionCircuit.name =
      `portal-milestone-complete-circuit-${progressZone}`;
    if (orbiting) completionCircuit.rotation.x = Math.PI / 2;
    completionCircuit.visible = false;
    completionCircuit.renderOrder = 3;
    root.add(completionCircuit);

    const fragmentSign = this.createPortalFragmentSign(
      signParent,
      x,
      z,
      rotation,
      fragmentZone,
    );
    const colors = Array.from(
      { length: total },
      (_, index) =>
        new THREE.Color(
          this.zoneMilestoneColors[progressZone][
            index % this.zoneMilestoneColors[progressZone].length
          ] ?? this.host.colors.cyan,
        ),
    );
    const display: PortalMilestoneDisplay = {
      progressZone,
      facets,
      cores,
      completionCircuit,
      dummy: new THREE.Object3D(),
      growth: new Float32Array(total),
      colors,
      colorScratch: new THREE.Color(),
      total,
      targetUnlocked: THREE.MathUtils.clamp(
        progress.unlocked,
        0,
        total,
      ),
      completion: progress.unlocked >= total ? 1 : 0,
      orbiting,
      phase: (Math.abs(x * 0.31 + z * 0.17) % 1) * Math.PI * 2,
    };
    for (let index = 0; index < total; index += 1) {
      display.growth[index] =
        index < display.targetUnlocked ? 1 : 0;
    }
    this.host.addLanternReveal({
      mesh: fragmentSign,
      range: 8.4,
      isAvailable: () => {
        const fragmentProgress =
          this.host.getZoneMilestoneProgress(fragmentZone);
        return (
          fragmentProgress.total > 0 &&
          fragmentProgress.unlocked >= fragmentProgress.total
        );
      },
    });
    this.updatePortalMilestoneDisplay(display, 0, true);
    return display;
  }

  private updatePortalMilestoneDisplay(
    display: PortalMilestoneDisplay,
    delta: number,
    immediate = false,
  ): void {
    const follow =
      immediate || this.host.isReducedMotion()
        ? 1
        : 1 - Math.exp(-delta * 5.6);
    for (let index = 0; index < display.total; index += 1) {
      const target = index < display.targetUnlocked ? 1 : 0;
      const growth = THREE.MathUtils.lerp(
        display.growth[index] ?? 0,
        target,
        follow,
      );
      display.growth[index] = growth;
      const color = display.colorScratch
        .copy(display.colors[index] ?? display.colors[0]!)
        .lerp(this.dormantMilestoneShade, (1 - growth) * 0.46);
      display.facets.setColorAt(index, color);
      display.cores.setColorAt(index, color);

      const dummy = display.dummy;
      if (display.orbiting) {
        const angle =
          display.phase +
          (index / display.total) * Math.PI * 2 +
          this.host.getElapsed() * (0.16 + index * 0.018);
        const radius = 1.48 + (index % 2) * 0.32;
        dummy.position.set(
          Math.cos(angle) * radius,
          Math.sin(angle * 1.7 + display.phase) * 0.46,
          Math.sin(angle) * radius,
        );
        dummy.rotation.set(
          angle * 0.42 + index,
          -angle * 0.68,
          angle + index * 0.4,
        );
      } else {
        const angle =
          display.total === 1
            ? Math.PI / 2
            : THREE.MathUtils.lerp(
                -Math.PI * 0.08,
                Math.PI * 1.08,
                index / (display.total - 1),
              );
        dummy.position.set(
          Math.cos(angle) * 1.86,
          Math.sin(angle) * 1.86,
          0,
        );
        dummy.rotation.set(0, 0, angle - Math.PI / 2);
      }
      const seedScale = 0.42 + growth * 0.58;
      const shardHeight = 1.32 + (index % 3) * 0.15;
      dummy.scale.set(
        0.78 * seedScale,
        shardHeight * seedScale,
        0.78 * seedScale,
      );
      dummy.updateMatrix();
      display.facets.setMatrixAt(index, dummy.matrix);

      dummy.scale.set(
        0.88 * seedScale,
        shardHeight * 1.1 * seedScale,
        0.88 * seedScale,
      );
      dummy.updateMatrix();
      display.cores.setMatrixAt(index, dummy.matrix);
    }
    display.facets.instanceMatrix.needsUpdate = true;
    display.cores.instanceMatrix.needsUpdate = true;
    if (display.facets.instanceColor) {
      display.facets.instanceColor.needsUpdate = true;
    }
    if (display.cores.instanceColor) {
      display.cores.instanceColor.needsUpdate = true;
    }

    const completeTarget =
      display.targetUnlocked >= display.total ? 1 : 0;
    display.completion = THREE.MathUtils.lerp(
      display.completion,
      completeTarget,
      immediate || this.host.isReducedMotion()
        ? 1
        : 1 - Math.exp(-delta * 3.2),
    );
    display.completionCircuit.visible = display.completion > 0.005;
    display.completionCircuit.material.opacity =
      display.completion *
      (0.68 + Math.sin(this.host.getElapsed() * 2.8 + display.phase) * 0.12);
    display.completionCircuit.scale.setScalar(
      1 + display.completion * Math.sin(this.host.getElapsed() * 1.9) * 0.018,
    );
  }

  private updatePortalMilestones(delta: number): void {
    for (const portal of this.portals) {
      this.updatePortalMilestoneDisplay(portal.milestones, delta);
    }
  }

  createThreshold(
    parent: THREE.Group,
    x: number,
    z: number,
    color: number,
    label: string,
    destination: ZoneId,
  ): void {
    const action = () => this.host.travelTo(destination);
    const group = new THREE.Group();
    group.name = `portal-to-${destination}`;
    group.position.set(x, 0, z);
    // Keep every threshold tangent to the island edge, with its step facing
    // inward. The Archive portal already looked close at 0/π; the diagonal
    // Field portals need this radial yaw to avoid appearing offset.
    group.rotation.y = Math.atan2(-x, -z);

    const portalMaterial =
      color === this.host.colors.green
        ? this.host.materials.green
        : color === this.host.colors.cyan
          ? this.host.materials.cyan
          : color === this.host.colors.violet
            ? this.host.materials.violet
            : this.host.materials.amber;

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.75, 0.36, 6, 18),
      this.host.materials.stone,
    );
    ring.name = `portal-stone-ring-${destination}`;
    ring.position.y = 2.05;
    ring.castShadow = true;
    ring.receiveShadow = true;
    group.add(ring);

    const coreMaterial = portalMaterial.clone();
    coreMaterial.transparent = true;
    coreMaterial.opacity = 0.64;
    coreMaterial.depthWrite = false;
    coreMaterial.side = THREE.DoubleSide;
    const core = new THREE.Mesh(new THREE.CircleGeometry(1.48, 28), coreMaterial);
    core.position.set(0, 2.05, -0.02);
    core.renderOrder = 0;
    group.add(core);

    const swirl = new THREE.Mesh(
      new THREE.TorusGeometry(0.92, 0.055, 5, 24, Math.PI * 1.55),
      this.host.materials.portalGlyph,
    );
    swirl.position.set(0, 2.05, 0);
    swirl.rotation.z = Math.abs(x * 0.2 + z * 0.13);
    swirl.castShadow = false;
    swirl.renderOrder = 2;
    group.add(swirl);

    for (const side of [-1, 1]) {
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.78, 1.3, 0.9),
        this.host.materials.stone,
      );
      base.position.set(side * 1.42, 0.65, 0);
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);
    }

    const step = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 0.25, 1.6),
      this.host.materials.parchment,
    );
    step.position.set(0, 0.08, 0.45);
    step.receiveShadow = true;
    group.add(step);

    parent.add(group);
    const currentZone = this.host.getCurrentZone();
    const isReturnThreshold =
      destination === "field" && currentZone !== "field";
    const progressZone = isReturnThreshold ? currentZone : destination;
    this.host.addAnimatedItem({
      object: core,
      originY: core.position.y,
      phase: Math.abs(x * 0.4 + z * 0.7),
      amplitude: 0.045,
      rotationSpeed: 0,
    });
    this.host.addAnimatedItem({
      object: swirl,
      originY: swirl.position.y,
      phase: Math.abs(z * 0.3),
      amplitude: 0,
      rotationSpeed: 0.42,
      rotationAxis: "z",
    });
    this.registerAperture({
      x,
      z,
      core,
      destination,
      milestoneParent: group,
      signParent: parent,
      rotation: group.rotation.y,
      progressZone,
      // Both faces of a threshold teach the same world-owned fragment.
      // Return portals therefore mirror the world being left, not Field.
      fragmentZone: progressZone,
      orbiting: false,
      action,
      interaction: {
        id: `portal-${label}`,
        label,
        radius: 2.65,
      },
    });
  }
}
