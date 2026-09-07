import * as THREE from "three";

import type { Kickable } from "../../Kickable";
import { addBox } from "../../scenePrimitives";
import type { WorldStatusOptions } from "../../../world/WorldContracts";

export interface GridServerPatchHost {
  materials: Readonly<{
    amber: THREE.Material;
    black: THREE.Material;
    brass: THREE.Material;
    coral: THREE.Material;
    cyan: THREE.Material;
    tealDark: THREE.Material;
    violet: THREE.Material;
  }>;
  colors: Readonly<{
    amber: number;
    coral: number;
    cyan: number;
    violet: number;
  }>;
  registerKickable: (
    object: THREE.Object3D,
    radius: number,
    restingY: number,
    gravity: boolean,
    friction: number,
    message: string,
  ) => Kickable;
  addInteraction: (
    id: string,
    label: string,
    x: number,
    z: number,
    radius: number,
    action: () => void | Promise<void>,
  ) => void;
  getHeldKickable: () => Kickable | null;
  onStatus: (message: string, options?: WorldStatusOptions) => void;
  onComplete: () => void;
  hasAchievement: (title: string) => boolean;
  getElapsed: () => number;
  isReducedMotion: () => boolean;
}

interface PatchCable {
  plug: THREE.Group;
  kickable: Kickable;
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  positions: Float32Array;
  anchor: THREE.Vector3;
  target: THREE.Vector3;
  origin: THREE.Vector3;
  connected: boolean;
  connectionBlend: number;
}

interface PatchFloppy {
  object: THREE.Group;
  kickable: Kickable;
  target: THREE.Vector3;
  origin: THREE.Vector3;
  insertionStart: THREE.Vector3;
  insertionQuaternion: THREE.Quaternion;
  targetQuaternion: THREE.Quaternion;
  inserted: boolean;
  insertionBlend: number;
}

interface GridServerPatchState {
  group: THREE.Group;
  cables: [PatchCable, PatchCable];
  floppy: PatchFloppy;
  socketLights: THREE.Mesh<
    THREE.TorusGeometry,
    THREE.MeshBasicMaterial
  >[];
  statusLights: THREE.InstancedMesh<
    THREE.OctahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  statusDummy: THREE.Object3D;
  pulseAge: number;
}

interface GridServerPatchSnapshot {
  cables: [boolean, boolean];
  floppyInserted: boolean;
  complete: boolean;
}

const cablePointCount = 14;
const coralRackFrontZ = -4.68;

export class GridServerPatchPuzzle {
  private state: GridServerPatchState | null = null;
  private snapshot: GridServerPatchSnapshot = {
    cables: [false, false],
    floppyInserted: false,
    complete: false,
  };

  constructor(private readonly host: GridServerPatchHost) {
    if (host.hasAchievement("SNEAKERNET")) {
      this.snapshot = {
        cables: [true, true],
        floppyInserted: true,
        complete: true,
      };
    }
  }

  mount(parent: THREE.Group): void {
    if (this.state) {
      throw new Error("The Grid server patch puzzle is already mounted.");
    }
    const group = new THREE.Group();
    group.name = "grid-server-patch-puzzle";
    parent.add(group);

    const cableConfigs = [
      {
        anchor: new THREE.Vector3(-8.5, 0.76, -5.02),
        target: new THREE.Vector3(8.08, 0.82, coralRackFrontZ),
        origin: new THREE.Vector3(-6.7, 0.34, -4.72),
        color: this.host.colors.cyan,
        material: this.host.materials.cyan,
      },
      {
        anchor: new THREE.Vector3(0, 0.76, -7.02),
        target: new THREE.Vector3(8.9, 0.82, coralRackFrontZ),
        origin: new THREE.Vector3(1.72, 0.34, -6.3),
        color: this.host.colors.violet,
        material: this.host.materials.violet,
      },
    ] as const;
    const cables = cableConfigs.map((config, index) =>
      this.createCable(group, config, this.snapshot.cables[index] ?? false),
    ) as [PatchCable, PatchCable];

    const socketLights: THREE.Mesh<
      THREE.TorusGeometry,
      THREE.MeshBasicMaterial
    >[] = [];
    for (const [index, cable] of cables.entries()) {
      const material = new THREE.MeshBasicMaterial({
        color:
          index === 0 ? this.host.colors.cyan : this.host.colors.violet,
        transparent: true,
        opacity: cable.connected ? 0.95 : 0.34,
        toneMapped: false,
      });
      const socket = new THREE.Mesh(
        new THREE.TorusGeometry(0.18, 0.035, 5, 18),
        material,
      );
      socket.name = `grid-patch-target-socket-${index}`;
      socket.position.copy(cable.target);
      socket.castShadow = false;
      group.add(socket);
      socketLights.push(socket);
    }

    const floppy = this.createFloppy(
      group,
      this.snapshot.floppyInserted,
    );
    const slot = addBox(
      group,
      [0.92, 0.16, 0.16],
      [8.5, 1.36, coralRackFrontZ],
      this.host.materials.black,
    );
    slot.name = "grid-coral-rack-floppy-slot";
    slot.castShadow = false;
    const slotMouth = addBox(
      group,
      [0.72, 0.055, 0.025],
      [8.5, 1.36, coralRackFrontZ + 0.09],
      this.host.materials.coral,
    );
    slotMouth.castShadow = false;

    const statusLights = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.09, 0),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        toneMapped: false,
      }),
      3,
    );
    statusLights.name = "grid-server-patch-status-lights";
    statusLights.frustumCulled = false;
    const statusDummy = new THREE.Object3D();
    const statusColors = [
      new THREE.Color(this.host.colors.cyan),
      new THREE.Color(this.host.colors.violet),
      new THREE.Color(this.host.colors.coral),
    ];
    for (let index = 0; index < 3; index += 1) {
      statusDummy.position.set(8.18 + index * 0.32, 1.72, coralRackFrontZ + 0.1);
      statusDummy.updateMatrix();
      statusLights.setMatrixAt(index, statusDummy.matrix);
      statusLights.setColorAt(index, statusColors[index]!);
    }
    statusLights.instanceMatrix.needsUpdate = true;
    if (statusLights.instanceColor) {
      statusLights.instanceColor.needsUpdate = true;
    }
    group.add(statusLights);

    this.state = {
      group,
      cables,
      floppy,
      socketLights,
      statusLights,
      statusDummy,
      pulseAge: 2,
    };
    this.host.addInteraction(
      "grid-server-patch-bus",
      "Inspect severed patch bus",
      8.5,
      coralRackFrontZ,
      2.1,
      () => this.inspect(),
    );
    this.update(0);
  }

  unmount(): void {
    this.state = null;
  }

  update(delta: number): void {
    const state = this.state;
    if (!state) return;
    for (const [index, cable] of state.cables.entries()) {
      if (
        !cable.connected &&
        cable.kickable.enabled &&
        this.host.getHeldKickable() !== cable.kickable &&
        this.isNearFloorTarget(cable.plug.position, cable.target, 0.58)
      ) {
        cable.connected = true;
        cable.connectionBlend = 0;
        cable.kickable.enabled = false;
        cable.kickable.velocity.set(0, 0, 0);
        this.snapshot.cables[index] = true;
        state.pulseAge = 0;
        this.host.onStatus(
          index === 0
            ? "The cyan plug seats with a hard magnetic click. One half of the severed carrier steadies."
            : "The violet plug catches the second socket. Two racks begin exchanging the same impossible heartbeat.",
        );
      }
      if (cable.connected) {
        cable.connectionBlend = Math.min(
          1,
          cable.connectionBlend +
            delta * (this.host.isReducedMotion() ? 8 : 3.8),
        );
        const eased = THREE.MathUtils.smoothstep(
          cable.connectionBlend,
          0,
          1,
        );
        cable.plug.position.lerp(cable.target, eased);
        cable.plug.rotation.x = THREE.MathUtils.lerp(
          cable.plug.rotation.x,
          Math.PI / 2,
          eased,
        );
      }
      this.updateCableLine(cable);
      const socket = state.socketLights[index];
      if (socket) {
        socket.material.opacity =
          (cable.connected ? 0.76 : 0.24) +
          Math.sin(this.host.getElapsed() * (cable.connected ? 4.2 : 1.6) + index) *
            (cable.connected ? 0.18 : 0.05);
      }
    }

    const floppy = state.floppy;
    if (
      !floppy.inserted &&
      floppy.kickable.enabled &&
      this.host.getHeldKickable() !== floppy.kickable &&
      this.isNearFloorTarget(floppy.object.position, floppy.target, 0.68)
    ) {
      floppy.inserted = true;
      floppy.insertionBlend = 0;
      floppy.insertionStart.copy(floppy.object.position);
      floppy.insertionQuaternion.copy(floppy.object.quaternion);
      floppy.kickable.enabled = false;
      floppy.kickable.velocity.set(0, 0, 0);
      this.snapshot.floppyInserted = true;
      state.pulseAge = 0;
      this.host.onStatus(
        "The floppy shutter yields. Old magnetic sectors wake beneath the coral rack’s modern pulse.",
      );
    }
    if (floppy.inserted) {
      floppy.insertionBlend = Math.min(
        1,
        floppy.insertionBlend +
          delta * (this.host.isReducedMotion() ? 8 : 3.2),
      );
      const eased = THREE.MathUtils.smoothstep(
        floppy.insertionBlend,
        0,
        1,
      );
      floppy.object.position.lerpVectors(
        floppy.insertionStart,
        floppy.target,
        eased,
      );
      floppy.object.quaternion.slerpQuaternions(
        floppy.insertionQuaternion,
        floppy.targetQuaternion,
        eased,
      );
    }

    const complete =
      state.cables.every((cable) => cable.connected) &&
      floppy.inserted;
    if (complete && !this.snapshot.complete) {
      this.snapshot.complete = true;
      state.pulseAge = 0;
      this.host.onComplete();
      this.host.onStatus(
        "Both patch leads hold. The floppy uploads WORM.COM and the coral rack opens a local C2 channel. `worm` or `c2` now answers at any terminal.",
        { kind: "achievement", title: "SNEAKERNET" },
      );
    }
    state.pulseAge = Math.min(2, state.pulseAge + delta);
    const pulse =
      state.pulseAge < 1
        ? Math.sin(state.pulseAge * Math.PI) *
          (1 - state.pulseAge)
        : 0;
    for (let index = 0; index < 3; index += 1) {
      const active =
        index < 2
          ? state.cables[index]?.connected
          : state.floppy.inserted;
      state.statusDummy.position.set(
        8.18 + index * 0.32,
        1.72 + pulse * 0.08,
        coralRackFrontZ + 0.1,
      );
      const scale =
        (active ? 1 : 0.55) *
        (1 + pulse * (this.snapshot.complete ? 1.2 : 0.55));
      state.statusDummy.scale.setScalar(scale);
      state.statusDummy.updateMatrix();
      state.statusLights.setMatrixAt(index, state.statusDummy.matrix);
    }
    state.statusLights.instanceMatrix.needsUpdate = true;
  }

  resetLooseParts(): boolean {
    const state = this.state;
    if (!state || this.snapshot.complete) return false;
    let changed = false;
    for (const cable of state.cables) {
      if (cable.connected) continue;
      changed ||= cable.plug.position.distanceToSquared(cable.origin) > 0.01;
      cable.plug.position.copy(cable.origin);
      cable.plug.rotation.set(0, 0, 0);
      cable.kickable.velocity.set(0, 0, 0);
      cable.kickable.enabled = true;
    }
    if (!state.floppy.inserted) {
      changed ||=
        state.floppy.object.position.distanceToSquared(state.floppy.origin) >
        0.01;
      state.floppy.object.position.copy(state.floppy.origin);
      state.floppy.object.rotation.set(0, 0.18, 0);
      state.floppy.kickable.velocity.set(0, 0, 0);
      state.floppy.kickable.enabled = true;
    }
    return changed;
  }

  isComplete(): boolean {
    return this.snapshot.complete;
  }

  getTraceLines(): readonly string[] | null {
    if (!this.snapshot.complete) return null;
    const state = this.state;
    if (state) state.pulseAge = 0;
    return [
      "GRID TRACE // SNEAKERNET CARRIER",
      "cyan.rack/0  ── magnetic patch ──┐",
      "violet.rack/1 ─ magnetic patch ─┼─ coral.rack/2",
      "fd0: 1.44 MB · 80 tracks · checksum 0xDAE7",
      "payload: WORM.COM · resident packet hunter",
      "c2: 192.168.0.1:31337 · LISTENING",
      "installed: /world/bin/worm",
    ];
  }

  forEachDynamicObject(visitor: (object: THREE.Object3D) => void): void {
    const state = this.state;
    if (!state) return;
    for (const cable of state.cables) {
      visitor(cable.plug);
      visitor(cable.line);
    }
    visitor(state.floppy.object);
    visitor(state.statusLights);
  }

  private createCable(
    parent: THREE.Group,
    config: {
      anchor: THREE.Vector3;
      target: THREE.Vector3;
      origin: THREE.Vector3;
      color: number;
      material: THREE.Material;
    },
    connected: boolean,
  ): PatchCable {
    const plug = new THREE.Group();
    plug.name = `grid-loose-patch-plug-${config.color.toString(16)}`;
    plug.position.copy(connected ? config.target : config.origin);
    const grip = addBox(
      plug,
      [0.38, 0.18, 0.24],
      [0, 0, 0],
      this.host.materials.black,
    );
    grip.castShadow = false;
    const tip = addBox(
      plug,
      [0.18, 0.12, 0.31],
      [0, 0, 0.22],
      config.material,
    );
    tip.castShadow = false;
    parent.add(plug);
    const kickable = this.host.registerKickable(
      plug,
      0.24,
      config.origin.y,
      false,
      0.9,
      "A loose patch plug skitters across the etched floor, tugging its cable behind it.",
    );
    kickable.enabled = !connected;

    const positions = new Float32Array(cablePointCount * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({
        color: config.color,
        transparent: true,
        opacity: 0.82,
        toneMapped: false,
      }),
    );
    line.name = "grid-live-patch-cable";
    line.frustumCulled = false;
    parent.add(line);
    return {
      plug,
      kickable,
      line,
      positions,
      anchor: config.anchor.clone(),
      target: config.target.clone(),
      origin: config.origin.clone(),
      connected,
      connectionBlend: connected ? 1 : 0,
    };
  }

  private createFloppy(
    parent: THREE.Group,
    inserted: boolean,
  ): PatchFloppy {
    const origin = new THREE.Vector3(5.5, 0.2, -3.9);
    const target = new THREE.Vector3(8.5, 1.36, coralRackFrontZ + 0.015);
    const object = new THREE.Group();
    object.name = "grid-loose-floppy-disk";
    object.position.copy(inserted ? target : origin);
    object.rotation.y = inserted ? 0 : 0.18;
    const body = addBox(
      object,
      [0.72, 0.075, 0.68],
      [0, 0, 0],
      this.host.materials.tealDark,
    );
    body.castShadow = false;
    const label = addBox(
      object,
      [0.48, 0.012, 0.26],
      [0, 0.045, -0.11],
      this.host.materials.amber,
    );
    label.castShadow = false;
    const shutter = addBox(
      object,
      [0.42, 0.018, 0.16],
      [0, 0.05, 0.23],
      this.host.materials.brass,
    );
    shutter.castShadow = false;
    parent.add(object);
    const targetQuaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(Math.PI / 2, 0, 0),
    );
    if (inserted) object.quaternion.copy(targetQuaternion);
    const kickable = this.host.registerKickable(
      object,
      0.38,
      origin.y,
      false,
      0.91,
      "The floppy disk slides over the circuitry with a distinctly obsolete confidence.",
    );
    kickable.enabled = !inserted;
    return {
      object,
      kickable,
      target,
      origin,
      insertionStart: object.position.clone(),
      insertionQuaternion: object.quaternion.clone(),
      targetQuaternion,
      inserted,
      insertionBlend: inserted ? 1 : 0,
    };
  }

  private updateCableLine(cable: PatchCable): void {
    const end = cable.plug.position;
    const directionX = end.x - cable.anchor.x;
    const directionZ = end.z - cable.anchor.z;
    const length = Math.max(0.001, Math.hypot(directionX, directionZ));
    const perpendicularX = -directionZ / length;
    const perpendicularZ = directionX / length;
    const slack = cable.connected ? 0.18 : Math.min(0.72, length * 0.06);
    for (let point = 0; point < cablePointCount; point += 1) {
      const progress = point / (cablePointCount - 1);
      const curve = Math.sin(progress * Math.PI);
      const offset = point * 3;
      cable.positions[offset] =
        THREE.MathUtils.lerp(cable.anchor.x, end.x, progress) +
        perpendicularX *
          curve *
          slack *
          Math.sin(progress * Math.PI * 3 + cable.anchor.x);
      cable.positions[offset + 1] =
        THREE.MathUtils.lerp(cable.anchor.y, end.y, progress) -
        curve * (0.42 + slack * 0.18);
      cable.positions[offset + 2] =
        THREE.MathUtils.lerp(cable.anchor.z, end.z, progress) +
        perpendicularZ *
          curve *
          slack *
          Math.sin(progress * Math.PI * 3 + cable.anchor.x);
    }
    cable.line.geometry.attributes.position!.needsUpdate = true;
  }

  private inspect(): void {
    const state = this.state;
    if (!state) return;
    if (this.snapshot.complete) {
      this.host.onStatus(
        "Three status facets burn steadily. The coral rack keeps C2://192.168.0.1:31337 open to WORM.COM in every terminal.",
      );
      return;
    }
    const openCables = state.cables.filter((cable) => !cable.connected).length;
    this.host.onStatus(
      `${openCables === 0 ? "Both magnetic patch leads are seated" : `${openCables} loose magnetic lead${openCables === 1 ? "" : "s"} trail across the floor`}. The coral rack’s narrow disk mouth remains ${state.floppy.inserted ? "occupied" : "empty"}.`,
    );
  }

  private isNearFloorTarget(
    position: THREE.Vector3,
    target: THREE.Vector3,
    radius: number,
  ): boolean {
    return Math.hypot(position.x - target.x, position.z - target.z) < radius;
  }
}
