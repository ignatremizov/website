import * as THREE from "three";

const designScale = 8;
const ink = "#111216";
const skin = "#ffcc99";
const cyan = "#33ffff";
const turquoise = "#33ffcc";

function assetUrl(filename: string): string {
  return new URL(
    `${import.meta.env.BASE_URL}assets/mightymatica/${filename}`,
    window.location.href,
  ).href;
}

function fillAndStroke(
  drawing: CanvasRenderingContext2D,
  path: Path2D,
  fill: string,
  lineWidth = 0.82,
): void {
  drawing.fillStyle = fill;
  drawing.fill(path);
  drawing.strokeStyle = ink;
  drawing.lineWidth = lineWidth;
  drawing.stroke(path);
}

function drawEyeBase(
  drawing: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  drawing.beginPath();
  drawing.ellipse(x, y, 6.2, 7.25, 0, 0, Math.PI * 2);
  drawing.fillStyle = "#ffffff";
  drawing.fill();
  drawing.strokeStyle = ink;
  drawing.lineWidth = 0.82;
  drawing.stroke();
}

function drawEye(
  drawing: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  drawing.beginPath();
  drawing.ellipse(x, y, 5.5, 4.05, 0, 0, Math.PI * 2);
  drawing.fillStyle = cyan;
  drawing.fill();

  drawing.beginPath();
  drawing.ellipse(x, y + 0.45, 1.5, 1.5, 0, 0, Math.PI * 2);
  drawing.fillStyle = ink;
  drawing.fill();
}

function drawBrowTufts(drawing: CanvasRenderingContext2D): void {
  const left = new Path2D();
  left.moveTo(50.982, 10.435);
  left.lineTo(50.191, 4.94);
  left.lineTo(44.833, 2.572);
  left.lineTo(40.644, 6.11);
  left.lineTo(43.009, 14.015);
  left.closePath();
  fillAndStroke(drawing, left, turquoise, 0.72);

  const right = new Path2D();
  right.moveTo(70.616, 10.702);
  right.lineTo(72.764, 5.583);
  right.lineTo(69.388, 0.796);
  right.lineTo(63.976, 1.676);
  right.lineTo(61.937, 9.67);
  right.closePath();
  fillAndStroke(drawing, right, turquoise, 0.72);
}

function drawHands(drawing: CanvasRenderingContext2D): void {
  const left = new Path2D();
  left.moveTo(5.2, 86.2);
  left.lineTo(5.7, 91.35);
  left.quadraticCurveTo(5.75, 92.65, 7.6, 92.45);
  left.quadraticCurveTo(8.85, 92.6, 9.7, 90.85);
  left.lineTo(10.6, 86.7);
  left.lineTo(14.1, 85.2);
  left.lineTo(17.95, 80.35);
  left.quadraticCurveTo(19.6, 79.15, 17.85, 77.45);
  left.lineTo(16.45, 76.6);
  left.lineTo(11.2, 78.95);
  left.quadraticCurveTo(7.6, 77.05, 3.95, 78.1);
  left.lineTo(0.85, 80.1);
  left.quadraticCurveTo(-0.8, 81.35, 0.7, 82.6);
  left.lineTo(1.45, 86.1);
  left.quadraticCurveTo(2.85, 87.45, 5.2, 86.2);
  left.closePath();
  fillAndStroke(drawing, left, skin);

  const right = new Path2D();
  right.moveTo(93.1, 74.5);
  right.lineTo(95, 73.15);
  right.lineTo(96.75, 73.5);
  right.lineTo(100.1, 76.75);
  right.quadraticCurveTo(103.2, 75.25, 105.75, 77);
  right.quadraticCurveTo(108.85, 78.5, 110, 80);
  right.lineTo(110.75, 81.9);
  right.quadraticCurveTo(110.55, 83.4, 107.75, 83.5);
  right.lineTo(108.75, 85.5);
  right.lineTo(107.75, 87.25);
  right.lineTo(103.85, 86.25);
  right.lineTo(103.25, 88.75);
  right.quadraticCurveTo(102.95, 90.85, 101.35, 90.65);
  right.quadraticCurveTo(98.95, 90.8, 98.25, 88.9);
  right.lineTo(97.6, 85.15);
  right.lineTo(92.35, 79.25);
  right.quadraticCurveTo(90.9, 76.9, 93.1, 74.5);
  right.closePath();
  fillAndStroke(drawing, right, skin);
}

function drawBeardLine(drawing: CanvasRenderingContext2D): void {
  drawing.beginPath();
  drawing.moveTo(29.35, 64.55);
  drawing.quadraticCurveTo(30.55, 65.95, 31.95, 67.1);
  drawing.quadraticCurveTo(37.4, 71.45, 46.35, 72.4);
  drawing.lineTo(49.15, 69.75);
  drawing.lineTo(49.35, 69.55);
  drawing.quadraticCurveTo(49.45, 69.7, 49.55, 69.85);
  drawing.quadraticCurveTo(52, 73.2, 54.95, 73.9);
  drawing.quadraticCurveTo(59.05, 74.55, 60.2, 73.8);
  drawing.quadraticCurveTo(64.85, 72.8, 66.45, 69.15);
  drawing.lineTo(71.85, 71.8);
  drawing.quadraticCurveTo(81.15, 71.6, 84.95, 64.05);
  drawing.strokeStyle = ink;
  drawing.lineWidth = 0.82;
  drawing.lineCap = "round";
  drawing.lineJoin = "round";
  drawing.stroke();
}

function drawRecoveredFrame(
  drawing: CanvasRenderingContext2D,
  body: HTMLImageElement,
): void {
  drawing.clearRect(0, 0, 113 * designScale, 132 * designScale);
  drawing.save();
  drawing.scale(designScale, designScale);
  // The first archived atlas frame trims two transparent source pixels from
  // the left of the 115 px symbol. Match that crop so its billboard aspect and
  // centering remain identical to the recovered 113 × 132 frame.
  drawing.translate(-2, 0);
  drawing.imageSmoothingEnabled = true;
  drawing.imageSmoothingQuality = "high";

  // This is the exact transform from Pifagor/Pifagor-silent in the recovered
  // XFL. Flash used this imported body beneath vector eyes, hands, brows, and
  // the quiet beard line; keeping that hybrid is what preserves the model.
  drawing.drawImage(
    body,
    10.9,
    15,
    body.naturalWidth * 0.258407592773438,
    body.naturalHeight * 0.254150390625,
  );

  drawEyeBase(drawing, 49.8, 20.2);
  drawEyeBase(drawing, 66.55, 18.9);
  drawHands(drawing);
  drawEye(drawing, 49.7, 22.25);
  drawEye(drawing, 66.45, 20.95);
  drawBrowTufts(drawing);
  drawBeardLine(drawing);
  drawing.restore();
}

function createTexture(): {
  texture: THREE.CanvasTexture;
  cancelPendingLoad: () => void;
} {
  const canvas = document.createElement("canvas");
  canvas.width = 113 * designScale;
  canvas.height = 132 * designScale;
  const drawing = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = "pythagoras-recovered-flash-hybrid";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;

  let cancelled = false;
  const body = new Image();
  body.decoding = "async";
  body.onload = () => {
    if (cancelled || !drawing) return;
    drawRecoveredFrame(drawing, body);
    texture.needsUpdate = true;
  };
  body.src = assetUrl("pythagoras-body-original.png");

  return {
    texture,
    cancelPendingLoad: () => {
      cancelled = true;
      body.onload = null;
    },
  };
}

export interface PythagorasCurator {
  sprite: THREE.Sprite;
  texture: THREE.CanvasTexture;
  cancelPendingLoad: () => void;
}

export function createPythagorasCurator(): PythagorasCurator {
  const { texture, cancelPendingLoad } = createTexture();
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.02,
      // Pythagoras participates in the foreground-occlusion pass. Opaque
      // sprite pixels must establish scene depth so the later avatar pass
      // stays behind him while its reveal shell draws only hidden fragments.
      depthWrite: true,
      fog: true,
      toneMapped: false,
    }),
  );
  sprite.name = "pythagoras-curator-recovered-flash-hybrid";
  sprite.position.set(0, 2.42, 0);
  sprite.scale.set(4.02, 4.72, 1);
  return { sprite, texture, cancelPendingLoad };
}
