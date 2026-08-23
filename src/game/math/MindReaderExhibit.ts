import * as THREE from "three";
import { MindReaderGlyphField } from "./MindReaderGlyphField";
import {
  MindReaderWisdomEffects,
  type MindReaderWisdomEffect,
} from "./MindReaderWisdomEffects";
import type {
  MathQualityTier,
  MathSpellStage,
  MathTravelingBody,
  MightymaticaZoneContext,
} from "./types";

type MindReaderVectorId = "pinwheel" | "star" | "phi" | "sun";
interface MindReaderSymbolCopy {
  name: string;
  fact: string;
  effect: MindReaderWisdomEffect;
}
type MindReaderSymbol =
  | (MindReaderSymbolCopy & {
      kind: "vector";
      id: MindReaderVectorId;
    })
  | (MindReaderSymbolCopy & {
      kind: "glyph";
      glyph: string;
      scale?: number;
      xScale?: number;
      xOffset?: number;
      yOffset?: number;
    })
  | (MindReaderSymbolCopy & {
      kind: "loss";
    });
const recoveredSymbols = [
  {
    kind: "vector",
    id: "pinwheel",
    name: "five-bladed pinwheel",
    fact:
      "Mirror the fold of its blades and the same airflow makes it spin in the opposite direction, a simple demonstration of chirality.",
    effect: "pinwheel-gust",
  },
  {
    kind: "vector",
    id: "star",
    name: "star medallion",
    fact:
      "In a regular pentagram, each diagonal is φ times a side of its surrounding pentagon: approximately 1.618 to 1.",
    effect: "golden-star",
  },
  {
    kind: "vector",
    id: "phi",
    name: "lowercase phi",
    fact:
      "Mathematicians commonly use it for the golden ratio, approximately 1.618.",
    effect: "golden-ratio",
  },
  {
    kind: "vector",
    id: "sun",
    name: "dotted sun",
    fact:
      "Astronomy writes the Sun as ☉, a circle with a central dot; Yuri’s mark adds a dotted corona.",
    effect: "solar-flare",
  },
] as const satisfies readonly MindReaderSymbol[];
// Stable, highly readable anchors keep each round visually coherent. Three
// stranger marks rotate through the remaining slots so the answer pattern is
// concealed without turning one chart into an exhaustive Unicode catalogue.
const coreSymbols = [
  {
    kind: "glyph",
    glyph: "♣",
    name: "club suit",
    fact:
      "French cards call this suit trèfle, or clover; English cards call the same shape clubs.",
    effect: "clover-court",
    scale: 1.7,
  },
  {
    kind: "glyph",
    glyph: "✠",
    name: "cross pattée (✠)",
    fact:
      "Unicode labels ✠ “MALTESE CROSS,” although its broad-ended form is famously used for Germany’s Iron Cross.",
    effect: "iron-heraldry",
    scale: 1.72,
  },
  {
    kind: "glyph",
    glyph: "€",
    name: "euro sign",
    fact:
      "Its design invokes Greek epsilon and E for Europe; the parallel bars suggest stability.",
    effect: "euro-current",
    scale: 1.66,
  },
  {
    kind: "glyph",
    glyph: "∞",
    name: "infinity loop",
    fact:
      "John Wallis introduced ∞ in 1655; why he chose a sideways eight is uncertain.",
    effect: "infinity-overflow",
    scale: 1.78,
  },
  {
    kind: "glyph",
    glyph: "⌘",
    name: "place-of-interest knot",
    fact:
      "Apple borrowed ⌘ for its Command key from a Nordic map symbol marking places of interest.",
    effect: "circuit-walk",
    scale: 1.66,
  },
  {
    kind: "glyph",
    glyph: "♄",
    name: "Saturn sign",
    fact:
      "Its hooked shape is traditionally read as the sickle or scythe of the Roman god Saturn.",
    effect: "saturn-gravity",
    scale: 1.7,
  },
  {
    kind: "glyph",
    glyph: "☿",
    name: "Mercury sign",
    fact:
      "In alchemy, the planet’s mark also represented quicksilver: the metallic element mercury.",
    effect: "mercury-tide",
    scale: 1.7,
  },
  {
    kind: "glyph",
    glyph: "☾",
    name: "last-quarter Moon",
    fact:
      "The phase marks the Moon’s place in its orbit rather than its lit fraction; it looks half-full and rises near midnight.",
    effect: "lunar-phases",
    scale: 1.78,
  },
  {
    kind: "glyph",
    glyph: "✾",
    name: "six-petalled florette (✾)",
    fact:
      "Printers called ornaments like this fleurons or printer’s flowers, casting them as metal type and repeating them into dividers and borders.",
    effect: "florette-vines",
    scale: 1.72,
  },
  {
    kind: "glyph",
    glyph: "𝄞",
    name: "treble clef",
    fact:
      "It curls around the staff’s second line, declaring that line to be the note G.",
    effect: "treble-staff",
    scale: 1.72,
    yOffset: 0.08,
  },
  {
    kind: "glyph",
    glyph: "𓁶",
    name: "Egyptian head hieroglyph",
    fact:
      "It could represent the word “head,” transliterated as “tp” because hieroglyphs left its unknown vowels unwritten.",
    effect: "desert-memory",
    scale: 2.28,
    xScale: 1.12,
    yOffset: 0.08,
  },
  {
    kind: "loss",
    name: "struck-through Loss sigil",
    fact:
      "Its four-panel geometry abstracts Loss, a 2008 webcomic whose layout became an internet shorthand.",
    effect: "loss-bounce",
  },
] as const satisfies readonly MindReaderSymbol[];
const rotatingSymbols = [
  {
    kind: "glyph",
    glyph: "ඞ",
    name: "Sinhala letter nga (ඞ)",
    fact:
      "It represents the “ng” in “sing”; online, its shape is also compared to a crewmate from Among Us.",
    effect: "among-us",
    scale: 1.72,
  },
  {
    kind: "glyph",
    glyph: "𓃠",
    name: "Egyptian cat hieroglyph",
    fact:
      "For Egyptians, the animal guarded homes from vermin and embodied Bastet, a protective goddess associated with fertility and prosperity.",
    effect: "bastet-cat",
    scale: 2.08,
    xOffset: 0.1,
    yOffset: 0.16,
  },
  {
    kind: "glyph",
    glyph: "𖣐",
    name: "Bamum Phase-C letter Ngom",
    fact:
      "King Ibrahim Njoya created Bamum writing for the Bamum language of western Cameroon.",
    effect: "bamum-ink",
    scale: 1.65,
  },
  {
    kind: "glyph",
    glyph: "𖤍",
    name: "Bamum Phase-D letter Yen",
    fact:
      "Its historical writing stages preserve the transition from pictographs to a compact syllabary.",
    effect: "bamum-fold",
    scale: 1.65,
  },
  {
    kind: "glyph",
    glyph: "𖤓",
    name: "Bamum Phase-D letter Ngkyee",
    fact:
      "The script evolved from pictographs toward a semi-syllabary in roughly fourteen years.",
    effect: "bamum-syllabary",
    scale: 1.65,
  },
  {
    kind: "glyph",
    glyph: "龘",
    name: "three-dragon ideograph 龘",
    fact:
      "Its reading is “dá”; its 48 strokes describe the appearance of dragons in flight.",
    effect: "dragon-flight",
    scale: 1.24,
  },
  {
    kind: "glyph",
    glyph: "࿇",
    name: "Tibetan crossed vajra",
    fact:
      "Its four vajra heads point to the cardinal directions and symbolize absolute stability.",
    effect: "vajra-cardinals",
    scale: 1.76,
  },
  {
    kind: "glyph",
    glyph: "ζ",
    name: "Greek lowercase zeta (ζ)",
    fact:
      "In mathematics, it famously labels a function connecting a sum over integers to a product over prime numbers.",
    effect: "zeta-zeros",
    scale: 1.72,
  },
  {
    kind: "glyph",
    glyph: "Ψ",
    name: "Greek capital psi (Ψ)",
    fact:
      "Physicists often use Ψ or ψ for a quantum wavefunction that encodes a system’s state.",
    effect: "psi-collapse",
    scale: 1.66,
  },
  {
    kind: "glyph",
    glyph: "𱁬",
    name: "84-stroke Japanese taito (𱁬)",
    fact:
      "It joins 䨺, “cloudy,” with 龘, “the appearance of a dragon in flight”; its own meaning is uncertain.",
    effect: "taito-storm",
    scale: 1.34,
  },
  {
    kind: "glyph",
    glyph: "֎",
    name: "left-facing Armenian eternity sign",
    fact:
      "The arevakhach, or “sun cross,” symbolizes eternal life and recurs on Armenian khachkars, church stonework, and modern emblems.",
    effect: "armenian-eternity",
    scale: 1.7,
  },
] as const satisfies readonly MindReaderSymbol[];
const answerSymbols = [
  ...recoveredSymbols,
  ...coreSymbols,
  ...rotatingSymbols,
] as const satisfies readonly MindReaderSymbol[];
const answerSymbolList: readonly MindReaderSymbol[] = answerSymbols;
const dragonGlyph = "龘";
const taitoGlyph = "𱁬";
const rotatingDecoyCount = 3;
const exhibitScale = 1.8;
const chartCanvasWidth = 600;
const chartCanvasHeight = 1000;
const chartColumnCount = 5;
const chartRowCount = 20;
const chartWidth = 3.54;
const chartDepth = 6.3;
const chartCenterX = -0.95;
const chartCenterZ = -0.05;
const chartSymbolY = 0.145;
const chartCenter = new THREE.Vector3(
  chartCenterX,
  chartSymbolY,
  chartCenterZ,
);
const glyphAtlasColumns = 8;
const glyphAtlasRows = Math.ceil(
  answerSymbolList.length / glyphAtlasColumns,
);
const answerRevealDuration = 0.72;
const answerBaseScale = 1.2;
const orbAssemblyScale = 0.65;
const panelScale = 0.68;
const portraitPanelScale = 0.78;
const instructionTurnDuration = 0.9;
const localUp = new THREE.Vector3(0, 1, 0);
// The instructions stay west of the walkable chart while the portrait becomes
// a distinct focal panel at its north edge.
const instructionPanelPosition = [-4.35, 1.78, -0.37] as const;
// Keep the portrait just screen-right of the physical assembly so the
// photographed and modeled orbs read as one staged composition.
const portraitPanelPosition = [-1.21, 1.33, -4.3] as const;
// The photographed orb sits one camera-depth behind this physical assembly.
// Their small vertical offset lets the 2D answer appear to enter the 3D ball.
const orbAssemblyPosition = [-0.75, 0, -3.9] as const;
const panelToCamera = new THREE.Vector3(11.5, 14.5, 11.5).normalize();
const panelRight = new THREE.Vector3(
  panelToCamera.z,
  0,
  -panelToCamera.x,
).normalize();
const panelUp = new THREE.Vector3()
  .crossVectors(panelToCamera, panelRight)
  .normalize();
const panelFacing = new THREE.Matrix4().makeBasis(
  panelRight,
  panelUp,
  panelToCamera,
);

function assetUrl(filename: string): string {
  return new URL(
    `${import.meta.env.BASE_URL}assets/mightymatica/${filename}`,
    window.location.href,
  ).href;
}

function seededIndex(seed: number, length: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return Math.floor((value - Math.floor(value)) * length) % length;
}

function createPageRevealOrder(): MindReaderSymbol[] {
  const order = [...answerSymbolList];
  // The module is evaluated once per page load, so this order survives zone
  // travel but changes after a reload. Fisher–Yates visits every mark exactly
  // once before the sequence repeats.
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = order[index];
    const swap = order[swapIndex];
    if (!current || !swap) continue;
    order[index] = swap;
    order[swapIndex] = current;
  }
  return order;
}

const pageRevealOrder = createPageRevealOrder();

function getRoundAnswerSymbol(round: number): MindReaderSymbol {
  const index = (round - 1) % pageRevealOrder.length;
  return pageRevealOrder[index] ?? answerSymbols[0];
}

function getRoundSymbolPalette(
  round: number,
  answer: MindReaderSymbol,
): MindReaderSymbol[] {
  const symbols: MindReaderSymbol[] = [
    ...recoveredSymbols,
    ...coreSymbols,
  ];
  const start =
    ((round - 1) * rotatingDecoyCount) %
    rotatingSymbols.length;
  const conflictsWith = (
    candidate: MindReaderSymbol,
    selected: MindReaderSymbol,
  ): boolean => {
    if (candidate.kind !== "glyph" || selected.kind !== "glyph") {
      return false;
    }
    return (
      (candidate.glyph === dragonGlyph &&
        selected.glyph === taitoGlyph) ||
      (candidate.glyph === taitoGlyph &&
        selected.glyph === dragonGlyph)
    );
  };
  const selectedRotating: MindReaderSymbol[] = [];
  for (
    let offset = 0;
    offset < rotatingSymbols.length &&
    selectedRotating.length < rotatingDecoyCount;
    offset += 1
  ) {
    const symbol =
      rotatingSymbols[
        (start + offset) % rotatingSymbols.length
      ];
    if (
      !symbol ||
      symbol === answer ||
      conflictsWith(symbol, answer) ||
      selectedRotating.some((selected) =>
        conflictsWith(symbol, selected),
      )
    ) {
      continue;
    }
    selectedRotating.push(symbol);
  }
  symbols.push(...selectedRotating);
  return [
    answer,
    ...symbols.filter((symbol) => symbol !== answer),
  ];
}

function getRoundChartSymbols(
  round: number,
  answer: MindReaderSymbol,
  cellCount: number,
): MindReaderSymbol[] {
  const palette = getRoundSymbolPalette(round, answer);
  const bag = Array.from(
    { length: cellCount },
    (_, index) => palette[index % palette.length] ?? answer,
  );
  // Balance appearances by filling one bag, then shuffle the complete chart
  // rather than replaying a short shuffled sequence. Nearby duplicates and
  // incidental motifs are allowed; only the multiples-of-nine trail is
  // deliberately authored.
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const swapIndex = seededIndex(
      round * 104729 + index * 8191,
      index + 1,
    );
    const current = bag[index];
    const swap = bag[swapIndex];
    if (!current || !swap) continue;
    bag[index] = swap;
    bag[swapIndex] = current;
  }
  return bag;
}

/**
 * Yuri's recovered Mindread.swf cycles through these four answer marks. Three
 * silhouettes are traced as paths and phi uses its proper Unicode form, so the
 * chart and reveal stay sharp instead of enlarging 58–64 px raster exports.
 */
function drawMindReaderVectorSymbol(
  drawing: CanvasRenderingContext2D,
  id: MindReaderVectorId,
  x: number,
  y: number,
  radius: number,
  ink: string,
  paper: string,
): void {
  drawing.save();
  drawing.translate(x, y);
  drawing.lineCap = "round";
  drawing.lineJoin = "round";
  drawing.strokeStyle = ink;
  drawing.fillStyle = ink;
  drawing.lineWidth = Math.max(1.4, radius * 0.09);

  if (id === "pinwheel") {
    drawing.lineWidth = Math.max(1.5, radius * 0.075);
    for (let blade = 0; blade < 5; blade += 1) {
      drawing.save();
      drawing.rotate(-0.18 + (blade * Math.PI * 2) / 5);
      drawing.beginPath();
      drawing.moveTo(0, 0);
      drawing.bezierCurveTo(
        -radius * 0.08,
        -radius * 0.14,
        -radius * 0.3,
        -radius * 0.6,
        -radius * 0.22,
        -radius * 0.8,
      );
      drawing.bezierCurveTo(
        radius * 0.05,
        -radius * 0.7,
        radius * 0.34,
        -radius * 0.48,
        radius * 0.43,
        -radius * 0.3,
      );
      drawing.bezierCurveTo(
        radius * 0.24,
        -radius * 0.3,
        radius * 0.07,
        -radius * 0.14,
        0,
        0,
      );
      drawing.closePath();
      drawing.fillStyle = paper;
      drawing.fill();
      drawing.stroke();
      drawing.restore();
    }
  } else if (id === "star") {
    drawing.beginPath();
    drawing.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
    drawing.fillStyle = ink;
    drawing.fill();
    drawing.beginPath();
    for (let point = 0; point < 10; point += 1) {
      const angle = -Math.PI / 2 + (point * Math.PI) / 5;
      const pointRadius = radius * (point % 2 === 0 ? 0.53 : 0.23);
      const pointX = Math.cos(angle) * pointRadius;
      const pointY = Math.sin(angle) * pointRadius;
      if (point === 0) drawing.moveTo(pointX, pointY);
      else drawing.lineTo(pointX, pointY);
    }
    drawing.closePath();
    drawing.fillStyle = paper;
    drawing.fill();
  } else if (id === "phi") {
    drawing.textAlign = "center";
    drawing.textBaseline = "middle";
    drawing.fillStyle = ink;
    drawing.font =
      `600 ${radius * 1.72}px "STIX Two Math", ` +
      '"Cambria Math", "Times New Roman", serif';
    drawing.fillText("φ", 0, radius * 0.04);
  } else {
    drawing.beginPath();
    drawing.arc(0, 0, radius * 0.25, 0, Math.PI * 2);
    drawing.fill();
    for (let dot = 0; dot < 12; dot += 1) {
      const angle = (dot * Math.PI * 2) / 12;
      drawing.beginPath();
      drawing.arc(
        Math.cos(angle) * radius * 0.58,
        Math.sin(angle) * radius * 0.58,
        radius * 0.075,
        0,
        Math.PI * 2,
      );
      drawing.fill();
    }
  }
  drawing.restore();
}

function drawMindReaderNonVectorSymbol(
  drawing: CanvasRenderingContext2D,
  symbol: Exclude<MindReaderSymbol, { kind: "vector" }>,
  x: number,
  y: number,
  radius: number,
  ink: string,
): void {
  drawing.save();
  drawing.translate(x, y);
  drawing.fillStyle = ink;
  drawing.strokeStyle = ink;
  drawing.textAlign = "center";
  drawing.textBaseline = "middle";

  if (symbol.kind === "loss") {
    // Draw the punctuation separately: normal monospace kerning made the joke
    // too wide, while compressing the whole string turned the central pipe and
    // strike into a crosshair. Taller marks and close advances preserve the
    // infamous ":.|:;" rhythm at both chart and crystal-ball scale.
    const dotRadius = Math.max(1.05, radius * 0.065);
    const upperY = -radius * 0.3;
    const lowerY = radius * 0.3;
    const drawDot = (dotX: number, dotY: number): void => {
      drawing.beginPath();
      drawing.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
      drawing.fill();
    };
    for (const dotX of [-radius * 0.5, radius * 0.26]) {
      drawDot(dotX, upperY);
      drawDot(dotX, lowerY);
    }
    drawDot(-radius * 0.25, lowerY);
    drawDot(radius * 0.55, upperY);
    drawing.lineCap = "round";
    drawing.lineWidth = Math.max(1.4, radius * 0.08);
    drawing.beginPath();
    drawing.moveTo(0, -radius * 0.58);
    drawing.lineTo(0, radius * 0.58);
    drawing.stroke();
    drawing.beginPath();
    drawing.moveTo(radius * 0.55, lowerY - dotRadius * 0.2);
    drawing.quadraticCurveTo(
      radius * 0.56,
      radius * 0.5,
      radius * 0.45,
      radius * 0.59,
    );
    drawing.stroke();
    drawing.lineWidth = Math.max(1.1, radius * 0.055);
    drawing.beginPath();
    drawing.moveTo(-radius * 0.64, -radius * 0.035);
    drawing.lineTo(radius * 0.68, -radius * 0.035);
    drawing.stroke();
    drawing.restore();
    return;
  }

  drawing.scale(symbol.xScale ?? 1, 1);
  drawing.font =
    `500 ${radius * (symbol.scale ?? 1.65)}px ` +
    '"Noto Sans Egyptian Hieroglyphs", "Noto Sans Bamum", ' +
    '"Noto Sans Sinhala", "Noto Sans CJK JP", "Noto Music", ' +
    '"Noto Sans Symbols 2", "Segoe UI Symbol", FreeSerif, serif';
  drawing.fillText(
    symbol.glyph,
    radius * (symbol.xOffset ?? 0),
    radius * (symbol.yOffset ?? 0),
  );
  drawing.restore();
}

function drawMindReaderSymbol(
  drawing: CanvasRenderingContext2D,
  symbol: MindReaderSymbol,
  x: number,
  y: number,
  radius: number,
  ink: string,
  paper: string,
): void {
  if (symbol.kind === "vector") {
    drawMindReaderVectorSymbol(
      drawing,
      symbol.id,
      x,
      y,
      radius,
      ink,
      paper,
    );
    return;
  }
  drawMindReaderNonVectorSymbol(
    drawing,
    symbol,
    x,
    y,
    radius,
    ink,
  );
}

function createMindReaderGlyphAtlas(): THREE.CanvasTexture {
  const tileSize = 96;
  const atlas = document.createElement("canvas");
  atlas.width = tileSize * glyphAtlasColumns;
  atlas.height = tileSize * glyphAtlasRows;
  const drawing = atlas.getContext("2d");
  const scratch = document.createElement("canvas");
  scratch.width = tileSize;
  scratch.height = tileSize;
  const scratchDrawing = scratch.getContext("2d");
  if (drawing && scratchDrawing) {
    for (const [index, symbol] of answerSymbolList.entries()) {
      scratchDrawing.clearRect(0, 0, tileSize, tileSize);
      scratchDrawing.fillStyle = "#000";
      scratchDrawing.fillRect(0, 0, tileSize, tileSize);
      drawMindReaderSymbol(
        scratchDrawing,
        symbol,
        tileSize / 2,
        tileSize / 2,
        30,
        "#fff",
        "#000",
      );
      // Convert the black-on-white authoring helper into a clean alpha mask.
      // This preserves holes in marks such as the star medallion while letting
      // the physical glyph reveal the chart or world beneath it.
      const pixels = scratchDrawing.getImageData(
        0,
        0,
        tileSize,
        tileSize,
      );
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        pixels.data[offset + 3] = pixels.data[offset] ?? 0;
        pixels.data[offset] = 255;
        pixels.data[offset + 1] = 255;
        pixels.data[offset + 2] = 255;
      }
      scratchDrawing.putImageData(pixels, 0, 0);
      drawing.drawImage(
        scratch,
        (index % glyphAtlasColumns) * tileSize,
        Math.floor(index / glyphAtlasColumns) * tileSize,
      );
    }
  }
  const texture = new THREE.CanvasTexture(atlas);
  texture.name = "mind-reader-physical-symbol-atlas";
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function drawCenteredWrappedText(
  drawing: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  firstBaselineY: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): void {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (
      line &&
      drawing.measureText(candidate).width > maxWidth
    ) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < maxLines) {
    const consumedWords = lines
      .join(" ")
      .split(/\s+/)
      .filter(Boolean).length;
    const remaining = words.slice(consumedWords).join(" ");
    line = remaining || line;
    if (
      lines.length === maxLines - 1 &&
      drawing.measureText(line).width > maxWidth
    ) {
      while (
        line.length > 1 &&
        drawing.measureText(`${line}…`).width > maxWidth
      ) {
        line = line.slice(0, -1);
      }
      line = `${line.trimEnd()}…`;
    }
    lines.push(line);
  }
  for (const [index, wrappedLine] of lines.entries()) {
    drawing.fillText(
      wrappedLine,
      centerX,
      firstBaselineY + index * lineHeight,
    );
  }
}

function createInstructionTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 760;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    const gradient = drawing.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "rgba(9, 16, 26, 0.98)");
    gradient.addColorStop(1, "rgba(26, 10, 42, 0.98)");
    drawing.fillStyle = gradient;
    drawing.fillRect(0, 0, canvas.width, canvas.height);
    drawing.strokeStyle = "#55dce8";
    drawing.lineWidth = 10;
    drawing.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);
    drawing.textAlign = "left";
    drawing.textBaseline = "middle";
    drawing.fillStyle = "#55dce8";
    drawing.font = "700 58px Georgia, serif";
    drawing.fillText("MIND READER", 58, 66);
    drawing.fillStyle = "#b8c7d5";
    drawing.font = "600 25px ui-monospace, monospace";
    drawing.fillText("FOLLOW ALL FIVE STEPS BEFORE ASKING THE BALL", 58, 116);

    const instructions: ReadonlyArray<readonly string[]> = [
      ["Choose any two-digit number."],
      ["Add its two digits."],
      ["Subtract that sum from the original number."],
      ["Find the result in the chart.", "Remember the symbol beside it."],
      ["Ask the crystal ball for its answer."],
    ] as const;
    const rowCenters = [190, 287, 384, 500, 646] as const;
    for (const [index, instruction] of instructions.entries()) {
      const y = rowCenters[index] ?? 190;
      drawing.beginPath();
      drawing.arc(82, y, 31, 0, Math.PI * 2);
      drawing.fillStyle = index === 4 ? "#ffbd55" : "#9e82ff";
      drawing.fill();
      drawing.fillStyle = "#0b1020";
      drawing.textAlign = "center";
      drawing.font = "700 33px ui-monospace, monospace";
      drawing.fillText(String(index + 1), 82, y + 1);
      drawing.fillStyle = "#f1eadb";
      drawing.textAlign = "left";
      drawing.font = "600 39px ui-sans-serif, system-ui, sans-serif";
      if (instruction.length === 1) {
        drawing.fillText(instruction[0] ?? "", 142, y);
      } else {
        drawing.fillText(instruction[0] ?? "", 142, y - 25);
        drawing.fillStyle = "#d9d2e5";
        drawing.font = "500 35px ui-sans-serif, system-ui, sans-serif";
        drawing.fillText(instruction[1] ?? "", 142, y + 27);
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = "mind-reader-visible-ritual";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function createExplanationTexture(
  canvas: HTMLCanvasElement,
): THREE.CanvasTexture {
  canvas.width = 1200;
  canvas.height = 760;
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = "mind-reader-arithmetic-proof";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function createAnswerTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  canvas.width = 256;
  canvas.height = 256;
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = "mind-reader-orb-answer";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

export class MindReaderExhibit {
  private readonly context: MightymaticaZoneContext;
  private readonly group = new THREE.Group();
  private readonly chartCanvas = document.createElement("canvas");
  private readonly chartTexture: THREE.CanvasTexture;
  private readonly glyphField: MindReaderGlyphField;
  private readonly glyphHome = new THREE.Vector3();
  private readonly instructionTexture: THREE.CanvasTexture;
  private readonly explanationCanvas = document.createElement("canvas");
  private readonly explanationTexture: THREE.CanvasTexture;
  private readonly instructionPanel = new THREE.Group();
  private readonly instructionFocus = new THREE.Vector3();
  private readonly instructionFacing = new THREE.Quaternion();
  private readonly instructionTurnRotation = new THREE.Quaternion();
  private readonly portraitTexture: THREE.Texture;
  private readonly portrait: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly answerCanvas = document.createElement("canvas");
  private readonly answerTexture: THREE.CanvasTexture;
  private readonly answer: THREE.Sprite;
  private readonly orbAssembly: THREE.Group;
  private readonly orbPayload: THREE.Group;
  private readonly orbEffectOrigin = new THREE.Vector3();
  private readonly orb: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshStandardMaterial
  >;
  private readonly orbLight: THREE.PointLight;
  private readonly wisdomEffects: MindReaderWisdomEffects;
  private readonly interactionIds = [
    "math-mind-reader",
    "math-mind-reader-orb",
  ] as const;
  private phase:
    | "idle"
    | "reading"
    | "armed"
    | "revealed"
    | "explained" = "idle";
  private round = 0;
  private targetSymbol: MindReaderSymbol = getRoundAnswerSymbol(1);
  private answerRevealAge = answerRevealDuration;
  private instructionTurn = 0;
  private instructionTurnFrom = 0;
  private instructionTurnTarget = 0;
  private instructionTurnAge = instructionTurnDuration;
  private pendingExplanationSymbol: MindReaderSymbol | null = null;
  private releaseInstructionCamera: (() => void) | null = null;
  private disposed = false;

  constructor(context: MightymaticaZoneContext) {
    this.context = context;
    this.group.name = "mind-reader-exhibit";
    this.group.position.set(-7.4, 0, -4.1);
    this.group.scale.setScalar(exhibitScale);
    context.root.add(this.group);

    const brassMaterial = new THREE.MeshStandardMaterial({
      color: 0xb97b32,
      roughness: 0.42,
      metalness: 0.62,
    });

    this.chartCanvas.width = chartCanvasWidth;
    this.chartCanvas.height = chartCanvasHeight;
    this.chartTexture = new THREE.CanvasTexture(this.chartCanvas);
    this.chartTexture.colorSpace = THREE.SRGBColorSpace;
    this.chartTexture.minFilter = THREE.LinearFilter;
    this.chartTexture.generateMipmaps = false;
    const chartMaterial = new THREE.MeshBasicMaterial({
      map: this.chartTexture,
      // The canvas is fully opaque. Keeping this in the opaque pass lets the
      // chart establish normal scene depth before transparent player effects
      // such as a charged spell orb are drawn.
      transparent: false,
      depthWrite: true,
      side: THREE.DoubleSide,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const chartBacking = new THREE.Mesh(
      new THREE.BoxGeometry(3.62, 0.08, 6.38),
      new THREE.MeshStandardMaterial({
        color: 0xb97b32,
        emissive: 0x321606,
        emissiveIntensity: 0.32,
        roughness: 0.58,
        metalness: 0.28,
      }),
    );
    chartBacking.name = "mind-reader-flush-chart-backing";
    chartBacking.position.set(chartCenterX, 0.075, chartCenterZ);
    chartBacking.receiveShadow = true;
    this.group.add(chartBacking);
    const chart = new THREE.Mesh(
      new THREE.PlaneGeometry(chartWidth, chartDepth),
      chartMaterial,
    );
    // A thin floor plaque clears the Sierpiński tiles without rebuilding the
    // old chest-high table.
    chart.position.set(chartCenterX, 0.117, chartCenterZ);
    chart.rotation.x = -Math.PI / 2;
    chart.renderOrder = 2;
    this.group.add(chart);
    this.glyphField = new MindReaderGlyphField(context, {
      parent: this.group,
      atlas: createMindReaderGlyphAtlas(),
      atlasColumns: glyphAtlasColumns,
      atlasRows: glyphAtlasRows,
      markCount: chartColumnCount * chartRowCount,
      chartCenter,
      chartHalfWidth: chartWidth / 2,
      chartHalfDepth: chartDepth / 2,
      chartY: chartSymbolY,
      // The exhibit group is scaled; this resolves to y=0.189 in world space,
      // just above the Sierpiński floor tiles rather than inside them.
      floorY: 0.105,
    });

    this.instructionTexture = createInstructionTexture();
    this.explanationTexture = createExplanationTexture(
      this.explanationCanvas,
    );
    this.portraitTexture = new THREE.TextureLoader().load(
      assetUrl("mind-reader-original.jpg"),
      (texture) => {
        if (this.disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
      },
    );
    this.portraitTexture.colorSpace = THREE.SRGBColorSpace;
    this.portraitTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.portraitTexture.wrapT = THREE.ClampToEdgeWrapping;
    // Trim a little more empty image area while retaining the panel's aspect.
    // Keeping the sampled window anchored at its upper-right edge brings the
    // photographed hands and orb closer to the physical crystal ball.
    this.portraitTexture.repeat.set(0.6, 0.555);
    this.portraitTexture.offset.set(0.4, 0.445);

    this.instructionPanel.name = "mind-reader-instruction-panel";
    // Match the default isometric camera basis. Setting pitch and yaw as Euler
    // angles introduces visible roll after the parent transform.
    this.instructionPanel.position.set(...instructionPanelPosition);
    this.instructionFacing.setFromRotationMatrix(panelFacing);
    this.instructionPanel.quaternion.copy(this.instructionFacing);
    this.instructionPanel.scale.setScalar(panelScale);
    this.group.add(this.instructionPanel);

    const instructionSlab = new THREE.Mesh(
      new THREE.BoxGeometry(4.08, 2.63, 0.14),
      new THREE.MeshStandardMaterial({
        color: 0x24192f,
        emissive: 0x190c27,
        emissiveIntensity: 0.45,
        roughness: 0.52,
        metalness: 0.42,
      }),
    );
    instructionSlab.name = "mind-reader-two-sided-instruction-slab";
    this.instructionPanel.add(instructionSlab);
    const instructionSlabEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(instructionSlab.geometry),
      new THREE.LineBasicMaterial({
        color: 0xffbd55,
        transparent: true,
        opacity: 0.82,
        toneMapped: false,
      }),
    );
    instructionSlabEdges.name = "mind-reader-instruction-slab-edges";
    this.instructionPanel.add(instructionSlabEdges);

    const instructions = new THREE.Mesh(
      new THREE.PlaneGeometry(3.95, 2.5),
      new THREE.MeshBasicMaterial({
        map: this.instructionTexture,
        transparent: false,
        depthWrite: true,
        side: THREE.FrontSide,
        toneMapped: false,
      }),
    );
    instructions.name = "mind-reader-playable-instructions";
    instructions.position.z = 0.076;
    instructions.renderOrder = 3;
    this.instructionPanel.add(instructions);

    const explanation = new THREE.Mesh(
      new THREE.PlaneGeometry(3.95, 2.5),
      new THREE.MeshBasicMaterial({
        map: this.explanationTexture,
        transparent: false,
        depthWrite: true,
        side: THREE.FrontSide,
        toneMapped: false,
      }),
    );
    explanation.name = "mind-reader-proof-on-reverse";
    explanation.position.z = -0.076;
    explanation.rotation.y = Math.PI;
    explanation.renderOrder = 3;
    this.instructionPanel.add(explanation);

    const portraitPanel = new THREE.Group();
    portraitPanel.name = "mind-reader-portrait-panel";
    portraitPanel.position.set(...portraitPanelPosition);
    portraitPanel.quaternion.setFromRotationMatrix(panelFacing);
    portraitPanel.scale.setScalar(portraitPanelScale);
    this.group.add(portraitPanel);

    const portraitBackplane = new THREE.Mesh(
      new THREE.PlaneGeometry(3.29, 2.66),
      new THREE.MeshBasicMaterial({
        color: 0x080612,
        transparent: true,
        opacity: 0.94,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    portraitBackplane.name = "mind-reader-portrait-backplane";
    portraitBackplane.position.z = -0.04;
    portraitPanel.add(portraitBackplane);
    const portraitFrame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(3.29, 2.66)),
      new THREE.LineBasicMaterial({
        color: 0x4cc8d5,
        transparent: true,
        opacity: 0.62,
        toneMapped: false,
      }),
    );
    portraitFrame.name = "mind-reader-portrait-frame";
    portraitFrame.position.z = -0.025;
    portraitPanel.add(portraitFrame);

    this.portrait = new THREE.Mesh(
      new THREE.PlaneGeometry(3.13, 2.5),
      new THREE.MeshBasicMaterial({
        map: this.portraitTexture,
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    this.portrait.name = "original-mind-reader-portrait";
    this.portrait.renderOrder = 2;
    portraitPanel.add(this.portrait);

    this.answerTexture = createAnswerTexture(this.answerCanvas);
    const orbMaterial = new THREE.MeshStandardMaterial({
      color: 0xf7f5ff,
      emissive: 0x8f4cff,
      emissiveIntensity: 1.2,
      roughness: 0.08,
      metalness: 0.02,
      transparent: true,
      opacity: 0.9,
    });
    this.orbAssembly = new THREE.Group();
    this.orbAssembly.name = "mind-reader-crystal-ball-assembly";
    this.orbAssembly.position.set(...orbAssemblyPosition);
    this.orbAssembly.scale.setScalar(orbAssemblyScale);
    this.group.add(this.orbAssembly);

    const orbCenterY = 2.06;
    this.orbPayload = new THREE.Group();
    this.orbPayload.name = "mind-reader-movable-wisdom-orb";
    this.orbPayload.position.set(0, orbCenterY, 0);
    this.orbAssembly.add(this.orbPayload);

    this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 14), orbMaterial);
    this.orb.castShadow = false;
    this.orbPayload.add(this.orb);

    const orbRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.045, 5, 28),
      brassMaterial,
    );
    orbRim.position.set(0, orbCenterY - 0.62, 0);
    orbRim.rotation.x = Math.PI / 2;
    this.orbAssembly.add(orbRim);

    const orbCup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.9, 0.32, 16),
      brassMaterial,
    );
    orbCup.name = "mind-reader-raised-orb-cup";
    orbCup.position.set(0, orbCenterY - 0.78, 0);
    this.orbAssembly.add(orbCup);
    const orbStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.3, 1.02, 12),
      brassMaterial,
    );
    orbStem.name = "mind-reader-orb-pedestal-stem";
    orbStem.position.set(0, 0.62, 0);
    this.orbAssembly.add(orbStem);
    const orbFoot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.62, 0.16, 14),
      brassMaterial,
    );
    orbFoot.name = "mind-reader-orb-pedestal-foot";
    orbFoot.position.set(0, 0.13, 0);
    this.orbAssembly.add(orbFoot);

    this.orbLight = new THREE.PointLight(0xb784ff, 2.1, 4.2, 2);
    this.orbPayload.add(this.orbLight);

    this.answer = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.answerTexture,
        transparent: true,
        opacity: 0,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.answer.name = "mind-reader-revealed-symbol";
    // Seat the billboard just beyond the camera-facing tangent of the sphere.
    // The extra clearance survives the orb's revealed-state pulse, while scene
    // depth still lets a player who jumps in front cover the symbol.
    this.answer.position
      .copy(panelToCamera)
      .multiplyScalar(0.72);
    this.answer.scale.setScalar(answerBaseScale);
    // Wisdom effects use additive transparent layers up through order 9. Draw
    // the answer last among those layers while retaining depth testing, so the
    // glyph survives a solar flare but is still hidden by a player in front.
    this.answer.renderOrder = 10;
    this.answer.visible = false;
    this.orbPayload.add(this.answer);

    this.orbEffectOrigin
      .copy(this.orbAssembly.position)
      .addScaledVector(this.orbPayload.position, orbAssemblyScale);
    this.wisdomEffects = new MindReaderWisdomEffects(context, {
      parent: this.group,
      orbAssembly: this.orbPayload,
      orbSocket: this.orbAssembly,
      orbVisual: this.orb,
      orbAnswer: this.answer,
      orbLight: this.orbLight,
      orbOrigin: this.orbEffectOrigin,
      floorY: 0.105,
      onOrbKnocked: () => {
        this.updateInteractionLabels("Inspect the displaced wisdom orb");
        this.context.onStatus(
          "By every right triangle! Bastet has introduced an unbounded variable.",
          {
            kind: "speech",
            speaker: "Pythagoras",
            toastPolicy: "alongside-achievement",
          },
        );
      },
      onOrbRecovered: () => {
        if (this.phase === "revealed") {
          this.updateInteractionLabels("Inspect how the trick worked");
        }
        this.context.onStatus(
          "The wisdom orb is seated again. The cat’s proof remains under review.",
          { toastPolicy: "after-achievement" },
        );
      },
    });

    context.addInteraction({
      id: "math-mind-reader",
      label: "Begin the five-step mind-reader ritual",
      x: this.group.position.x,
      z: this.group.position.z,
      radius: 6.4,
      action: () => this.interact(),
    });
    const orbInteractionWorld = this.group.localToWorld(
      this.orbEffectOrigin.clone(),
    );
    context.addInteraction({
      id: "math-mind-reader-orb",
      label: "Begin the five-step mind-reader ritual",
      x: orbInteractionWorld.x,
      z: orbInteractionWorld.z,
      radius: 2.15,
      action: () => this.interact(),
    });
    context.registerPointerAction(
      chartBacking,
      () => this.interact(),
      10,
      () => this.wisdomEffects.isOrbReady(),
    );
    context.registerPointerAction(
      this.orbAssembly,
      () => this.interact(),
      8,
    );
    this.startRound();
    context.addWalkSurface(
      "math-mind-reader-chart",
      this.group.position.x - 0.95 * exhibitScale,
      this.group.position.z - 0.05 * exhibitScale,
      1.77 * exhibitScale,
      3.15 * exhibitScale,
      0.212,
    );
  }

  update(delta: number, elapsed: number): void {
    this.updateInstructionTurn(delta);
    this.updateAnswerReveal(delta);
    this.glyphField.update(delta, elapsed);
    this.wisdomEffects.update(delta, elapsed);
    if (this.context.reducedMotion) {
      this.orb.scale.setScalar(1);
      this.orbLight.intensity =
        this.phase === "revealed" || this.phase === "explained" ? 4.2 : 2.1;
      return;
    }
    const revealed = this.phase === "revealed" || this.phase === "explained";
    const revealBoost = revealed ? 1.6 : 0;
    const pulse = Math.sin(elapsed * (revealed ? 7 : 2.4));
    const looseOrb = this.wisdomEffects.getTravelingOrb();
    if (!looseOrb?.enabled) {
      this.orb.scale.setScalar(
        1 + pulse * (revealed ? 0.055 : 0.018),
      );
      this.orb.rotation.y += 0.006;
    } else {
      this.orb.scale.setScalar(1);
    }
    this.orbLight.intensity = 2.15 + revealBoost + pulse * 0.35;
  }

  hasActiveMotion(): boolean {
    return (
      this.instructionTurnAge < instructionTurnDuration ||
      this.glyphField.hasActiveMotion() ||
      this.wisdomEffects.hasActiveMotion()
    );
  }

  setQuality(quality: MathQualityTier): void {
    this.glyphField.setQuality(quality);
    this.wisdomEffects.setQuality(quality);
  }

  getTravelingOrb(): MathTravelingBody | null {
    return this.wisdomEffects.getTravelingOrb();
  }

  reactToSpell(stage: MathSpellStage, charge: number): number {
    if (!this.wisdomEffects.isOrbReady()) {
      this.wisdomEffects.reactToSpell();
    }
    return this.glyphField.reactToSpell(stage, charge);
  }

  dispose(): void {
    this.disposed = true;
    this.releaseInstructionCamera?.();
    this.releaseInstructionCamera = null;
    this.chartTexture.dispose();
    this.instructionTexture.dispose();
    this.explanationTexture.dispose();
    this.portraitTexture.dispose();
    this.answerTexture.dispose();
    this.glyphField.dispose();
    this.wisdomEffects.dispose();
    this.portrait.material.dispose();
    this.answer.material.dispose();
  }

  forEachDynamicObject(visitor: (object: THREE.Object3D) => void): void {
    visitor(this.orbPayload);
    this.wisdomEffects.forEachDynamicObject(visitor);
  }

  private interact(): void {
    if (!this.wisdomEffects.isOrbReady()) {
      this.context.performReachGesture(this.orbPayload, true);
      return;
    }
    if (this.phase === "idle") {
      this.phase = "reading";
      this.updateInteractionLabels("Finish reading the instructions");
      this.releaseInstructionCamera?.();
      this.instructionPanel.getWorldPosition(this.instructionFocus);
      this.releaseInstructionCamera = this.context.requestCameraFrame({
        focus: this.instructionFocus,
        zoom: 2.05,
        // Interaction, movement, or leaving the room dismisses this framing.
        // There is deliberately no passive reading deadline.
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }

    if (this.phase === "reading") {
      this.releaseInstructionCamera?.();
      this.releaseInstructionCamera = null;
      this.phase = "armed";
      this.updateInteractionLabels("Ask the orb for its answer");
      return;
    }

    if (this.phase === "armed") {
      this.releaseInstructionCamera?.();
      this.releaseInstructionCamera = null;
      this.phase = "revealed";
      const target = this.targetSymbol;
      this.renderAnswer(target);
      this.answer.visible = true;
      this.answerRevealAge = this.context.reducedMotion
        ? answerRevealDuration
        : 0;
      this.updateAnswerReveal(0);
      this.orb.material.color.setHex(0xfff8d8);
      this.orb.material.emissive.setHex(0xff4fc8);
      this.wisdomEffects.trigger(target.effect);
      this.updateInteractionLabels("Inspect how the trick worked");
      this.context.onStatus(
        `The crystal ball reveals the ${target.name}. ${target.fact}\nWas it the symbol you remembered?`,
        { kind: "achievement", title: "MIND OVER MATH" },
      );
      return;
    }

    if (this.phase === "revealed") {
      // The next chart may already be live, but its proof remains queued until
      // the old reverse face has turned completely out of view.
      if (this.pendingExplanationSymbol) return;
      this.phase = "explained";
      this.beginInstructionTurn(1);
      if (this.round === 1) {
        this.releaseInstructionCamera?.();
        this.instructionPanel.getWorldPosition(this.instructionFocus);
        this.releaseInstructionCamera = this.context.requestCameraFrame({
          focus: this.instructionFocus,
          zoom: 2.05,
          duration: Number.POSITIVE_INFINITY,
        });
      }
      this.updateInteractionLabels(
        this.round === 1
          ? "Finish reading the proof"
          : "Cycle to another symbol",
      );
      return;
    }

    this.startRound();
  }

  private startRound(): void {
    this.wisdomEffects?.dismiss();
    this.releaseInstructionCamera?.();
    this.releaseInstructionCamera = null;
    this.round += 1;
    this.targetSymbol = getRoundAnswerSymbol(this.round);
    const isGuidedRound = this.round === 1;
    this.phase = isGuidedRound ? "idle" : "armed";
    this.pendingExplanationSymbol = this.targetSymbol;
    this.beginInstructionTurn(0);
    this.answer.visible = false;
    this.answer.material.opacity = 0;
    this.answerRevealAge = answerRevealDuration;
    this.orb.material.color.setHex(0xf7f5ff);
    this.orb.material.emissive.setHex(0x8f4cff);
    this.updateInteractionLabels(
      isGuidedRound
        ? "Begin the five-step mind-reader ritual"
        : "Ask the orb for another answer",
    );
    this.renderChart();
  }

  private updateInteractionLabels(label: string): void {
    for (const id of this.interactionIds) {
      this.context.updateInteractionLabel(id, label);
    }
  }

  private renderAnswer(symbol: MindReaderSymbol): void {
    const drawing = this.answerCanvas.getContext("2d");
    if (!drawing) return;
    drawing.clearRect(0, 0, this.answerCanvas.width, this.answerCanvas.height);
    const glow = drawing.createRadialGradient(128, 128, 12, 128, 128, 116);
    glow.addColorStop(0, "rgba(255, 255, 244, 0.98)");
    glow.addColorStop(0.58, "rgba(241, 223, 255, 0.8)");
    glow.addColorStop(1, "rgba(158, 104, 255, 0)");
    drawing.fillStyle = glow;
    drawing.fillRect(0, 0, 256, 256);
    drawMindReaderSymbol(
      drawing,
      symbol,
      128,
      132,
      72,
      "#251337",
      "rgba(255, 255, 255, 0.96)",
    );
    this.answerTexture.needsUpdate = true;
  }

  private beginInstructionTurn(target: 0 | 1): void {
    this.instructionTurnFrom = this.instructionTurn;
    this.instructionTurnTarget = target;
    this.instructionTurnAge = this.context.reducedMotion
      ? instructionTurnDuration
      : 0;
    if (this.context.reducedMotion) {
      this.instructionTurn = target;
      this.applyInstructionTurn();
      this.commitPendingExplanation();
    }
  }

  private updateInstructionTurn(delta: number): void {
    if (this.instructionTurnAge >= instructionTurnDuration) return;
    this.instructionTurnAge = Math.min(
      instructionTurnDuration,
      this.instructionTurnAge + delta,
    );
    const progress = THREE.MathUtils.smootherstep(
      this.instructionTurnAge,
      0,
      instructionTurnDuration,
    );
    this.instructionTurn = THREE.MathUtils.lerp(
      this.instructionTurnFrom,
      this.instructionTurnTarget,
      progress,
    );
    this.applyInstructionTurn();
    if (this.instructionTurnAge >= instructionTurnDuration) {
      this.commitPendingExplanation();
    }
  }

  private applyInstructionTurn(): void {
    this.instructionTurnRotation.setFromAxisAngle(
      localUp,
      this.instructionTurn * Math.PI,
    );
    this.instructionPanel.quaternion
      .copy(this.instructionFacing)
      .multiply(this.instructionTurnRotation);
  }

  private commitPendingExplanation(): void {
    if (
      this.instructionTurnTarget !== 0 ||
      Math.abs(this.instructionTurn) > 0.001 ||
      !this.pendingExplanationSymbol
    ) {
      return;
    }
    const symbol = this.pendingExplanationSymbol;
    this.pendingExplanationSymbol = null;
    this.renderExplanation(symbol);
  }

  private renderExplanation(symbol: MindReaderSymbol): void {
    const drawing = this.explanationCanvas.getContext("2d");
    if (!drawing) return;
    const width = this.explanationCanvas.width;
    const height = this.explanationCanvas.height;
    drawing.clearRect(0, 0, width, height);
    const gradient = drawing.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#1b1028");
    gradient.addColorStop(0.58, "#100f20");
    gradient.addColorStop(1, "#08202a");
    drawing.fillStyle = gradient;
    drawing.fillRect(0, 0, width, height);
    drawing.strokeStyle = "#ffbd55";
    drawing.lineWidth = 10;
    drawing.strokeRect(7, 7, width - 14, height - 14);

    drawing.textAlign = "left";
    drawing.textBaseline = "middle";
    drawing.fillStyle = "#ffbd55";
    drawing.font = "700 55px Georgia, serif";
    drawing.fillText("WHAT THE ORB KNEW", 58, 65);
    drawing.fillStyle = "#b8c7d5";
    drawing.font = "600 25px ui-monospace, monospace";
    drawing.fillText(
      "LET a = TENS DIGIT · b = ONES DIGIT",
      58,
      116,
    );

    const cards = [
      ["NUMBER", "10a + b"],
      ["DIGIT SUM", "a + b"],
      ["REMAINDER", "9a"],
    ] as const;
    for (const [index, [label, formula]] of cards.entries()) {
      const x = 58 + index * 374;
      drawing.fillStyle = "rgba(158, 130, 255, 0.14)";
      drawing.fillRect(x, 158, 340, 126);
      drawing.strokeStyle = "rgba(158, 130, 255, 0.48)";
      drawing.lineWidth = 3;
      drawing.strokeRect(x, 158, 340, 126);
      drawing.fillStyle = "#a994ef";
      drawing.font = "700 21px ui-monospace, monospace";
      drawing.fillText(label, x + 20, 184);
      drawing.fillStyle = "#f5efe4";
      drawing.font = "600 51px Georgia, serif";
      drawing.fillText(formula, x + 20, 242);
    }

    drawing.textAlign = "center";
    drawing.fillStyle = "#f5efe4";
    drawing.font = "600 49px Georgia, serif";
    drawing.fillText(
      "(10a + b)  −  (a + b)  =  9a",
      width / 2,
      348,
    );
    drawing.fillStyle = "#55dce8";
    drawing.font = "700 27px ui-monospace, monospace";
    drawing.fillText(
      "EVERY POSSIBLE RESULT IS A MULTIPLE OF NINE",
      width / 2,
      404,
    );

    const multiples = [9, 18, 27, 36, 45, 54, 63, 72, 81] as const;
    const cellWidth = 112;
    const rowWidth = cellWidth * multiples.length;
    const rowLeft = (width - rowWidth) / 2;
    for (const [index, multiple] of multiples.entries()) {
      const centerX = rowLeft + index * cellWidth + cellWidth / 2;
      drawing.fillStyle =
        index % 2 === 0
          ? "rgba(255, 189, 85, 0.12)"
          : "rgba(85, 220, 232, 0.1)";
      drawing.fillRect(rowLeft + index * cellWidth, 444, cellWidth, 134);
      drawing.fillStyle = "#d9d2e5";
      drawing.font = "700 25px ui-monospace, monospace";
      drawing.fillText(String(multiple), centerX, 470);
      drawMindReaderSymbol(
        drawing,
        symbol,
        centerX,
        530,
        28,
        "#f5efe4",
        "#17111f",
      );
    }

    drawing.fillStyle = "#ffbd55";
    drawing.font = "700 24px ui-monospace, monospace";
    drawing.fillText("ABOUT THIS MARK", width / 2, 596);
    drawing.fillStyle = "#f5efe4";
    drawing.font = "700 37px Georgia, serif";
    drawing.fillText(symbol.name, width / 2, 638);
    drawing.fillStyle = "#f1eadb";
    drawing.font = "500 29px ui-sans-serif, system-ui, sans-serif";
    drawCenteredWrappedText(
      drawing,
      symbol.fact,
      width / 2,
      670,
      width - 120,
      34,
      3,
    );
    this.explanationTexture.needsUpdate = true;
  }

  private updateAnswerReveal(delta: number): void {
    if (!this.answer.visible) return;
    this.answerRevealAge = Math.min(
      answerRevealDuration,
      this.answerRevealAge + delta,
    );
    const progress = this.context.reducedMotion
      ? 1
      : THREE.MathUtils.smoothstep(
          this.answerRevealAge,
          0,
          answerRevealDuration,
        );
    const opacity = THREE.MathUtils.smoothstep(progress, 0.08, 0.72);
    this.answer.material.opacity = opacity;
    const scale = THREE.MathUtils.lerp(0.18, 1, progress);
    this.answer.scale.setScalar(answerBaseScale * scale);
  }

  private renderChart(): void {
    const drawing = this.chartCanvas.getContext("2d");
    if (!drawing) return;
    const answer = this.targetSymbol;

    const width = this.chartCanvas.width;
    const height = this.chartCanvas.height;
    drawing.clearRect(0, 0, width, height);
    drawing.fillStyle = "#f7f1e7";
    drawing.fillRect(0, 0, width, height);

    const columns = chartColumnCount;
    const rows = chartRowCount;
    const validOutcomeCount = 9;
    const chartSymbols = getRoundChartSymbols(
      this.round,
      answer,
      columns * rows - validOutcomeCount,
    );
    let chartSymbolCursor = 0;
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    for (let column = 0; column < columns; column += 1) {
      if (column % 2 === 0) {
        drawing.fillStyle = "rgba(151, 113, 179, 0.055)";
        drawing.fillRect(column * cellWidth, 0, cellWidth, height);
      }
    }
    drawing.strokeStyle = "rgba(72, 44, 88, 0.16)";
    drawing.lineWidth = 1.5;
    for (let index = 0; index <= columns; index += 1) {
      drawing.beginPath();
      drawing.moveTo(index * cellWidth, 0);
      drawing.lineTo(index * cellWidth, height);
      drawing.stroke();
    }
    for (let index = 0; index <= rows; index += 1) {
      drawing.beginPath();
      drawing.moveTo(0, index * cellHeight);
      drawing.lineTo(width, index * cellHeight);
      drawing.stroke();
    }
    drawing.strokeStyle = "#b97b32";
    drawing.lineWidth = 8;
    drawing.strokeRect(4, 4, width - 8, height - 8);

    drawing.textAlign = "center";
    drawing.textBaseline = "middle";
    for (let column = 0; column < columns; column += 1) {
      for (let row = 0; row < rows; row += 1) {
        const number = 99 - column * rows - row;
        const left = column * cellWidth;
        const centerY = row * cellHeight + cellHeight * 0.5;
        drawing.fillStyle = "#bd1747";
        drawing.font = "700 25px ui-monospace, monospace";
        drawing.fillText(String(number), left + 31, centerY);
        const validOutcome =
          number >= 9 && number <= 81 && number % 9 === 0;
        const symbol = validOutcome
          ? answer
          : (chartSymbols[chartSymbolCursor] ?? recoveredSymbols[0]);
        if (!validOutcome) chartSymbolCursor += 1;
        const symbolCanvasX = left + 83;
        const symbolCanvasY = centerY + 1;
        this.glyphHome.set(
          chartCenterX +
            (symbolCanvasX / width - 0.5) * chartWidth,
          chartSymbolY,
          chartCenterZ +
            (symbolCanvasY / height - 0.5) * chartDepth,
        );
        this.glyphField.setMark(
          column * rows + row,
          this.glyphHome,
          Math.max(0, answerSymbolList.indexOf(symbol)),
        );
      }
    }

    this.chartTexture.needsUpdate = true;
    this.glyphField.commitLayout();
  }
}
