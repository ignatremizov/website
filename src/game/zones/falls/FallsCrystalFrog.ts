import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { QualityTier } from "../../../world/WorldContracts";
import type { Kickable } from "../../Kickable";
import { disposeObjectTree } from "../../sceneResources.ts";
import { GlitchFragments, writeGlitchDissolveTransform } from "../../GlitchFragments.ts";
import {
  createFallsFrogRoutes, createFrogRejoinHops, createFrogRejoinSteps,
  frogClearanceHeight, frogClearanceRadius, frogHopHeight,
  frogRouteWeight, takeWeightedFrogCandidate, type FrogHop, type FrogNode,
} from "./FallsCrystalFrogRoute.ts";

export interface FallsCrystalFrogHost {
  /** Fill the reused numeric record in mounted-root LOCAL coordinates. False = absent. */
  readPlayerFeet(out: { x: number; y: number; z: number }): boolean;
  /**
   * Required extra scenery/NPC clearance, called only at mount and hop choice.
   * Check the complete swept arc, including both endpoints, using the supplied
   * feet parabola and clearance envelope. Equal endpoints with lift=0 check a
   * standing spawn. Query current obstacles; never register the frog as terrain.
   */
  isHopClear(
    fromX: number, fromY: number, fromZ: number,
    toX: number, toY: number, toZ: number,
    lift: number, radius: number, height: number,
  ): boolean;
  /** Base island floor, or null over the void. Raised supports belong to shared physics. */
  floorHeight(x: number, z: number): number | null;
  /** Highest support below these feet, for the held/released landing shadow. */
  shadowHeight(x: number, y: number, z: number): number | null;
  onWaterLanding(x: number, y: number, z: number): void;
}

export interface FallsCrystalFrogDebugHop {
  readonly from: Readonly<{ x: number; y: number; z: number }>;
  readonly to: Readonly<{ x: number; y: number; z: number }>;
  readonly lift: number;
}

interface FrogState {
  root: THREE.Group;
  rig: THREE.Group;
  pose: THREE.Group;
  legs: THREE.Group[];
  arms: THREE.Group[];
  details: THREE.Group;
  shadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  sparks: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  positions: Float32Array;
  nodes: FrogNode[];
  edges: FrogHop[][];
  recent: number[];
  current: number;
  hop: FrogHop | null;
  hopOrigin: { x: number; y: number; z: number; cluster: string };
  rejoinHops: FrogHop[];
  rejoinSteps: FrogHop[];
  body: Kickable;
  glitch: GlitchFragments;
  phase: "rest" | "crouch" | "flight" | "land" | "held" | "released" | "dissolve" | "reform";
  clock: number;
  duration: number;
  wait: number;
  escape: number;
  burst: number;
  wasNear: boolean;
  collapsing: boolean;
  strandedFor: number;
}

/**
 * Falls-local ambient creature; owns every resource beneath mount()'s returned
 * root. Protect that entire root from static batching. Freeze at the start of
 * Falls Event Horizon, retaining the rig for host destruction traversal; unmount
 * before generic zone disposal.
 * The host borrows one Kickable for dragging/free flight. Route animation owns
 * it otherwise (enabled=false); it never becomes a player-blocking collider.
 * No shell state, lights, timers, or global listeners.
 */
export class FallsCrystalFrog {
  private state: FrogState | null = null;
  private quality: QualityTier = "medium";
  private readonly player = { x: 0, y: 0, z: 0 };
  private readonly debugHop = { from: this.player, to: this.player, lift: 0 };
  // Terrain layout is fixed for this controller's lifetime; dynamic scenery and
  // NPC clearance is deliberately never cached with the graph.
  private routes: ReturnType<typeof createFallsFrogRoutes> | null = null;
  private readonly candidateWeights = new Float64Array(256);
  private readonly zero = new THREE.Vector3();
  private readonly host: FallsCrystalFrogHost;

  constructor(host: FallsCrystalFrogHost) { this.host = host; }

  /** Returns null if no unobstructed starting perch exists; never spawns in scenery. */
  mount(parent: THREE.Group): THREE.Group | null {
    const routes = this.routes ??= createFallsFrogRoutes();
    this.unmount();
    for (let index = 0; index < routes.nodes.length; index += 1) {
      this.candidateWeights[index] = routes.edges[index]!.length >= 3 ? 1 : 0;
    }
    let current = -1;
    for (;;) {
      const index = takeWeightedFrogCandidate(
        this.candidateWeights, routes.nodes.length, Math.random(),
      );
      if (index < 0) return null;
      const node = routes.nodes[index]!;
      if (this.host.isHopClear(
        node.x, node.y, node.z, node.x, node.y, node.z,
        0, frogClearanceRadius, frogClearanceHeight,
      )) {
        current = index;
        break;
      }
    }
    const root = new THREE.Group();
    root.name = "falls-roaming-crystal-frog";
    root.userData.clickNavigationPassThrough = true;
    const rig = new THREE.Group();
    rig.name = "falls-crystal-frog-body";
    rig.userData.upright = true;
    const pose = new THREE.Group();
    root.add(rig);
    rig.add(pose);
    const jade = new THREE.MeshStandardMaterial({
      color: 0x208963, roughness: 0.43, metalness: 0.12, flatShading: true,
    });
    const belly = new THREE.MeshStandardMaterial({ color: 0x9dcc88, roughness: 0.65 });
    const crystal = new THREE.MeshStandardMaterial({
      color: 0x77ffd2, emissive: 0x36daa5, emissiveIntensity: 1.25,
      roughness: 0.24, metalness: 0.25, flatShading: true,
    });
    const eye = new THREE.MeshStandardMaterial({
      color: 0xf2df86, emissive: 0x9b8a31, emissiveIntensity: 0.35,
    });
    const black = new THREE.MeshStandardMaterial({ color: 0x071e1a, roughness: 0.25 });
    const round = new THREE.SphereGeometry(1, 12, 8);
    const facet = new THREE.OctahedronGeometry(1);
    // Bake only fixed branch-local transforms. Pose squash, each leg joint, and
    // quality-gated details retain independent parents after material batching.
    const parts = new Map<THREE.Object3D, Map<THREE.Material, THREE.BufferGeometry[]>>();
    const partMatrix = new THREE.Matrix4();
    const ellipsoid = (
      owner: THREE.Object3D, material: THREE.Material,
      x: number, y: number, z: number, sx: number, sy: number, sz: number,
      geometry: THREE.BufferGeometry = round,
    ): void => {
      let materials = parts.get(owner);
      if (!materials) {
        materials = new Map();
        parts.set(owner, materials);
      }
      let geometries = materials.get(material);
      if (!geometries) {
        geometries = [];
        materials.set(material, geometries);
      }
      partMatrix.makeScale(sx, sy, sz).setPosition(x, y, z);
      geometries.push(geometry.clone().applyMatrix4(partMatrix));
    };
    // Broad low torso, blunt muzzle, high separated eyes and folded haunches.
    ellipsoid(pose, jade, 0, 0.27, -0.04, 0.31, 0.23, 0.36);
    ellipsoid(pose, belly, 0, 0.18, 0.18, 0.23, 0.12, 0.22);
    ellipsoid(pose, jade, 0, 0.33, 0.23, 0.31, 0.17, 0.21);
    ellipsoid(pose, black, 0, 0.275, 0.419, 0.21, 0.012, 0.012);
    const legs: THREE.Group[] = [];
    const arms: THREE.Group[] = [];
    const details = new THREE.Group();
    pose.add(details);
    for (const side of [-1, 1]) {
      ellipsoid(pose, jade, side * 0.21, 0.45, 0.22, 0.12, 0.13, 0.12);
      ellipsoid(pose, eye, side * 0.22, 0.47, 0.31, 0.082, 0.087, 0.045);
      ellipsoid(pose, black, side * 0.22, 0.48, 0.35, 0.052, 0.022, 0.012);
      const leg = new THREE.Group();
      leg.position.set(side * 0.26, 0.14, -0.2);
      pose.add(leg);
      legs.push(leg);
      ellipsoid(leg, jade, side * 0.06, 0.035, 0, 0.16, 0.14, 0.24);
      ellipsoid(leg, jade, side * 0.1, -0.085, 0.16, 0.09, 0.045, 0.19);
      const arm = new THREE.Group();
      arm.position.set(side * 0.24, 0.22, 0.29);
      pose.add(arm);
      arms.push(arm);
      ellipsoid(arm, jade, 0, -0.1, 0, 0.06, 0.13, 0.07);
      for (let toe = 0; toe < 3; toe += 1) {
        ellipsoid(arm, belly, side * (-0.05 + toe * 0.052), -0.185,
          0.09 + (toe === 1 ? 0.04 : 0), 0.026, 0.024, 0.073);
        ellipsoid(leg, belly, side * (0.05 + toe * 0.05), -0.105,
          0.3, 0.025, 0.022, 0.065);
      }
      ellipsoid(details, crystal, side * 0.26, 0.36, -0.12, 0.065, 0.11, 0.065, facet);
    }
    for (let i = 0; i < 3; i += 1) {
      ellipsoid(pose, crystal, 0, 0.48 - i * 0.035, 0.02 - i * 0.15,
        0.075, 0.16 - i * 0.025, 0.075, facet);
    }
    for (const [owner, materials] of parts) {
      for (const [material, geometries] of materials) {
        const merged = mergeGeometries(geometries, false);
        if (merged) {
          const mesh = new THREE.Mesh(merged, material);
          mesh.castShadow = true;
          owner.add(mesh);
          for (const geometry of geometries) geometry.dispose();
        } else {
          // Preserve ownership/visibility if future model parts have incompatible
          // attributes. Unmount still disposes these unmerged geometries.
          for (const geometry of geometries) {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            owner.add(mesh);
          }
        }
      }
    }
    round.dispose();
    facet.dispose();
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24),
      new THREE.MeshBasicMaterial({
        color: 0x102c25, transparent: true, opacity: 0.28,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
      }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(0.34, 0.27, 1);
    root.add(shadow);
    const positions = new Float32Array(12 * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3)
      .setUsage(THREE.DynamicDrawUsage));
    const sparks = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: 0x98ffda, size: 2.5, sizeAttenuation: false, transparent: true,
      opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    sparks.frustumCulled = false;
    root.add(sparks);
    const body: Kickable = {
      object: rig, velocity: new THREE.Vector3(), enabled: false,
      radius: frogClearanceRadius, restingY: 0, platform: null,
      platformOffset: 0, onPlatform: false, gravity: true,
      pinballRadius: null, friction: 0.986, kickCooldown: 0, message: "",
      collisionHeight: frogClearanceHeight,
    };
    const node = routes.nodes[current]!;
    this.state = {
      root, rig, pose, legs, arms, details, shadow, sparks, positions, ...routes,
      body, glitch: new GlitchFragments(root, 24, "falls-frog-glitch-fragments"),
      hopOrigin: { ...node }, rejoinHops: [], rejoinSteps: [],
      recent: [current], current, hop: null, phase: "rest", clock: 0,
      duration: 1, wait: 0.8 + Math.random() * 1.5, escape: 0, burst: 0, wasNear: false,
      collapsing: false, strandedFor: 0,
    };
    rig.position.set(node.x, node.y, node.z);
    shadow.position.set(node.x, node.y + 0.018, node.z);
    parent.add(root);
    this.setQuality(this.quality);
    return root;
  }

  getBody(): Kickable | null { return this.state?.body ?? null; }

  /** Borrowed view for same-frame debug drawing; do not mutate or retain it. */
  getDebugHop(): FallsCrystalFrogDebugHop | null {
    const s = this.state;
    if (!s || s.collapsing || !s.hop ||
      (s.phase !== "crouch" && s.phase !== "flight")) return null;
    this.debugHop.from = s.hopOrigin;
    this.debugHop.to = s.hop.landing ?? s.nodes[s.hop.to]!;
    this.debugHop.lift = s.hop.lift;
    return this.debugHop;
  }

  owns(body: Kickable): boolean { return this.state?.body === body; }

  canGrab(body: Kickable): boolean {
    const s = this.state;
    return s !== null && s.body === body && !s.collapsing &&
      s.phase !== "dissolve" && s.phase !== "reform";
  }

  beginHold(body: Kickable): boolean {
    const s = this.state;
    if (!s || !this.canGrab(body)) return false;
    s.phase = "held";
    s.clock = 0;
    s.hop = null;
    s.burst = 0;
    s.strandedFor = 0;
    s.body.enabled = false;
    s.body.onPlatform = false;
    s.body.platform = null;
    s.body.velocity.set(0, 0, 0);
    this.resetPose(s);
    return true;
  }

  /** Velocity is the shared pointer's recent, bounded fling estimate. */
  releaseHold(body: Kickable, cancelled = false): boolean {
    const s = this.state;
    if (!s || s.body !== body || s.phase !== "held" || s.collapsing) return false;
    if (cancelled) body.velocity.set(0, 0, 0);
    const speed = Math.hypot(body.velocity.x, body.velocity.z);
    if (speed > 10) {
      body.velocity.x *= 10 / speed;
      body.velocity.z *= 10 / speed;
    }
    body.velocity.y = cancelled ? 0 : Math.min(3.5, speed * 0.18);
    body.enabled = true;
    body.kickCooldown = 0.35;
    body.onPlatform = false;
    body.platform = null;
    s.phase = "released";
    s.clock = 0;
    s.current = -1;
    s.escape = 3;
    s.recent.length = 0;
    this.resetPose(s);
    return true;
  }

  hasActiveMotion(): boolean {
    const s = this.state;
    return s !== null && !s.collapsing &&
      (s.phase === "held" || s.phase === "released" ||
        s.phase === "dissolve" || s.phase === "reform" || s.glitch.hasActiveMotion());
  }

  setQuality(quality: QualityTier): void {
    this.quality = quality;
    if (!this.state || this.state.collapsing) return;
    this.state.details.visible = quality !== "low";
    this.state.sparks.geometry.setDrawRange(0, quality === "low" ? 0 : quality === "medium" ? 6 : 12);
  }

  update(delta: number, elapsed: number, reducedMotion: boolean): void {
    const s = this.state;
    if (!s || s.collapsing || !Number.isFinite(delta) || delta <= 0) return;
    const dt = Math.min(delta, 0.05);
    const present = this.host.readPlayerFeet(this.player) &&
      Number.isFinite(this.player.x) && Number.isFinite(this.player.y) && Number.isFinite(this.player.z);
    const from = s.hopOrigin;
    const near = present && Math.abs(this.player.y - s.rig.position.y) < 2 &&
      Math.hypot(this.player.x - s.rig.position.x, this.player.z - s.rig.position.z) < 3.2;
    if (near) s.escape = 3;
    s.clock += dt;
    s.glitch.update(dt, elapsed);
    if (s.phase === "held" || s.phase === "released") {
      this.updateCarried(s, reducedMotion);
      return;
    }
    if (s.phase === "dissolve" || s.phase === "reform") {
      this.updateRematerialization(s, dt, reducedMotion);
      return;
    }
    if (s.phase === "rest") {
      if (s.current < 0) s.strandedFor += dt;
      s.wait -= dt;
      if (near && !s.wasNear) s.wait = Math.min(s.wait, 0.04);
      if (s.wait <= 0) this.chooseHop(s, present, reducedMotion);
    } else if (s.phase === "crouch") {
      const t = Math.min(1, s.clock / s.duration);
      s.pose.scale.set(1 + t * 0.12, 1 - t * (reducedMotion ? 0.12 : 0.3), 1 + t * 0.08);
      if (t === 1) {
        s.phase = "flight";
        s.clock = 0;
        s.duration = s.hop!.distance / (reducedMotion ? 4.2 : s.escape > 0 ? 8 : 5.2) + 0.18;
      }
    } else if (s.phase === "flight") {
      const hop = s.hop!;
      const to = hop.landing ?? s.nodes[hop.to]!;
      const t = Math.min(1, s.clock / s.duration);
      s.rig.position.set(
        from.x + (to.x - from.x) * t, frogHopHeight(from, to, hop.lift, t),
        from.z + (to.z - from.z) * t,
      );
      s.pose.scale.set(1, 1 + Math.sin(Math.PI * t) * (reducedMotion ? 0.04 : 0.12), 1);
      s.pose.rotation.x = reducedMotion ? 0 : -Math.sin(2 * Math.PI * t) * 0.16;
      for (const leg of s.legs) leg.rotation.x = Math.sin(Math.PI * t) * (reducedMotion ? 0.2 : 0.8);
      // Fixed on the known receiving surface: never floats over a gorge or cliff.
      s.shadow.material.opacity = 0.16 + 0.16 * t;
      if (t === 1) {
        s.current = hop.landing ? -1 : hop.to;
        s.strandedFor = 0;
        if (hop.landing) {
          this.prepareRejoin(s, to, s.hopOrigin);
          this.host.onWaterLanding(to.x, to.y, to.z);
        } else {
          if (s.recent.length === 8) s.recent.shift();
          s.recent.push(s.current);
        }
        s.phase = "land";
        s.clock = 0;
        s.duration = reducedMotion ? 0.17 : 0.1;
        s.burst = reducedMotion ? 0 : 0.45;
        s.escape = Math.max(0, s.escape - 1);
        s.pose.rotation.x = 0;
        for (const leg of s.legs) leg.rotation.x = 0;
      }
    } else {
      const t = Math.min(1, s.clock / s.duration);
      s.pose.scale.set(1 + (1 - t) * 0.1, 1 - (1 - t) * 0.2, 1);
      if (t === 1) {
        s.phase = "rest";
        s.hop = null;
        s.wait = s.escape > 0 ? 0.035 : Math.random() < 0.25 ? 2 + Math.random() * 3 : 0.25 + Math.random() * 0.65;
      }
    }
    s.wasNear = near;
    s.burst = reducedMotion ? 0 : Math.max(0, s.burst - dt);
    s.sparks.visible = s.burst > 0 && this.quality !== "low";
    if (s.sparks.visible) {
      const age = 1 - s.burst / 0.45;
      const node = s.rig.position;
      for (let i = 0; i < 12; i += 1) {
        const angle = i * 2.399963;
        const radius = 0.12 + age * (0.2 + (i % 3) * 0.08);
        s.positions[i * 3] = node.x + Math.cos(angle) * radius;
        s.positions[i * 3 + 1] = node.y + 0.12 + Math.sin(age * Math.PI) * 0.35;
        s.positions[i * 3 + 2] = node.z + Math.sin(angle) * radius;
      }
      s.sparks.material.opacity = (1 - age) * 0.7;
      s.sparks.geometry.attributes.position!.needsUpdate = true;
    }
  }

  private chooseHop(s: FrogState, playerPresent: boolean, reducedMotion: boolean): void {
    const from = s.current >= 0 ? s.nodes[s.current]! : s.hopOrigin;
    let selected: FrogHop | null = null;
    // Prefer an authored landing. Only a displaced frog may take a short
    // intermediate floor step if direct rejoins are blocked or out of range.
    for (let pass = 0; pass < (s.current < 0 ? 2 : 1) && !selected; pass += 1) {
      const options = s.current >= 0 ? s.edges[s.current]!
        : pass === 0 ? s.rejoinHops : s.rejoinSteps;
      for (let index = 0; index < options.length; index += 1) {
        const hop = options[index]!;
        const to = hop.landing ?? s.nodes[hop.to]!;
        const weight = frogRouteWeight(from, to, hop.to, s.recent,
          this.player.x, this.player.z, playerPresent && s.escape > 0);
        this.candidateWeights[index] = s.current >= 0
          ? weight : weight / (1 + hop.distance * hop.distance);
      }
      // Clearance stays live, and is checked only for drawn proposals. A low
      // rejoin arc can escape under a deck; its higher fallback can clear a riser.
      for (;;) {
        const index = takeWeightedFrogCandidate(
          this.candidateWeights, options.length, Math.random(),
        );
        if (index < 0) break;
        const hop = options[index]!;
        const to = hop.landing ?? s.nodes[hop.to]!;
        if (this.host.isHopClear(
          from.x, from.y, from.z, to.x, to.y, to.z,
          hop.lift, frogClearanceRadius, frogClearanceHeight,
        )) {
          selected = hop;
        } else if (hop.fallbackLift !== undefined && this.host.isHopClear(
          from.x, from.y, from.z, to.x, to.y, to.z,
          hop.fallbackLift, frogClearanceRadius, frogClearanceHeight,
        )) {
          selected = { ...hop, lift: hop.fallbackLift };
        }
        if (selected) break;
      }
    }
    if (!selected) {
      // Cornered frogs hold their ground instead of jittering A→B→A.
      s.wait = s.escape > 0 ? 0.45 : 2;
      // A quiet dead end can eventually be left after a proper rest. Retain
      // history under threat so repeated approach never produces ping-pong.
      if (s.escape === 0) {
        s.recent.length = 0;
        s.recent.push(s.current);
      }
      s.escape = 0;
      if (s.current < 0 && s.strandedFor >= 6 && !this.host.isHopClear(
        from.x, from.y, from.z, from.x, from.y, from.z,
        0, frogClearanceRadius, frogClearanceHeight,
      )) {
        // Recover an invalid embedded landing, not a safe frog temporarily
        // cornered by the player/NPCs or waiting for a clear exit.
        this.beginDissolve(s, reducedMotion);
      }
      return;
    }
    s.hopOrigin.x = from.x;
    s.hopOrigin.y = from.y;
    s.hopOrigin.z = from.z;
    s.hopOrigin.cluster = from.cluster;
    s.hop = selected;
    s.phase = "crouch";
    s.clock = 0;
    s.duration = reducedMotion ? 0.16 : s.escape > 0 ? 0.07 : 0.18;
    const to = selected.landing ?? s.nodes[selected.to]!;
    s.rig.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
    s.shadow.position.set(to.x, to.y + 0.018, to.z);
    s.shadow.material.opacity = 0.2;
  }

  private resetPose(s: FrogState): void {
    s.pose.position.set(0, 0, 0);
    s.pose.rotation.set(0, 0, 0);
    s.pose.scale.setScalar(1);
    for (const joint of s.legs) joint.rotation.set(0, 0, 0);
    for (const joint of s.arms) joint.rotation.set(0, 0, 0);
  }

  private prepareRejoin(s: FrogState, landing: FrogNode, previous: FrogNode | null): void {
    const steps = createFrogRejoinSteps(
      landing, s.nodes, s.edges, (x, z) => this.host.floorHeight(x, z), previous,
    );
    s.hopOrigin = { ...landing };
    s.rejoinHops = createFrogRejoinHops(s.hopOrigin, s.nodes, s.edges);
    s.rejoinSteps = steps;
  }

  private updateCarried(s: FrogState, reducedMotion: boolean): void {
    const held = s.phase === "held";
    const feet = s.rig.position;
    const support = this.host.shadowHeight(feet.x, feet.y, feet.z);
    s.shadow.visible = support !== null;
    if (support !== null) {
      s.shadow.position.set(feet.x, support + 0.022, feet.z);
      s.shadow.material.opacity = 0.28 / (1 + Math.max(0, feet.y - support) * 0.3);
    }
    s.sparks.visible = false;
    if (held) {
      const wave = Math.sin(s.clock * (reducedMotion ? 3 : 17));
      const amplitude = reducedMotion ? 0.18 : 0.85;
      s.pose.rotation.set(0.16, 0, wave * amplitude * 0.13);
      s.pose.scale.set(0.98, 1.08 + Math.sin(s.clock * 7) * amplitude * 0.035, 0.98);
      for (let i = 0; i < s.legs.length; i += 1) {
        s.legs[i]!.rotation.set(-0.55 + wave * amplitude * (i === 0 ? 1 : -1),
          0, (i === 0 ? -1 : 1) * (0.2 + amplitude * 0.1));
        s.arms[i]!.rotation.set(0.3 - wave * amplitude * (i === 0 ? 1 : -1),
          0, (i === 0 ? -1 : 1) * 0.35);
      }
      return;
    }
    const floor = this.host.floorHeight(feet.x, feet.z);
    if ((floor === null && s.clock > 0.28) || feet.y < -1.8) {
      this.beginDissolve(s, reducedMotion);
      return;
    }
    // Shared physics sets support ownership only after settling. Base ground
    // has no SurfaceArea, so it uses the same zero-vertical-speed condition.
    const landed = s.clock > 0.08 &&
      (s.body.onPlatform || (floor !== null &&
        Math.abs(s.body.velocity.y) < 0.05 && Math.abs(feet.y - floor) < 0.12));
    if (!landed) return;
    s.body.enabled = false;
    s.body.velocity.set(0, 0, 0);
    this.prepareRejoin(s, {
      x: feet.x, y: feet.y, z: feet.z, cluster: s.body.platform?.id ?? "gorge",
    }, null);
    s.phase = "land";
    s.clock = 0;
    s.duration = reducedMotion ? 0.17 : 0.12;
    s.burst = reducedMotion ? 0 : 0.45;
    this.host.onWaterLanding(feet.x, feet.y, feet.z);
  }

  private beginDissolve(s: FrogState, reducedMotion: boolean): void {
    s.phase = "dissolve";
    s.clock = 0;
    s.duration = reducedMotion ? 0.24 : 0.58;
    s.wait = 0;
    s.body.enabled = false;
    s.shadow.visible = false;
    s.sparks.visible = false;
    s.glitch.emit({
      position: s.rig.position, velocity: s.body.velocity, scale: 0.9,
      yaw: s.rig.rotation.y, phase: 0.37, color: 0x77ffd2,
      count: this.quality === "low" ? 7 : this.quality === "medium" ? 11 : 16,
      reducedMotion,
    });
    s.body.velocity.set(0, 0, 0);
    this.resetPose(s);
  }

  private updateRematerialization(s: FrogState, dt: number, reducedMotion: boolean): void {
    const t = Math.min(1, s.clock / s.duration);
    if (s.phase === "dissolve") {
      writeGlitchDissolveTransform(s.pose, this.zero, 1, t, 0.37, reducedMotion);
      if (t < 1) return;
      s.wait = Math.max(0, s.wait - dt);
      if (s.wait > 0) return;
      // Move only while entirely dissolved, and validate dynamic scenery again.
      // Do not retry a blocked spawn every frame.
      for (let i = 0; i < s.nodes.length; i += 1) {
        this.candidateWeights[i] = s.edges[i]!.length >= 3 ? 1 : 0;
      }
      let target = -1;
      for (;;) {
        const index = takeWeightedFrogCandidate(this.candidateWeights, s.nodes.length, Math.random());
        if (index < 0) break;
        const node = s.nodes[index]!;
        if (!this.host.isHopClear(node.x, node.y, node.z, node.x, node.y, node.z,
          0, frogClearanceRadius, frogClearanceHeight)) continue;
        target = index;
        break;
      }
      if (target < 0) {
        s.wait = 0.8;
        return;
      }
      const node = s.nodes[target]!;
      s.rig.position.set(node.x, node.y, node.z);
      s.current = target;
      s.hopOrigin = { ...node };
      s.recent.length = 0;
      s.recent.push(target);
      s.rejoinHops.length = 0;
      s.rejoinSteps.length = 0;
      s.body.platform = null;
      s.body.onPlatform = false;
      s.strandedFor = 0;
      this.resetPose(s);
      s.pose.scale.setScalar(0);
      s.shadow.position.set(node.x, node.y + 0.022, node.z);
      s.phase = "reform";
      s.clock = 0;
      s.duration = 0.32;
      return;
    }
    s.pose.scale.setScalar(THREE.MathUtils.smoothstep(t, 0, 1));
    s.shadow.visible = true;
    s.shadow.material.opacity = t * 0.28;
    if (t < 1) return;
    s.phase = "rest";
    s.clock = 0;
    s.wait = 0.25;
    s.escape = 3;
  }

  /**
   * Idempotent handoff: freeze even mid-hop without detaching or disposing the
   * rig. The host may now animate its meshes without update/quality fighting it.
   * Remount starts a fresh frog; collapse cannot resume the old route.
   */
  freezeForWorldCollapse(): void {
    const s = this.state;
    if (!s || s.collapsing) return;
    s.collapsing = true;
    s.body.enabled = false;
    s.glitch.clear();
    s.shadow.visible = false;
    s.sparks.visible = false;
    s.burst = 0;
  }

  unmount(): void {
    if (!this.state) return;
    this.state.body.enabled = false;
    this.state.glitch.dispose();
    this.state.root.removeFromParent();
    disposeObjectTree(this.state.root);
    this.state = null;
    this.debugHop.from = this.player;
    this.debugHop.to = this.player;
    this.debugHop.lift = 0;
  }

  dispose(): void {
    this.unmount();
    this.routes = null;
  }
}
