import * as THREE from "three";

function createMathTexture(
  canvas: HTMLCanvasElement,
  name: string,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = name;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
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

export function createNeedleExperimentTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 608;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    const random = createRandom(0xb0ff0a);
    const wash = drawing.createLinearGradient(0, 0, canvas.width, canvas.height);
    wash.addColorStop(0, "#173b42");
    wash.addColorStop(0.55, "#102e35");
    wash.addColorStop(1, "#0b252c");
    drawing.fillStyle = wash;
    drawing.fillRect(0, 0, canvas.width, canvas.height);

    drawing.strokeStyle = "rgba(122,211,216,0.095)";
    drawing.lineWidth = 1;
    for (let x = 24; x < canvas.width; x += 24) {
      drawing.beginPath();
      drawing.moveTo(x + 0.5, 0);
      drawing.lineTo(x + 0.5, canvas.height);
      drawing.stroke();
    }
    for (let y = 24; y < canvas.height; y += 24) {
      drawing.beginPath();
      drawing.moveTo(0, y + 0.5);
      drawing.lineTo(canvas.width, y + 0.5);
      drawing.stroke();
    }

    // Sampling arcs and baseline rulers make the surface look purpose-built
    // without competing with the five physical Buffon guide lines above it.
    drawing.strokeStyle = "rgba(255,190,84,0.28)";
    drawing.lineWidth = 3;
    drawing.setLineDash([10, 8]);
    for (const radius of [92, 154, 216]) {
      drawing.beginPath();
      drawing.arc(canvas.width / 2, canvas.height / 2, radius, 0, Math.PI * 2);
      drawing.stroke();
    }
    drawing.setLineDash([]);

    drawing.strokeStyle = "rgba(235,235,215,0.3)";
    drawing.lineWidth = 2;
    for (let tick = 0; tick <= 24; tick += 1) {
      const x = 38 + (tick / 24) * (canvas.width - 76);
      const length = tick % 6 === 0 ? 18 : tick % 3 === 0 ? 12 : 7;
      drawing.beginPath();
      drawing.moveTo(x, 28);
      drawing.lineTo(x, 28 + length);
      drawing.moveTo(x, canvas.height - 28);
      drawing.lineTo(x, canvas.height - 28 - length);
      drawing.stroke();
    }

    drawing.fillStyle = "rgba(235,236,215,0.58)";
    drawing.font = "700 18px ui-monospace, monospace";
    drawing.textAlign = "left";
    drawing.fillText("BUFFON DROP FIELD", 44, 74);
    drawing.font = "600 14px ui-monospace, monospace";
    drawing.fillStyle = "rgba(150,222,224,0.48)";
    drawing.fillText("L / D = 1.000", 44, 99);
    drawing.textAlign = "right";
    drawing.fillStyle = "rgba(255,190,84,0.55)";
    drawing.fillText("π ← 2N / X", canvas.width - 44, 74);

    drawing.strokeStyle = "rgba(5,13,16,0.46)";
    drawing.lineWidth = 7;
    drawing.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    drawing.strokeStyle = "rgba(127,215,217,0.2)";
    drawing.lineWidth = 2;
    drawing.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);

    for (let scuff = 0; scuff < 90; scuff += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const length = 3 + random() * 18;
      drawing.strokeStyle =
        scuff % 5 === 0
          ? "rgba(226,192,128,0.11)"
          : "rgba(3,11,13,0.15)";
      drawing.lineWidth = 0.5 + random() * 0.8;
      drawing.beginPath();
      drawing.moveTo(x, y);
      drawing.lineTo(
        x + length,
        y + (random() - 0.5) * length * 0.28,
      );
      drawing.stroke();
    }
  }
  const texture = createMathTexture(canvas, "math-buffon-calibration-mat");
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export function createSierpinskiUnderfloorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 768;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    const random = createRandom(0x51e2f10f);
    const center = canvas.width / 2;
    const wash = drawing.createRadialGradient(
      center,
      center,
      18,
      center,
      center,
      center * 0.92,
    );
    wash.addColorStop(0, "#241b4d");
    wash.addColorStop(0.34, "#15143b");
    wash.addColorStop(0.72, "#0d102c");
    wash.addColorStop(1, "#09091d");
    drawing.fillStyle = wash;
    drawing.fillRect(0, 0, canvas.width, canvas.height);

    drawing.lineWidth = 1;
    for (let coordinate = 0; coordinate <= canvas.width; coordinate += 28.444) {
      const major = Math.round(coordinate / 28.444) % 3 === 0;
      drawing.strokeStyle = major
        ? "rgba(85,220,232,0.11)"
        : "rgba(158,130,255,0.055)";
      drawing.beginPath();
      drawing.moveTo(coordinate, 0);
      drawing.lineTo(coordinate, canvas.height);
      drawing.moveTo(0, coordinate);
      drawing.lineTo(canvas.width, coordinate);
      drawing.stroke();
    }

    // Nested missing-middle outlines imply more carpet below the walkable
    // layer. They are deliberately dim so the colored top tiles remain the
    // room's dominant pattern.
    // Start inside the first missing middle. An outline around the entire
    // plane read as a second border competing with the walkable carpet.
    let size = (canvas.width * 0.92) / 3;
    for (let generation = 1; generation < 6; generation += 1) {
      drawing.strokeStyle =
        generation % 2 === 0
          ? `rgba(85,220,232,${0.16 - generation * 0.018})`
          : `rgba(158,130,255,${0.18 - generation * 0.02})`;
      drawing.lineWidth = Math.max(1, 4 - generation * 0.45);
      drawing.strokeRect(
        center - size / 2,
        center - size / 2,
        size,
        size,
      );
      const missing = size / 3;
      drawing.fillStyle = `rgba(2,3,12,${0.2 + generation * 0.06})`;
      drawing.fillRect(
        center - missing / 2,
        center - missing / 2,
        missing,
        missing,
      );
      size /= 3;
    }

    for (let star = 0; star < 180; star += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const radius = star % 19 === 0 ? 2.2 : 0.45 + random() * 0.85;
      drawing.fillStyle =
        star % 13 === 0
          ? "rgba(255,189,85,0.42)"
          : `rgba(164,211,240,${0.1 + random() * 0.25})`;
      drawing.beginPath();
      drawing.arc(x, y, radius, 0, Math.PI * 2);
      drawing.fill();
    }
  }
  const texture = createMathTexture(canvas, "math-sierpinski-deep-underfloor");
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}
