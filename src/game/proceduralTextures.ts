import * as THREE from "three";

function createTexture(
  canvas: HTMLCanvasElement,
  name: string,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = name;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createFieldGroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    const random = createRandom(0x51a7f13d);
    drawing.fillStyle = "#594a36";
    drawing.fillRect(0, 0, canvas.width, canvas.height);

    for (let index = 0; index < 72; index += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const radiusX = 5 + random() * 23;
      const radiusY = 3 + random() * 13;
      drawing.fillStyle =
        index % 3 === 0
          ? `rgba(116, 96, 65, ${0.025 + random() * 0.055})`
          : `rgba(37, 35, 29, ${0.02 + random() * 0.05})`;
      drawing.beginPath();
      drawing.ellipse(
        x,
        y,
        radiusX,
        radiusY,
        random() * Math.PI,
        0,
        Math.PI * 2,
      );
      drawing.fill();
    }

    drawing.lineCap = "round";
    for (let index = 0; index < 90; index += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const length = 1.5 + random() * 8;
      const angle = random() * Math.PI * 2;
      drawing.strokeStyle =
        index % 4 === 0
          ? "rgba(202, 174, 111, 0.075)"
          : "rgba(22, 26, 23, 0.09)";
      drawing.lineWidth = 0.45 + random() * 0.7;
      drawing.beginPath();
      drawing.moveTo(x, y);
      drawing.lineTo(
        x + Math.cos(angle) * length,
        y + Math.sin(angle) * length,
      );
      drawing.stroke();
    }

    drawing.strokeStyle = "rgba(220, 191, 128, 0.055)";
    drawing.lineWidth = 1.2;
    for (let index = 0; index < 4; index += 1) {
      const offset = index * 64 - 18;
      drawing.beginPath();
      drawing.moveTo(-20, offset + 28);
      drawing.bezierCurveTo(64, offset - 5, 164, offset + 62, 280, offset + 17);
      drawing.stroke();
    }
  }
  const texture = createTexture(canvas, "field-survey-worn-ground");
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.4, 3.4);
  texture.rotation = 0.17;
  texture.center.set(0.5, 0.5);
  // The ground is seen at shallow camera angles, where mipmaps prevent the
  // repeated survey grain from shimmering as the player moves.
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function createFieldDesirePathTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 512;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    const pixels = drawing.createImageData(canvas.width, canvas.height);
    const random = createRandom(0x0dd5e12e);
    for (let y = 0; y < canvas.height; y += 1) {
      const longWear =
        Math.sin((y / canvas.height) * Math.PI * 9.4) * 0.055 +
        Math.sin((y / canvas.height) * Math.PI * 23.7) * 0.025;
      for (let x = 0; x < canvas.width; x += 1) {
        const across = Math.abs((x / (canvas.width - 1)) * 2 - 1);
        const edge = THREE.MathUtils.smoothstep(1 - across, 0.02, 0.32);
        const grain = (random() - 0.5) * 0.18;
        const compressedCenter = 1 - across ** 2;
        const alpha = THREE.MathUtils.clamp(
          edge *
            (0.3 + compressedCenter * 0.3 + longWear + grain) *
            (random() > 0.985 ? 0.34 : 1),
          0,
          0.62,
        );
        const shade = Math.round(
          THREE.MathUtils.clamp(
            88 + compressedCenter * 18 + grain * 30,
            70,
            118,
          ),
        );
        const index = (y * canvas.width + x) * 4;
        pixels.data[index] = shade + 8;
        pixels.data[index + 1] = shade;
        pixels.data[index + 2] = shade - 18;
        pixels.data[index + 3] = Math.round(alpha * 255);
      }
    }
    drawing.putImageData(pixels, 0, 0);

    const scuffRandom = createRandom(0x7ea2c4);
    drawing.fillStyle = "rgba(54, 45, 31, 0.12)";
    for (let index = 0; index < 34; index += 1) {
      drawing.beginPath();
      drawing.ellipse(
        30 + scuffRandom() * 68,
        scuffRandom() * canvas.height,
        0.8 + scuffRandom() * 2.2,
        1.2 + scuffRandom() * 4.6,
        scuffRandom() * Math.PI,
        0,
        Math.PI * 2,
      );
      drawing.fill();
    }
  }
  const texture = createTexture(canvas, "field-well-worn-desire-path");
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function createFieldAtlasTexture(
  mathDiscovered = false,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 448;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    drawing.fillStyle = "#b8a478";
    drawing.fillRect(0, 0, canvas.width, canvas.height);

    const wash = drawing.createRadialGradient(380, 210, 30, 380, 210, 470);
    wash.addColorStop(0, "rgba(244, 225, 169, 0.38)");
    wash.addColorStop(1, "rgba(75, 57, 35, 0.16)");
    drawing.fillStyle = wash;
    drawing.fillRect(0, 0, canvas.width, canvas.height);

    drawing.strokeStyle = "rgba(76, 61, 40, 0.24)";
    drawing.lineWidth = 2;
    for (let x = 48; x < canvas.width; x += 72) {
      drawing.beginPath();
      drawing.moveTo(x, 24);
      drawing.lineTo(x, canvas.height - 24);
      drawing.stroke();
    }
    for (let y = 44; y < canvas.height; y += 64) {
      drawing.beginPath();
      drawing.moveTo(24, y);
      drawing.lineTo(canvas.width - 24, y);
      drawing.stroke();
    }

    const contours = [
      [42, 112, 168, 30, 266, 158, 382, 74],
      [70, 348, 202, 218, 304, 394, 446, 278],
      [340, 58, 462, 150, 560, 34, 712, 136],
      [402, 382, 528, 248, 628, 402, 742, 306],
    ] as const;
    drawing.strokeStyle = "rgba(74, 57, 36, 0.5)";
    drawing.lineWidth = 5;
    for (const [x1, y1, c1x, c1y, c2x, c2y, x2, y2] of contours) {
      drawing.beginPath();
      drawing.moveTo(x1, y1);
      drawing.bezierCurveTo(c1x, c1y, c2x, c2y, x2, y2);
      drawing.stroke();
    }

    drawing.setLineDash([12, 10]);
    drawing.strokeStyle = "rgba(38, 92, 98, 0.78)";
    drawing.lineWidth = 5;
    drawing.beginPath();
    drawing.moveTo(384, 232);
    drawing.bezierCurveTo(300, 176, 216, 120, 128, 90);
    drawing.moveTo(384, 232);
    drawing.bezierCurveTo(486, 194, 570, 128, 656, 82);
    drawing.moveTo(384, 232);
    drawing.bezierCurveTo(410, 300, 432, 344, 462, 390);
    drawing.stroke();
    drawing.setLineDash([]);

    drawing.setLineDash(mathDiscovered ? [8, 7] : [4, 12]);
    drawing.strokeStyle = mathDiscovered
      ? "rgba(146, 112, 221, 0.84)"
      : "rgba(77, 68, 58, 0.36)";
    drawing.lineWidth = mathDiscovered ? 4 : 3;
    drawing.beginPath();
    drawing.moveTo(658, 80);
    drawing.bezierCurveTo(688, 112, 704, 148, 696, 188);
    drawing.stroke();
    drawing.setLineDash([]);

    const destinations: Array<{
      x: number;
      y: number;
      color: string;
      label: string;
    }> = [
      { x: 126, y: 88, color: "#6ea66a", label: "FALLS" },
      { x: 658, y: 80, color: "#48c8d5", label: "GRID" },
      { x: 464, y: 390, color: "#9179df", label: "ARCHIVE" },
    ];
    if (mathDiscovered) {
      destinations.push({
        x: 696,
        y: 188,
        color: "#d5a455",
        label: "MATH",
      });
    }
    drawing.textAlign = "center";
    drawing.textBaseline = "middle";
    for (const destination of destinations) {
      drawing.fillStyle = destination.color;
      drawing.beginPath();
      drawing.arc(destination.x, destination.y, 16, 0, Math.PI * 2);
      drawing.fill();
      drawing.strokeStyle = "#443622";
      drawing.lineWidth = 5;
      drawing.stroke();
      drawing.fillStyle = "#3a2e20";
      drawing.font = "700 19px ui-monospace, monospace";
      drawing.fillText(destination.label, destination.x, destination.y + 35);
    }
    if (!mathDiscovered) {
      drawing.strokeStyle = "rgba(64, 54, 42, 0.5)";
      drawing.lineWidth = 4;
      drawing.strokeRect(683, 175, 26, 26);
      drawing.fillStyle = "rgba(58, 48, 37, 0.72)";
      drawing.font = "800 18px ui-monospace, monospace";
      drawing.fillText("?", 696, 188);
      drawing.fillText("UNINDEXED", 696, 225);
    }

    drawing.strokeStyle = "#6e5632";
    drawing.lineWidth = 6;
    drawing.beginPath();
    drawing.arc(384, 232, 28, 0, Math.PI * 2);
    drawing.stroke();
    drawing.fillStyle = "#315f63";
    drawing.beginPath();
    drawing.arc(384, 232, 9, 0, Math.PI * 2);
    drawing.fill();

    drawing.fillStyle = "#3b3021";
    drawing.textAlign = "left";
    drawing.font = "800 24px Georgia, serif";
    drawing.fillText("FIELD ATLAS", 34, 38);
    drawing.font = "600 15px ui-monospace, monospace";
    drawing.fillText("SURVEY 03 · STRANGE SKIES", 34, 62);

    drawing.strokeStyle = "#5c482d";
    drawing.lineWidth = 8;
    drawing.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    drawing.strokeStyle = "rgba(238, 210, 148, 0.55)";
    drawing.lineWidth = 2;
    drawing.strokeRect(21, 21, canvas.width - 42, canvas.height - 42);
  }
  return createTexture(canvas, "field-planning-atlas");
}
