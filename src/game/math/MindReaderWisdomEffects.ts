import * as THREE from "three";
import { disposeObjectTree } from "../sceneResources";
import type {
  MathDynamicJumpSurface,
  MathLooseBodyHandle,
  MathQualityTier,
  MathTravelingBody,
  MightymaticaZoneContext,
} from "./types";

export type MindReaderWisdomEffect =
  | "pinwheel-gust"
  | "golden-star"
  | "golden-ratio"
  | "solar-flare"
  | "clover-court"
  | "iron-heraldry"
  | "euro-current"
  | "infinity-overflow"
  | "circuit-walk"
  | "saturn-gravity"
  | "mercury-tide"
  | "lunar-phases"
  | "florette-vines"
  | "treble-staff"
  | "desert-memory"
  | "loss-bounce"
  | "among-us"
  | "bastet-cat"
  | "bamum-ink"
  | "bamum-fold"
  | "bamum-syllabary"
  | "dragon-flight"
  | "vajra-cardinals"
  | "zeta-zeros"
  | "psi-collapse"
  | "taito-storm"
  | "armenian-eternity";

interface MindReaderWisdomEffectsOptions {
  parent: THREE.Group;
  orbAssembly: THREE.Group;
  orbSocket: THREE.Group;
  orbVisual: THREE.Object3D;
  orbAnswer: THREE.Sprite;
  orbLight: THREE.PointLight;
  orbOrigin: Readonly<THREE.Vector3>;
  floorY: number;
  onOrbKnocked: () => void;
  onOrbRecovered: () => void;
}

interface QualityLimits {
  motes: number;
  tokens: number;
  rings: number;
  phantoms: number;
  lineSegments: number;
}

interface EffectCounts {
  motes: number;
  tokens: number;
  rings: number;
  phantoms: number;
}

type OrbState = "home" | "fallen" | "held" | "restoring";

const maximumMotes = 128;
const maximumTokens = 44;
const maximumRings = 18;
const maximumPhantoms = 20;
const maximumLineSegments = 440;
const maximumComponents = 48;
const maximumPyramids = 6;
const tokenAtlasColumns = 8;
const hiddenY = -100;
const goldenAngle = Math.PI * (3 - Math.sqrt(5));
const catSwatTime = 1.22;
const catEffectDuration = 6.8;
const ordinaryEffectDuration = 8.4;
const reducedEffectDuration = 3.8;
const orbRecoveryRadius = 0.78;
const orbVisualRadius = 0.62;
const orbBoundaryRadius = 15.45;

const qualityLimits: Readonly<Record<MathQualityTier, QualityLimits>> = {
  low: {
    motes: 42,
    tokens: 14,
    rings: 7,
    phantoms: 9,
    lineSegments: 170,
  },
  medium: {
    motes: 78,
    tokens: 26,
    rings: 12,
    phantoms: 14,
    lineSegments: 320,
  },
  high: {
    motes: maximumMotes,
    tokens: maximumTokens,
    rings: maximumRings,
    phantoms: maximumPhantoms,
    lineSegments: maximumLineSegments,
  },
};

const effectCounts: Readonly<Record<MindReaderWisdomEffect, EffectCounts>> = {
  "pinwheel-gust": { motes: 92, tokens: 5, rings: 8, phantoms: 0 },
  "golden-star": { motes: 68, tokens: 6, rings: 10, phantoms: 0 },
  "golden-ratio": { motes: 54, tokens: 12, rings: 9, phantoms: 0 },
  "solar-flare": { motes: 128, tokens: 9, rings: 12, phantoms: 0 },
  "clover-court": { motes: 96, tokens: 24, rings: 8, phantoms: 0 },
  "iron-heraldry": { motes: 82, tokens: 18, rings: 10, phantoms: 0 },
  "euro-current": { motes: 88, tokens: 38, rings: 9, phantoms: 0 },
  "infinity-overflow": { motes: 124, tokens: 36, rings: 16, phantoms: 0 },
  "circuit-walk": { motes: 88, tokens: 28, rings: 6, phantoms: 0 },
  "saturn-gravity": { motes: 108, tokens: 8, rings: 18, phantoms: 12 },
  "mercury-tide": { motes: 112, tokens: 14, rings: 9, phantoms: 0 },
  "lunar-phases": { motes: 74, tokens: 18, rings: 13, phantoms: 8 },
  "florette-vines": { motes: 116, tokens: 28, rings: 8, phantoms: 0 },
  "treble-staff": { motes: 86, tokens: 32, rings: 8, phantoms: 0 },
  "desert-memory": { motes: 128, tokens: 22, rings: 9, phantoms: 0 },
  "loss-bounce": { motes: 72, tokens: 36, rings: 7, phantoms: 0 },
  "among-us": { motes: 104, tokens: 44, rings: 11, phantoms: 0 },
  "bastet-cat": { motes: 92, tokens: 12, rings: 10, phantoms: 0 },
  "bamum-ink": { motes: 104, tokens: 26, rings: 8, phantoms: 0 },
  "bamum-fold": { motes: 74, tokens: 30, rings: 9, phantoms: 0 },
  "bamum-syllabary": { motes: 88, tokens: 36, rings: 14, phantoms: 0 },
  "dragon-flight": { motes: 104, tokens: 20, rings: 9, phantoms: 18 },
  "vajra-cardinals": { motes: 76, tokens: 20, rings: 14, phantoms: 12 },
  "zeta-zeros": { motes: 80, tokens: 28, rings: 12, phantoms: 0 },
  "psi-collapse": { motes: 112, tokens: 24, rings: 16, phantoms: 10 },
  "taito-storm": { motes: 128, tokens: 26, rings: 13, phantoms: 20 },
  "armenian-eternity": { motes: 108, tokens: 24, rings: 16, phantoms: 12 },
};

const wisdomTokens = [
  "♪",
  "♫",
  "𝄞",
  "♠",
  "♥",
  "♦",
  "♣",
  "☉",
  "φ",
  "e",
  "π",
  "sin",
  "cos",
  "∞",
  "ℵ₀",
  "ℵ₁",
  "TREE(3)",
  "⌘",
  "0",
  "1",
  "€",
  "$",
  "£",
  "¥",
  "₿",
  "☿",
  "☾",
  "✾",
  "𓁶",
  "😭",
  "📉",
  "ඞ",
  "🚨",
  "!",
  "!!",
  "👁",
  "𓃠",
  "𖣐",
  "𖤍",
  "𖤓",
  "龘",
  "☁",
  "࿇",
  "ζ",
  "Ψ",
  "Re",
  "Im",
  "𱁬",
  "֎",
  "✠",
  "1.618",
  "9",
  "18",
  "27",
  "45",
  "72",
  "∑",
  "∏",
  "i",
  "⚡",
  "●",
  "🍎",
  "🍇",
  "🦅",
  "🐦‍🔥",
] as const;

const tokenIndex = new Map<string, number>(
  wisdomTokens.map((token, index) => [token, index]),
);

const color = {
  white: 0xffffff,
  ivory: 0xfff4d8,
  cyan: 0x66ecff,
  violet: 0xa978ff,
  magenta: 0xff5dc8,
  amber: 0xffbd55,
  gold: 0xffd65c,
  orange: 0xff7b35,
  red: 0xff3c58,
  green: 0x62e878,
  deepGreen: 0x167d55,
  silver: 0xcde5ec,
  mercury: 0xb8d4db,
  sand: 0xd8a660,
  indigo: 0x5861ff,
  black: 0x19131f,
} as const;
const rainbowColors = [
  color.red,
  color.orange,
  color.gold,
  color.green,
  color.cyan,
  color.indigo,
  color.violet,
  color.magenta,
] as const;
const binaryDirections = [-1, 1] as const;
const euroRails = [-0.34, 0.34] as const;
const zetaZeros = [-2.35, -1.12, 0.72, 2.08] as const;
const goldenRatio = (1 + Math.sqrt(5)) / 2;
const goldenSpiralGrowth = Math.log(goldenRatio) / (Math.PI / 2);
// Keep the pentagram proof camera-side and east of the photographed panel.
// Its labels share these anchors, so the complete φ explanation moves as one.
const goldenStarProof = {
  centerX: 2.55,
  centerY: 1.1,
  radius: 1.45,
  z: 0.18,
} as const;
const goldenStarSideMidpoint = {
  x: (Math.cos(Math.PI / 2) + Math.cos(Math.PI / 10)) / 2,
  y: (Math.sin(Math.PI / 2) + Math.sin(Math.PI / 10)) / 2,
} as const;
const goldenStarDiagonalMidpoint = {
  x: (Math.cos(Math.PI / 2) + Math.cos(-Math.PI * 3 / 10)) / 2,
  y: (Math.sin(Math.PI / 2) + Math.sin(-Math.PI * 3 / 10)) / 2,
} as const;
const crossPatteeOutline = createCrossPatteeShape()
  .getSpacedPoints(40)
  .slice(0, -1);
const circuitBoardLayouts = [
  [-2.45, -1.75, 0.08],
  [2.28, -1.18, -0.11],
  [-1.55, 1.82, -0.08],
  [2.62, 1.56, 0.14],
] as const;
// These four nodes define the Command effect's circuit topology. Quality tiers
// may simplify decoration and tracer density, but must not remove a board.
const circuitBoardCount = circuitBoardLayouts.length;
const circuitTraceSegments = [
  [-0.96, -0.48, 0.86, -0.48],
  [-0.96, 0.48, 0.68, 0.48],
  [-0.68, -0.48, -0.68, 0.22],
  [0.08, -0.48, 0.08, 0.48],
  [0.68, 0.48, 0.94, 0.18],
] as const;
const circuitRelayOrders = [
  [0, 1],
  [0, 2, 1],
  [0, 2, 3, 1],
] as const;
const zetaAnnotationTokens = [
  "ζ",
  "Re",
  "Im",
  "9",
  "18",
  "27",
  "45",
  "72",
  "i",
] as const;
const vajraProngProfile = [
  [0.16, 0],
  [0.34, 0.16],
  [0.58, 0.29],
  [0.82, 0.18],
  [1, 0],
] as const;
const wisdomEffectPalettes: Readonly<
  Record<MindReaderWisdomEffect, readonly [number, number]>
> = {
  "pinwheel-gust": [color.cyan, color.white],
  "golden-star": [color.gold, color.orange],
  "golden-ratio": [color.gold, color.orange],
  "solar-flare": [color.gold, color.orange],
  "clover-court": [color.green, color.amber],
  "iron-heraldry": [color.silver, color.red],
  "euro-current": [color.gold, color.orange],
  "infinity-overflow": [color.cyan, color.magenta],
  "circuit-walk": [color.cyan, color.violet],
  "saturn-gravity": [color.silver, color.violet],
  "mercury-tide": [color.mercury, color.white],
  "lunar-phases": [color.silver, color.violet],
  "florette-vines": [color.green, color.amber],
  "treble-staff": [color.cyan, color.white],
  "desert-memory": [color.sand, color.gold],
  "loss-bounce": [color.magenta, color.cyan],
  "among-us": [color.red, color.cyan],
  "bastet-cat": [color.green, color.gold],
  "bamum-ink": [color.indigo, color.amber],
  "bamum-fold": [color.indigo, color.amber],
  "bamum-syllabary": [color.indigo, color.amber],
  "dragon-flight": [color.violet, color.cyan],
  "vajra-cardinals": [color.amber, color.cyan],
  "zeta-zeros": [color.cyan, color.red],
  "psi-collapse": [color.cyan, color.magenta],
  "taito-storm": [color.violet, color.cyan],
  "armenian-eternity": [color.amber, color.red],
};
const wisdomEffectTokens: Readonly<
  Record<MindReaderWisdomEffect, readonly string[]>
> = {
  "pinwheel-gust": ["●", "●", "●", "●", "●"],
  "golden-star": ["1", "φ", "1.618"],
  "golden-ratio": ["φ", "e", "π", "sin", "cos", "1.618"],
  "solar-flare": ["☉", "⚡", "☉"],
  "clover-court": ["♣", "♠", "♥", "♦"],
  "iron-heraldry": ["✠", "🦅", "🐦‍🔥", "⚡"],
  "euro-current": ["€", "$", "£", "¥", "₿", "€", "1", "0"],
  "infinity-overflow": ["∞", "ℵ₀", "ℵ₁", "TREE(3)", "π", "e", "∑", "∏"],
  "circuit-walk": ["⌘", "0", "1", "0", "1"],
  "saturn-gravity": ["●", "♄", "☾"],
  "mercury-tide": ["☿", "●", "☿"],
  "lunar-phases": ["☾", "●", "☾", "●"],
  "florette-vines": ["✾", "♣", "🍎", "✾", "🍇", "●"],
  "treble-staff": ["♪", "♫", "♪", "𝄞"],
  "desert-memory": ["𓁶", "☉", "𓁶"],
  "loss-bounce": ["😭", "📉", "●", "1", "0"],
  "among-us": ["ඞ", "!", "🚨", "!!", "👁", "ඞ", "!"],
  "bastet-cat": ["𓃠", "☾", "𓃠"],
  "bamum-ink": ["𖣐", "𖤍", "𖤓"],
  "bamum-fold": ["𖤍", "𖣐", "𖤓"],
  "bamum-syllabary": ["𖤓", "𖣐", "𖤍"],
  "dragon-flight": ["龘", "☁", "龘", "☁"],
  "vajra-cardinals": ["࿇", "⚡", "࿇"],
  "zeta-zeros": ["ζ", "Re", "Im", "0", "9", "18", "27", "45", "72", "i"],
  "psi-collapse": ["Ψ", "0", "1", "Ψ", "∞"],
  "taito-storm": ["𱁬", "龘", "☁", "⚡"],
  "armenian-eternity": ["֎", "☉", "֎", "✾"],
};

function fract(value: number): number {
  return value - Math.floor(value);
}

function hash(index: number, salt = 0): number {
  return fract(Math.sin(index * 91.731 + salt * 47.117) * 43758.5453);
}

function createTokenAtlas(): THREE.CanvasTexture {
  const tileSize = 128;
  const rows = Math.ceil(wisdomTokens.length / tokenAtlasColumns);
  const canvas = document.createElement("canvas");
  canvas.width = tileSize * tokenAtlasColumns;
  canvas.height = tileSize * rows;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    drawing.clearRect(0, 0, canvas.width, canvas.height);
    drawing.textAlign = "center";
    drawing.textBaseline = "middle";
    for (const [index, token] of wisdomTokens.entries()) {
      const x = (index % tokenAtlasColumns) * tileSize + tileSize / 2;
      const y = Math.floor(index / tokenAtlasColumns) * tileSize + tileSize / 2;
      const longToken = token.length > 3 && token !== "🐦‍🔥";
      drawing.font =
        `700 ${longToken ? 39 : 70}px ` +
        '"Noto Color Emoji", "Noto Sans Egyptian Hieroglyphs", ' +
        '"Noto Sans Bamum", "Noto Sans Sinhala", "Noto Sans CJK JP", ' +
        '"Noto Music", "Noto Sans Symbols 2", "Segoe UI Symbol", serif';
      drawing.lineWidth = longToken ? 5 : 7;
      drawing.strokeStyle = "rgba(18, 8, 30, 0.78)";
      drawing.strokeText(token, x, y + (token === "𓃠" ? 8 : 2));
      drawing.fillStyle = "#ffffff";
      drawing.fillText(token, x, y + (token === "𓃠" ? 8 : 2));
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = "mind-reader-wisdom-token-atlas";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function createMercuryGeometry(
  columns: number,
  rows: number,
  width: number,
  depth: number,
): THREE.BufferGeometry {
  const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
  const indices: number[] = [];
  let cursor = 0;
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      positions[cursor] = (column / columns - 0.5) * width;
      positions[cursor + 1] = 0;
      positions[cursor + 2] = (row / rows) * depth;
      cursor += 3;
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const topLeft = row * (columns + 1) + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + columns + 1;
      const bottomRight = bottomLeft + 1;
      indices.push(
        topLeft,
        bottomLeft,
        topRight,
        topRight,
        bottomLeft,
        bottomRight,
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createCrossPatteeShape(): THREE.Shape {
  const shape = new THREE.Shape();
  const reach = 1.48;
  const terminalHalfWidth = 0.92;
  const neckReach = 0.16;
  const neckHalfWidth = 0.008;
  const outerControlReach = 1.36;
  const outerControlWidth = 0.18;
  const innerControlReach = 0.32;
  const innerControlWidth = 0;
  shape.moveTo(-terminalHalfWidth, reach);
  shape.lineTo(terminalHalfWidth, reach);
  shape.bezierCurveTo(
    outerControlWidth,
    outerControlReach,
    innerControlWidth,
    innerControlReach,
    neckHalfWidth,
    neckReach,
  );
  shape.lineTo(neckReach, neckHalfWidth);
  shape.bezierCurveTo(
    innerControlReach,
    innerControlWidth,
    outerControlReach,
    outerControlWidth,
    reach,
    terminalHalfWidth,
  );
  shape.lineTo(reach, -terminalHalfWidth);
  shape.bezierCurveTo(
    outerControlReach,
    -outerControlWidth,
    innerControlReach,
    -innerControlWidth,
    neckReach,
    -neckHalfWidth,
  );
  shape.lineTo(neckHalfWidth, -neckReach);
  shape.bezierCurveTo(
    innerControlWidth,
    -innerControlReach,
    outerControlWidth,
    -outerControlReach,
    terminalHalfWidth,
    -reach,
  );
  shape.lineTo(-terminalHalfWidth, -reach);
  shape.bezierCurveTo(
    -outerControlWidth,
    -outerControlReach,
    -innerControlWidth,
    -innerControlReach,
    -neckHalfWidth,
    -neckReach,
  );
  shape.lineTo(-neckReach, -neckHalfWidth);
  shape.bezierCurveTo(
    -innerControlReach,
    -innerControlWidth,
    -outerControlReach,
    -outerControlWidth,
    -reach,
    -terminalHalfWidth,
  );
  shape.lineTo(-reach, terminalHalfWidth);
  shape.bezierCurveTo(
    -outerControlReach,
    outerControlWidth,
    -innerControlReach,
    innerControlWidth,
    -neckReach,
    neckHalfWidth,
  );
  shape.lineTo(-neckHalfWidth, neckReach);
  shape.bezierCurveTo(
    -innerControlWidth,
    innerControlReach,
    -outerControlWidth,
    outerControlReach,
    -terminalHalfWidth,
    reach,
  );
  shape.closePath();
  return shape;
}

function createCrossPatteeGeometry(): THREE.ShapeGeometry {
  const shape = createCrossPatteeShape();
  return new THREE.ShapeGeometry(shape);
}

function createInstancedPropMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: "mind-reader-instanced-prop-material",
    uniforms: {
      uOpacity: { value: 1 },
    },
    vertexShader: `
      varying vec3 vColor;
      varying float vShade;

      void main() {
        vec3 instanceNormal = normalize(mat3(instanceMatrix) * normal);
        vec3 lightDirection = normalize(vec3(0.36, 0.84, 0.41));
        vShade = 0.64 + max(0.0, dot(instanceNormal, lightDirection)) * 0.46;
        vColor = instanceColor;
        vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying vec3 vColor;
      varying float vShade;

      void main() {
        gl_FragColor = vec4(vColor * vShade, uOpacity);
      }
    `,
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function createSpectralCat(material: THREE.MeshBasicMaterial): THREE.Group {
  const cat = new THREE.Group();
  cat.name = "mind-reader-bastet-apparition";
  const addPart = (
    geometry: THREE.BufferGeometry,
    position: [number, number, number],
    scale: [number, number, number],
  ): THREE.Mesh => {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(...position);
    part.scale.set(...scale);
    cat.add(part);
    return part;
  };
  addPart(new THREE.SphereGeometry(0.38, 10, 7), [0, 0.47, 0], [1.4, 1, 0.72]);
  addPart(new THREE.SphereGeometry(0.31, 10, 7), [0.45, 0.76, 0], [1, 0.92, 0.88]);
  const leftEar = addPart(
    new THREE.ConeGeometry(0.15, 0.32, 4),
    [0.34, 1.03, -0.15],
    [1, 1, 0.75],
  );
  leftEar.rotation.z = -0.16;
  const rightEar = addPart(
    new THREE.ConeGeometry(0.15, 0.32, 4),
    [0.34, 1.03, 0.15],
    [1, 1, 0.75],
  );
  rightEar.rotation.z = -0.16;
  for (const z of [-0.24, 0.24]) {
    addPart(
      new THREE.CapsuleGeometry(0.075, 0.34, 3, 6),
      [0.1, 0.16, z],
      [1, 1, 1],
    );
    addPart(
      new THREE.CapsuleGeometry(0.075, 0.3, 3, 6),
      [-0.28, 0.18, z],
      [1, 1, 1],
    );
  }
  const paw = addPart(
    new THREE.CapsuleGeometry(0.07, 0.46, 3, 6),
    [0.62, 0.57, -0.18],
    [1, 1, 1],
  );
  paw.name = "mind-reader-cat-swat-paw";
  paw.rotation.z = -1.08;
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.48, 0.5, 0),
    new THREE.Vector3(-0.78, 0.76, 0.12),
    new THREE.Vector3(-0.7, 1.08, 0.2),
    new THREE.Vector3(-0.48, 1.13, 0.1),
  ]);
  addPart(
    new THREE.TubeGeometry(tailCurve, 14, 0.045, 5, false),
    [0, 0, 0],
    [1, 1, 1],
  ).name = "mind-reader-cat-tail";
  const eyeMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd65c,
    transparent: true,
    opacity: 1,
    toneMapped: false,
  });
  for (const z of [-0.105, 0.105]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 6, 4),
      eyeMaterial,
    );
    eye.position.set(0.705, 0.82, z);
    cat.add(eye);
  }
  cat.visible = false;
  return cat;
}

function createCloudDragon(material: THREE.MeshBasicMaterial): THREE.Group {
  const dragon = new THREE.Group();
  dragon.name = "mind-reader-cloud-dragon";
  const headRig = new THREE.Group();
  headRig.name = "mind-reader-cloud-dragon-head-rig";
  dragon.add(headRig);
  const head = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.36, 1),
    material,
  );
  head.name = "mind-reader-cloud-dragon-head";
  head.scale.set(1.25, 0.8, 0.88);
  headRig.add(head);
  const snout = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 10, 7),
    material,
  );
  snout.name = "mind-reader-cloud-dragon-snout";
  snout.position.set(0.43, -0.07, 0);
  snout.scale.set(1.28, 0.62, 0.72);
  headRig.add(snout);
  const lowerJaw = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.11, 0.34, 3, 7),
    material,
  );
  lowerJaw.name = "mind-reader-cloud-dragon-jaw";
  lowerJaw.position.set(0.48, -0.22, 0);
  lowerJaw.rotation.z = -Math.PI / 2;
  lowerJaw.scale.set(1, 1, 0.72);
  headRig.add(lowerJaw);
  const noseMaterial = new THREE.MeshBasicMaterial({
    color: 0x24152e,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    toneMapped: false,
  });
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 8, 6),
    noseMaterial,
  );
  nose.position.set(0.69, -0.05, 0);
  nose.scale.set(0.75, 0.62, 1);
  headRig.add(nose);
  for (const side of [-1, 1]) {
    const nostril = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 5, 4),
      new THREE.MeshBasicMaterial({
        color: 0xffd65c,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    nostril.position.set(0.775, -0.015, side * 0.07);
    headRig.add(nostril);
  }
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(
      new THREE.ConeGeometry(0.075, 0.68, 5),
      material,
    );
    horn.position.set(-0.08, 0.3, side * 0.22);
    horn.rotation.set(side * 0.18, 0, 0.56);
    headRig.add(horn);
    const brow = new THREE.Mesh(
      new THREE.ConeGeometry(0.055, 0.34, 5),
      material,
    );
    brow.position.set(0.16, 0.22, side * 0.29);
    brow.rotation.set(side * 0.46, 0, -1.08);
    headRig.add(brow);
    const whiskerCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.32, -0.02, side * 0.2),
      new THREE.Vector3(0.68, 0.08, side * 0.58),
      new THREE.Vector3(1.04, -0.18, side * 0.86),
    ]);
    const whisker = new THREE.Mesh(
      new THREE.TubeGeometry(whiskerCurve, 10, 0.018, 4, false),
      material,
    );
    whisker.name = `mind-reader-cloud-dragon-whisker-${side}`;
    headRig.add(whisker);
  }
  const eyeMaterial = new THREE.MeshBasicMaterial({
    color: 0xffef91,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.068, 8, 5),
      eyeMaterial,
    );
    eye.position.set(0.19, 0.12, side * 0.285);
    eye.scale.set(1, 0.88, 0.72);
    headRig.add(eye);
    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 6, 4),
      noseMaterial,
    );
    pupil.position.set(0.235, 0.12, side * 0.318);
    pupil.scale.set(0.7, 1.35, 0.7);
    headRig.add(pupil);
  }
  for (let frill = 0; frill < 7; frill += 1) {
    const angle = (frill / 7) * Math.PI * 2;
    const mane = new THREE.Mesh(
      new THREE.ConeGeometry(0.075, 0.38, 4),
      material,
    );
    mane.position.set(
      -0.28,
      Math.cos(angle) * 0.33,
      Math.sin(angle) * 0.35,
    );
    mane.rotation.set(Math.sin(angle) * 0.75, 0, Math.cos(angle) * -0.75);
    headRig.add(mane);
  }
  const body = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.34, 1),
    material,
    16,
  );
  body.name = "mind-reader-cloud-dragon-body";
  body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  body.frustumCulled = false;
  dragon.add(body);
  const tailGeometry = new THREE.ConeGeometry(0.28, 1.05, 5);
  tailGeometry.rotateZ(-Math.PI / 2);
  const tail = new THREE.Mesh(tailGeometry, material);
  tail.name = "mind-reader-cloud-dragon-tail";
  dragon.add(tail);
  dragon.visible = false;
  return dragon;
}

/**
 * A bounded "wisdom theatre" shared by every Mind Reader reveal. Each mark
 * composes the same instanced motes, glyph billboards, rings, line buffer and
 * phantom chain differently, keeping the catalogue extravagant without
 * multiplying draw calls or allocating new effects in the frame loop.
 */
export class MindReaderWisdomEffects {
  private readonly context: MightymaticaZoneContext;
  private readonly parent: THREE.Group;
  private readonly orbAssembly: THREE.Group;
  private readonly orbSocket: THREE.Group;
  private readonly orbVisual: THREE.Object3D;
  private readonly orbAnswer: THREE.Sprite;
  private readonly orbLight: THREE.PointLight;
  private readonly orbHome = new THREE.Vector3();
  private readonly orbOrigin = new THREE.Vector3();
  private readonly orbRestoreStart = new THREE.Vector3();
  private readonly orbRestoreTarget = new THREE.Vector3();
  private readonly floorRelativeY: number;
  private readonly onOrbKnocked: () => void;
  private readonly onOrbRecovered: () => void;
  private readonly root = new THREE.Group();
  private readonly stage = new THREE.Group();
  private readonly moteMesh: THREE.InstancedMesh<
    THREE.TetrahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly tokenAtlas = createTokenAtlas();
  private readonly tokenMesh: THREE.InstancedMesh<
    THREE.PlaneGeometry,
    THREE.ShaderMaterial
  >;
  private readonly tokenIndexAttribute: THREE.InstancedBufferAttribute;
  private readonly tokenOpacityAttribute: THREE.InstancedBufferAttribute;
  private readonly ringMesh: THREE.InstancedMesh<
    THREE.TorusGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly phantomMesh: THREE.InstancedMesh<
    THREE.IcosahedronGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly componentMesh: THREE.InstancedMesh<
    THREE.BoxGeometry,
    THREE.ShaderMaterial
  >;
  private readonly pyramidMesh: THREE.InstancedMesh<
    THREE.ConeGeometry,
    THREE.ShaderMaterial
  >;
  private readonly lineGeometry: THREE.BufferGeometry;
  private readonly linePositions = new Float32Array(maximumLineSegments * 6);
  private readonly lineColors = new Float32Array(maximumLineSegments * 6);
  private readonly lines: THREE.LineSegments<
    THREE.BufferGeometry,
    THREE.LineBasicMaterial
  >;
  private readonly mercuryGeometry = createMercuryGeometry(12, 8, 6.4, 7.2);
  private readonly mercuryMaterial = new THREE.MeshBasicMaterial({
    color: color.mercury,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly mercurySheet: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly catMaterial = new THREE.MeshBasicMaterial({
    color: 0x83e8ce,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly cat = createSpectralCat(this.catMaterial);
  private readonly catTail = this.cat.getObjectByName("mind-reader-cat-tail");
  private readonly catPaw = this.cat.getObjectByName(
    "mind-reader-cat-swat-paw",
  );
  private readonly dragonMaterial = new THREE.MeshBasicMaterial({
    color: color.violet,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly dragon = createCloudDragon(this.dragonMaterial);
  private readonly dragonHeadRig = this.dragon.getObjectByName(
    "mind-reader-cloud-dragon-head-rig",
  );
  private readonly dragonWhiskers = binaryDirections.map((side) =>
    this.dragon.getObjectByName(`mind-reader-cloud-dragon-whisker-${side}`),
  );
  private readonly dragonBody = this.dragon.getObjectByName(
    "mind-reader-cloud-dragon-body",
  );
  private readonly dragonTail = this.dragon.getObjectByName(
    "mind-reader-cloud-dragon-tail",
  );
  private readonly radianceCore = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.56, 2),
    new THREE.MeshBasicMaterial({
      color: color.gold,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  private readonly radianceLight = new THREE.PointLight(
    color.gold,
    0,
    11,
    1.35,
  );
  private readonly ironOutline = new THREE.Mesh(
    createCrossPatteeGeometry(),
    new THREE.MeshBasicMaterial({
      color: color.silver,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  private readonly orbHomeMarker = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.045, 5, 36),
    new THREE.MeshBasicMaterial({
      color: color.gold,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  private readonly orbWorld = new THREE.Vector3();
  private readonly orbSurface: MathDynamicJumpSurface = {
    id: "math-mind-reader-loose-orb-top",
    x: 0,
    z: 0,
    halfWidth: 0.5,
    halfDepth: 0.5,
    height: 0,
    supportMargin: 0.04,
    debugResolution: 8,
    enabled: false,
    contains: (x, z, margin) => {
      const dx = x - this.orbSurface.x;
      const dz = z - this.orbSurface.z;
      const radius = this.orbSurface.halfWidth + margin;
      return dx * dx + dz * dz <= radius * radius;
    },
  };
  private readonly removeOrbSurface: () => void;
  private readonly looseOrb: MathLooseBodyHandle;
  private readonly travelingOrb: MathTravelingBody = {
    position: this.orbWorld,
    radius: 0.72,
    restingY: 0.72,
    enabled: false,
    held: false,
    kind: "wisdom-orb",
  };
  private readonly dummy = new THREE.Object3D();
  private readonly scratchColor = new THREE.Color();
  private readonly scratchPosition = new THREE.Vector3();
  private readonly scratchPositionB = new THREE.Vector3();
  private readonly scratchTangent = new THREE.Vector3();
  private readonly dragonForward = new THREE.Vector3(1, 0, 0);
  private readonly scratchQuaternion = new THREE.Quaternion();
  private readonly playerWorld = new THREE.Vector3();
  private readonly playerLocal = new THREE.Vector3();
  private readonly orbWorldScale = new THREE.Vector3();
  private activeEffect: MindReaderWisdomEffect | null = null;
  private effectAge = 0;
  private effectDuration = ordinaryEffectDuration;
  private lineCount = 0;
  private quality: MathQualityTier;
  private limits: QualityLimits;
  private orbState: OrbState = "home";
  private orbStateAge = 0;
  private orbAnswerRoll = 0;
  private mercuryPushStrength = 0;
  private mercuryPushLateral = 0;
  private catSwatTriggered = false;
  private disposed = false;

  constructor(
    context: MightymaticaZoneContext,
    options: MindReaderWisdomEffectsOptions,
  ) {
    this.context = context;
    this.parent = options.parent;
    this.orbAssembly = options.orbAssembly;
    this.orbSocket = options.orbSocket;
    this.orbVisual = options.orbVisual;
    this.orbAnswer = options.orbAnswer;
    this.orbLight = options.orbLight;
    this.orbHome.copy(options.orbAssembly.position);
    this.orbOrigin.copy(options.orbOrigin);
    this.floorRelativeY = options.floorY - options.orbOrigin.y;
    this.onOrbKnocked = options.onOrbKnocked;
    this.onOrbRecovered = options.onOrbRecovered;
    this.quality = context.quality;
    this.limits = qualityLimits[this.quality];

    this.root.name = "mind-reader-wisdom-effects";
    this.parent.add(this.root);
    this.stage.position.copy(this.orbOrigin);
    this.root.add(this.stage);

    this.moteMesh = new THREE.InstancedMesh(
      new THREE.TetrahedronGeometry(0.065, 0),
      new THREE.MeshBasicMaterial({
        color: color.white,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      maximumMotes,
    );
    this.moteMesh.name = "mind-reader-wisdom-motes";
    this.moteMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.moteMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(maximumMotes * 3),
      3,
    );
    this.moteMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.moteMesh.frustumCulled = false;
    this.moteMesh.renderOrder = 7;
    this.stage.add(this.moteMesh);

    const tokenRows = Math.ceil(wisdomTokens.length / tokenAtlasColumns);
    const tokenGeometry = new THREE.PlaneGeometry(1, 1);
    this.tokenIndexAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(maximumTokens),
      1,
    );
    this.tokenOpacityAttribute = new THREE.InstancedBufferAttribute(
      new Float32Array(maximumTokens),
      1,
    );
    this.tokenIndexAttribute.setUsage(THREE.DynamicDrawUsage);
    this.tokenOpacityAttribute.setUsage(THREE.DynamicDrawUsage);
    tokenGeometry.setAttribute("instanceTokenIndex", this.tokenIndexAttribute);
    tokenGeometry.setAttribute("instanceOpacity", this.tokenOpacityAttribute);
    const tokenMaterial = new THREE.ShaderMaterial({
      name: "mind-reader-wisdom-token-material",
      uniforms: {
        uAtlas: { value: this.tokenAtlas },
        uGrid: {
          value: new THREE.Vector2(tokenAtlasColumns, tokenRows),
        },
      },
      vertexShader: `
        uniform vec2 uGrid;
        attribute float instanceTokenIndex;
        attribute float instanceOpacity;
        varying vec2 vAtlasUv;
        varying float vOpacity;
        varying vec3 vTint;

        void main() {
          float column = mod(instanceTokenIndex, uGrid.x);
          float rowFromTop = floor(instanceTokenIndex / uGrid.x);
          float row = uGrid.y - rowFromTop - 1.0;
          vAtlasUv = (uv + vec2(column, row)) / uGrid;
          vOpacity = instanceOpacity;
          vTint = instanceColor;
          mat4 worldInstance = modelMatrix * instanceMatrix;
          vec4 center = viewMatrix * worldInstance * vec4(0.0, 0.0, 0.0, 1.0);
          float scaleX = length(worldInstance[0].xyz);
          float scaleY = length(worldInstance[1].xyz);
          center.xy += position.xy * vec2(scaleX, scaleY);
          gl_Position = projectionMatrix * center;
        }
      `,
      fragmentShader: `
        uniform sampler2D uAtlas;
        varying vec2 vAtlasUv;
        varying float vOpacity;
        varying vec3 vTint;

        void main() {
          vec4 sampleColor = texture2D(uAtlas, vAtlasUv);
          if (sampleColor.a < 0.035 || vOpacity < 0.01) discard;
          vec3 preservedEmoji = mix(vTint, sampleColor.rgb, step(0.08, length(sampleColor.rgb - vec3(1.0))));
          gl_FragColor = vec4(preservedEmoji, sampleColor.a * vOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.tokenMesh = new THREE.InstancedMesh(
      tokenGeometry,
      tokenMaterial,
      maximumTokens,
    );
    this.tokenMesh.name = "mind-reader-wisdom-glyphs";
    this.tokenMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tokenMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(maximumTokens * 3),
      3,
    );
    this.tokenMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.tokenMesh.frustumCulled = false;
    this.tokenMesh.renderOrder = 8;
    this.stage.add(this.tokenMesh);

    this.ringMesh = new THREE.InstancedMesh(
      new THREE.TorusGeometry(1, 0.025, 5, 44),
      new THREE.MeshBasicMaterial({
        color: color.white,
        transparent: true,
        opacity: 0.76,
        depthWrite: false,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      maximumRings,
    );
    this.ringMesh.name = "mind-reader-wisdom-rings";
    this.ringMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ringMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(maximumRings * 3),
      3,
    );
    this.ringMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.ringMesh.frustumCulled = false;
    this.ringMesh.renderOrder = 6;
    this.stage.add(this.ringMesh);

    this.phantomMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.22, 0),
      new THREE.MeshBasicMaterial({
        color: color.white,
        transparent: true,
        opacity: 0.64,
        depthWrite: false,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      maximumPhantoms,
    );
    this.phantomMesh.name = "mind-reader-wisdom-phantoms";
    this.phantomMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.phantomMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(maximumPhantoms * 3),
      3,
    );
    this.phantomMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.phantomMesh.frustumCulled = false;
    this.phantomMesh.renderOrder = 6;
    this.stage.add(this.phantomMesh);

    this.componentMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      createInstancedPropMaterial(),
      maximumComponents,
    );
    this.componentMesh.name = "mind-reader-wisdom-components";
    this.componentMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.componentMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(maximumComponents * 3),
      3,
    );
    this.componentMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.componentMesh.count = 0;
    this.componentMesh.frustumCulled = false;
    this.componentMesh.renderOrder = 6;
    this.componentMesh.visible = false;
    this.stage.add(this.componentMesh);

    this.pyramidMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1, 1, 4),
      createInstancedPropMaterial(),
      maximumPyramids,
    );
    this.pyramidMesh.name = "mind-reader-desert-pyramids";
    this.pyramidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pyramidMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(maximumPyramids * 3),
      3,
    );
    this.pyramidMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.pyramidMesh.count = 0;
    this.pyramidMesh.frustumCulled = false;
    this.pyramidMesh.renderOrder = 6;
    this.pyramidMesh.visible = false;
    this.stage.add(this.pyramidMesh);

    this.lineGeometry = new THREE.BufferGeometry();
    this.lineGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.linePositions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.lineGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(this.lineColors, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.lineGeometry.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(
      this.lineGeometry,
      new THREE.LineBasicMaterial({
        color: color.white,
        transparent: true,
        opacity: 0.88,
        vertexColors: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.lines.name = "mind-reader-wisdom-diagrams";
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 7;
    this.stage.add(this.lines);

    this.mercurySheet = new THREE.Mesh(
      this.mercuryGeometry,
      this.mercuryMaterial,
    );
    this.mercurySheet.name = "mind-reader-mercury-tide";
    this.mercurySheet.position.y = this.floorRelativeY + 0.035;
    this.mercurySheet.frustumCulled = false;
    this.mercurySheet.renderOrder = 5;
    this.mercurySheet.visible = false;
    this.stage.add(this.mercurySheet);

    this.cat.position.y = this.floorRelativeY;
    this.cat.renderOrder = 8;
    this.stage.add(this.cat);
    this.dragon.renderOrder = 8;
    this.stage.add(this.dragon);
    this.radianceCore.name = "mind-reader-wisdom-radiance-core";
    // The answer sprite renders above the theatre. Keeping the additive core
    // it preserves the glyph while opaque players can still occlude both.
    this.radianceCore.renderOrder = 4;
    this.radianceCore.visible = false;
    this.stage.add(this.radianceCore);
    this.radianceLight.name = "mind-reader-wisdom-radiance-light";
    this.radianceLight.position.set(0, 0.15, 0);
    this.stage.add(this.radianceLight);
    this.ironOutline.name = "mind-reader-cross-pattee-outline";
    this.ironOutline.renderOrder = 8;
    this.ironOutline.visible = false;
    this.stage.add(this.ironOutline);

    this.orbHomeMarker.name = "mind-reader-orb-home-marker";
    this.orbHomeMarker.position.copy(this.orbOrigin);
    this.orbHomeMarker.rotation.x = Math.PI / 2;
    this.orbHomeMarker.visible = false;
    this.orbHomeMarker.renderOrder = 8;
    this.root.add(this.orbHomeMarker);

    this.orbVisual.getWorldScale(this.orbWorldScale);
    const worldRadius =
      orbVisualRadius *
      Math.max(
        this.orbWorldScale.x,
        this.orbWorldScale.y,
        this.orbWorldScale.z,
      );
    // The host keeps the payload upright for stable shared physics. This
    // controller rolls the glass and rotates the camera-facing answer in tandem,
    // creating the impression that the glyph is suspended inside a marble.
    this.orbAssembly.userData.upright = true;
    this.orbAssembly.userData.sphericalLooseBody = true;
    this.orbAssembly.userData.sphericalFloorY = 0.155;
    this.looseOrb = context.registerLooseBody({
      object: this.orbAssembly,
      radius: worldRadius,
      restingY: worldRadius,
      gravity: true,
      boundaryRadius: orbBoundaryRadius,
      friction: 0.992,
      message:
        "The displaced wisdom orb rolls away with a distinctly non-symbolic opinion of the proof.",
      enabled: false,
    });
    this.travelingOrb.radius = worldRadius;
    this.travelingOrb.restingY = worldRadius;
    this.orbSurface.halfWidth = worldRadius * 0.82;
    this.orbSurface.halfDepth = worldRadius * 0.82;
    this.removeOrbSurface = context.registerDynamicJumpSurface(
      this.orbSurface,
    );
    this.hideAllInstances();
  }

  trigger(effect: MindReaderWisdomEffect): void {
    if (this.disposed) return;
    this.activeEffect = effect;
    this.effectAge = 0;
    this.effectDuration = this.context.reducedMotion
      ? reducedEffectDuration
      : effect === "bastet-cat"
        ? catEffectDuration
        : ordinaryEffectDuration;
    this.catSwatTriggered = false;
    this.stage.visible = true;
    this.cat.visible = effect === "bastet-cat";
    this.dragon.visible =
      effect === "dragon-flight" || effect === "taito-storm";
    this.mercurySheet.visible = effect === "mercury-tide";
    this.mercuryMaterial.opacity = 0;
    this.radianceCore.visible =
      effect === "solar-flare" || effect === "among-us";
    this.ironOutline.visible = effect === "iron-heraldry";
    this.radianceLight.intensity = 0;
    this.mercuryPushStrength = 0;
    this.mercuryPushLateral = 0;
    const palette = this.getEffectPalette(effect);
    this.orbLight.color.setHex(palette[0]);
    this.hideAllInstances();
  }

  dismiss(): void {
    this.activeEffect = null;
    this.effectAge = 0;
    this.stage.visible = false;
    this.cat.visible = false;
    this.dragon.visible = false;
    this.mercurySheet.visible = false;
    this.mercuryMaterial.opacity = 0;
    this.radianceCore.visible = false;
    this.radianceLight.intensity = 0;
    this.ironOutline.visible = false;
    this.mercuryPushStrength = 0;
    this.mercuryPushLateral = 0;
    this.orbLight.color.setHex(0xb784ff);
    this.hideAllInstances();
  }

  update(delta: number, elapsed: number): void {
    if (this.disposed) return;
    this.updateOrb(delta);
    const effect = this.activeEffect;
    if (!effect) return;

    this.effectAge += delta;
    const duration = Math.max(0.01, this.effectDuration);
    const progress = THREE.MathUtils.clamp(this.effectAge / duration, 0, 1);
    const envelope =
      THREE.MathUtils.smoothstep(progress, 0, 0.11) *
      (1 - THREE.MathUtils.smoothstep(progress, 0.78, 1));
    const effectClock = this.context.reducedMotion
      ? this.effectAge * 0.22
      : elapsed;
    this.renderEffect(effect, progress, envelope, effectClock, delta);

    if (
      effect === "bastet-cat" &&
      !this.catSwatTriggered &&
      this.effectAge >=
        (this.context.reducedMotion ? catSwatTime * 0.72 : catSwatTime)
    ) {
      this.catSwatTriggered = true;
      this.knockOrbOver();
    }
    if (this.effectAge >= duration) {
      this.activeEffect = null;
      this.stage.visible = false;
      this.cat.visible = false;
      this.dragon.visible = false;
      this.mercurySheet.visible = false;
      this.mercuryMaterial.opacity = 0;
      this.radianceCore.visible = false;
      this.radianceLight.intensity = 0;
      this.ironOutline.visible = false;
      this.mercuryPushStrength = 0;
      this.mercuryPushLateral = 0;
      this.orbLight.color.setHex(0xb784ff);
      this.hideAllInstances();
    }
  }

  hasActiveMotion(): boolean {
    return (
      this.activeEffect !== null ||
      this.orbState === "held" ||
      this.orbState === "restoring" ||
      (this.looseOrb.enabled &&
        this.looseOrb.velocity.lengthSq() > 0.0025)
    );
  }

  isOrbReady(): boolean {
    return this.orbState === "home";
  }

  getTravelingOrb(): MathTravelingBody | null {
    return this.travelingOrb.enabled ? this.travelingOrb : null;
  }

  setQuality(quality: MathQualityTier): void {
    this.quality = quality;
    this.limits = qualityLimits[quality];
  }

  forEachDynamicObject(visitor: (object: THREE.Object3D) => void): void {
    visitor(this.root);
  }

  reactToSpell(): void {
    if (this.orbState === "home") return;
    this.beginOrbRestore();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.looseOrb.dispose();
    this.removeOrbSurface();
    this.root.removeFromParent();
    disposeObjectTree(this.root);
  }

  private renderEffect(
    effect: MindReaderWisdomEffect,
    progress: number,
    envelope: number,
    elapsed: number,
    delta: number,
  ): void {
    const requested = effectCounts[effect];
    const reducedFactor = this.context.reducedMotion ? 0.48 : 1;
    const moteCount = Math.floor(
      Math.min(requested.motes, this.limits.motes) * reducedFactor,
    );
    const tokenCount = Math.floor(
      Math.min(requested.tokens, this.limits.tokens) * reducedFactor,
    );
    const ringCount = Math.min(requested.rings, this.limits.rings);
    const phantomCount = Math.min(
      requested.phantoms,
      this.limits.phantoms,
    );
    this.renderMotes(effect, moteCount, progress, envelope, elapsed);
    this.renderTokens(effect, tokenCount, progress, envelope, elapsed);
    this.renderRings(effect, ringCount, progress, envelope, elapsed);
    this.renderPhantoms(
      effect,
      phantomCount,
      progress,
      envelope,
      elapsed,
    );
    this.renderComponents(effect, progress, envelope, elapsed);
    this.renderPyramids(effect, progress, envelope, elapsed);
    this.renderLines(effect, progress, envelope, elapsed);
    this.lines.material.opacity = envelope * 0.88;
    this.updateRadiance(effect, progress, envelope, elapsed);
    this.updateIronOutline(effect, progress, envelope, elapsed);
    if (effect === "mercury-tide") {
      this.updateMercury(progress, envelope, elapsed, delta);
    } else {
      this.mercurySheet.visible = false;
      this.mercuryMaterial.opacity = 0;
      this.mercuryPushStrength = 0;
      this.mercuryPushLateral = 0;
    }
    if (effect === "bastet-cat") {
      this.updateCat(progress, envelope, elapsed);
    } else {
      this.cat.visible = false;
    }
    if (effect === "dragon-flight" || effect === "taito-storm") {
      this.updateDragon(effect === "taito-storm", envelope, elapsed);
    } else {
      this.dragon.visible = false;
    }
    this.applyEnvironmentalForce(effect, progress, delta);
  }

  private updateRadiance(
    effect: MindReaderWisdomEffect,
    progress: number,
    envelope: number,
    elapsed: number,
  ): void {
    const solar = effect === "solar-flare";
    const alarm = effect === "among-us";
    if (!solar && !alarm) {
      this.radianceCore.visible = false;
      this.radianceLight.intensity = 0;
      return;
    }
    const material = this.radianceCore.material as THREE.MeshBasicMaterial;
    const pulse =
      1 +
      Math.sin(elapsed * (solar ? 9.5 : 13.5)) *
        (this.context.reducedMotion ? 0.03 : solar ? 0.18 : 0.12);
    this.radianceCore.visible = envelope > 0.002;
    this.radianceCore.position.set(0, solar ? 0 : 0.28, solar ? 0 : -0.08);
    this.radianceCore.scale.setScalar(
      Math.max(
        0.001,
        (solar ? 0.85 + progress * 0.85 : 0.54 + progress * 0.42) *
          pulse *
          envelope,
      ),
    );
    material.color.setHex(solar ? color.gold : color.red);
    material.opacity = envelope * (solar ? 0.92 : 0.68);
    this.radianceLight.color.setHex(solar ? color.orange : color.red);
    this.radianceLight.position.copy(this.radianceCore.position);
    this.radianceLight.intensity =
      envelope *
      (solar
        ? this.quality === "low"
          ? 4.5
          : 8.5
        : this.quality === "low"
          ? 2.4
          : 5.2);
  }

  private updateIronOutline(
    effect: MindReaderWisdomEffect,
    progress: number,
    envelope: number,
    elapsed: number,
  ): void {
    if (effect !== "iron-heraldry" || envelope <= 0.002) {
      this.ironOutline.visible = false;
      return;
    }
    const pulse =
      1 +
      Math.sin(elapsed * 4.8) *
        (this.context.reducedMotion ? 0.015 : 0.075);
    this.ironOutline.visible = true;
    this.ironOutline.position.set(0, 1.25, -0.18);
    this.ironOutline.rotation.set(
      0,
      0,
      Math.sin(elapsed * 0.42) * 0.045,
    );
    this.ironOutline.scale.setScalar(
      Math.max(
        0.001,
        (0.5 + Math.min(1, progress * 2.8) * 0.66) *
          pulse *
          envelope,
      ),
    );
    (
      this.ironOutline.material as THREE.MeshBasicMaterial
    ).opacity = envelope * 0.3;
  }

  private renderMotes(
    effect: MindReaderWisdomEffect,
    count: number,
    progress: number,
    envelope: number,
    elapsed: number,
  ): void {
    const windLike =
      effect === "pinwheel-gust" ||
      effect === "desert-memory" ||
      effect === "taito-storm";
    const floral =
      effect === "clover-court" ||
      effect === "florette-vines" ||
      effect === "armenian-eternity";
    const cosmic =
      effect === "solar-flare" ||
      effect === "saturn-gravity" ||
      effect === "psi-collapse" ||
      effect === "infinity-overflow";
    const palette = this.getEffectPalette(effect);
    for (let index = 0; index < maximumMotes; index += 1) {
      if (index >= count || envelope <= 0.002) {
        this.hideInstance(this.moteMesh, index);
        continue;
      }
      const phase = index * goldenAngle + hash(index, 2) * 1.7;
      const seed = hash(index, 4);
      let x = 0;
      let y = 0;
      let z = 0;
      let scale = 0.55 + seed * 1.25;
      if (windLike) {
        const turn =
          phase +
          elapsed * (effect === "taito-storm" ? 4.4 : 3.1) +
          progress * 5;
        const radius =
          0.18 + seed * (effect === "desert-memory" ? 5.4 : 3.5);
        x = Math.cos(turn) * radius;
        y =
          this.floorRelativeY +
          0.14 +
          fract(seed * 5 + progress * (1.4 + hash(index, 8))) *
            (effect === "desert-memory" ? 4.8 : 3.8);
        z =
          (fract(seed * 7 + progress * 2.1) - 0.38) *
          (effect === "desert-memory"
            ? 7.8
            : effect === "taito-storm"
              ? 6.4
              : 5.6);
        scale *= effect === "desert-memory" ? 1.72 : 1;
      } else if (floral) {
        const radius = 0.3 + progress * (2.2 + seed * 3.2);
        x = Math.cos(phase + elapsed * 0.45) * radius;
        z = Math.sin(phase + elapsed * 0.45) * radius;
        y =
          this.floorRelativeY +
          0.15 +
          Math.abs(Math.sin(progress * Math.PI * 2.2 + phase)) *
            (0.45 + seed * 1.5);
        scale *= index % 4 === 0 ? 1.6 : 0.82;
      } else if (cosmic) {
        const radius =
          0.25 +
          fract(seed + progress * (0.7 + hash(index, 9))) *
            (effect === "infinity-overflow" ? 5.2 : 3.8);
        const polar = Math.acos(1 - 2 * hash(index, 11));
        const spin = phase + elapsed * (0.45 + seed);
        x = Math.sin(polar) * Math.cos(spin) * radius;
        y = Math.cos(polar) * radius * 0.72;
        z = Math.sin(polar) * Math.sin(spin) * radius;
      } else if (effect === "mercury-tide") {
        x = (seed - 0.5) * 6.1;
        z = fract(hash(index, 17) + progress * 1.6) * 7.2;
        y =
          this.floorRelativeY +
          0.08 +
          Math.abs(Math.sin(z * 2.5 + elapsed * 5 + phase)) *
            (0.18 + seed * 0.42);
        scale *= 0.8;
      } else {
        const radius = 0.25 + progress * (1.6 + seed * 3.4);
        x = Math.cos(phase + elapsed * 0.7) * radius;
        z = Math.sin(phase + elapsed * 0.7) * radius;
        y =
          (hash(index, 12) - 0.25) * 2.6 +
          Math.sin(elapsed * 2.1 + phase) * 0.22;
      }
      const flicker = 0.62 + Math.sin(elapsed * 10 + phase) * 0.28;
      this.dummy.position.set(x, y, z);
      this.dummy.rotation.set(
        phase + elapsed,
        phase * 0.7 - elapsed * 0.4,
        phase * 0.31,
      );
      this.dummy.scale.setScalar(
        Math.max(0.001, scale * envelope * flicker),
      );
      if (floral) this.dummy.scale.set(1.8, 0.28, 0.75).multiplyScalar(scale * envelope);
      this.dummy.updateMatrix();
      this.moteMesh.setMatrixAt(index, this.dummy.matrix);
      this.moteMesh.setColorAt(
        index,
        this.scratchColor.setHex(
          this.getInstanceTint(effect, index, palette),
        ),
      );
    }
    this.moteMesh.instanceMatrix.needsUpdate = true;
    this.moteMesh.instanceColor!.needsUpdate = true;
    this.moteMesh.visible = count > 0 && envelope > 0.002;
  }

  private renderTokens(
    effect: MindReaderWisdomEffect,
    count: number,
    progress: number,
    envelope: number,
    elapsed: number,
  ): void {
    const palette = this.getEffectPalette(effect);
    const tokenSet = this.getEffectTokens(effect);
    for (let index = 0; index < maximumTokens; index += 1) {
      if (index >= count || envelope <= 0.002) {
        this.hideToken(index);
        continue;
      }
      let token = tokenSet[index % tokenSet.length] ?? "●";
      const phase = index * goldenAngle + hash(index, 21) * 1.2;
      const seed = hash(index, 22);
      let x = 0;
      let y = 0;
      let z = 0;
      let size = 0.45 + seed * 0.34;
      if (
        effect === "loss-bounce" ||
        effect === "among-us" ||
        effect === "clover-court"
      ) {
        const radius = 0.7 + seed * 4.2;
        x = Math.cos(phase) * radius * progress;
        z = Math.sin(phase) * radius * progress;
        y =
          this.floorRelativeY +
          0.42 +
          Math.abs(Math.sin(progress * Math.PI * (2.2 + seed) + phase)) *
            (1.1 + seed * 1.5);
        size *=
          effect === "among-us"
            ? token === "!" || token === "!!"
              ? 1.75
              : 1.35
            : 1;
      } else if (effect === "euro-current") {
        const stream = fract(seed + progress * (0.9 + seed * 0.8));
        x = -3.8 + stream * 7.6;
        z = (hash(index, 28) - 0.5) * 4.2;
        y =
          this.floorRelativeY +
          0.45 +
          Math.abs(Math.sin(stream * Math.PI * 3 + phase)) *
            (0.75 + seed * 2.2);
        size *= token === "€" ? 1.45 : token === "1" || token === "0" ? 0.65 : 1.15;
      } else if (effect === "treble-staff") {
        x = -2.8 + fract(seed + progress * (0.6 + seed * 0.45)) * 6.4;
        y = 0.3 + ((index % 5) - 2) * 0.22;
        z = (seed - 0.5) * 1.8 + Math.sin(x * 1.8 + phase) * 0.16;
        size *= token === "𝄞" ? 1.6 : 1;
      } else if (effect === "iron-heraldry") {
        const heraldicBird = token === "🦅" || token === "🐦‍🔥";
        const orbit = phase + elapsed * (heraldicBird ? 0.12 : 0.34);
        const radius = heraldicBird ? 2.35 + seed * 1.2 : 1.5 + seed * 2.7;
        x = Math.cos(orbit) * radius;
        y = 1.2 + Math.sin(orbit * 1.35) * (heraldicBird ? 1.15 : 1.7);
        z = Math.sin(orbit) * (heraldicBird ? 1.1 : 2.1);
        size *= heraldicBird ? (token === "🐦‍🔥" ? 1.75 : 1.5) : 0.92;
      } else if (effect === "golden-ratio") {
        const orbit = (index / Math.max(1, count)) * Math.PI * 2;
        x = Math.cos(orbit) * 3.65;
        y = 0.9 + Math.sin(orbit) * 2.25;
        z = -0.68;
        size *= token === "φ" || token === "1.618" ? 1.22 : 0.82;
      } else if (effect === "zeta-zeros") {
        if (index < zetaZeros.length) {
          token = "0";
          x = zetaZeros[index] ?? 0;
          y = 0.58;
          z = 0.16;
          size = 0.7;
        } else {
          const annotationIndex = index - zetaZeros.length;
          token =
            zetaAnnotationTokens[
              annotationIndex % zetaAnnotationTokens.length
            ] ?? "ζ";
          const row = Math.floor(annotationIndex / 7);
          x = -2.7 + (annotationIndex % 7) * 0.86;
          y =
            1.25 +
            row * 0.72 +
            Math.sin(elapsed * 1.7 + phase) * 0.05;
          z = -0.72 + row * 0.18;
          size *= token.length > 3 ? 0.72 : 1;
        }
      } else if (effect === "golden-star") {
        const proofReveal = THREE.MathUtils.smootherstep(
          progress,
          0.03,
          0.38,
        );
        if (index === 0) {
          token = "1";
          x =
            goldenStarProof.centerX +
            goldenStarProof.radius *
              goldenStarSideMidpoint.x *
              proofReveal +
            0.12;
          y =
            goldenStarProof.centerY +
            goldenStarProof.radius *
              goldenStarSideMidpoint.y *
              proofReveal +
            0.14;
          z = goldenStarProof.z + 0.02;
          size = 0.68;
        } else if (index === 1) {
          token = "φ";
          x =
            goldenStarProof.centerX +
            goldenStarProof.radius *
              goldenStarDiagonalMidpoint.x *
              proofReveal -
            0.1;
          y =
            goldenStarProof.centerY +
            goldenStarProof.radius *
              goldenStarDiagonalMidpoint.y *
              proofReveal;
          z = goldenStarProof.z + 0.02;
          size = 0.72;
        } else if (index === 2) {
          token = "1.618";
          x =
            goldenStarProof.centerX +
            goldenStarProof.radius *
              goldenStarDiagonalMidpoint.x *
              proofReveal -
            0.02;
          y =
            goldenStarProof.centerY +
            goldenStarProof.radius *
              goldenStarDiagonalMidpoint.y *
              proofReveal -
            0.48;
          z = goldenStarProof.z + 0.02;
          size = 0.46;
        } else {
          token = "φ";
          const proofPoint = index - 3;
          const angle =
            Math.PI / 2 - (proofPoint * Math.PI * 2) / 5;
          x =
            goldenStarProof.centerX +
            Math.cos(angle) *
              goldenStarProof.radius *
              0.58 *
              proofReveal;
          y =
            goldenStarProof.centerY +
            Math.sin(angle) *
              goldenStarProof.radius *
              0.58 *
              proofReveal;
          z = goldenStarProof.z + 0.01;
          size = 0.3;
        }
      } else if (
        effect === "bamum-ink" ||
        effect === "bamum-fold" ||
        effect === "bamum-syllabary"
      ) {
        const step = index / Math.max(1, count - 1);
        x = -3.2 + step * 6.4;
        y =
          this.floorRelativeY +
          0.45 +
          Math.sin(step * Math.PI) * (1.8 + (index % 3) * 0.23);
        z = Math.sin(step * Math.PI * 3 + elapsed * 0.6) * 0.7;
        size *= 1.28;
      } else if (
        effect === "dragon-flight" ||
        effect === "taito-storm"
      ) {
        const orbit = phase + elapsed * 0.55;
        const radius = 2 + seed * 2.6;
        x = Math.cos(orbit) * radius;
        z = Math.sin(orbit) * radius;
        y = 0.5 + Math.sin(orbit * 2 + phase) * 1.35;
        size *= token === "龘" || token === "𱁬" ? 1.35 : 0.9;
      } else if (effect === "infinity-overflow") {
        const path = phase + progress * Math.PI * 3;
        const radius = 2.2 + seed * 2.5;
        x = Math.sin(path) * radius;
        z = Math.sin(path * 2) * radius * 0.48;
        y = (seed - 0.3) * 2.5 + Math.cos(path) * 0.35;
        size *= token.length > 3 ? 0.68 : 1.18;
      } else if (effect === "circuit-walk") {
        const lane = index % 5;
        const travel = fract(progress * (0.9 + seed) + seed);
        x = -3.1 + travel * 6.2;
        z = -2.2 + lane * 1.08;
        y = this.floorRelativeY + 0.16 + (index % 3) * 0.08;
        size *= 0.72;
      } else {
        const orbit = phase + elapsed * (0.3 + seed * 0.45);
        const radius = 0.7 + seed * 3.8;
        x = Math.cos(orbit) * radius;
        z = Math.sin(orbit) * radius;
        y = Math.sin(orbit * 1.7 + phase) * (0.6 + seed * 1.3);
      }
      const pulse = 0.82 + Math.sin(elapsed * 4.2 + phase) * 0.16;
      this.setToken(
        index,
        token,
        x,
        y,
        z,
        size * pulse,
        envelope,
        effect === "zeta-zeros" && index < zetaZeros.length
          ? color.red
          : effect === "golden-star" && index === 0
            ? color.cyan
            : effect === "golden-star" && index < 3
              ? color.gold
          : this.getInstanceTint(effect, index, palette),
      );
    }
    this.tokenMesh.instanceMatrix.needsUpdate = true;
    this.tokenMesh.instanceColor!.needsUpdate = true;
    this.tokenIndexAttribute.needsUpdate = true;
    this.tokenOpacityAttribute.needsUpdate = true;
    this.tokenMesh.visible = count > 0 && envelope > 0.002;
  }

  private renderRings(
    effect: MindReaderWisdomEffect,
    count: number,
    progress: number,
    envelope: number,
    elapsed: number,
  ): void {
    const palette = this.getEffectPalette(effect);
    for (let index = 0; index < maximumRings; index += 1) {
      if (index >= count || envelope <= 0.002) {
        this.hideInstance(this.ringMesh, index);
        continue;
      }
      const phase = index / Math.max(1, count);
      const pulse = 0.82 + Math.sin(elapsed * 2.4 + index * 0.73) * 0.16;
      let radius = 0.35 + fract(progress * 0.8 + phase) * 4.5;
      let y = 0;
      let rotationX = Math.PI / 2;
      let rotationY = 0;
      let rotationZ = 0;
      if (effect === "saturn-gravity") {
        radius =
          0.5 +
          phase * 4.4 *
            (1 + Math.sin(elapsed * 2.2 + phase * 6) * 0.2);
        y = (phase - 0.5) * 0.9;
        rotationX = Math.PI / 2 + Math.sin(phase * 8) * 0.42;
        rotationZ = 0.28;
      } else if (effect === "psi-collapse") {
        const collapse =
          progress < 0.7
            ? 1
            : 1 - THREE.MathUtils.smoothstep(progress, 0.7, 0.86);
        radius = (0.45 + phase * 4.2) * Math.max(0.08, collapse);
        y = Math.sin(phase * Math.PI * 4 + elapsed * 2) * 0.8;
        rotationY = phase * Math.PI;
      } else if (effect === "armenian-eternity") {
        radius = 0.55 + phase * 3.8;
        y = this.floorRelativeY + 0.07 + phase * 0.06;
        rotationX = Math.PI / 2;
        rotationZ = elapsed * (index % 2 === 0 ? 0.26 : -0.22);
      } else if (effect === "solar-flare") {
        radius = 0.55 + fract(progress * 1.5 + phase) * 4.2;
        rotationX = phase * Math.PI;
        rotationY = phase * Math.PI * 0.5;
      } else if (effect === "lunar-phases") {
        radius = 0.7 + phase * 3.5;
        rotationX = Math.PI / 2 + Math.sin(phase * 6) * 0.3;
        rotationZ = elapsed * 0.1;
      } else if (effect === "vajra-cardinals") {
        radius = 0.55 + phase * 3.4;
        rotationX = index % 2 === 0 ? Math.PI / 2 : 0;
        rotationY = (index % 4) * (Math.PI / 4);
      }
      this.dummy.position.set(
        0,
        y + (effect === "armenian-eternity" ? 0 : 0.02),
        0,
      );
      this.dummy.rotation.set(rotationX, rotationY, rotationZ);
      this.dummy.scale.setScalar(
        Math.max(0.001, radius * envelope * pulse),
      );
      this.dummy.updateMatrix();
      this.ringMesh.setMatrixAt(index, this.dummy.matrix);
      this.ringMesh.setColorAt(
        index,
        this.scratchColor.setHex(index % 3 === 0 ? palette[1] : palette[0]),
      );
    }
    this.ringMesh.instanceMatrix.needsUpdate = true;
    this.ringMesh.instanceColor!.needsUpdate = true;
    this.ringMesh.visible = count > 0 && envelope > 0.002;
  }

  private renderPhantoms(
    effect: MindReaderWisdomEffect,
    count: number,
    progress: number,
    envelope: number,
    elapsed: number,
  ): void {
    const palette = this.getEffectPalette(effect);
    for (let index = 0; index < maximumPhantoms; index += 1) {
      if (index >= count || envelope <= 0.002) {
        this.hideInstance(this.phantomMesh, index);
        continue;
      }
      const chain = index / Math.max(1, count - 1);
      const lag = chain * 0.55;
      const travel = elapsed * (effect === "taito-storm" ? 1.15 : 0.78) - lag;
      let x = Math.cos(travel) * (2.2 + Math.sin(travel * 0.7) * 0.8);
      let y = 0.5 + Math.sin(travel * 1.7) * 1.2 - chain * 0.16;
      let z = Math.sin(travel) * (2.6 + Math.cos(travel * 0.9) * 0.7);
      let scale = (1 - chain * 0.55) * envelope;
      if (effect === "saturn-gravity") {
        const orbit = elapsed * 0.6 + chain * Math.PI * 2;
        const radius = 1.2 + chain * 3.3;
        x = Math.cos(orbit) * radius;
        z = Math.sin(orbit) * radius;
        y = Math.sin(orbit * 2) * 0.55;
        scale = (0.25 + chain * 0.48) * envelope;
      } else if (
        effect === "dragon-flight" ||
        effect === "taito-storm"
      ) {
        // The authored dragon owns the readable serpentine body. Reuse the
        // generic phantom pool as cloud wisps trailing its route.
        const cloudTravel = elapsed * 0.7 - chain * 2.8;
        x = Math.cos(cloudTravel) * (2.4 + chain * 1.5);
        z = Math.sin(cloudTravel) * (2.8 + chain * 1.4);
        y =
          0.35 +
          Math.sin(cloudTravel * 1.6) * 1.1 -
          chain * 0.3;
        scale = (0.34 - chain * 0.14) * envelope;
      } else if (effect === "vajra-cardinals") {
        const arm = index % 4;
        const distance = 0.55 + Math.floor(index / 4) * 0.75;
        x = Math.cos((arm * Math.PI) / 2) * distance;
        z = Math.sin((arm * Math.PI) / 2) * distance;
        y = Math.sin(elapsed * 3 + distance) * 0.08;
        scale = 0.42 * envelope;
      } else if (effect === "armenian-eternity") {
        const spiral = chain * Math.PI * 4 + elapsed * 0.45;
        const radius = 0.5 + chain * 3.5;
        x = Math.cos(spiral) * radius;
        z = Math.sin(spiral) * radius;
        y = this.floorRelativeY + 0.12 + Math.sin(spiral * 2) * 0.18;
        scale = 0.25 * envelope;
      } else if (effect === "psi-collapse") {
        const wave = chain * Math.PI * 4 + elapsed * 1.4;
        const collapse =
          1 - THREE.MathUtils.smoothstep(progress, 0.68, 0.86);
        x = (chain - 0.5) * 6 * collapse;
        z = Math.sin(wave) * 1.15 * collapse;
        y = Math.cos(wave * 0.5) * 0.8 * collapse;
        scale = (0.35 + (1 - collapse) * 1.8) * envelope;
      }
      this.dummy.position.set(x, y, z);
      this.dummy.rotation.set(travel, chain * 5, -travel * 0.5);
      this.dummy.scale.set(
        Math.max(0.001, scale * (index === 0 ? 1.65 : 1)),
        Math.max(0.001, scale * (index === 0 ? 0.8 : 1)),
        Math.max(0.001, scale),
      );
      this.dummy.updateMatrix();
      this.phantomMesh.setMatrixAt(index, this.dummy.matrix);
      this.phantomMesh.setColorAt(
        index,
        this.scratchColor.setHex(index < 3 ? palette[1] : palette[0]),
      );
    }
    this.phantomMesh.instanceMatrix.needsUpdate = true;
    this.phantomMesh.instanceColor!.needsUpdate = true;
    this.phantomMesh.visible = count > 0 && envelope > 0.002;
  }

  private renderComponents(
    effect: MindReaderWisdomEffect,
    progress: number,
    envelope: number,
    elapsed: number,
  ): void {
    let count = 0;
    if (effect === "euro-current" && envelope > 0.002) {
      const candleCount =
        this.quality === "low" ? 8 : this.quality === "medium" ? 11 : 14;
      for (let candle = 0; candle < candleCount; candle += 1) {
        const x = -3.35 + candle * (6.7 / Math.max(1, candleCount - 1));
        const open =
          -0.88 +
          candle * 0.13 +
          Math.sin(candle * 1.73 + elapsed * 0.34) * 0.31;
        const change =
          (hash(candle, 104) > 0.47 ? 1 : -1) *
          (0.2 + hash(candle, 105) * 0.36);
        const close = open + change * Math.min(1, progress * 4);
        const bodyHeight = Math.max(0.12, Math.abs(close - open));
        this.setComponent(
          count,
          x,
          (open + close) / 2,
          -0.2,
          0.24,
          bodyHeight,
          0.12,
          0,
          change >= 0 ? 0x52e18a : 0xff5570,
        );
        count += 1;
      }
    } else if (effect === "circuit-walk" && envelope > 0.002) {
      for (let board = 0; board < circuitBoardCount; board += 1) {
        const layout =
          circuitBoardLayouts[board] ?? circuitBoardLayouts[0];
        const boardX = layout[0];
        const boardZ = layout[1];
        const boardRotation = layout[2];
        this.setComponent(
          count,
          boardX,
          this.floorRelativeY + 0.115,
          boardZ,
          2.25,
          0.07,
          1.42,
          boardRotation,
          board % 2 === 0 ? 0x25b975 : 0x198e62,
        );
        count += 1;
        const chipCount = this.quality === "low" ? 3 : 5;
        for (let chip = 0; chip < chipCount; chip += 1) {
          const localX = -0.72 + (chip % 3) * 0.7;
          const localZ = chip < 3 ? -0.28 : 0.37;
          this.setComponent(
            count,
            boardX + localX,
            this.floorRelativeY + 0.225,
            boardZ + localZ,
            chip % 3 === 1 ? 0.42 : 0.28,
            0.11,
            chip % 2 === 0 ? 0.34 : 0.24,
            boardRotation,
            chip % 3 === 1 ? 0x18384a : color.violet,
          );
          count += 1;
        }
        const capacitorCount = this.quality === "high" ? 3 : 2;
        for (let capacitor = 0; capacitor < capacitorCount; capacitor += 1) {
          this.setComponent(
            count,
            boardX + 0.58 + capacitor * 0.27,
            this.floorRelativeY + 0.36,
            boardZ + 0.42,
            0.12,
            0.42 + capacitor * 0.08,
            0.12,
            boardRotation,
            capacitor % 2 === 0 ? color.cyan : color.amber,
          );
          count += 1;
        }
      }
    }
    this.componentMesh.count = Math.min(count, maximumComponents);
    this.componentMesh.visible = count > 0;
    this.componentMesh.material.uniforms.uOpacity!.value = Math.min(
      0.96,
      envelope * 1.15,
    );
    this.componentMesh.instanceMatrix.needsUpdate = count > 0;
    if (this.componentMesh.instanceColor) {
      this.componentMesh.instanceColor.needsUpdate = count > 0;
    }
  }

  private renderPyramids(
    effect: MindReaderWisdomEffect,
    progress: number,
    envelope: number,
    elapsed: number,
  ): void {
    if (effect !== "desert-memory" || envelope <= 0.002) {
      this.pyramidMesh.count = 0;
      this.pyramidMesh.visible = false;
      return;
    }
    const count =
      this.quality === "low" ? 3 : this.quality === "medium" ? 4 : 6;
    const layouts = [
      [-2.8, -2.4, 1.8],
      [0.1, -3.15, 2.7],
      [3.15, -2.2, 1.45],
      [-3.75, 0.25, 1.15],
      [3.9, 0.65, 1.05],
      [1.65, -0.35, 0.82],
    ] as const;
    for (let index = 0; index < count; index += 1) {
      const layout = layouts[index] ?? layouts[0];
      const growth = THREE.MathUtils.smootherstep(
        progress,
        0.06 + index * 0.025,
        0.34 + index * 0.03,
      );
      const height =
        layout[2] *
        growth *
        (1 + Math.sin(elapsed * 1.6 + index) * 0.018);
      const base = layout[2] * 0.88 * growth;
      this.dummy.position.set(
        layout[0],
        this.floorRelativeY + height / 2,
        layout[1],
      );
      this.dummy.rotation.set(0, Math.PI / 4 + index * 0.17, 0);
      this.dummy.scale.set(
        Math.max(0.001, base),
        Math.max(0.001, height),
        Math.max(0.001, base),
      );
      this.dummy.updateMatrix();
      this.pyramidMesh.setMatrixAt(index, this.dummy.matrix);
      this.pyramidMesh.setColorAt(
        index,
        this.scratchColor.setHex(
          index % 3 === 1 ? 0xffdc72 : 0xeeb76a,
        ),
      );
    }
    this.pyramidMesh.count = count;
    this.pyramidMesh.visible = true;
    this.pyramidMesh.material.uniforms.uOpacity!.value = Math.min(
      0.94,
      envelope * 1.12,
    );
    this.pyramidMesh.instanceMatrix.needsUpdate = true;
    if (this.pyramidMesh.instanceColor) {
      this.pyramidMesh.instanceColor.needsUpdate = true;
    }
  }

  private renderLines(
    effect: MindReaderWisdomEffect,
    progress: number,
    envelope: number,
    elapsed: number,
  ): void {
    this.lineCount = 0;
    const palette = this.getEffectPalette(effect);
    if (envelope > 0.002) {
      switch (effect) {
        case "pinwheel-gust":
          this.drawPinwheelWind(progress, elapsed, palette);
          break;
        case "golden-star":
          this.drawGoldenStar(progress, elapsed, palette);
          break;
        case "golden-ratio":
          this.drawGoldenRatio(progress, elapsed, palette);
          break;
        case "solar-flare":
          this.drawSolarFlares(progress, elapsed, palette);
          break;
        case "clover-court":
        case "florette-vines":
          this.drawGrowingVines(progress, elapsed, palette, effect === "florette-vines");
          break;
        case "iron-heraldry":
          this.drawIronHeraldry(progress, elapsed, palette);
          break;
        case "euro-current":
          this.drawEuroCurrent(progress, elapsed, palette);
          break;
        case "infinity-overflow":
          this.drawInfinity(progress, elapsed, palette);
          break;
        case "circuit-walk":
          this.drawCircuits(progress, elapsed, palette);
          break;
        case "saturn-gravity":
        case "lunar-phases":
          this.drawOrbitalField(progress, elapsed, palette, effect === "saturn-gravity");
          break;
        case "mercury-tide":
          this.drawMercuryWake(progress, elapsed, palette);
          break;
        case "treble-staff":
          this.drawMusicStaff(progress, elapsed, palette);
          break;
        case "desert-memory":
          this.drawDesertMemory(progress, elapsed, palette);
          break;
        case "loss-bounce":
        case "among-us":
          this.drawComicBurst(progress, elapsed, palette);
          break;
        case "bastet-cat":
          this.drawCatSigil(progress, elapsed, palette);
          break;
        case "bamum-ink":
        case "bamum-fold":
        case "bamum-syllabary":
          this.drawBamumEvolution(effect, progress, elapsed, palette);
          break;
        case "dragon-flight":
        case "taito-storm":
          this.drawDragonStorm(progress, elapsed, palette, effect === "taito-storm");
          break;
        case "vajra-cardinals":
          this.drawVajra(progress, elapsed, palette);
          break;
        case "zeta-zeros":
          this.drawZetaPlane(progress, elapsed, palette);
          break;
        case "psi-collapse":
          this.drawQuantumWaves(progress, elapsed, palette);
          break;
        case "armenian-eternity":
          this.drawEternityRose(progress, elapsed, palette);
          break;
      }
    }
    this.lineGeometry.setDrawRange(0, this.lineCount * 2);
    const positionAttribute = this.lineGeometry.getAttribute("position");
    const colorAttribute = this.lineGeometry.getAttribute("color");
    positionAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
    this.lines.visible = this.lineCount > 0;
  }

  private drawPinwheelWind(
    progress: number,
    elapsed: number,
    palette: readonly [number, number],
  ): void {
    for (let blade = 0; blade < 8; blade += 1) {
      const offset = (blade * Math.PI * 2) / 8 + elapsed * 1.7;
      const initialT = 0;
      let previousX = Math.cos(offset) * initialT;
      let previousY = -0.475;
      let previousZ = Math.sin(offset) * initialT;
      for (let step = 1; step <= 28; step += 1) {
        const t = step / 28;
        const angle = offset + t * Math.PI * (2.5 + progress * 2);
        const radius = t * (2.7 + progress * 2.1);
        const x = Math.cos(angle) * radius;
        const y = (t - 0.25) * 1.9;
        const z = Math.sin(angle) * radius + t * 2.1;
        this.addLine(
          previousX,
          previousY,
          previousZ,
          x,
          y,
          z,
          blade % 2 === 0 ? palette[0] : palette[1],
        );
        previousX = x;
        previousY = y;
        previousZ = z;
      }
    }
  }

  private drawGoldenStar(
    progress: number,
    elapsed: number,
    palette: readonly [number, number],
  ): void {
    for (let layer = 0; layer < 4; layer += 1) {
      const radius = (0.7 + layer * 0.78) * Math.min(1, progress * 4);
      const rotation = elapsed * (layer % 2 === 0 ? 0.16 : -0.12);
      for (let point = 0; point < 5; point += 1) {
        const from = (point * 2) % 5;
        const to = ((point + 1) * 2) % 5;
        const fromAngle = rotation - Math.PI / 2 + (from * Math.PI * 2) / 5;
        const toAngle = rotation - Math.PI / 2 + (to * Math.PI * 2) / 5;
        this.addLine(
          Math.cos(fromAngle) * radius,
          layer * 0.16 - 0.25,
          Math.sin(fromAngle) * radius,
          Math.cos(toAngle) * radius,
          layer * 0.16 - 0.25,
          Math.sin(toAngle) * radius,
          layer % 2 === 0 ? palette[0] : palette[1],
        );
      }
    }
    this.drawFlatGoldenSpiral(progress, elapsed, palette);
    this.drawGoldenStarRatioProof(progress, palette);
  }

  private drawFlatGoldenSpiral(
    progress: number,
    elapsed: number,
    palette: readonly [number, number],
  ): void {
    const reveal = THREE.MathUtils.smootherstep(progress, 0, 0.34);
    const totalSegments =
      this.quality === "low" ? 48 : this.quality === "medium" ? 72 : 96;
    const visibleSegments = Math.max(
      1,
      Math.floor(totalSegments * reveal),
    );
    const angleSpan = Math.PI * 4;
    const outerRadius = 3.35;
    const rotation = this.context.reducedMotion ? 0 : elapsed * 0.08;
    const floorY = -0.31;
    const strands =
      this.quality === "low"
        ? [
            [-0.014, 0.994, palette[0]],
            [0.014, 1.006, palette[1]],
          ] as const
        : [
            [-0.018, 0.992, palette[1]],
            [0, 1, color.gold],
            [0.018, 1.008, palette[0]],
          ] as const;
    const pulsePosition =
      fract(elapsed * 0.18) * Math.max(1, visibleSegments);

    // A narrow three-strand ribbon survives the busy star field better than a
    // single one-pixel line. All strands share the same logarithmic curve, so
    // it still reads as one golden spiral emerging from the orb.
    for (const [strand, [angleOffset, radiusScale, strandTint]] of
      strands.entries()) {
      const firstRadius =
        outerRadius *
        radiusScale *
        Math.exp(goldenSpiralGrowth * -angleSpan);
      let previousX = Math.cos(rotation + angleOffset) * firstRadius;
      let previousZ = Math.sin(rotation + angleOffset) * firstRadius;
      for (let segment = 1; segment <= visibleSegments; segment += 1) {
        const t = segment / totalSegments;
        const growthAngle = t * angleSpan;
        const angle = growthAngle + rotation + angleOffset;
        const radius =
          outerRadius *
          radiusScale *
          Math.exp(goldenSpiralGrowth * (growthAngle - angleSpan));
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const directPulseDistance = Math.abs(segment - pulsePosition);
        const pulseDistance = Math.min(
          directPulseDistance,
          Math.max(0, visibleSegments - directPulseDistance),
        );
        this.addLine(
          previousX,
          floorY + strand * 0.012,
          previousZ,
          x,
          floorY + strand * 0.012,
          z,
          pulseDistance < 4.5
            ? color.ivory
            : segment % 11 === 0
              ? palette[1]
              : strandTint,
        );
        previousX = x;
        previousZ = z;
      }
    }
  }

  private drawGoldenStarRatioProof(
    progress: number,
    palette: readonly [number, number],
  ): void {
    const reveal = THREE.MathUtils.smootherstep(progress, 0.03, 0.38);
    const radius = goldenStarProof.radius * reveal;
    const vertexX = (index: number): number =>
      goldenStarProof.centerX +
      Math.cos(Math.PI / 2 - (index * Math.PI * 2) / 5) * radius;
    const vertexY = (index: number): number =>
      goldenStarProof.centerY +
      Math.sin(Math.PI / 2 - (index * Math.PI * 2) / 5) * radius;

    for (let vertex = 0; vertex < 5; vertex += 1) {
      const next = (vertex + 1) % 5;
      this.addLine(
        vertexX(vertex),
        vertexY(vertex),
        goldenStarProof.z,
        vertexX(next),
        vertexY(next),
        goldenStarProof.z,
        color.silver,
      );
      const starNext = (vertex + 2) % 5;
      this.addLine(
        vertexX(vertex),
        vertexY(vertex),
        goldenStarProof.z + 0.01,
        vertexX(starNext),
        vertexY(starNext),
        goldenStarProof.z + 0.01,
        vertex % 2 === 0 ? palette[0] : palette[1],
      );
    }

    const drawMeasuredSegment = (
      start: number,
      end: number,
      tint: number,
    ): void => {
      const ax = vertexX(start);
      const ay = vertexY(start);
      const bx = vertexX(end);
      const by = vertexY(end);
      const length = Math.max(0.001, Math.hypot(bx - ax, by - ay));
      const normalX = (-(by - ay) / length) * 0.018;
      const normalY = ((bx - ax) / length) * 0.018;
      for (const offset of binaryDirections) {
        this.addLine(
          ax + normalX * offset,
          ay + normalY * offset,
          goldenStarProof.z + 0.025,
          bx + normalX * offset,
          by + normalY * offset,
          goldenStarProof.z + 0.025,
          tint,
        );
      }
      const tickHalfLength = 0.11;
      const tickX = (-(by - ay) / length) * tickHalfLength;
      const tickY = ((bx - ax) / length) * tickHalfLength;
      this.addLine(
        ax - tickX,
        ay - tickY,
        goldenStarProof.z + 0.025,
        ax + tickX,
        ay + tickY,
        goldenStarProof.z + 0.025,
        tint,
      );
      this.addLine(
        bx - tickX,
        by - tickY,
        goldenStarProof.z + 0.025,
        bx + tickX,
        by + tickY,
        goldenStarProof.z + 0.025,
        tint,
      );
    };

    // A regular pentagon's diagonal-to-side ratio is exactly φ.
    drawMeasuredSegment(0, 1, color.cyan);
    drawMeasuredSegment(0, 2, color.gold);
  }

  private drawGoldenSpiralConstruction(
    left: number,
    bottom: number,
    height: number,
    diagramZ: number,
    palette: readonly [number, number],
  ): void {
    const width = height * goldenRatio;
    const right = left + width;
    const top = bottom + height;
    this.addLine(left, bottom, diagramZ, right, bottom, diagramZ, palette[0]);
    this.addLine(right, bottom, diagramZ, right, top, diagramZ, palette[1]);
    this.addLine(right, top, diagramZ, left, top, diagramZ, palette[0]);
    this.addLine(left, top, diagramZ, left, bottom, diagramZ, palette[1]);

    // Recursively remove a square from the left, top, right and bottom.
    // A quarter-circle in each square meets the next at the shared edge with
    // the same tangent, producing the familiar Fibonacci approximation of a
    // golden spiral rather than a free curve merely fitted inside the frame.
    let rectangleX = left;
    let rectangleY = bottom;
    let rectangleWidth = width;
    let rectangleHeight = height;
    const squareCount =
      this.quality === "low" ? 5 : this.quality === "medium" ? 7 : 8;
    const arcSegments =
      this.quality === "low" ? 10 : this.quality === "medium" ? 14 : 18;
    for (let square = 0; square < squareCount; square += 1) {
      const direction = square % 4;
      let squareX = rectangleX;
      let squareY = rectangleY;
      let squareSize = 0;
      let centerX = 0;
      let centerY = 0;
      let startAngle = 0;
      let endAngle = 0;

      if (direction === 0) {
        squareSize = rectangleHeight;
        centerX = squareX + squareSize;
        centerY = squareY;
        startAngle = Math.PI;
        endAngle = Math.PI / 2;
        this.addLine(
          squareX + squareSize,
          rectangleY,
          diagramZ,
          squareX + squareSize,
          rectangleY + rectangleHeight,
          diagramZ,
          square % 2 === 0 ? palette[1] : palette[0],
        );
        rectangleX += squareSize;
        rectangleWidth -= squareSize;
      } else if (direction === 1) {
        squareSize = rectangleWidth;
        squareY = rectangleY + rectangleHeight - squareSize;
        centerX = squareX;
        centerY = squareY;
        startAngle = Math.PI / 2;
        endAngle = 0;
        this.addLine(
          rectangleX,
          squareY,
          diagramZ,
          rectangleX + rectangleWidth,
          squareY,
          diagramZ,
          square % 2 === 0 ? palette[1] : palette[0],
        );
        rectangleHeight -= squareSize;
      } else if (direction === 2) {
        squareSize = rectangleHeight;
        squareX = rectangleX + rectangleWidth - squareSize;
        centerX = squareX;
        centerY = squareY + squareSize;
        startAngle = 0;
        endAngle = -Math.PI / 2;
        this.addLine(
          squareX,
          rectangleY,
          diagramZ,
          squareX,
          rectangleY + rectangleHeight,
          diagramZ,
          square % 2 === 0 ? palette[1] : palette[0],
        );
        rectangleWidth -= squareSize;
      } else {
        squareSize = rectangleWidth;
        centerX = squareX + squareSize;
        centerY = squareY + squareSize;
        startAngle = -Math.PI / 2;
        endAngle = -Math.PI;
        this.addLine(
          rectangleX,
          rectangleY + squareSize,
          diagramZ,
          rectangleX + rectangleWidth,
          rectangleY + squareSize,
          diagramZ,
          square % 2 === 0 ? palette[1] : palette[0],
        );
        rectangleY += squareSize;
        rectangleHeight -= squareSize;
      }

      let previousX = centerX + Math.cos(startAngle) * squareSize;
      let previousY = centerY + Math.sin(startAngle) * squareSize;
      for (let segment = 1; segment <= arcSegments; segment += 1) {
        const t = segment / arcSegments;
        const angle = THREE.MathUtils.lerp(startAngle, endAngle, t);
        const x = centerX + Math.cos(angle) * squareSize;
        const y = centerY + Math.sin(angle) * squareSize;
        this.addLine(
          previousX,
          previousY,
          diagramZ,
          x,
          y,
          diagramZ,
          (segment + square) % 7 === 0 ? palette[1] : palette[0],
        );
        previousX = x;
        previousY = y;
      }
    }
  }

  private drawGoldenRatio(
    progress: number,
    _elapsed: number,
    palette: readonly [number, number],
  ): void {
    const reveal = THREE.MathUtils.smootherstep(progress, 0.02, 0.42);
    const diagramZ = -0.08;
    this.drawGoldenSpiralConstruction(
      0.2,
      -0.45,
      2.72 * reveal,
      diagramZ,
      palette,
    );

    const triangleCenterX = -2.55;
    const triangleBase = 1.34 * reveal;
    const triangleSide = triangleBase * goldenRatio;
    const triangleHeight = Math.sqrt(
      Math.max(0, triangleSide * triangleSide - (triangleBase / 2) ** 2),
    );
    const triangleBottom = -0.18;
    this.addLine(
      triangleCenterX - triangleBase / 2,
      triangleBottom,
      diagramZ,
      triangleCenterX + triangleBase / 2,
      triangleBottom,
      diagramZ,
      palette[0],
    );
    this.addLine(
      triangleCenterX + triangleBase / 2,
      triangleBottom,
      diagramZ,
      triangleCenterX,
      triangleBottom + triangleHeight,
      diagramZ,
      palette[1],
    );
    this.addLine(
      triangleCenterX,
      triangleBottom + triangleHeight,
      diagramZ,
      triangleCenterX - triangleBase / 2,
      triangleBottom,
      diagramZ,
      palette[0],
    );
    // Bisect the left 72° base angle. The meeting point divides the opposite
    // φ-length side into lengths 1 and 1/φ, leaving a smaller golden triangle
    // beside its complementary golden gnomon.
    const divisionProgress = 1 / goldenRatio;
    const divisionX = THREE.MathUtils.lerp(
      triangleCenterX,
      triangleCenterX + triangleBase / 2,
      divisionProgress,
    );
    const divisionY = THREE.MathUtils.lerp(
      triangleBottom + triangleHeight,
      triangleBottom,
      divisionProgress,
    );
    this.addLine(
      triangleCenterX - triangleBase / 2,
      triangleBottom,
      diagramZ,
      divisionX,
      divisionY,
      diagramZ,
      palette[1],
    );
  }

  private drawSolarFlares(
    progress: number,
    elapsed: number,
    palette: readonly [number, number],
  ): void {
    for (let flare = 0; flare < 34; flare += 1) {
      const angle = (flare * Math.PI * 2) / 34 + elapsed * 0.13;
      const length =
        1.35 +
        Math.sin(elapsed * 5.5 + flare * 1.7) * 0.62 +
        progress * 3.25;
      const tangent = Math.sin(elapsed * 2.7 + flare) * 0.38;
      let x = Math.cos(angle) * 0.52;
      let y = Math.sin(angle) * 0.52;
      let z = 0;
      for (let step = 1; step <= 4; step += 1) {
        const t = step / 4;
        const branchAngle =
          angle + tangent * t + Math.sin(flare * 7 + step) * 0.04;
        const radius = THREE.MathUtils.lerp(0.52, length, t);
        const nextX = Math.cos(branchAngle) * radius;
        const nextY = Math.sin(branchAngle) * radius;
        const nextZ =
          Math.sin(angle * 3 + elapsed + step * 0.7) * 0.82 * t;
        this.addLine(
          x,
          y,
          z,
          nextX,
          nextY,
          nextZ,
          flare % 3 === 0 ? palette[1] : palette[0],
        );
        x = nextX;
        y = nextY;
        z = nextZ;
      }
    }
  }

  private drawGrowingVines(
    progress: number,
    elapsed: number,
    palette: readonly [number, number],
    flowering: boolean,
  ): void {
    const growth =
      progress < 0.72
        ? THREE.MathUtils.smoothstep(progress, 0.02, 0.55)
        : 1 - THREE.MathUtils.smoothstep(progress, 0.72, 1);
    for (let branch = 0; branch < 10; branch += 1) {
      const angle = (branch * Math.PI * 2) / 10 + Math.sin(elapsed * 0.3) * 0.08;
      let previousX = 0;
      let previousZ = 0;
      for (let step = 1; step <= 18; step += 1) {
        const t = (step / 18) * growth;
        const radius = t * (3.5 + hash(branch, 3) * 2.5);
        const curl = Math.sin(t * 9 + branch) * (0.18 + t * 0.35);
        const x = Math.cos(angle + curl) * radius;
        const z = Math.sin(angle + curl) * radius;
        this.addLine(
          previousX,
          this.floorRelativeY + 0.05,
          previousZ,
          x,
          this.floorRelativeY + 0.05 + Math.sin(t * Math.PI) * 0.08,
          z,
          flowering && step % 4 === 0 ? palette[1] : palette[0],
        );
        previousX = x;
        previousZ = z;
      }
    }
  }

  private drawIronHeraldry(
    progress: number,
    elapsed: number,
    palette: readonly [number, number],
  ): void {
    const reveal = THREE.MathUtils.smootherstep(progress, 0.02, 0.34);
    const centerY = 1.25;
    const outlineScales = [1.16, 0.82] as const;
    for (let layer = 0; layer < outlineScales.length; layer += 1) {
      const scale = outlineScales[layer] ?? outlineScales[0];
      const rotation =
        layer === 1
          ? elapsed * (this.context.reducedMotion ? 0.12 : 0.9)
          : Math.sin(elapsed * 0.42) * 0.045;
      const cosine = Math.cos(rotation);
      const sine = Math.sin(rotation);
      for (let index = 0; index < crossPatteeOutline.length; index += 1) {
        const from = crossPatteeOutline[index]!;
        const to =
          crossPatteeOutline[(index + 1) % crossPatteeOutline.length]!;
        const ax = (from.x * cosine - from.y * sine) * scale * reveal;
        const ay =
          centerY +
          (from.x * sine + from.y * cosine) * scale * reveal;
        const bx = (to.x * cosine - to.y * sine) * scale * reveal;
        const by =
          centerY +
          (to.x * sine + to.y * cosine) * scale * reveal;
        this.addLine(
          ax,
          ay,
          scale > 1 ? -0.1 : -0.06,
          bx,
          by,
          scale > 1 ? -0.1 : -0.06,
          index % 3 === 0 ? palette[1] : palette[0],
        );
      }
    }

    const satelliteCount = this.context.reducedMotion ? 1 : 2;
    for (let satellite = 0; satellite < satelliteCount; satellite += 1) {
      const orbitDirection = satellite === 0 ? 1 : -1;
      const orbitAngle =
        elapsed *
          (this.context.reducedMotion ? 0.08 : 0.58) *
          orbitDirection +
        satellite * Math.PI;
      const orbitRadius = 2.15 + satellite * 0.42;
      const satelliteX = Math.cos(orbitAngle) * orbitRadius;
      const satelliteY =
        centerY + Math.sin(orbitAngle) * orbitRadius * 0.58;
      const rotation =
        elapsed *
        (this.context.reducedMotion
          ? 0.16
          : satellite === 0
            ? 2.7
            : -2.3);
      const cosine = Math.cos(rotation);
      const sine = Math.sin(rotation);
      const scale = 0.12 + reveal * 0.09;
      for (let index = 0; index < crossPatteeOutline.length; index += 1) {
        const from = crossPatteeOutline[index]!;
        const to =
          crossPatteeOutline[
            (index + 1) % crossPatteeOutline.length
          ]!;
        this.addLine(
          satelliteX +
            (from.x * cosine - from.y * sine) * scale,
          satelliteY +
            (from.x * sine + from.y * cosine) * scale,
          0.08 + satellite * 0.04,
          satelliteX + (to.x * cosine - to.y * sine) * scale,
          satelliteY + (to.x * sine + to.y * cosine) * scale,
          0.08 + satellite * 0.04,
          satellite === 0 ? palette[1] : palette[0],
        );
      }
    }
  }

  private drawEuroCurrent(
    progress: number,
    elapsed: number,
    palette: readonly [number, number],
  ): void {
    for (const [railIndex, rail] of euroRails.entries()) {
      this.addLine(
        -3.8,
        rail,
        0,
        3.8,
        rail,
        0,
        railIndex === 0 ? palette[0] : color.silver,
      );
    }
    const candleCount =
      this.quality === "low" ? 8 : this.quality === "medium" ? 11 : 14;
    let previousX = -3.35;
    let previousClose = -0.8;
    for (let candle = 0; candle < candleCount; candle += 1) {
      const x = -3.35 + candle * (6.7 / Math.max(1, candleCount - 1));
      const open =
        -0.88 +
        candle * 0.13 +
        Math.sin(candle * 1.73 + elapsed * 0.34) * 0.31;
      const change =
        (hash(candle, 104) > 0.47 ? 1 : -1) *
        (0.2 + hash(candle, 105) * 0.36) *
        Math.min(1, progress * 4);
      const close = open + change;
      const high =
        Math.max(open, close) + 0.18 + hash(candle, 106) * 0.34;
      const low =
        Math.min(open, close) - 0.18 - hash(candle, 107) * 0.34;
      const tint = change >= 0 ? 0x52e18a : 0xff5570;
      this.addLine(x, low, -0.18, x, high, -0.18, tint);
      this.addLine(
        x - 0.13,
        open,
        -0.16,
        x + 0.13,
        open,
        -0.16,
        tint,
      );
      this.addLine(
        x - 0.13,
        close,
        -0.16,
        x + 0.13,
        close,
        -0.16,
        tint,
      );
      if (candle > 0) {
        this.addLine(
          previousX,
          previousClose,
          0.1,
          x,
          close,
          0.1,
          change >= 0 ? color.green : color.red,
        );
      }
      previousX = x;
      previousClose = close;
    }
  }

  private drawInfinity(
    progress: number,
    elapsed: number,
    palette: readonly [number, number],
  ): void {
    for (let lane = 0; lane < 5; lane += 1) {
      const phase = elapsed * 0.2;
      const radius = 2.2 + lane * 0.28 + progress * 1.1;
      let previousX = Math.sin(phase) * radius;
      let previousY =
        Math.sin(phase * 2) * radius * 0.46 + (lane - 2) * 0.08;
      for (let step = 1; step <= 52; step += 1) {
        const t = (step / 52) * Math.PI * 2;
        const x = Math.sin(t + phase) * radius;
        const y =
          Math.sin((t + phase) * 2) * radius * 0.46 +
          (lane - 2) * 0.08;
        this.addLine(
          previousX,
          previousY,
          lane * 0.11,
          x,
          y,
          lane * 0.11,
          (step + lane) % 3 === 0 ? palette[1] : palette[0],
        );
        previousX = x;
        previousY = y;
      }
    }
    for (let bolt = 0; bolt < 9; bolt += 1) {
      const sign = bolt % 2 === 0 ? 1 : -1;
      let x = sign * (1.4 + (bolt % 3) * 0.5);
      let y = Math.sin(bolt * 1.7) * 0.7;
      for (let step = 0; step < 5; step += 1) {
        const nextX = x + sign * (0.32 + hash(bolt + step, 41) * 0.42);
        const nextY =
          y + (hash(bolt * 7 + step, 42) - 0.5) * 0.72;
        this.addLine(
          x,
          y,
          (bolt - 4) * 0.12,
          nextX,
          nextY,
          (bolt - 4) * 0.12,
          rainbowColors[bolt % rainbowColors.length] ?? palette[1],
        );
        x = nextX;
        y = nextY;
      }
    }
  }

  private drawCircuits(
    progress: number,
    elapsed: number,
    palette: readonly [number, number],
  ): void {
    const reveal = Math.min(1, progress * 3);
    for (let board = 0; board < circuitBoardCount; board += 1) {
      const layout =
        circuitBoardLayouts[board] ?? circuitBoardLayouts[0];
      const cosine = Math.cos(layout[2]);
      const sine = Math.sin(layout[2]);
      for (const [ax, az, bx, bz] of circuitTraceSegments) {
        this.addLine(
          layout[0] + ax * cosine - az * sine,
          this.floorRelativeY + 0.192,
          layout[1] + az * cosine + ax * sine,
          layout[0] + bx * cosine - bz * sine,
          this.floorRelativeY + 0.192,
          layout[1] + bz * cosine + bx * sine,
          board % 2 === 0 ? color.cyan : color.gold,
        );
      }
    }
    const routeCount =
      this.quality === "low" ? 10 : this.quality === "medium" ? 16 : 22;
    for (let route = 0; route < routeCount; route += 1) {
      const destination =
        circuitBoardLayouts[route % circuitBoardCount] ??
        circuitBoardLayouts[0];
      const destinationX =
        destination[0] + (hash(route, 31) - 0.5) * 1.65;
      const destinationZ =
        destination[1] + (hash(route, 32) - 0.5) * 0.88;
      const revealedDestinationX = destinationX * reveal;
      const revealedDestinationZ = destinationZ * reveal;
      let x = 0;
      let y = 0;
      let z = 0;
      const steps = Math.max(1, Math.floor(10 * reveal));
      const tracerStep = Math.floor(
        fract(elapsed * (0.72 + hash(route, 39) * 0.32) + route * 0.17) *
          steps,
      );
      for (let step = 0; step < steps; step += 1) {
        const pathProgress = (step + 1) / steps;
        const horizontal = (route + step) % 2 === 0;
        const detour =
          (hash(route * 17 + step, 8) - 0.5) *
          0.72 *
          (1 - pathProgress);
        const nextX = horizontal
          ? revealedDestinationX * pathProgress
          : x + detour;
        const nextZ = horizontal
          ? z + detour
          : revealedDestinationZ * pathProgress;
        const nextY = THREE.MathUtils.lerp(
          0,
          this.floorRelativeY + 0.09 + route * 0.003,
          Math.min(1, (step + 1) / 3),
        );
        const routeTint =
          step === tracerStep
            ? color.white
            : (step + Math.floor(elapsed * 8)) % 6 === 0
              ? palette[1]
              : route % 4 === 0
                ? color.green
                : palette[0];
        this.addLine(
          x,
          y,
          z,
          nextX,
          nextY,
          nextZ,
          routeTint,
        );
        if (step === tracerStep) {
          this.addLine(
            x,
            y + 0.045,
            z,
            nextX,
            nextY + 0.045,
            nextZ,
            palette[1],
          );
        }
        x = nextX;
        y = nextY;
        z = nextZ;
      }
      this.addLine(
        x,
        y,
        z,
        revealedDestinationX,
        this.floorRelativeY + 0.192,
        revealedDestinationZ,
        route % 4 === 0 ? color.green : palette[0],
      );
    }

    const relayReveal = THREE.MathUtils.smootherstep(progress, 0.2, 0.48);
    if (relayReveal <= 0.002) return;
    const relayOrder =
      circuitRelayOrders[circuitBoardCount - 2] ?? circuitRelayOrders[0];
    const relayTravel =
      fract(elapsed * 0.28) * relayOrder.length;
    const activeRelay = Math.floor(relayTravel);
    const activeRelayProgress = fract(relayTravel);
    const relaySegments = this.quality === "low" ? 6 : 9;
    for (let relay = 0; relay < relayOrder.length; relay += 1) {
      const sourceIndex = relayOrder[relay] ?? 0;
      const destinationIndex =
        relayOrder[(relay + 1) % relayOrder.length] ?? 0;
      const source =
        circuitBoardLayouts[sourceIndex] ?? circuitBoardLayouts[0];
      const destination =
        circuitBoardLayouts[destinationIndex] ?? circuitBoardLayouts[0];
      let previousX: number = source[0];
      let previousY = this.floorRelativeY + 0.24;
      let previousZ: number = source[1];
      for (let segment = 1; segment <= relaySegments; segment += 1) {
        const t = (segment / relaySegments) * relayReveal;
        const x = THREE.MathUtils.lerp(source[0], destination[0], t);
        const z = THREE.MathUtils.lerp(source[1], destination[1], t);
        const y =
          this.floorRelativeY +
          0.24 +
          Math.sin(t * Math.PI) * (0.42 + relay * 0.05);
        const segmentCenter =
          ((segment - 0.5) / relaySegments) * relayReveal;
        const packetDistance = Math.abs(
          segmentCenter - activeRelayProgress * relayReveal,
        );
        const packetActive =
          relay === activeRelay &&
          packetDistance < 1.25 / relaySegments;
        this.addLine(
          previousX,
          previousY,
          previousZ,
          x,
          y,
          z,
          packetActive
            ? color.white
            : relay % 2 === 0
              ? palette[0]
              : palette[1],
        );
        if (packetActive) {
          this.addLine(
            previousX,
            previousY + 0.055,
            previousZ,
            x,
            y + 0.055,
            z,
            color.gold,
          );
        }
        previousX = x;
        previousY = y;
        previousZ = z;
      }
    }
  }

  private drawOrbitalField(
    progress: number,
    elapsed: number,
    palette: readonly [number, number],
    gravity: boolean,
  ): void {
    for (let orbit = 0; orbit < 8; orbit += 1) {
      const radius = 0.7 + orbit * 0.48 + progress * 0.8;
      const direction = orbit % 2 ? -1 : 1;
      const phase = elapsed * 0.08 * direction;
      let previousX = Math.cos(phase) * radius;
      let previousZ = Math.sin(phase) * radius;
      let previousY = gravity
        ? Math.sin(phase * 2 + orbit) * 0.18
        : Math.sin(phase + orbit) * 0.32;
      for (let step = 1; step <= 28; step += 1) {
        const angle = (step / 28) * Math.PI * 2 + phase;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = gravity
          ? Math.sin(angle * 2 + orbit) * 0.18
          : Math.sin(angle + orbit) * 0.32;
        this.addLine(
          previousX,
          previousY,
          previousZ,
          x,
          y,
          z,
          orbit % 3 === 0 ? palette[1] : palette[0],
        );
        previousX = x;
        previousY = y;
        previousZ = z;
      }
    }
  }

  private drawMercuryWake(
    progress: number,
    elapsed: number,
    palette: readonly [number, number],
  ): void {
    const front = -1.6 + progress * 10.4;
    const waveStrength =
      THREE.MathUtils.smoothstep(progress, 0.32, 0.55) *
      (1 - THREE.MathUtils.smoothstep(progress, 0.78, 0.96));
    for (let lane = -5; lane <= 5; lane += 1) {
      let previousX = lane * 0.58;
      let previousZ = front - 2.4;
      for (let step = 1; step <= 12; step += 1) {
        const z = front - 2.4 + step * 0.4;
        const x = lane * 0.58 + Math.sin(z * 2.2 + elapsed * 4 + lane) * 0.12;
        const y =
          this.floorRelativeY +
          0.09 +
          Math.sin(z * 3.4 + elapsed * 5.2 + lane) * 0.08 +
          Math.exp(-Math.pow((z - front) * 1.2, 2)) *
            waveStrength *
            1.65;
        this.addLine(
          previousX,
          y,
          previousZ,
          x,
          y,
          z,
          step % 4 === 0 ? palette[1] : palette[0],
        );
        previousX = x;
        previousZ = z;
      }
    }
  }

  private drawMusicStaff(
    progress: number,
    elapsed: number,
    palette: readonly [number, number],
  ): void {
    const width = Math.min(4.2, progress * 9);
    for (let line = 0; line < 5; line += 1) {
      const y = (line - 2) * 0.24;
      this.addLine(-width, y, 0, width, y, 0, line === 2 ? palette[1] : palette[0]);
    }
    for (let bar = -3; bar <= 3; bar += 1) {
      const x = bar * 1.05 + Math.sin(elapsed * 0.5) * 0.08;
      this.addLine(x, -0.56, 0, x, 0.56, 0, palette[1]);
    }
  }

  private drawDesertMemory(
    progress: number,
    elapsed: number,
    palette: readonly [number, number],
  ): void {
    const size = Math.min(4.4, progress * 9);
    this.addLine(-size, this.floorRelativeY + 0.05, -2.2, 0, 3, -2.2, palette[0]);
    this.addLine(0, 3, -2.2, size, this.floorRelativeY + 0.05, -2.2, palette[1]);
    this.addLine(size, this.floorRelativeY + 0.05, -2.2, -size, this.floorRelativeY + 0.05, -2.2, palette[0]);
    for (let dune = -5; dune <= 5; dune += 1) {
      let previousX = -5.2;
      let previousZ = dune * 0.52;
      for (let step = 1; step <= 12; step += 1) {
        const x = -5.2 + (step / 12) * 10.4;
        const z =
          dune * 0.52 +
          Math.sin(step * 0.88 + dune + elapsed * 2.4) * 0.22;
        this.addLine(
          previousX,
          this.floorRelativeY + 0.08 + (dune + 5) * 0.012,
          previousZ,
          x,
          this.floorRelativeY + 0.08 + (dune + 5) * 0.012,
          z,
          dune % 3 === 0 ? palette[1] : palette[0],
        );
        previousX = x;
        previousZ = z;
      }
    }
    for (let ray = 0; ray < 30; ray += 1) {
      const angle = ray * goldenAngle + elapsed * 0.14;
      const radius = 0.6 + progress * 4.2;
      this.addLine(
        Math.cos(angle) * 0.35,
        Math.sin(angle) * 0.35,
        0,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        Math.sin(angle * 3) * 1.3,
        ray % 4 === 0 ? palette[1] : palette[0],
      );
    }
  }

  private drawComicBurst(
    progress: number,
    elapsed: number,
    palette: readonly [number, number],
  ): void {
    const radius = 0.4 + progress * 4.8;
    for (let ray = 0; ray < 28; ray += 1) {
      const angle = (ray * Math.PI * 2) / 28 + elapsed * 0.06;
      const inner = ray % 2 === 0 ? 0.45 : 0.75;
      this.addLine(
        Math.cos(angle) * inner,
        Math.sin(angle) * inner,
        0,
        Math.cos(angle) * radius * (0.7 + hash(ray, 3) * 0.5),
        Math.sin(angle) * radius * (0.7 + hash(ray, 3) * 0.5),
        (hash(ray, 8) - 0.5) * 1.7,
        ray % 3 === 0 ? palette[1] : palette[0],
      );
    }
  }

  private drawCatSigil(
    progress: number,
    elapsed: number,
    palette: readonly [number, number],
  ): void {
    const radius = 0.6 + Math.min(1, progress * 4) * 2.8;
    for (let point = 0; point < 16; point += 1) {
      const angleA = (point / 16) * Math.PI * 2 + elapsed * 0.16;
      const angleB = ((point + 1) / 16) * Math.PI * 2 + elapsed * 0.16;
      this.addLine(
        Math.cos(angleA) * radius,
        this.floorRelativeY + 0.06,
        Math.sin(angleA) * radius,
        Math.cos(angleB) * radius,
        this.floorRelativeY + 0.06,
        Math.sin(angleB) * radius,
        point % 4 === 0 ? palette[1] : palette[0],
      );
    }
  }

  private drawBamumEvolution(
    effect: MindReaderWisdomEffect,
    progress: number,
    elapsed: number,
    palette: readonly [number, number],
  ): void {
    const stages =
      effect === "bamum-syllabary" ? 14 : effect === "bamum-fold" ? 9 : 7;
    const visible = Math.ceil(stages * Math.min(1, progress * 2.5));
    for (let stage = 0; stage < visible; stage += 1) {
      const t = stage / Math.max(1, stages - 1);
      const x = -3.5 + t * 7;
      const y =
        effect === "bamum-ink"
          ? -0.9 + Math.sin(t * Math.PI * 2.6) * (0.7 + t)
          : -1.1 + Math.sin(t * Math.PI) * 2.8;
      const z =
        effect === "bamum-fold"
          ? (stage % 2 === 0 ? -1 : 1) *
            Math.sin(Math.min(1, progress * 2) * Math.PI) *
            1.05
          : Math.sin(t * Math.PI * 4 + elapsed * 0.5) * 0.7;
      const nextT = (stage + 1) / Math.max(1, stages - 1);
      const nextX = -3.5 + nextT * 7;
      const nextY =
        effect === "bamum-ink"
          ? -0.9 +
            Math.sin(nextT * Math.PI * 2.6) * (0.7 + nextT)
          : -1.1 + Math.sin(nextT * Math.PI) * 2.8;
      const nextZ =
        effect === "bamum-fold"
          ? ((stage + 1) % 2 === 0 ? -1 : 1) *
            Math.sin(Math.min(1, progress * 2) * Math.PI) *
            1.05
          : Math.sin(nextT * Math.PI * 4 + elapsed * 0.5) * 0.7;
      this.addLine(x, y, z, nextX, nextY, nextZ, stage % 3 === 0 ? palette[1] : palette[0]);
      const panelSize = 0.22 + t * 0.18;
      this.addLine(x - panelSize, y - panelSize, z, x + panelSize, y - panelSize, z, palette[0]);
      this.addLine(x + panelSize, y - panelSize, z, x + panelSize, y + panelSize, z, palette[1]);
      this.addLine(x + panelSize, y + panelSize, z, x - panelSize, y + panelSize, z, palette[0]);
      this.addLine(x - panelSize, y + panelSize, z, x - panelSize, y - panelSize, z, palette[1]);
    }
  }

  private drawDragonStorm(
    progress: number,
    elapsed: number,
    palette: readonly [number, number],
    storm: boolean,
  ): void {
    const bolts = storm ? 22 : 10;
    const reveal = Math.min(1, progress * 3);
    for (let bolt = 0; bolt < bolts; bolt += 1) {
      let x = (hash(bolt, 2) - 0.5) * 7;
      let y =
        3.2 +
        hash(bolt, 3) * 1.4 +
        Math.sin(elapsed * 1.4 + bolt) * 0.2;
      let z = (hash(bolt, 4) - 0.5) * 5;
      const visibleSteps = Math.max(
        1,
        Math.ceil((storm ? 6 : 3) * reveal),
      );
      for (let step = 0; step < visibleSteps; step += 1) {
        const nextX = x + (hash(bolt * 9 + step, 6) - 0.5) * 0.8;
        const nextY = y - (0.35 + hash(bolt + step, 7) * 0.6);
        const nextZ = z + (hash(bolt * 5 + step, 8) - 0.5) * 0.65;
        this.addLine(x, y, z, nextX, nextY, nextZ, step % 2 === 0 ? palette[1] : palette[0]);
        x = nextX;
        y = nextY;
        z = nextZ;
      }
    }
  }

  private drawVajra(
    progress: number,
    elapsed: number,
    palette: readonly [number, number],
  ): void {
    const reveal = THREE.MathUtils.smootherstep(progress, 0.02, 0.38);
    const reach = (0.65 + reveal * 3.75) *
      (1 + Math.sin(elapsed * 2.8) * 0.025);
    const rotation = elapsed * 0.1;
    for (let arm = 0; arm < 4; arm += 1) {
      const angle = arm * (Math.PI / 2) + rotation;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      this.addLine(0, 0, 0, dx * reach, 0, dz * reach, palette[0]);
      for (const side of binaryDirections) {
        let previousLongitudinal = vajraProngProfile[0][0] * reach;
        let previousLateral = 0;
        for (
          let segment = 1;
          segment < vajraProngProfile.length;
          segment += 1
        ) {
          const point = vajraProngProfile[segment]!;
          const longitudinal = point[0] * reach;
          const lateral =
            point[1] *
            reach *
            side *
            (1 + Math.sin(elapsed * 3.2 + arm + segment) * 0.06);
          const startX =
            dx * previousLongitudinal - dz * previousLateral;
          const startZ =
            dz * previousLongitudinal + dx * previousLateral;
          const endX = dx * longitudinal - dz * lateral;
          const endZ = dz * longitudinal + dx * lateral;
          this.addLine(
            startX,
            Math.sin(elapsed * 2.6 + arm + segment) * 0.055,
            startZ,
            endX,
            Math.sin(elapsed * 2.6 + arm + segment + 0.4) * 0.055,
            endZ,
            segment % 2 === 0 ? palette[1] : palette[0],
          );
          previousLongitudinal = longitudinal;
          previousLateral = lateral;
        }
      }
      const collar = reach * 0.22;
      const collarHalf = reach * 0.1;
      this.addLine(
        dx * collar - dz * collarHalf,
        0.02,
        dz * collar + dx * collarHalf,
        dx * collar + dz * collarHalf,
        0.02,
        dz * collar - dx * collarHalf,
        palette[1],
      );
    }
    for (let ring = 0; ring < 3; ring += 1) {
      const radius = 0.56 + ring * 0.38;
      for (let segment = 0; segment < 16; segment += 1) {
        const a = (segment / 16) * Math.PI * 2 + elapsed * 0.16 * (ring % 2 ? -1 : 1);
        const b = ((segment + 1) / 16) * Math.PI * 2 + elapsed * 0.16 * (ring % 2 ? -1 : 1);
        this.addLine(
          Math.cos(a) * radius,
          ring * 0.04,
          Math.sin(a) * radius,
          Math.cos(b) * radius,
          ring * 0.04,
          Math.sin(b) * radius,
          ring % 2 === 0 ? palette[0] : palette[1],
        );
      }
    }
  }

  private drawZetaPlane(
    progress: number,
    elapsed: number,
    palette: readonly [number, number],
  ): void {
    const extent = Math.min(3.8, progress * 8);
    const planeY = -1.45;
    // Number line and real-valued trace.
    this.addLine(-extent, 0, 0, extent, 0, 0, palette[0]);
    this.addLine(0, -2.6, 0, 0, 2.6, 0, palette[0]);
    let previousX = -extent;
    let previousY = Math.sin(-extent * 2.1) * 0.7;
    for (let step = 1; step <= 84; step += 1) {
      const x = -extent + (step / 84) * extent * 2;
      const y =
        Math.sin(x * 2.1 + elapsed * 0.35) * (0.55 + Math.cos(x * 0.7) * 0.22) +
        Math.sin(x * 4.7) * 0.18;
      this.addLine(
        previousX,
        previousY,
        0.1,
        x,
        y,
        0.1,
        Math.abs(y) < 0.13 ? palette[1] : palette[0],
      );
      previousX = x;
      previousY = y;
    }
    for (const zero of zetaZeros) {
      const focus = 0.28 + Math.sin(elapsed * 4 + zero) * 0.025;
      this.addLine(zero, -0.48, 0.15, zero, 0.48, 0.15, color.red);
      this.addLine(zero, focus, 0.16, zero + focus, 0, 0.16, color.red);
      this.addLine(zero + focus, 0, 0.16, zero, -focus, 0.16, color.red);
      this.addLine(zero, -focus, 0.16, zero - focus, 0, 0.16, color.red);
      this.addLine(zero - focus, 0, 0.16, zero, focus, 0.16, color.red);
    }
    for (let arc = 0; arc < zetaZeros.length - 1; arc += 1) {
      const start = zetaZeros[arc] ?? 0;
      const end = zetaZeros[arc + 1] ?? start;
      let previousX = start;
      let previousY = 0;
      for (let step = 1; step <= 14; step += 1) {
        const t = step / 14;
        const x = THREE.MathUtils.lerp(start, end, t);
        const y =
          Math.sin(t * Math.PI) *
          (0.55 + arc * 0.22) *
          (0.8 + Math.sin(elapsed * 1.2 + arc) * 0.12);
        this.addLine(
          previousX,
          previousY,
          0.14,
          x,
          y,
          0.14,
          step > 10 ? palette[1] : palette[0],
        );
        previousX = x;
        previousY = y;
      }
    }
    const heightAt = (x: number, z: number): number =>
      planeY +
      0.12 +
      Math.abs(
        Math.sin(x * 1.5 + z * 2.2 + elapsed * 0.28) *
          Math.cos(x * 0.62 - z * 1.35),
      ) *
        0.72;
    // Complex plane: Re and Im axes, a sparse grid, and the zeta magnitude
    // rising out of it. Keeping this orthogonal to the first graph makes the
    // two mathematical views readable as distinct objects in the room.
    this.addLine(-extent, planeY, 0, extent, planeY, 0, palette[0]);
    this.addLine(0, planeY, -2.7, 0, planeY, 2.7, palette[1]);
    for (let grid = -3; grid <= 3; grid += 1) {
      if (grid === 0) continue;
      this.addLine(
        -extent,
        planeY,
        grid * 0.72,
        extent,
        planeY,
        grid * 0.72,
        color.silver,
      );
      this.addLine(
        grid * 0.86,
        planeY,
        -2.7,
        grid * 0.86,
        planeY,
        2.7,
        color.silver,
      );
    }
    for (let lane = -4; lane <= 4; lane += 1) {
      const z = lane * 0.54;
      let previousCurveX = -extent;
      let previousCurveY = heightAt(-extent, z);
      for (let step = 1; step <= 24; step += 1) {
        const x = -extent + (step / 24) * extent * 2;
        const y = heightAt(x, z);
        this.addLine(
          previousCurveX,
          previousCurveY,
          z,
          x,
          y,
          z,
          lane === 0 || step % 7 === 0 ? palette[1] : palette[0],
        );
        previousCurveX = x;
        previousCurveY = y;
      }
    }
    for (let column = -3; column <= 3; column += 1) {
      const x = column * 0.86;
      let previousSurfaceZ = -2.7;
      let previousSurfaceY = heightAt(x, previousSurfaceZ);
      for (let step = 1; step <= 12; step += 1) {
        const z = -2.7 + (step / 12) * 5.4;
        const y = heightAt(x, z);
        this.addLine(
          x,
          previousSurfaceY,
          previousSurfaceZ,
          x,
          y,
          z,
          column === 0 || step % 4 === 0 ? palette[1] : palette[0],
        );
        previousSurfaceY = y;
        previousSurfaceZ = z;
      }
    }
  }

  private drawQuantumWaves(
    progress: number,
    elapsed: number,
    palette: readonly [number, number],
  ): void {
    const collision = THREE.MathUtils.smoothstep(progress, 0.32, 0.68);
    const collapsed = THREE.MathUtils.smoothstep(progress, 0.68, 0.86);
    const separation = THREE.MathUtils.lerp(2.6, 0.18, collision);
    const sheetCount = this.quality === "low" ? 2 : 4;
    const gridSteps = this.quality === "low" ? 10 : 14;
    for (let sheet = 0; sheet < 2; sheet += 1) {
      const direction = sheet === 0 ? -1 : 1;
      const centerZ = direction * separation;
      for (let lane = 0; lane < sheetCount; lane += 1) {
        const laneZ =
          centerZ +
          (lane - (sheetCount - 1) / 2) * 0.42 *
            (1 - collapsed);
        const firstX = -3.6;
        const firstWave =
          Math.exp(-firstX * firstX * 0.32) *
          Math.cos(firstX * 2.5 + elapsed * 1.35 * direction);
        let previousX = firstX;
        let previousY = firstWave * 0.78 * (1 - collapsed);
        for (let step = 1; step <= gridSteps; step += 1) {
          const x = -3.6 + (step / gridSteps) * 7.2;
          const gaussian = Math.exp(-x * x * 0.32);
          const interference =
            Math.cos(x * 2.5 + elapsed * 1.35 * direction) *
            Math.cos(centerZ * 1.4 - elapsed * 0.7);
          const y =
            gaussian * interference * 0.78 * (1 - collapsed) +
            Math.exp(-(x * x + laneZ * laneZ) * 1.9) *
              collapsed *
              3.5;
          this.addLine(
            previousX,
            previousY,
            laneZ,
            x,
            y,
            laneZ,
            sheet === 0 ? palette[0] : palette[1],
          );
          previousX = x;
          previousY = y;
        }
      }
      for (let cross = 0; cross <= gridSteps; cross += 2) {
        const x = -3.6 + (cross / gridSteps) * 7.2;
        let previousZ = centerZ - ((sheetCount - 1) * 0.42) / 2;
        let previousY = 0;
        for (let lane = 0; lane < sheetCount; lane += 1) {
          const z =
            centerZ +
            (lane - (sheetCount - 1) / 2) * 0.42 *
              (1 - collapsed);
          const gaussian = Math.exp(-x * x * 0.32);
          const y =
            gaussian *
              Math.cos(x * 2.5 + elapsed * 1.35 * direction) *
              0.78 *
              (1 - collapsed) +
            Math.exp(-(x * x + z * z) * 1.9) * collapsed * 3.5;
          if (lane > 0) {
            this.addLine(
              x,
              previousY,
              previousZ,
              x,
              y,
              z,
              sheet === 0 ? palette[0] : palette[1],
            );
          }
          previousY = y;
          previousZ = z;
        }
      }
    }
    if (collapsed > 0.02) {
      for (let ray = 0; ray < 18; ray += 1) {
        const angle = (ray / 18) * Math.PI * 2;
        const radius = (1 - collapsed) * 1.2 + 0.12;
        this.addLine(
          Math.cos(angle) * radius,
          0,
          Math.sin(angle) * radius,
          0,
          3.8 * collapsed,
          0,
          ray % 2 === 0 ? palette[0] : palette[1],
        );
      }
    }
  }

  private drawEternityRose(
    progress: number,
    elapsed: number,
    palette: readonly [number, number],
  ): void {
    const bloom = Math.min(1, progress * 3);
    for (let arm = 0; arm < 8; arm += 1) {
      let previousX = 0;
      let previousZ = 0;
      for (let step = 1; step <= 24; step += 1) {
        const t = (step / 24) * bloom;
        const angle =
          (arm * Math.PI * 2) / 8 +
          t * Math.PI * 1.35 +
          elapsed * (arm % 2 === 0 ? 0.12 : -0.12);
        const radius = t * 4.2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        this.addLine(
          previousX,
          this.floorRelativeY + 0.06,
          previousZ,
          x,
          this.floorRelativeY + 0.06 + Math.sin(t * Math.PI) * 0.12,
          z,
          arm % 2 === 0 ? palette[0] : palette[1],
        );
        previousX = x;
        previousZ = z;
      }
    }
  }

  private updateMercury(
    progress: number,
    envelope: number,
    elapsed: number,
    delta: number,
  ): void {
    this.mercurySheet.visible = envelope > 0.002;
    this.mercuryMaterial.opacity = envelope * 0.58;
    const positions = this.mercuryGeometry.getAttribute("position");
    const front = -1.6 + progress * 10.4;
    const tidalEnvelope =
      THREE.MathUtils.smoothstep(progress, 0.28, 0.5) *
      (1 - THREE.MathUtils.smoothstep(progress, 0.82, 0.98));
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      const crest = Math.exp(-Math.pow((z - front) * 0.72, 2));
      positions.setY(
        index,
        0.025 +
          Math.sin(z * 2.5 + x * 1.1 + elapsed * 5.4) * 0.055 +
          crest * (0.8 + tidalEnvelope * 1.45) * envelope,
      );
    }
    positions.needsUpdate = true;
    if (this.context.reducedMotion) {
      this.mercuryPushStrength = 0;
      this.mercuryPushLateral = 0;
      return;
    }
    this.context.copyPlayerPosition(this.playerWorld);
    this.playerLocal.copy(this.playerWorld);
    this.parent.worldToLocal(this.playerLocal);
    const relativeX = this.playerLocal.x - this.orbOrigin.x;
    const relativeZ = this.playerLocal.z - this.orbOrigin.z;
    let targetPush = 0;
    let targetLateral = 0;
    if (
      Math.abs(relativeX) < 3.3 &&
      progress > 0.16 &&
      progress < 0.86
    ) {
      const crestDistance = Math.abs(relativeZ - front);
      const crestInfluence =
        1 - THREE.MathUtils.smoothstep(crestDistance, 0.12, 1.36);
      targetPush =
        crestInfluence * envelope * (4.7 + tidalEnvelope * 7.2);
      targetLateral =
        Math.sin(elapsed * 0.82 + relativeX * 0.38) *
        crestInfluence *
        0.72;
    }
    const follow = 1 - Math.exp(-delta * 6.5);
    this.mercuryPushStrength = THREE.MathUtils.lerp(
      this.mercuryPushStrength,
      targetPush,
      follow,
    );
    this.mercuryPushLateral = THREE.MathUtils.lerp(
      this.mercuryPushLateral,
      targetLateral,
      follow,
    );
    if (
      this.mercuryPushStrength > 0.015 ||
      Math.abs(this.mercuryPushLateral) > 0.015
    ) {
      this.context.applyPlayerDrift(
        this.mercuryPushLateral * delta,
        this.mercuryPushStrength * delta,
      );
    }
  }

  private updateCat(
    progress: number,
    envelope: number,
    elapsed: number,
  ): void {
    this.cat.visible = true;
    this.catMaterial.opacity = Math.min(0.82, envelope * 1.15);
    const age = this.effectAge;
    if (age < catSwatTime) {
      const approach = THREE.MathUtils.smootherstep(age, 0.12, catSwatTime);
      this.cat.position.set(
        THREE.MathUtils.lerp(-3.4, -0.72, approach),
        this.floorRelativeY +
          Math.sin(approach * Math.PI) * (this.context.reducedMotion ? 0.18 : 0.72),
        THREE.MathUtils.lerp(1.6, 0.38, approach),
      );
      this.cat.rotation.y = -0.2 + approach * 0.45;
      this.cat.rotation.z = Math.sin(approach * Math.PI) * -0.16;
    } else {
      const retreat = THREE.MathUtils.smoothstep(
        age,
        catSwatTime,
        catSwatTime + 1.1,
      );
      this.cat.position.set(
        THREE.MathUtils.lerp(-0.72, 1.45, retreat),
        this.floorRelativeY,
        THREE.MathUtils.lerp(0.38, 0.92, retreat),
      );
      this.cat.rotation.y = THREE.MathUtils.lerp(0.25, Math.PI * 0.92, retreat);
      this.cat.rotation.z = 0;
    }
    this.cat.scale.setScalar(
      (0.82 + Math.sin(elapsed * 5) * 0.025) *
        Math.min(1, envelope * 2.2),
    );
    if (this.catTail) {
      this.catTail.rotation.x = Math.sin(elapsed * 4.2) * 0.24;
    }
    if (this.catPaw) {
      const swat = 1 - Math.min(1, Math.abs(age - catSwatTime) / 0.32);
      this.catPaw.rotation.z = -1.08 - swat * 1.1;
    }
    void progress;
  }

  private updateDragon(
    storm: boolean,
    envelope: number,
    elapsed: number,
  ): void {
    this.dragon.visible = envelope > 0.002;
    this.dragonMaterial.color.setHex(storm ? color.cyan : color.violet);
    this.dragonMaterial.opacity = envelope * (storm ? 0.82 : 0.68);
    const travel = elapsed * (storm ? 1.15 : 0.78);
    this.dragon.position.set(0, 0, 0);
    this.dragon.rotation.set(0, 0, 0);
    this.dragon.scale.setScalar(
      (storm ? 1.08 : 0.88) *
        envelope *
        (1 + Math.sin(elapsed * 4.5) * 0.05),
    );
    if (this.dragonHeadRig) {
      this.sampleDragonPath(travel, storm, this.scratchPosition);
      this.sampleDragonPath(travel + 0.025, storm, this.scratchPositionB);
      this.scratchTangent
        .subVectors(this.scratchPositionB, this.scratchPosition)
        .normalize();
      this.scratchQuaternion.setFromUnitVectors(
        this.dragonForward,
        this.scratchTangent,
      );
      this.dragonHeadRig.position.copy(this.scratchPosition);
      this.dragonHeadRig.quaternion.copy(this.scratchQuaternion);
    }
    for (let index = 0; index < binaryDirections.length; index += 1) {
      const side = binaryDirections[index]!;
      const whisker = this.dragonWhiskers[index];
      if (whisker) whisker.rotation.x = Math.sin(elapsed * 5 + side) * 0.2;
    }
    const body = this.dragonBody;
    if (body instanceof THREE.InstancedMesh) {
      for (let segment = 0; segment < body.count; segment += 1) {
        const lag = segment + 1;
        const taper = 1 - segment / (body.count * 1.25);
        const segmentTravel = travel - lag * (storm ? 0.17 : 0.205);
        this.sampleDragonPath(
          segmentTravel,
          storm,
          this.scratchPosition,
        );
        this.sampleDragonPath(
          segmentTravel + 0.025,
          storm,
          this.scratchPositionB,
        );
        this.scratchTangent
          .subVectors(this.scratchPositionB, this.scratchPosition)
          .normalize();
        this.scratchQuaternion.setFromUnitVectors(
          this.dragonForward,
          this.scratchTangent,
        );
        this.dummy.position.copy(this.scratchPosition);
        this.dummy.quaternion.copy(this.scratchQuaternion);
        this.dummy.scale.set(
          Math.max(0.28, taper * 1.18),
          Math.max(0.28, taper * 0.82),
          Math.max(0.28, taper * 0.92),
        );
        this.dummy.updateMatrix();
        body.setMatrixAt(segment, this.dummy.matrix);
      }
      body.instanceMatrix.needsUpdate = true;
    }
    const tail = this.dragonTail;
    if (tail) {
      const tailTravel =
        travel - (body instanceof THREE.InstancedMesh ? body.count + 1 : 17) *
          (storm ? 0.17 : 0.205);
      this.sampleDragonPath(tailTravel, storm, this.scratchPosition);
      this.sampleDragonPath(
        tailTravel + 0.025,
        storm,
        this.scratchPositionB,
      );
      this.scratchTangent
        .subVectors(this.scratchPositionB, this.scratchPosition)
        .normalize()
        .negate();
      this.scratchQuaternion.setFromUnitVectors(
        this.dragonForward,
        this.scratchTangent,
      );
      tail.position.copy(this.scratchPosition);
      tail.quaternion.copy(this.scratchQuaternion);
      tail.scale.setScalar(0.72);
    }
  }

  private sampleDragonPath(
    travel: number,
    storm: boolean,
    target: THREE.Vector3,
  ): THREE.Vector3 {
    const stormStretch = storm ? 1.12 : 1;
    const radiusX =
      (2.35 + Math.sin(travel * 0.7) * 0.82) * stormStretch;
    const radiusZ =
      (2.82 + Math.cos(travel * 0.9) * 0.74) * stormStretch;
    return target.set(
      Math.cos(travel) * radiusX,
      0.55 +
        Math.sin(travel * 1.43) * (storm ? 1.42 : 1.18) +
        Math.sin(travel * 0.37) * 0.32,
      Math.sin(travel) * radiusZ,
    );
  }

  private applyEnvironmentalForce(
    effect: MindReaderWisdomEffect,
    progress: number,
    delta: number,
  ): void {
    if (
      this.context.reducedMotion ||
      (effect !== "saturn-gravity" && effect !== "pinwheel-gust")
    ) {
      return;
    }
    if (progress < 0.18 || progress > 0.82) return;
    this.context.copyPlayerPosition(this.playerWorld);
    this.orbWorld.copy(this.orbOrigin);
    this.parent.localToWorld(this.orbWorld);
    const dx = this.orbWorld.x - this.playerWorld.x;
    const dz = this.orbWorld.z - this.playerWorld.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 1.4 || distance > 7.2) return;
    if (effect === "pinwheel-gust") {
      const push = (1 - distance / 7.2) * delta * 4.8;
      this.context.applyPlayerDrift(
        (dz / distance) * push + (-dx / distance) * push * 0.32,
        (-dx / distance) * push + (-dz / distance) * push * 0.32,
      );
      return;
    }
    const pull = (1 - distance / 7.2) * delta * 1.05;
    this.context.applyPlayerDrift(
      (dx / distance) * pull,
      (dz / distance) * pull,
    );
  }

  private knockOrbOver(): void {
    if (this.orbState !== "home") return;
    this.context.root.attach(this.orbAssembly);
    this.orbState = "fallen";
    this.orbStateAge = 0;
    this.orbHomeMarker.visible = true;
    this.looseOrb.enabled = true;
    this.looseOrb.velocity.set(4.8, 3.7, 2.35);
    this.syncLooseOrb();
    this.context.refreshCollisionDebug();
    this.onOrbKnocked();
  }

  private updateOrb(delta: number): void {
    this.orbStateAge += delta;
    const held = this.looseOrb.enabled && this.looseOrb.held;
    if (held) {
      if (this.orbState !== "held") {
        this.orbState = "held";
        this.orbStateAge = 0;
      }
    } else if (this.orbState === "held") {
      this.orbState = "fallen";
      this.orbStateAge = 0;
      if (this.isOrbNearSocket()) {
        this.beginOrbRestore();
      } else if (this.orbAssembly.parent !== this.context.root) {
        this.context.root.attach(this.orbAssembly);
      }
    }

    if (this.orbState === "restoring") {
      const progress = THREE.MathUtils.smootherstep(
        this.orbStateAge,
        0,
        this.context.reducedMotion ? 0.22 : 0.72,
      );
      this.orbAssembly.position
        .copy(this.orbRestoreStart)
        .lerp(this.orbRestoreTarget, progress);
      this.orbAssembly.position.y +=
        Math.sin(progress * Math.PI) *
        (this.context.reducedMotion ? 0.08 : 0.52);
      this.orbVisual.rotation.x *= 1 - progress;
      this.orbVisual.rotation.y *= 1 - progress;
      this.orbVisual.rotation.z *= 1 - progress;
      this.orbAnswerRoll = THREE.MathUtils.lerp(
        this.orbAnswerRoll,
        0,
        progress,
      );
      this.orbAnswer.material.rotation = this.orbAnswerRoll;
      if (progress >= 1) {
        this.orbSocket.attach(this.orbAssembly);
        this.orbAssembly.position.copy(this.orbHome);
        this.orbAssembly.rotation.set(0, 0, 0);
        this.orbAssembly.scale.set(1, 1, 1);
        this.orbVisual.rotation.set(0, 0, 0);
        this.orbAnswerRoll = 0;
        this.orbAnswer.material.rotation = 0;
        this.orbState = "home";
        this.orbHomeMarker.visible = false;
        this.looseOrb.velocity.set(0, 0, 0);
        this.context.refreshCollisionDebug();
        this.onOrbRecovered();
      }
    } else if (this.looseOrb.enabled) {
      const planarSpeed = Math.hypot(
        this.looseOrb.velocity.x,
        this.looseOrb.velocity.z,
      );
      if (planarSpeed > 0.002) {
        const roll = (planarSpeed * delta) / Math.max(0.1, this.looseOrb.radius);
        this.orbVisual.rotateOnWorldAxis(
          this.scratchPosition
            .set(this.looseOrb.velocity.z, 0, -this.looseOrb.velocity.x)
            .normalize(),
          roll,
        );
        this.orbAnswerRoll +=
          ((this.looseOrb.velocity.x * 0.72 -
            this.looseOrb.velocity.z * 0.38) *
            delta) /
          Math.max(0.1, this.looseOrb.radius);
        this.orbAnswerRoll = Math.atan2(
          Math.sin(this.orbAnswerRoll),
          Math.cos(this.orbAnswerRoll),
        );
        this.orbAnswer.material.rotation = this.orbAnswerRoll;
      }
    }
    this.syncLooseOrb();
    if (this.orbHomeMarker.visible) {
      const markerPulse =
        1 +
        Math.sin(this.orbStateAge * 4.4) *
          (this.context.reducedMotion ? 0.03 : 0.12);
      this.orbHomeMarker.scale.setScalar(markerPulse);
      (
        this.orbHomeMarker.material as THREE.MeshBasicMaterial
      ).opacity = 0.56 + Math.sin(this.orbStateAge * 5.1) * 0.16;
    }
  }

  private beginOrbRestore(): void {
    if (this.orbState === "home" || this.orbState === "restoring") return;
    this.looseOrb.enabled = false;
    this.looseOrb.velocity.set(0, 0, 0);
    this.orbState = "restoring";
    this.orbStateAge = 0;
    this.orbRestoreStart.copy(this.orbAssembly.position);
    this.orbRestoreTarget.copy(this.orbHome);
    this.orbSocket.localToWorld(this.orbRestoreTarget);
    this.context.root.worldToLocal(this.orbRestoreTarget);
    this.syncLooseOrb();
  }

  private isOrbNearSocket(): boolean {
    this.orbAssembly.getWorldPosition(this.orbWorld);
    this.scratchPosition.copy(this.orbHome);
    this.orbSocket.localToWorld(this.scratchPosition);
    return (
      Math.hypot(
        this.orbWorld.x - this.scratchPosition.x,
        this.orbWorld.z - this.scratchPosition.z,
      ) <= orbRecoveryRadius
    );
  }

  private syncLooseOrb(): void {
    this.orbAssembly.getWorldPosition(this.orbWorld);
    this.orbVisual.getWorldScale(this.orbWorldScale);
    const radius =
      orbVisualRadius *
      Math.max(
        this.orbWorldScale.x,
        this.orbWorldScale.y,
        this.orbWorldScale.z,
      );
    this.looseOrb.radius = radius;
    this.travelingOrb.radius = radius;
    this.travelingOrb.restingY = radius;
    this.travelingOrb.enabled =
      this.looseOrb.enabled && this.orbAssembly.visible;
    this.travelingOrb.held = this.looseOrb.held;
    this.orbSurface.x = this.orbWorld.x;
    this.orbSurface.z = this.orbWorld.z;
    this.orbSurface.height = this.orbWorld.y + radius;
    this.orbSurface.halfWidth = radius * 0.82;
    this.orbSurface.halfDepth = radius * 0.82;
    this.orbSurface.enabled =
      this.travelingOrb.enabled && !this.travelingOrb.held;
  }

  private setToken(
    index: number,
    token: string,
    x: number,
    y: number,
    z: number,
    size: number,
    opacity: number,
    tint: number,
  ): void {
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.setScalar(Math.max(0.001, size));
    this.dummy.updateMatrix();
    this.tokenMesh.setMatrixAt(index, this.dummy.matrix);
    this.tokenIndexAttribute.setX(index, tokenIndex.get(token) ?? 0);
    this.tokenOpacityAttribute.setX(index, opacity);
    this.tokenMesh.setColorAt(index, this.scratchColor.setHex(tint));
  }

  private hideToken(index: number): void {
    this.hideInstance(this.tokenMesh, index);
    this.tokenOpacityAttribute.setX(index, 0);
  }

  private hideInstance(mesh: THREE.InstancedMesh, index: number): void {
    this.dummy.position.set(0, hiddenY, 0);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }

  private hideAllInstances(): void {
    for (let index = 0; index < maximumMotes; index += 1) {
      this.hideInstance(this.moteMesh, index);
    }
    for (let index = 0; index < maximumTokens; index += 1) {
      this.hideToken(index);
    }
    for (let index = 0; index < maximumRings; index += 1) {
      this.hideInstance(this.ringMesh, index);
    }
    for (let index = 0; index < maximumPhantoms; index += 1) {
      this.hideInstance(this.phantomMesh, index);
    }
    this.moteMesh.instanceMatrix.needsUpdate = true;
    this.tokenMesh.instanceMatrix.needsUpdate = true;
    this.ringMesh.instanceMatrix.needsUpdate = true;
    this.phantomMesh.instanceMatrix.needsUpdate = true;
    this.tokenOpacityAttribute.needsUpdate = true;
    this.lineCount = 0;
    this.lineGeometry.setDrawRange(0, 0);
    this.moteMesh.visible = false;
    this.tokenMesh.visible = false;
    this.ringMesh.visible = false;
    this.phantomMesh.visible = false;
    this.componentMesh.count = 0;
    this.componentMesh.visible = false;
    this.pyramidMesh.count = 0;
    this.pyramidMesh.visible = false;
    this.lines.visible = false;
  }

  private setComponent(
    index: number,
    x: number,
    y: number,
    z: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
    rotationY: number,
    tint: number,
  ): void {
    if (index >= maximumComponents) return;
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(0, rotationY, 0);
    this.dummy.scale.set(scaleX, scaleY, scaleZ);
    this.dummy.updateMatrix();
    this.componentMesh.setMatrixAt(index, this.dummy.matrix);
    this.componentMesh.setColorAt(
      index,
      this.scratchColor.setHex(tint),
    );
  }

  private addLine(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    tint: number,
  ): void {
    if (
      this.lineCount >= maximumLineSegments ||
      this.lineCount >= this.limits.lineSegments
    ) {
      return;
    }
    const offset = this.lineCount * 6;
    this.linePositions[offset] = ax;
    this.linePositions[offset + 1] = ay;
    this.linePositions[offset + 2] = az;
    this.linePositions[offset + 3] = bx;
    this.linePositions[offset + 4] = by;
    this.linePositions[offset + 5] = bz;
    this.scratchColor.setHex(tint);
    for (let vertex = 0; vertex < 2; vertex += 1) {
      const colorOffset = offset + vertex * 3;
      this.lineColors[colorOffset] = this.scratchColor.r;
      this.lineColors[colorOffset + 1] = this.scratchColor.g;
      this.lineColors[colorOffset + 2] = this.scratchColor.b;
    }
    this.lineCount += 1;
  }

  private getEffectPalette(
    effect: MindReaderWisdomEffect,
  ): readonly [number, number] {
    return wisdomEffectPalettes[effect];
  }

  private getInstanceTint(
    effect: MindReaderWisdomEffect,
    index: number,
    palette: readonly [number, number],
  ): number {
    if (effect === "infinity-overflow") {
      return rainbowColors[index % rainbowColors.length] ?? palette[0];
    }
    return index % 4 === 0 ? palette[1] : palette[0];
  }

  private getEffectTokens(effect: MindReaderWisdomEffect): readonly string[] {
    return wisdomEffectTokens[effect];
  }
}
