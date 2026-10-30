import * as THREE from "three";
import { worldBoundaryInset, type WorldBounds } from "./WorldBounds.ts";
import type { ZoneId } from "../world/WorldContracts.ts";

interface EdgeOptions {
  zone: ZoneId;
  bounds: WorldBounds;
  outer: WorldBounds;
  height: number;
  /** Keep waterfalls/outlets open rather than drawing a stone dam over water. */
  omit?: (x: number, z: number) => boolean;
}

type Vertex = [number, number, number];

/**
 * Static, chipped bedrock starts at the real player-centre limit, not at the
 * larger decorative island outline. One vertex-coloured mesh: no lights,
 * textures, collision surfaces, per-frame work, or picking barriers.
 */
export function createWorldEdge(options: EdgeOptions): THREE.Mesh {
  const { bounds, outer, height, zone } = options;
  const palette = zone === "field" ? [0x566344, 0x313b2c, 0x161f18]
    : zone === "falls" ? [0x667b73, 0x354b46, 0x111e20]
      : zone === "grid" ? [0x46666b, 0x273943, 0x0a171f]
        : zone === "archive" ? [0x596780, 0x303a50, 0x0e1524]
          : [0x796f83, 0x444055, 0x171824];
  const topColor = new THREE.Color(palette[0]);
  const sideColor = new THREE.Color(palette[1]);
  const fissureColor = new THREE.Color(palette[2]);
  const scratchColor = new THREE.Color();
  const positions: number[] = [];
  const colors: number[] = [];
  let seed = 9173 + zone.length * 291;
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const radius = (shape: WorldBounds, angle: number, inset: number): number =>
    shape.kind === "circle" ? shape.radius - inset
      : Math.min((shape.halfWidth - inset) / Math.max(1e-8, Math.abs(Math.cos(angle))),
        (shape.halfDepth - inset) / Math.max(1e-8, Math.abs(Math.sin(angle))));
  const point = (angle: number, fraction: number, y: number): Vertex => {
    const inner = radius(bounds, angle, worldBoundaryInset);
    // Circular foundations have 18 faceted sides. Stay inside their apothem,
    // retaining the original silhouette and its vertical cliff texture.
    const outside = outer.kind === "circle" ? outer.radius * Math.cos(Math.PI / 18) - 0.03
      : radius(outer, angle, 0.03);
    const r = inner + (outside - inner) * fraction;
    return [Math.cos(angle) * r, y, Math.sin(angle) * r];
  };
  const triangle = (a: Vertex, b: Vertex, c: Vertex, color: THREE.Color, shade = 1): void => {
    positions.push(...a, ...b, ...c);
    scratchColor.copy(color).multiplyScalar(shade);
    for (let i = 0; i < 3; i++) colors.push(scratchColor.r, scratchColor.g, scratchColor.b);
  };
  const span = bounds.kind === "circle" ? bounds.radius * Math.PI * 2
    : (bounds.halfWidth + bounds.halfDepth) * 4;
  const count = Math.min(224, Math.max(96, Math.ceil(span / 0.72)));
  // Unequal fracture widths and per-column layer breaks avoid reading as
  // three tidy rows of paving around the island.
  const widths = Array.from({ length: count }, () => 0.55 + random() * 1.05);
  const total = widths.reduce((sum, width) => sum + width, 0);
  const angles = [0];
  let angleSum = 0;
  for (const width of widths) {
    angleSum += width;
    angles.push(angleSum / total * Math.PI * 2);
  }
  if (bounds.kind === "square") {
    const corner = Math.atan2(bounds.halfDepth - worldBoundaryInset, bounds.halfWidth - worldBoundaryInset);
    angles.push(corner, Math.PI - corner, Math.PI + corner, Math.PI * 2 - corner);
    angles.sort((a, b) => a - b);
  }
  for (let segment = 0; segment < angles.length - 1; segment++) {
    const a = angles[segment]!;
    const b = angles[segment + 1]!;
    if (b - a < 0.001) continue;
    const middle = point((a + b) / 2, 0, height);
    if (options.omit?.(middle[0], middle[2])) continue;
    // A dark fractured bed makes gaps legible. Jagged wedges and loose chips
    // interrupt its inner edge, so this reads as eroded terrain, not a ring line.
    const start = -0.025 - random() * 0.035;
    const under = [point(a, start, height), point(b, start, height),
      point(b, 1, height), point(a, 1, height)];
    triangle(under[0]!, under[1]!, under[2]!, fissureColor, 0.9);
    triangle(under[0]!, under[2]!, under[3]!, fissureColor, 0.9);
    const layers = [0, 0.18 + random() * 0.23, 0.57 + random() * 0.22, 1];
    for (let row = 0; row < 3; row++) {
      if (row === 2 && random() < 0.25) continue;
      const gap = (b - a) * (0.06 + random() * 0.07);
      const inner = layers[row]! + random() * 0.025;
      const outside = layers[row + 1]! - (0.025 + random() * 0.055);
      const lift = 0.025 + row * 0.035 + random() * 0.10;
      const vertices = [
        point(a + gap, inner, height + lift * 0.45),
        point(b - gap, inner + random() * 0.09, height + lift * 0.7),
        point(b - gap * 0.45, outside - random() * 0.035, height + lift),
        point((a + b) / 2, outside + 0.025, height + lift * 0.4),
        point(a + gap * 0.4, outside - random() * 0.07, height + lift * 0.8),
      ];
      const centre = point((a + b) / 2, (inner + outside) / 2, height + lift);
      const shade = 0.76 + random() * 0.40 - row * 0.09;
      for (let edge = 0; edge < vertices.length; edge++) {
        const v = vertices[edge]!;
        const next = vertices[(edge + 1) % vertices.length]!;
        triangle(centre, v, next, topColor, shade * (0.93 + random() * 0.14));
        const low: Vertex = [v[0], height + 0.004, v[2]];
        const nextLow: Vertex = [next[0], height + 0.004, next[2]];
        triangle(v, nextLow, next, sideColor, shade);
        triangle(v, low, nextLow, sideColor, shade);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    name: `${zone}-fractured-edge-material`, vertexColors: true, roughness: 0.98,
    metalness: zone === "grid" || zone === "archive" ? 0.12 : 0,
    emissive: 0x15201e, emissiveIntensity: 0.18, flatShading: true,
  }));
  mesh.name = "world-playable-fractured-edge";
  mesh.userData.clickNavigationPassThrough = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
