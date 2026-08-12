import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { WorldStatusOptions } from "../../../world/WorldContracts";
import type { SurfaceArea } from "../../SurfaceSelection";
import { addBox, addCylinder } from "../../scenePrimitives";

export interface HanoiPuzzleHost {
  materials: Readonly<{
    black: THREE.Material;
    brass: THREE.Material;
    coral: THREE.Material;
    cyan: THREE.Material;
    green: THREE.Material;
    tealDark: THREE.Material;
    violet: THREE.Material;
  }>;
  colors: Readonly<{
    brass: THREE.ColorRepresentation;
    coral: THREE.ColorRepresentation;
    cyan: THREE.ColorRepresentation;
    green: THREE.ColorRepresentation;
    parchment: THREE.ColorRepresentation;
  }>;
  playerRadius: number;
  addStaticBox: (
    x: number,
    y: number,
    z: number,
    halfWidth: number,
    halfHeight: number,
    halfDepth: number,
    clearAbove?: number,
  ) => void;
  addSurface: (surface: SurfaceArea) => void;
  addInteraction: (
    id: string,
    label: string,
    x: number,
    z: number,
    radius: number,
    action: () => void | Promise<void>,
  ) => void;
  updateInteractionLabel: (id: string, label: string) => void;
  onStatus: (message: string, options?: WorldStatusOptions) => void;
  getElapsed: () => number;
  isReducedMotion: () => boolean;
  isCollisionDebugEnabled: () => boolean;
  refreshCollisionDebug: () => void;
  getPlayerPosition: () => Readonly<THREE.Vector3>;
  getPlayerWorldY: () => number;
  getPlayerHeading: () => number;
}

interface HanoiCoin {
  group: THREE.Group;
  value: number;
  peg: number | null;
}

interface HanoiPuzzleState {
  group: THREE.Group;
  coins: HanoiCoin[];
  stacks: number[][];
  pegOffsets: number[];
  tipSurfaces: SurfaceArea[];
  interactionIds: string[];
  protocolInteractionId: string;
  heldCoin: number | null;
  heldFrom: number | null;
  moves: number;
  completed: boolean;
  bufferReached: boolean;
  resetArmedUntil: number;
  bufferSignal: THREE.Group;
  reward: THREE.Group;
}

interface HanoiPuzzleSnapshot {
  stacks: [number[], number[], number[]];
  moves: number;
  completed: boolean;
  bufferReached: boolean;
}

const hanoiCoinBaseY = 0.49;
const hanoiCoinStackStep = 0.26;

export class HanoiPuzzle {
  private state: HanoiPuzzleState | null = null;
  private snapshot: HanoiPuzzleSnapshot = {
    stacks: [[2, 1, 0], [], []],
    moves: 0,
    completed: false,
    bufferReached: false,
  };

  constructor(private readonly host: HanoiPuzzleHost) {}

  mount(
    parent: THREE.Group,
    x: number,
    z: number,
  ): void {
    if (this.state) {
      throw new Error("The checksum Hanoi puzzle is already mounted.");
    }
    const group = new THREE.Group();
    group.name = "checksum-hanoi";
    group.position.set(x, 0, z);

    const base = addBox(
      group,
      [8.2, 0.26, 3.2],
      [0, 0.17, 0],
      this.host.materials.black,
    );
    base.castShadow = false;
    const deck = addBox(
      group,
      [7.82, 0.06, 2.84],
      [0, 0.33, 0],
      this.host.materials.tealDark,
    );
    deck.castShadow = false;
    this.host.addSurface({
      id: "checksum-hanoi-deck",
      x,
      z,
      halfWidth: 4.1,
      halfDepth: 1.6,
      requiresJump: false,
      heightAt: () => 0.36,
    });

    const pegOffsets = [-2.48, 0, 2.48];
    const pegMaterials = [
      this.host.materials.coral,
      this.host.materials.cyan,
      this.host.materials.green,
    ] as const;
    for (const [index, pegX] of pegOffsets.entries()) {
      const foot = new THREE.Mesh(
        new THREE.TorusGeometry(0.68, 0.07, 5, 22),
        pegMaterials[index] ?? this.host.materials.cyan,
      );
      foot.position.set(pegX, 0.39, 0);
      foot.rotation.x = Math.PI / 2;
      foot.castShadow = false;
      group.add(foot);
      const peg = addCylinder(
        group,
        0.1,
        0.14,
        1.82,
        8,
        [pegX, 1.25, 0],
        this.host.materials.brass,
      );
      peg.castShadow = false;
      const cap = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.17, 0),
        pegMaterials[index] ?? this.host.materials.cyan,
      );
      cap.position.set(pegX, 2.22, 0);
      cap.castShadow = false;
      group.add(cap);
      this.host.addStaticBox(
        x + pegX,
        1.2,
        z,
        0.13,
        1.2,
        0.13,
        2.4,
      );
    }

    const values = [1, 10, 100];
    const outerRadii = [0.61, 0.83, 1.06];
    const coinBodyColors = [
      0x80612f,
      0x98723a,
      0xaf8746,
    ];
    const hanoiCoinMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.48,
      metalness: 0.52,
    });
    const ensureNonIndexed = (
      geometry: THREE.BufferGeometry,
    ): THREE.BufferGeometry => {
      if (!geometry.index) return geometry;
      const converted = geometry.toNonIndexed();
      geometry.dispose();
      return converted;
    };
    const colorGeometry = (
      geometry: THREE.BufferGeometry,
      color: THREE.ColorRepresentation,
    ): THREE.BufferGeometry => {
      const value = new THREE.Color(color);
      const colors = new Float32Array(
        geometry.getAttribute("position").count * 3,
      );
      for (let vertex = 0; vertex < colors.length; vertex += 3) {
        colors[vertex] = value.r;
        colors[vertex + 1] = value.g;
        colors[vertex + 2] = value.b;
      }
      geometry.setAttribute(
        "color",
        new THREE.BufferAttribute(colors, 3),
      );
      return geometry;
    };
    const createCashDiscGeometry = (
      radius: number,
      holeHalf: number,
      thickness: number,
      segments = 32,
    ): THREE.BufferGeometry => {
      type Point = readonly [number, number, number];
      const positions: number[] = [];
      const uvs: number[] = [];
      const pushVertex = (point: Point): void => {
        positions.push(point[0], point[1], point[2]);
        uvs.push(
          point[0] / (radius * 2) + 0.5,
          point[2] / (radius * 2) + 0.5,
        );
      };
      const pushTriangle = (a: Point, b: Point, c: Point): void => {
        pushVertex(a);
        pushVertex(b);
        pushVertex(c);
      };
      const ringPoint = (angle: number, y: number): Point => [
        Math.cos(angle) * radius,
        y,
        Math.sin(angle) * radius,
      ];
      const squarePoint = (angle: number, y: number): Point => {
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const scale =
          holeHalf / Math.max(Math.abs(cosine), Math.abs(sine));
        return [cosine * scale, y, sine * scale];
      };
      const top = thickness / 2;
      const bottom = -top;
      for (let segment = 0; segment < segments; segment += 1) {
        const angleA = (segment / segments) * Math.PI * 2;
        const angleB = ((segment + 1) / segments) * Math.PI * 2;
        const outerTopA = ringPoint(angleA, top);
        const outerTopB = ringPoint(angleB, top);
        const innerTopA = squarePoint(angleA, top);
        const innerTopB = squarePoint(angleB, top);
        const outerBottomA = ringPoint(angleA, bottom);
        const outerBottomB = ringPoint(angleB, bottom);
        const innerBottomA = squarePoint(angleA, bottom);
        const innerBottomB = squarePoint(angleB, bottom);

        pushTriangle(outerTopA, innerTopB, outerTopB);
        pushTriangle(outerTopA, innerTopA, innerTopB);
        pushTriangle(outerBottomA, outerBottomB, innerBottomB);
        pushTriangle(outerBottomA, innerBottomB, innerBottomA);
        pushTriangle(outerTopA, outerTopB, outerBottomB);
        pushTriangle(outerTopA, outerBottomB, outerBottomA);
        pushTriangle(innerTopA, innerBottomB, innerTopB);
        pushTriangle(innerTopA, innerBottomA, innerBottomB);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(uvs, 2),
      );
      geometry.computeVertexNormals();
      return geometry;
    };
    const coins: HanoiCoin[] = [];
    for (let index = 0; index < values.length; index += 1) {
      const coinGroup = new THREE.Group();
      coinGroup.name = `checksum-coin-${values[index]}`;
      const outerRadius = outerRadii[index] ?? 0.58;
      const holeHalf = 0.23;
      const body = createCashDiscGeometry(
        outerRadius - 0.07,
        holeHalf,
        0.14,
      );
      const outerRim = new THREE.TorusGeometry(
        outerRadius - 0.06,
        0.055,
        5,
        32,
      );
      outerRim.rotateX(Math.PI / 2);
      const coinParts: THREE.BufferGeometry[] = [
        colorGeometry(
          ensureNonIndexed(body),
          coinBodyColors[index] ?? this.host.colors.brass,
        ),
        colorGeometry(ensureNonIndexed(outerRim), this.host.colors.brass),
      ];

      // Raised square collars preserve the silhouette of stringable ancient cash
      // while leaving enough clearance for the round checksum pegs.
      const collarOffset = holeHalf + 0.04;
      for (const side of [-1, 1]) {
        const horizontal = new THREE.BoxGeometry(0.6, 0.055, 0.07);
        horizontal.translate(0, 0.11, side * collarOffset);
        coinParts.push(
          colorGeometry(ensureNonIndexed(horizontal), this.host.colors.parchment),
        );
        const vertical = new THREE.BoxGeometry(0.07, 0.055, 0.46);
        vertical.translate(side * collarOffset, 0.11, 0);
        coinParts.push(
          colorGeometry(ensureNonIndexed(vertical), this.host.colors.parchment),
        );
      }

      // One, two, and three patina marks distinguish 1, 10, and 100 credits.
      for (let marker = 0; marker <= index; marker += 1) {
        const angle = -0.34 + (marker - index / 2) * 0.38;
        const tick = new THREE.BoxGeometry(0.1, 0.05, 0.21);
        tick.rotateY(Math.PI / 2 - angle);
        tick.translate(
          Math.cos(angle) * (outerRadius - 0.16),
          0.12,
          Math.sin(angle) * (outerRadius - 0.16),
        );
        coinParts.push(
          colorGeometry(
            ensureNonIndexed(tick),
            index === 2 ? this.host.colors.coral : this.host.colors.cyan,
          ),
        );
      }
      const coinGeometry = mergeGeometries(coinParts, false);
      for (const part of coinParts) part.dispose();
      if (!coinGeometry) continue;
      const coin = new THREE.Mesh(
        coinGeometry,
        hanoiCoinMaterial,
      );
      coin.castShadow = false;
      coin.receiveShadow = true;
      coinGroup.add(coin);

      const level = values.length - 1 - index;
      coinGroup.position.set(
        pegOffsets[0] ?? 0,
        hanoiCoinBaseY + level * hanoiCoinStackStep,
        0,
      );
      group.add(coinGroup);
      coins.push({
        group: coinGroup,
        value: values[index] ?? 1,
        peg: 0,
      });
    }

    const bufferSignal = new THREE.Group();
    bufferSignal.name = "checksum-buffer-checkpoint";
    bufferSignal.position.x = pegOffsets[1] ?? 0;
    const bufferBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.34, 2.5, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: this.host.colors.cyan,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    bufferBeam.position.y = 1.68;
    bufferBeam.castShadow = false;
    bufferSignal.add(bufferBeam);
    const bufferToken = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.38, 0.38),
      this.host.materials.cyan,
    );
    bufferToken.position.y = 3.02;
    bufferToken.rotation.set(0.32, Math.PI / 4, 0.18);
    bufferToken.castShadow = false;
    bufferSignal.add(bufferToken);
    bufferSignal.visible = false;
    group.add(bufferSignal);

    const reward = new THREE.Group();
    reward.name = "checksum-hanoi-reward";
    reward.position.x = pegOffsets[2] ?? 2.48;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.42, 3.2, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: this.host.colors.green,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    beam.position.y = 2;
    beam.castShadow = false;
    reward.add(beam);
    const rewardToken = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.32, 0),
      this.host.materials.green,
    );
    rewardToken.position.y = 3.62;
    rewardToken.castShadow = false;
    reward.add(rewardToken);
    reward.visible = false;
    group.add(reward);

    const protocolPad = addBox(
      group,
      [1.38, 0.16, 0.7],
      [0, 0.2, 2.08],
      this.host.materials.violet,
    );
    protocolPad.castShadow = false;
    parent.add(group);

    const interactionIds = pegOffsets.map(
      (_, index) => `checksum-hanoi-peg-${index}`,
    );
    const protocolInteractionId = "checksum-hanoi-protocol";
    const restoredStacks: [number[], number[], number[]] = [
      [...this.snapshot.stacks[0]],
      [...this.snapshot.stacks[1]],
      [...this.snapshot.stacks[2]],
    ];
    const tipSurfaces = pegOffsets.map((pegX, pegIndex) => {
      const enabled =
        (restoredStacks[pegIndex]?.length ?? 0) === coins.length;
      const surface: SurfaceArea = {
        id: `checksum-hanoi-tip-${pegIndex}`,
        x: x + pegX,
        z,
        halfWidth: enabled ? 0.3 : -1,
        halfDepth: enabled ? 0.3 : -1,
        requiresJump: true,
        landingMessage:
          "You balance on the checksum peg's tiny cap. This was not in the protocol.",
        heightAt: () => 2.42,
      };
      this.host.addSurface(surface);
      return surface;
    });
    bufferSignal.visible = this.snapshot.bufferReached;
    reward.visible = this.snapshot.completed;
    this.state = {
      group,
      coins,
      stacks: restoredStacks,
      pegOffsets,
      tipSurfaces,
      interactionIds,
      protocolInteractionId,
      heldCoin: null,
      heldFrom: null,
      moves: this.snapshot.moves,
      completed: this.snapshot.completed,
      bufferReached: this.snapshot.bufferReached,
      resetArmedUntil: 0,
      bufferSignal,
      reward,
    };
    for (const coin of coins) coin.peg = null;
    for (const [pegIndex, stack] of restoredStacks.entries()) {
      for (const [level, coinIndex] of stack.entries()) {
        const coin = coins[coinIndex];
        if (!coin) continue;
        coin.peg = pegIndex;
        coin.group.position.set(
          pegOffsets[pegIndex] ?? 0,
          hanoiCoinBaseY + level * hanoiCoinStackStep,
          0,
        );
      }
    }

    const footSupportMargin = this.host.playerRadius * 0.34;
    const maximumCoinSupportRadius =
      (outerRadii.at(-1) ?? 1.06) + footSupportMargin;
    for (const [pegIndex, pegX] of pegOffsets.entries()) {
      this.host.addSurface({
        id: `checksum-hanoi-coins-${pegIndex}`,
        x: x + pegX,
        z,
        halfWidth: maximumCoinSupportRadius,
        halfDepth: maximumCoinSupportRadius,
        requiresJump: false,
        debugResolution: 12,
        heightAt: (worldX: number, worldZ: number) => {
          const stack = this.state?.stacks[pegIndex];
          if (!stack?.length) return 0.36;
          const distance = Math.hypot(
            worldX - (x + pegX),
            worldZ - z,
          );
          let height = 0.36;
          for (const [level, coinIndex] of stack.entries()) {
            const radius =
              (outerRadii[coinIndex] ?? 0.58) -
              0.005 +
              footSupportMargin;
            if (distance <= radius) {
              height = Math.max(
                height,
                hanoiCoinBaseY + level * hanoiCoinStackStep + 0.15,
              );
            }
          }
          return height;
        },
      });
    }

    for (const [index, pegX] of pegOffsets.entries()) {
      this.host.addInteraction(
        interactionIds[index] ?? `checksum-hanoi-peg-${index}`,
        "Inspect checksum peg",
        x + pegX,
        z,
        2,
        () => this.interactHanoiPeg(index),
      );
    }
    this.host.addInteraction(
      protocolInteractionId,
      "Read checksum Hanoi protocol",
      x,
      z + 2.08,
      0.95,
      () => {
        const puzzle = this.state;
        if (!puzzle) return;
        if (
          puzzle.moves > 0 ||
          puzzle.heldCoin !== null ||
          puzzle.completed
        ) {
          if (puzzle.resetArmedUntil <= this.host.getElapsed()) {
            puzzle.resetArmedUntil = this.host.getElapsed() + 3.2;
            this.updateHanoiInteractionLabels();
            this.host.onStatus(
              "Tower reset armed, not executed. Press E on the violet console again within three seconds to confirm.",
            );
            return;
          }
          this.resetHanoiPuzzle(true);
          return;
        }
        this.host.onStatus(
          "Checksum Hanoi: coral INGRESS → cyan BUFFER → green SETTLE. Move one top cash coin at a time; a larger coin may never cover a smaller one. A complete BUFFER stack writes a checkpoint, while SETTLE mints the reward.",
        );
      },
    );
    this.updateHanoiInteractionLabels();
  }

  unmount(): void {
    const puzzle = this.state;
    if (!puzzle) return;
    const stacks: [number[], number[], number[]] = [
      [...(puzzle.stacks[0] ?? [])],
      [...(puzzle.stacks[1] ?? [])],
      [...(puzzle.stacks[2] ?? [])],
    ];
    if (puzzle.heldCoin !== null) {
      const source = puzzle.heldFrom ?? 0;
      (stacks[source] ?? stacks[0]).push(puzzle.heldCoin);
    }
    this.snapshot = {
      stacks,
      moves: puzzle.moves,
      completed: puzzle.completed,
      bufferReached: puzzle.bufferReached,
    };
    this.state = null;
  }

  isHoldingCoin(): boolean {
    return this.state?.heldCoin !== null && this.state?.heldCoin !== undefined;
  }

  getRestoreNote(): string {
    const puzzle = this.state;
    if (!puzzle || puzzle.moves <= 0) return "";
    if (puzzle.completed) {
      return (puzzle.stacks[2]?.length ?? 0) === puzzle.coins.length
        ? ` Checksum tower restored: SETTLE remains complete after ${puzzle.moves} moves.`
        : ` Checksum tower restored after ${puzzle.moves} moves; CASH FLOW remains recorded while the coins continue through the circuit.`;
    }
    return ` Checksum tower restored at ${puzzle.moves} moves${
      puzzle.bufferReached
        ? " with its BUFFER checkpoint intact"
        : ""
    }.`;
  }

  forEachDynamicObject(
    visit: (object: THREE.Object3D) => void,
  ): void {
    const puzzle = this.state;
    if (!puzzle) return;
    for (const coin of puzzle.coins) visit(coin.group);
    visit(puzzle.bufferSignal);
    visit(puzzle.reward);
  }

  reactToWorldCollapse(delta: number, instability: number): void {
    const puzzle = this.state;
    if (!puzzle) return;
    for (const [index, coin] of puzzle.coins.entries()) {
      coin.group.rotation.x +=
        delta * instability * (2.1 + index * 0.48);
      coin.group.rotation.z -=
        delta * instability * (1.44 + index * 0.36);
    }
  }

  private updateHanoiInteractionLabels(): void {
    const puzzle = this.state;
    if (!puzzle) return;
    const pegNames = ["INGRESS", "BUFFER", "SETTLE"];
    for (let pegIndex = 0; pegIndex < puzzle.stacks.length; pegIndex += 1) {
      const stack = puzzle.stacks[pegIndex];
      const interactionId = puzzle.interactionIds[pegIndex];
      if (!stack || !interactionId) continue;
      let label = "Inspect checksum peg";
      if (puzzle.heldCoin !== null) {
        const heldCoin = puzzle.coins[puzzle.heldCoin];
        const targetTop = stack.at(-1);
        const valid =
          targetTop === undefined || puzzle.heldCoin < targetTop;
        label = valid
          ? `Place ¢${heldCoin?.value ?? "?"} on ${pegNames[pegIndex] ?? "peg"}`
          : `${pegNames[pegIndex] ?? "Peg"} rejects ¢${heldCoin?.value ?? "?"}`;
      } else {
        const topCoinIndex = stack.at(-1);
        const topCoin =
          topCoinIndex === undefined
            ? undefined
            : puzzle.coins[topCoinIndex];
        label = topCoin
          ? `Lift ¢${topCoin.value} from ${pegNames[pegIndex] ?? "peg"}`
          : `Inspect empty ${pegNames[pegIndex] ?? "peg"}`;
      }
      this.host.updateInteractionLabel(interactionId, label);
    }
    const hasProgress =
      puzzle.moves > 0 || puzzle.heldCoin !== null || puzzle.completed;
    this.host.updateInteractionLabel(
      puzzle.protocolInteractionId,
      puzzle.resetArmedUntil > this.host.getElapsed()
        ? "CONFIRM checksum tower reset"
        : hasProgress
          ? `Arm tower reset · ${puzzle.moves} moves`
          : "Read checksum Hanoi protocol",
    );
  }

  private syncHanoiTipSurfaces(): void {
    const puzzle = this.state;
    if (!puzzle) return;
    for (const [pegIndex, surface] of puzzle.tipSurfaces.entries()) {
      const enabled =
        puzzle.heldCoin === null &&
        (puzzle.stacks[pegIndex]?.length ?? 0) === puzzle.coins.length;
      surface.halfWidth = enabled ? 0.3 : -1;
      surface.halfDepth = enabled ? 0.3 : -1;
    }
    if (this.host.isCollisionDebugEnabled()) {
      this.host.refreshCollisionDebug();
    }
  }

  private interactHanoiPeg(pegIndex: number): void {
    const puzzle = this.state;
    const stack = puzzle?.stacks[pegIndex];
    if (!puzzle || !stack) return;
    const pegNames = ["INGRESS", "BUFFER", "SETTLE"];
    const pegName = pegNames[pegIndex] ?? "peg";
    if (puzzle.resetArmedUntil > 0) {
      puzzle.resetArmedUntil = 0;
      this.updateHanoiInteractionLabels();
    }

    if (puzzle.heldCoin === null) {
      const coinIndex = stack.pop();
      if (coinIndex === undefined) {
        this.host.onStatus(
          `${pegName} is empty. Lift a top coin from another peg first.`,
        );
        return;
      }
      const coin = puzzle.coins[coinIndex];
      if (!coin) return;
      coin.peg = null;
      puzzle.heldCoin = coinIndex;
      puzzle.heldFrom = pegIndex;
      this.syncHanoiTipSurfaces();
      this.updateHanoiInteractionLabels();
      this.host.onStatus(
        `Holding the ¢${coin.value} checksum coin. Walk to another peg and press E to place it.`,
      );
      return;
    }

    const coinIndex = puzzle.heldCoin;
    const coin = puzzle.coins[coinIndex];
    if (!coin) return;
    const targetTop = stack.at(-1);
    if (targetTop !== undefined && coinIndex > targetTop) {
      const blocker = puzzle.coins[targetTop];
      this.host.onStatus(
        `Invalid settlement: ¢${coin.value} cannot cover the smaller ¢${blocker?.value ?? "?"} coin.`,
      );
      return;
    }

    stack.push(coinIndex);
    coin.peg = pegIndex;
    const returnedToSource = puzzle.heldFrom === pegIndex;
    puzzle.heldCoin = null;
    puzzle.heldFrom = null;
    if (!returnedToSource) puzzle.moves += 1;
    this.syncHanoiTipSurfaces();

    if (
      !puzzle.completed &&
      (puzzle.stacks[2]?.length ?? 0) === puzzle.coins.length
    ) {
      this.completeHanoiPuzzle();
      return;
    }
    if (
      (puzzle.stacks[1]?.length ?? 0) === puzzle.coins.length &&
      !puzzle.bufferReached
    ) {
      this.completeHanoiBufferCheckpoint();
      return;
    }

    this.updateHanoiInteractionLabels();
    this.host.onStatus(
      returnedToSource
        ? `¢${coin.value} returned to ${pegName}; move count unchanged.`
        : `¢${coin.value} settled on ${pegName}. ${puzzle.moves} legal move${puzzle.moves === 1 ? "" : "s"}.`,
    );
  }

  private resetHanoiPuzzle(announce: boolean): void {
    const puzzle = this.state;
    if (!puzzle) return;
    puzzle.stacks = [[2, 1, 0], [], []];
    puzzle.heldCoin = null;
    puzzle.heldFrom = null;
    puzzle.moves = 0;
    puzzle.completed = false;
    puzzle.bufferReached = false;
    puzzle.resetArmedUntil = 0;
    puzzle.bufferSignal.visible = false;
    puzzle.reward.visible = false;
    for (const coin of puzzle.coins) coin.peg = 0;
    this.syncHanoiTipSurfaces();
    this.updateHanoiInteractionLabels();
    if (announce) {
      this.host.onStatus(
        "Checksum tower reset. INGRESS holds ¢100, ¢10, and ¢1.",
      );
    }
  }

  private completeHanoiBufferCheckpoint(): void {
    const puzzle = this.state;
    if (!puzzle || puzzle.bufferReached) return;
    const cashFlowAlreadyRecorded = puzzle.completed;
    puzzle.bufferReached = true;
    puzzle.resetArmedUntil = 0;
    puzzle.bufferSignal.visible = true;
    this.updateHanoiInteractionLabels();
    this.host.onStatus(
      cashFlowAlreadyRecorded
        ? `BUFFER balanced in ${puzzle.moves} moves. The cyan checkpoint reconciles backward through the already-minted CASH FLOW record.`
        : `BUFFER balanced in ${puzzle.moves} moves. A cyan checkpoint packet is cached above the middle peg; continue the complete stack to green SETTLE for consensus.`,
      { kind: "achievement", title: "MIDDLE MANAGEMENT" },
    );
  }

  private completeHanoiPuzzle(): void {
    const puzzle = this.state;
    if (!puzzle || puzzle.completed) return;
    puzzle.completed = true;
    puzzle.reward.visible = true;
    this.updateHanoiInteractionLabels();
    this.host.onStatus(
      `Consensus settled in ${puzzle.moves} moves${
        puzzle.moves === 7 ? " (the optimal route)" : ""
      }. ${
        puzzle.bufferReached
          ? "The BUFFER checkpoint reconciles and "
          : ""
      }SETTLE mints a zero-latency cache token.`,
      { kind: "achievement", title: "CASH FLOW" },
    );
  }

  update(delta: number, elapsed: number): void {
    const puzzle = this.state;
    if (!puzzle) return;
    if (
      puzzle.resetArmedUntil > 0 &&
      puzzle.resetArmedUntil <= elapsed
    ) {
      puzzle.resetArmedUntil = 0;
      this.updateHanoiInteractionLabels();
    }
    const follow = this.host.isReducedMotion()
      ? 1
      : 1 - Math.exp(-delta * 10);
    for (const [coinIndex, coin] of puzzle.coins.entries()) {
      let targetX = coin.group.position.x;
      let targetY = coin.group.position.y;
      let targetZ = coin.group.position.z;
      if (coin.peg === null) {
        const forwardDistance = 0.86 + coinIndex * 0.12;
        const handSideDistance = 0.42 + coinIndex * 0.08;
        const forwardOffsetX =
          Math.sin(this.host.getPlayerHeading()) * forwardDistance;
        const forwardOffsetZ =
          Math.cos(this.host.getPlayerHeading()) * forwardDistance;
        const handSideOffsetX =
          Math.cos(this.host.getPlayerHeading()) * handSideDistance;
        const handSideOffsetZ =
          -Math.sin(this.host.getPlayerHeading()) * handSideDistance;
        const playerPosition = this.host.getPlayerPosition();
        targetX =
          playerPosition.x -
          puzzle.group.position.x +
          forwardOffsetX +
          handSideOffsetX;
        targetY =
          this.host.getPlayerWorldY() +
          1.26 +
          Math.sin(elapsed * 4.2) * 0.06;
        targetZ =
          playerPosition.z -
          puzzle.group.position.z +
          forwardOffsetZ +
          handSideOffsetZ;
      } else {
        const stack = puzzle.stacks[coin.peg];
        const level = Math.max(0, stack?.indexOf(coinIndex) ?? 0);
        targetX = puzzle.pegOffsets[coin.peg] ?? 0;
        targetY = hanoiCoinBaseY + level * hanoiCoinStackStep;
        targetZ = 0;
      }
      coin.group.position.x = THREE.MathUtils.lerp(
        coin.group.position.x,
        targetX,
        follow,
      );
      coin.group.position.y = THREE.MathUtils.lerp(
        coin.group.position.y,
        targetY,
        follow,
      );
      coin.group.position.z = THREE.MathUtils.lerp(
        coin.group.position.z,
        targetZ,
        follow,
      );
      if (coin.peg === null || puzzle.completed) {
        coin.group.rotation.y +=
          delta * (coin.peg === null ? 1.9 : 0.28 + coinIndex * 0.08);
      }
      const completionPulse =
        puzzle.completed && coin.peg === 2
          ? 1 + Math.sin(elapsed * 3.2 - coinIndex * 0.6) * 0.035
          : 1;
      coin.group.scale.setScalar(completionPulse);
    }
    if (puzzle.reward.visible) {
      puzzle.reward.rotation.y += delta * 0.7;
      puzzle.reward.position.y =
        Math.sin(elapsed * 2.2) * 0.08;
    }
    if (puzzle.bufferSignal.visible) {
      puzzle.bufferSignal.rotation.y += delta * 0.82;
      const pulse = this.host.isReducedMotion()
        ? 1
        : 1 + Math.sin(elapsed * 3.7) * 0.035;
      puzzle.bufferSignal.scale.setScalar(pulse);
    }
  }
}
