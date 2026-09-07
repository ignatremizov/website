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

function configureRepeatingTexture(
  texture: THREE.CanvasTexture,
  repeatX: number,
  repeatY: number,
  rotation = 0,
): THREE.CanvasTexture {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.rotation = rotation;
  texture.center.set(0.5, 0.5);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function forEachWrappedCanvasPoint(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  draw: (wrappedX: number, wrappedY: number) => void,
): void {
  for (const offsetX of [-canvas.width, 0, canvas.width]) {
    for (const offsetY of [-canvas.height, 0, canvas.height]) {
      draw(x + offsetX, y + offsetY);
    }
  }
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
  // The ground is seen at shallow camera angles, where mipmaps prevent the
  // repeated survey grain from shimmering as the player moves.
  return configureRepeatingTexture(texture, 3.4, 3.4, 0.17);
}

export function createFieldGroundReliefTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    const random = createRandom(0x8175eedd);
    drawing.fillStyle = "#858585";
    drawing.fillRect(0, 0, canvas.width, canvas.height);

    for (let index = 0; index < 360; index += 1) {
      const shade = Math.round(88 + random() * 92);
      drawing.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
      drawing.beginPath();
      drawing.ellipse(
        random() * canvas.width,
        random() * canvas.height,
        0.45 + random() * 2.2,
        0.35 + random() * 1.45,
        random() * Math.PI,
        0,
        Math.PI * 2,
      );
      drawing.fill();
    }

    drawing.lineCap = "round";
    for (let index = 0; index < 24; index += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const length = 10 + random() * 38;
      drawing.strokeStyle =
        index % 3 === 0 ? "rgba(184,184,184,0.32)" : "rgba(72,72,72,0.3)";
      drawing.lineWidth = 0.7 + random() * 1.3;
      drawing.beginPath();
      drawing.moveTo(x, y);
      drawing.bezierCurveTo(
        x + length * 0.3,
        y + (random() - 0.5) * 8,
        x + length * 0.72,
        y + (random() - 0.5) * 10,
        x + length,
        y + (random() - 0.5) * 7,
      );
      drawing.stroke();
    }
  }
  const texture = createTexture(canvas, "field-survey-ground-relief");
  texture.colorSpace = THREE.NoColorSpace;
  return configureRepeatingTexture(texture, 3.4, 3.4, 0.17);
}

export function createFieldFoundationTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    const random = createRandom(0xf013da71);
    const wash = drawing.createLinearGradient(0, 0, 0, canvas.height);
    wash.addColorStop(0, "#3f4b42");
    wash.addColorStop(0.52, "#303d37");
    wash.addColorStop(1, "#222d2a");
    drawing.fillStyle = wash;
    drawing.fillRect(0, 0, canvas.width, canvas.height);

    drawing.lineCap = "round";
    for (let layer = 0; layer < 14; layer += 1) {
      const y = 8 + layer * 18 + (random() - 0.5) * 5;
      drawing.strokeStyle =
        layer % 3 === 0
          ? "rgba(130,146,119,0.22)"
          : "rgba(12,22,20,0.38)";
      drawing.lineWidth = 1.2 + random() * 2.4;
      drawing.beginPath();
      drawing.moveTo(-12, y);
      for (let step = 0; step <= 8; step += 1) {
        drawing.lineTo(
          step * 36,
          y + Math.sin(step * 1.31 + layer) * 3 + (random() - 0.5) * 4,
        );
      }
      drawing.stroke();
    }

    for (let crack = 0; crack < 20; crack += 1) {
      let x = random() * canvas.width;
      let y = random() * canvas.height;
      drawing.strokeStyle = "rgba(8,14,13,0.48)";
      drawing.lineWidth = 0.7 + random() * 1.1;
      drawing.beginPath();
      drawing.moveTo(x, y);
      for (let branch = 0; branch < 3 + Math.floor(random() * 3); branch += 1) {
        x += (random() - 0.5) * 10;
        y += 5 + random() * 12;
        drawing.lineTo(x, y);
      }
      drawing.stroke();
    }

    for (let fleck = 0; fleck < 180; fleck += 1) {
      drawing.fillStyle =
        fleck % 4 === 0 ? "rgba(151,158,125,0.15)" : "rgba(7,16,14,0.19)";
      drawing.fillRect(
        random() * canvas.width,
        random() * canvas.height,
        0.7 + random() * 1.8,
        0.7 + random() * 1.8,
      );
    }
  }
  return configureRepeatingTexture(
    createTexture(canvas, "field-foundation-strata"),
    5.2,
    1.45,
  );
}

export function createFieldShelfTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    const random = createRandom(0x5e1f5eed);
    drawing.fillStyle = "#344239";
    drawing.fillRect(0, 0, canvas.width, canvas.height);

    // Copy every mark across opposite edges while drawing so the resulting
    // shelf texture tiles without the square seams visible on a broad cap.
    for (let patch = 0; patch < 68; patch += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const radiusX = 4 + random() * 19;
      const radiusY = 3 + random() * 13;
      const rotation = random() * Math.PI;
      drawing.fillStyle =
        patch % 4 === 0
          ? `rgba(101,123,87,${0.055 + random() * 0.07})`
          : `rgba(17,26,23,${0.045 + random() * 0.075})`;
      forEachWrappedCanvasPoint(canvas, x, y, (wrappedX, wrappedY) => {
        drawing.beginPath();
        drawing.ellipse(
          wrappedX,
          wrappedY,
          radiusX,
          radiusY,
          rotation,
          0,
          Math.PI * 2,
        );
        drawing.fill();
      });
    }

    drawing.lineCap = "round";
    for (let crack = 0; crack < 28; crack += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const angle = random() * Math.PI * 2;
      const length = 5 + random() * 19;
      drawing.strokeStyle =
        crack % 5 === 0
          ? "rgba(142,151,116,0.13)"
          : "rgba(7,15,13,0.28)";
      drawing.lineWidth = 0.6 + random() * 1.05;
      forEachWrappedCanvasPoint(canvas, x, y, (wrappedX, wrappedY) => {
        drawing.beginPath();
        drawing.moveTo(wrappedX, wrappedY);
        drawing.lineTo(
          wrappedX + Math.cos(angle) * length,
          wrappedY + Math.sin(angle) * length,
        );
        drawing.stroke();
      });
    }

    for (let fleck = 0; fleck < 190; fleck += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const radius = 0.35 + random() * 1.15;
      drawing.fillStyle =
        fleck % 6 === 0 ? "rgba(174,170,124,0.14)" : "rgba(9,18,15,0.2)";
      forEachWrappedCanvasPoint(canvas, x, y, (wrappedX, wrappedY) => {
        drawing.beginPath();
        drawing.arc(wrappedX, wrappedY, radius, 0, Math.PI * 2);
        drawing.fill();
      });
    }
  }
  return configureRepeatingTexture(
    createTexture(canvas, "field-outer-shelf-seamless-stone"),
    3.8,
    3.8,
    -0.08,
  );
}

export function createFieldCanvasTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    const random = createRandom(0xca7a5eed);
    drawing.fillStyle = "#ded8c7";
    drawing.fillRect(0, 0, canvas.width, canvas.height);

    drawing.lineWidth = 0.55;
    for (let thread = 0; thread < canvas.width; thread += 4) {
      drawing.strokeStyle =
        thread % 12 === 0
          ? "rgba(255,250,226,0.22)"
          : "rgba(61,57,48,0.14)";
      drawing.beginPath();
      drawing.moveTo(thread + 0.5, 0);
      drawing.lineTo(thread + 0.5, canvas.height);
      drawing.stroke();
    }
    for (let thread = 1; thread < canvas.height; thread += 3) {
      drawing.strokeStyle =
        thread % 9 === 1
          ? "rgba(255,250,226,0.16)"
          : "rgba(47,48,42,0.11)";
      drawing.beginPath();
      drawing.moveTo(0, thread + 0.5);
      drawing.lineTo(canvas.width, thread + 0.5);
      drawing.stroke();
    }

    for (let stain = 0; stain < 34; stain += 1) {
      drawing.fillStyle =
        stain % 4 === 0
          ? `rgba(49,54,44,${0.015 + random() * 0.035})`
          : `rgba(122,92,55,${0.012 + random() * 0.026})`;
      drawing.beginPath();
      drawing.ellipse(
        random() * canvas.width,
        random() * canvas.height,
        4 + random() * 24,
        2 + random() * 10,
        random() * Math.PI,
        0,
        Math.PI * 2,
      );
      drawing.fill();
    }
  }
  return configureRepeatingTexture(
    createTexture(canvas, "field-weathered-canvas-weave"),
    3.2,
    2.4,
    0.03,
  );
}

export function createFieldWoodTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    const random = createRandom(0x7100d51a);
    const wash = drawing.createLinearGradient(0, 0, 0, canvas.height);
    wash.addColorStop(0, "#70472d");
    wash.addColorStop(0.5, "#583522");
    wash.addColorStop(1, "#43271b");
    drawing.fillStyle = wash;
    drawing.fillRect(0, 0, canvas.width, canvas.height);

    drawing.lineCap = "round";
    for (let grain = 0; grain < 46; grain += 1) {
      const y = random() * canvas.height;
      drawing.strokeStyle =
        grain % 5 === 0
          ? "rgba(224,158,91,0.18)"
          : "rgba(31,15,11,0.24)";
      drawing.lineWidth = 0.45 + random() * 1.15;
      drawing.beginPath();
      drawing.moveTo(-12, y);
      drawing.bezierCurveTo(
        58,
        y + (random() - 0.5) * 12,
        188,
        y + (random() - 0.5) * 15,
        268,
        y + (random() - 0.5) * 9,
      );
      drawing.stroke();
    }

    for (let knot = 0; knot < 7; knot += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      for (let ring = 0; ring < 3; ring += 1) {
        drawing.strokeStyle = `rgba(30,14,10,${0.22 - ring * 0.045})`;
        drawing.lineWidth = 1;
        drawing.beginPath();
        drawing.ellipse(
          x,
          y,
          3 + ring * 3.8,
          1.5 + ring * 1.9,
          (random() - 0.5) * 0.22,
          0,
          Math.PI * 2,
        );
        drawing.stroke();
      }
    }

    drawing.strokeStyle = "rgba(235,190,121,0.13)";
    for (let scratch = 0; scratch < 18; scratch += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      drawing.beginPath();
      drawing.moveTo(x, y);
      drawing.lineTo(x + 8 + random() * 32, y + (random() - 0.5) * 5);
      drawing.stroke();
    }
  }
  return configureRepeatingTexture(
    createTexture(canvas, "field-weathered-survey-wood"),
    1.8,
    1.35,
  );
}

export function createFallsBridgeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    const random = createRandom(0xb71d6e5);
    const wash = drawing.createLinearGradient(0, 0, canvas.width, 0);
    wash.addColorStop(0, "#251b18");
    wash.addColorStop(0.08, "#4a3327");
    wash.addColorStop(0.48, "#604331");
    wash.addColorStop(0.9, "#3d2b24");
    wash.addColorStop(1, "#1d1716");
    drawing.fillStyle = wash;
    drawing.fillRect(0, 0, canvas.width, canvas.height);

    // Long fibres make each short slab read as a plank from the game camera.
    drawing.lineCap = "round";
    for (let grain = 0; grain < 72; grain += 1) {
      const x = random() * canvas.width;
      const drift = (random() - 0.5) * 28;
      drawing.strokeStyle =
        grain % 7 === 0
          ? `rgba(205,155,103,${0.08 + random() * 0.08})`
          : `rgba(18,13,13,${0.1 + random() * 0.15})`;
      drawing.lineWidth = 0.45 + random() * 1.45;
      drawing.beginPath();
      drawing.moveTo(x, -18);
      drawing.bezierCurveTo(
        x + drift * 0.35,
        132,
        x - drift * 0.22,
        356,
        x + drift,
        canvas.height + 18,
      );
      drawing.stroke();
    }

    for (let knot = 0; knot < 8; knot += 1) {
      const x = 30 + random() * (canvas.width - 60);
      const y = 48 + random() * (canvas.height - 96);
      const rotation = (random() - 0.5) * 0.34;
      for (let ring = 0; ring < 4; ring += 1) {
        drawing.strokeStyle = `rgba(20,13,12,${0.28 - ring * 0.045})`;
        drawing.lineWidth = 0.8 + ring * 0.22;
        drawing.beginPath();
        drawing.ellipse(
          x,
          y,
          3.5 + ring * 3.5,
          8 + ring * 5.4,
          rotation,
          0,
          Math.PI * 2,
        );
        drawing.stroke();
      }
    }

    const wetSheen = drawing.createLinearGradient(
      0,
      canvas.height * 0.18,
      canvas.width,
      canvas.height * 0.74,
    );
    wetSheen.addColorStop(0, "rgba(91,183,187,0)");
    wetSheen.addColorStop(0.46, "rgba(91,183,187,0.085)");
    wetSheen.addColorStop(0.58, "rgba(216,249,240,0.055)");
    wetSheen.addColorStop(1, "rgba(91,183,187,0)");
    drawing.fillStyle = wetSheen;
    drawing.fillRect(0, 0, canvas.width, canvas.height);

    for (const y of [38, canvas.height - 38]) {
      for (const x of [24, canvas.width - 24]) {
        drawing.fillStyle = "rgba(8,10,11,0.76)";
        drawing.beginPath();
        drawing.arc(x, y, 6.5, 0, Math.PI * 2);
        drawing.fill();
        drawing.fillStyle = "rgba(155,188,178,0.42)";
        drawing.beginPath();
        drawing.arc(x - 1.5, y - 1.8, 2.1, 0, Math.PI * 2);
        drawing.fill();
      }
    }

    drawing.fillStyle = "rgba(61,91,61,0.18)";
    for (let moss = 0; moss < 42; moss += 1) {
      const edgeX = random() < 0.5 ? random() * 25 : 231 + random() * 25;
      drawing.beginPath();
      drawing.ellipse(
        edgeX,
        random() * canvas.height,
        2 + random() * 8,
        3 + random() * 13,
        random() * Math.PI,
        0,
        Math.PI * 2,
      );
      drawing.fill();
    }
  }
  const texture = createTexture(canvas, "falls-weathered-wet-bridge-plank");
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function createFallsGroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    const random = createRandom(0xfa115eed);
    drawing.fillStyle = "#3c503e";
    drawing.fillRect(0, 0, canvas.width, canvas.height);

    for (let patch = 0; patch < 82; patch += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const radiusX = 4 + random() * 21;
      const radiusY = 3 + random() * 15;
      const rotation = random() * Math.PI;
      drawing.fillStyle =
        patch % 5 === 0
          ? `rgba(105,128,78,${0.06 + random() * 0.08})`
          : patch % 3 === 0
            ? `rgba(75,57,38,${0.045 + random() * 0.07})`
            : `rgba(17,31,24,${0.035 + random() * 0.06})`;
      forEachWrappedCanvasPoint(canvas, x, y, (wrappedX, wrappedY) => {
        drawing.beginPath();
        drawing.ellipse(
          wrappedX,
          wrappedY,
          radiusX,
          radiusY,
          rotation,
          0,
          Math.PI * 2,
        );
        drawing.fill();
      });
    }

    drawing.lineCap = "round";
    for (let blade = 0; blade < 150; blade += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const angle = -1.9 + random() * 0.65;
      const length = 1.5 + random() * 5;
      drawing.strokeStyle =
        blade % 7 === 0
          ? "rgba(157,164,102,0.17)"
          : "rgba(13,31,21,0.2)";
      drawing.lineWidth = 0.45 + random() * 0.55;
      forEachWrappedCanvasPoint(canvas, x, y, (wrappedX, wrappedY) => {
        drawing.beginPath();
        drawing.moveTo(wrappedX, wrappedY);
        drawing.lineTo(
          wrappedX + Math.cos(angle) * length,
          wrappedY + Math.sin(angle) * length,
        );
        drawing.stroke();
      });
    }

    for (let pebble = 0; pebble < 130; pebble += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const radius = 0.45 + random() * 1.35;
      drawing.fillStyle =
        pebble % 6 === 0
          ? "rgba(175,163,111,0.18)"
          : "rgba(13,20,18,0.23)";
      forEachWrappedCanvasPoint(canvas, x, y, (wrappedX, wrappedY) => {
        drawing.beginPath();
        drawing.arc(wrappedX, wrappedY, radius, 0, Math.PI * 2);
        drawing.fill();
      });
    }
  }
  return configureRepeatingTexture(
    createTexture(canvas, "falls-mossy-ground"),
    4.2,
    4.2,
    0.09,
  );
}

export function createFallsGroundReliefTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    const random = createRandom(0xfa115e1f);
    drawing.fillStyle = "#868686";
    drawing.fillRect(0, 0, canvas.width, canvas.height);
    for (let clump = 0; clump < 340; clump += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const radiusX = 0.45 + random() * 2.3;
      const radiusY = 0.35 + random() * 1.65;
      const rotation = random() * Math.PI;
      const shade = Math.round(78 + random() * 112);
      drawing.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
      forEachWrappedCanvasPoint(canvas, x, y, (wrappedX, wrappedY) => {
        drawing.beginPath();
        drawing.ellipse(
          wrappedX,
          wrappedY,
          radiusX,
          radiusY,
          rotation,
          0,
          Math.PI * 2,
        );
        drawing.fill();
      });
    }
  }
  const texture = createTexture(canvas, "falls-mossy-ground-relief");
  texture.colorSpace = THREE.NoColorSpace;
  return configureRepeatingTexture(texture, 4.2, 4.2, 0.09);
}

export function createFallsCliffTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    const random = createRandom(0xc11fface);
    drawing.fillStyle = "#657274";
    drawing.fillRect(0, 0, canvas.width, canvas.height);

    // Broad wrapped mineral patches establish irregular value before cracks
    // and broken strata. There is deliberately no top-to-bottom wash: a
    // gradient cannot tile vertically without exposing a repeated seam.
    for (let patch = 0; patch < 190; patch += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const radiusX = 10 + random() * 58;
      const radiusY = 7 + random() * 38;
      const rotation = random() * Math.PI;
      const shade = patch % 5;
      drawing.fillStyle =
        shade === 0
          ? `rgba(182,178,156,${0.045 + random() * 0.08})`
          : shade === 1
            ? `rgba(38,53,61,${0.06 + random() * 0.08})`
            : shade === 2
              ? `rgba(111,132,133,${0.05 + random() * 0.09})`
              : `rgba(49,63,71,${0.035 + random() * 0.07})`;
      forEachWrappedCanvasPoint(canvas, x, y, (wrappedX, wrappedY) => {
        drawing.beginPath();
        drawing.ellipse(
          wrappedX,
          wrappedY,
          radiusX,
          radiusY,
          rotation,
          0,
          Math.PI * 2,
        );
        drawing.fill();
      });
    }

    // Broken mineral veins run through several fracture directions. Reuse
    // identical local points in the wrapped copies so the tile stays seamless.
    drawing.lineCap = "round";
    drawing.lineJoin = "round";
    for (let seam = 0; seam < 40; seam += 1) {
      const startX = random() * canvas.width;
      const startY = random() * canvas.height;
      const span = 28 + random() * 108;
      const angle = (seam % 3) * Math.PI / 3 + (random() - 0.5) * 0.45;
      const tangentX = Math.cos(angle);
      const tangentY = Math.sin(angle);
      const points = Array.from({ length: 5 }, (_, segment) => {
        const distance = (segment / 4) * span;
        const split = (random() - 0.5) * 9;
        return [
          tangentX * distance - tangentY * split,
          tangentY * distance + tangentX * split,
        ] as const;
      });
      drawing.strokeStyle =
        seam % 4 === 0
          ? `rgba(187,191,172,${0.1 + random() * 0.09})`
          : `rgba(32,44,52,${0.1 + random() * 0.11})`;
      drawing.lineWidth = 0.65 + random() * 1.7;
      forEachWrappedCanvasPoint(canvas, startX, startY, (wrappedX, wrappedY) => {
        drawing.beginPath();
        for (const [index, [x, y]] of points.entries()) {
          if (index === 0) drawing.moveTo(wrappedX + x, wrappedY + y);
          else drawing.lineTo(wrappedX + x, wrappedY + y);
        }
        drawing.stroke();
      });
    }

    // Angular chips break up both horizontal faces and vertical walls.
    for (let chip = 0; chip < 95; chip += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const radius = 3 + random() * 15;
      const sides = 3 + (chip % 4);
      const rotation = random() * Math.PI * 2;
      drawing.fillStyle =
        chip % 3 === 0
          ? `rgba(189,192,178,${0.04 + random() * 0.06})`
          : `rgba(30,44,52,${0.045 + random() * 0.07})`;
      const corners = Array.from({ length: sides }, (_, side) => {
        const angle = rotation + (side / sides) * Math.PI * 2;
        const localRadius = radius * (0.68 + random() * 0.48);
        return [
          Math.cos(angle) * localRadius,
          Math.sin(angle) * localRadius,
        ] as const;
      });
      forEachWrappedCanvasPoint(canvas, x, y, (wrappedX, wrappedY) => {
        drawing.beginPath();
        for (const [side, [localX, localY]] of corners.entries()) {
          const pointX = wrappedX + localX;
          const pointY = wrappedY + localY;
          if (side === 0) drawing.moveTo(pointX, pointY);
          else drawing.lineTo(pointX, pointY);
        }
        drawing.closePath();
        drawing.fill();
      });
    }

    for (let crack = 0; crack < 52; crack += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const angle = random() * Math.PI * 2;
      const length = 10 + random() * 38;
      const tangentX = Math.cos(angle);
      const tangentY = Math.sin(angle);
      const normalX = -tangentY;
      const normalY = tangentX;
      drawing.strokeStyle = "rgba(26,37,44,0.32)";
      drawing.lineWidth = 0.65 + random() * 1.35;
      forEachWrappedCanvasPoint(canvas, x, y, (wrappedX, wrappedY) => {
        drawing.beginPath();
        drawing.moveTo(wrappedX, wrappedY);
        drawing.lineTo(
          wrappedX + tangentX * length * 0.42 + normalX * 3,
          wrappedY + tangentY * length * 0.42 + normalY * 3,
        );
        drawing.lineTo(
          wrappedX + tangentX * length - normalX * 2,
          wrappedY + tangentY * length - normalY * 2,
        );
        drawing.stroke();
      });
    }

    for (let moss = 0; moss < 42; moss += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const radiusX = 7 + random() * 28;
      const radiusY = 3 + random() * 13;
      const rotation = random() * Math.PI;
      drawing.fillStyle = `rgba(91,119,72,${0.04 + random() * 0.065})`;
      forEachWrappedCanvasPoint(canvas, x, y, (wrappedX, wrappedY) => {
        drawing.beginPath();
        drawing.ellipse(
          wrappedX,
          wrappedY,
          radiusX,
          radiusY,
          rotation,
          0,
          Math.PI * 2,
        );
        drawing.fill();
      });
    }
  }
  return configureRepeatingTexture(
    createTexture(canvas, "falls-fractured-strata-cliff"),
    1.35,
    1.35,
    0.035,
  );
}

export function createFallsWaterTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 512;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    const pixels = drawing.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += 1) {
      const v = y / canvas.height;
      for (let x = 0; x < canvas.width; x += 1) {
        const u = x / canvas.width;
        const broad =
          Math.sin(v * Math.PI * 12 + Math.sin(u * Math.PI * 4) * 1.35) *
          0.5;
        const filament =
          Math.sin(v * Math.PI * 34 + u * Math.PI * 10) * 0.22;
        const crossCurrent =
          Math.sin((v * 8 - u * 3) * Math.PI * 2) * 0.13;
        const flow = broad + filament + crossCurrent;
        const pale = THREE.MathUtils.clamp(0.48 + flow * 0.34, 0, 1);
        const index = (y * canvas.width + x) * 4;
        pixels.data[index] = Math.round(47 + pale * 82);
        pixels.data[index + 1] = Math.round(151 + pale * 82);
        pixels.data[index + 2] = Math.round(178 + pale * 72);
        pixels.data[index + 3] = Math.round(155 + pale * 82);
      }
    }
    drawing.putImageData(pixels, 0, 0);

    drawing.strokeStyle = "rgba(221, 253, 255, 0.34)";
    drawing.lineCap = "round";
    for (let filament = 0; filament < 16; filament += 1) {
      const x = 5 + ((filament * 37) % 118);
      drawing.lineWidth = filament % 4 === 0 ? 1.6 : 0.75;
      drawing.beginPath();
      drawing.moveTo(x, -12);
      drawing.bezierCurveTo(
        x + Math.sin(filament) * 9,
        130,
        x - Math.cos(filament * 0.8) * 11,
        360,
        x,
        524,
      );
      drawing.stroke();
    }
  }
  return configureRepeatingTexture(
    createTexture(canvas, "falls-flowing-water"),
    1.35,
    3.6,
  );
}

export function createArchiveFloorTexture(
  atlasWorldX = 0,
  atlasWorldZ = 0,
  worldDiameter = 27.6,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 768;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    const random = createRandom(0xa2c41e);
    const deckCenter = canvas.width / 2;
    const atlasCenterX =
      deckCenter + (atlasWorldX / worldDiameter) * canvas.width;
    const atlasCenterY =
      deckCenter + (atlasWorldZ / worldDiameter) * canvas.height;
    const wash = drawing.createRadialGradient(
      deckCenter,
      deckCenter,
      26,
      deckCenter,
      deckCenter,
      deckCenter,
    );
    wash.addColorStop(0, "#1b2637");
    wash.addColorStop(0.42, "#121d2b");
    wash.addColorStop(0.78, "#0c1421");
    wash.addColorStop(1, "#070b14");
    drawing.fillStyle = wash;
    drawing.fillRect(0, 0, canvas.width, canvas.height);

    // Observatory decking follows polar coordinates rather than looking like
    // another rectangular computer grid.
    drawing.lineCap = "round";
    for (let sector = 0; sector < 20; sector += 1) {
      const angle = (sector / 20) * Math.PI * 2 - Math.PI / 2;
      const inner = sector % 2 === 0 ? 52 : 118;
      drawing.strokeStyle =
        sector % 5 === 0
          ? "rgba(104,195,212,0.21)"
          : "rgba(116,139,167,0.13)";
      drawing.lineWidth = sector % 5 === 0 ? 2.2 : 1.2;
      drawing.beginPath();
      drawing.moveTo(
        deckCenter + Math.cos(angle) * inner,
        deckCenter + Math.sin(angle) * inner,
      );
      drawing.lineTo(
        deckCenter + Math.cos(angle) * 372,
        deckCenter + Math.sin(angle) * 372,
      );
      drawing.stroke();
    }

    for (const [index, radius] of [62, 118, 184, 252, 320, 364].entries()) {
      const instrumentRing = index < 4;
      drawing.strokeStyle =
        index === 3
          ? "rgba(157,128,255,0.22)"
          : index % 2 === 0
            ? "rgba(86,213,230,0.16)"
            : "rgba(149,168,189,0.12)";
      drawing.lineWidth = index === 3 ? 2.4 : 1.25;
      drawing.beginPath();
      drawing.arc(
        instrumentRing ? atlasCenterX : deckCenter,
        instrumentRing ? atlasCenterY : deckCenter,
        radius,
        0,
        Math.PI * 2,
      );
      drawing.stroke();
    }

    drawing.strokeStyle = "rgba(255,185,82,0.32)";
    drawing.lineWidth = 2;
    drawing.setLineDash([8, 10]);
    drawing.beginPath();
    drawing.moveTo(deckCenter, deckCenter);
    drawing.lineTo(atlasCenterX, atlasCenterY);
    drawing.stroke();
    drawing.setLineDash([]);
    drawing.strokeStyle = "rgba(85,220,232,0.42)";
    drawing.lineWidth = 2.5;
    drawing.strokeRect(atlasCenterX - 8, atlasCenterY - 8, 16, 16);

    for (let tick = 0; tick < 120; tick += 1) {
      const angle = (tick / 120) * Math.PI * 2;
      const inner = tick % 10 === 0 ? 341 : tick % 5 === 0 ? 349 : 354;
      const outer = 364;
      drawing.strokeStyle =
        tick % 10 === 0
          ? "rgba(255,185,82,0.42)"
          : "rgba(127,210,221,0.2)";
      drawing.lineWidth = tick % 10 === 0 ? 2.1 : 1;
      drawing.beginPath();
      drawing.moveTo(
        deckCenter + Math.cos(angle) * inner,
        deckCenter + Math.sin(angle) * inner,
      );
      drawing.lineTo(
        deckCenter + Math.cos(angle) * outer,
        deckCenter + Math.sin(angle) * outer,
      );
      drawing.stroke();
    }

    const orbitalArcs = [
      { radius: 96, start: 0.1, span: 1.4, color: "rgba(85,220,232,0.42)" },
      { radius: 154, start: 2.1, span: 1.9, color: "rgba(255,169,40,0.34)" },
      { radius: 218, start: 4.25, span: 1.2, color: "rgba(158,130,255,0.42)" },
      { radius: 286, start: 0.75, span: 0.92, color: "rgba(85,220,232,0.31)" },
    ] as const;
    for (const arc of orbitalArcs) {
      drawing.strokeStyle = arc.color;
      drawing.lineWidth = 4;
      drawing.beginPath();
      drawing.arc(
        atlasCenterX,
        atlasCenterY,
        arc.radius,
        arc.start,
        arc.start + arc.span,
      );
      drawing.stroke();
      const end = arc.start + arc.span;
      drawing.fillStyle = arc.color;
      drawing.beginPath();
      drawing.arc(
        atlasCenterX + Math.cos(end) * arc.radius,
        atlasCenterY + Math.sin(end) * arc.radius,
        5,
        0,
        Math.PI * 2,
      );
      drawing.fill();
    }

    for (let star = 0; star < 96; star += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 34 + Math.sqrt(random()) * 322;
      const x = deckCenter + Math.cos(angle) * radius;
      const y = deckCenter + Math.sin(angle) * radius;
      const size = star % 13 === 0 ? 2.6 : 0.7 + random() * 1.1;
      drawing.fillStyle =
        star % 11 === 0
          ? "rgba(255,184,92,0.48)"
          : `rgba(177,226,239,${0.12 + random() * 0.28})`;
      drawing.fillRect(x - size / 2, y - size / 2, size, size);
    }

    drawing.strokeStyle = "rgba(3,7,14,0.58)";
    drawing.lineWidth = 8;
    drawing.beginPath();
    drawing.arc(deckCenter, deckCenter, 378, 0, Math.PI * 2);
    drawing.stroke();
  }
  const texture = createTexture(canvas, "archive-polar-observatory-deck");
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export type ArchiveConsoleDisplayKind = "ledger" | "market";

export function createArchiveConsoleDisplayTexture(
  kind: ArchiveConsoleDisplayKind,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    const ledger = kind === "ledger";
    const background = drawing.createLinearGradient(0, 0, 512, 256);
    background.addColorStop(0, ledger ? "#092a31" : "#281908");
    background.addColorStop(0.58, ledger ? "#0d2029" : "#1d160d");
    background.addColorStop(1, "#080d14");
    drawing.fillStyle = background;
    drawing.fillRect(0, 0, 512, 256);

    const gridColor = ledger
      ? "rgba(117,230,238,0.13)"
      : "rgba(255,190,72,0.13)";
    drawing.strokeStyle = gridColor;
    drawing.lineWidth = 1;
    for (let x = 16; x < canvas.width; x += 32) {
      drawing.beginPath();
      drawing.moveTo(x + 0.5, 14);
      drawing.lineTo(x + 0.5, 242);
      drawing.stroke();
    }
    for (let y = 16; y < canvas.height; y += 24) {
      drawing.beginPath();
      drawing.moveTo(14, y + 0.5);
      drawing.lineTo(498, y + 0.5);
      drawing.stroke();
    }

    const accent = ledger ? "#83f4f2" : "#ffc85e";
    const accentSoft = ledger
      ? "rgba(131,244,242,0.48)"
      : "rgba(255,200,94,0.48)";
    drawing.strokeStyle = accentSoft;
    drawing.lineWidth = 2;
    drawing.strokeRect(8, 8, 496, 240);
    drawing.fillStyle = accent;
    drawing.fillRect(18, 19, 8, 8);

    drawing.font =
      "700 17px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    drawing.textBaseline = "middle";
    drawing.fillStyle = accent;
    drawing.fillText(
      ledger ? "SETTLEMENT BUS // LIVE" : "MARKET SIM // DELAYED",
      36,
      24,
    );
    drawing.textAlign = "right";
    drawing.fillStyle = "rgba(239,250,250,0.76)";
    drawing.fillText(ledger ? "SEPA SCT INST" : "ORBITAL INDEX", 490, 24);
    drawing.textAlign = "left";

    if (ledger) {
      drawing.font =
        "700 36px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      drawing.fillStyle = "#d8ffff";
      drawing.fillText("EUR 4.27M", 22, 68);
      drawing.font =
        "600 15px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      drawing.fillStyle = "rgba(216,255,255,0.72)";
      drawing.fillText("AVAILABLE", 24, 94);
      drawing.fillText("QUEUE  0004", 332, 63);
      drawing.fillText("WAKE   008ms", 332, 86);

      const values = [0.18, 0.27, 0.24, 0.39, 0.34, 0.47, 0.44, 0.62, 0.57, 0.75];
      drawing.strokeStyle = "#83f4f2";
      drawing.lineWidth = 4;
      drawing.lineJoin = "round";
      drawing.beginPath();
      for (const [index, value] of values.entries()) {
        const x = 24 + index * 50.5;
        const y = 218 - value * 112;
        if (index === 0) drawing.moveTo(x, y);
        else drawing.lineTo(x, y);
      }
      drawing.stroke();
      drawing.strokeStyle = "rgba(255,255,255,0.58)";
      drawing.lineWidth = 1.5;
      drawing.beginPath();
      drawing.moveTo(24, 218);
      drawing.lineTo(488, 218);
      drawing.stroke();
      drawing.fillStyle = "rgba(216,255,255,0.7)";
      drawing.fillText("COMPLIANCE OK", 24, 236);
      drawing.textAlign = "right";
      drawing.fillText("LEDGER 91AF:7C2D", 488, 236);
      drawing.textAlign = "left";
    } else {
      drawing.font =
        "700 32px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      drawing.fillStyle = "#fff0c5";
      drawing.fillText("NAV 102.48", 22, 66);
      drawing.font =
        "600 15px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      drawing.fillStyle = "rgba(255,240,197,0.72)";
      drawing.fillText("SIMULATED FEED", 24, 92);
      drawing.fillStyle = "#71e6ae";
      drawing.fillText("+1.84%", 383, 68);

      const random = createRandom(0x4d41524b);
      let close = 0.48;
      const candleBottom = 219;
      const candleHeight = 112;
      for (let index = 0; index < 15; index += 1) {
        const open = close;
        close = Math.max(
          0.1,
          Math.min(0.9, open + (random() - 0.46) * 0.24),
        );
        const high = Math.min(0.96, Math.max(open, close) + random() * 0.12);
        const low = Math.max(0.04, Math.min(open, close) - random() * 0.12);
        const x = 28 + index * 31;
        const rising = close >= open;
        drawing.strokeStyle = rising ? "#71e6ae" : "#ff765f";
        drawing.fillStyle = rising ? "#43bd87" : "#df594d";
        drawing.lineWidth = 2;
        drawing.beginPath();
        drawing.moveTo(x, candleBottom - low * candleHeight);
        drawing.lineTo(x, candleBottom - high * candleHeight);
        drawing.stroke();
        const bodyTop = candleBottom - Math.max(open, close) * candleHeight;
        const bodyBottom = candleBottom - Math.min(open, close) * candleHeight;
        drawing.fillRect(
          x - 7,
          bodyTop,
          14,
          Math.max(4, bodyBottom - bodyTop),
        );
      }
      drawing.fillStyle = "rgba(255,240,197,0.7)";
      drawing.fillText("VOL 01.42", 24, 236);
      drawing.textAlign = "right";
      drawing.fillText("RISK 0.08 / SIM", 488, 236);
      drawing.textAlign = "left";
    }

    const glass = drawing.createLinearGradient(0, 0, 512, 256);
    glass.addColorStop(0, "rgba(255,255,255,0.12)");
    glass.addColorStop(0.32, "rgba(255,255,255,0.025)");
    glass.addColorStop(0.7, "rgba(255,255,255,0)");
    glass.addColorStop(1, "rgba(255,255,255,0.055)");
    drawing.fillStyle = glass;
    drawing.fillRect(0, 0, 512, 256);
  }

  const texture = createTexture(canvas, `archive-${kind}-console-display`);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function createGridCircuitTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const drawing = canvas.getContext("2d");
  if (drawing) {
    const random = createRandom(0x61d71ace);
    drawing.fillStyle = "#152c31";
    drawing.fillRect(0, 0, canvas.width, canvas.height);

    const wash = drawing.createLinearGradient(0, 0, canvas.width, canvas.height);
    wash.addColorStop(0, "rgba(54,104,103,0.18)");
    wash.addColorStop(0.5, "rgba(5,16,20,0.05)");
    wash.addColorStop(1, "rgba(38,68,85,0.18)");
    drawing.fillStyle = wash;
    drawing.fillRect(0, 0, canvas.width, canvas.height);

    drawing.lineWidth = 1;
    for (let coordinate = 0; coordinate <= canvas.width; coordinate += 32) {
      drawing.strokeStyle =
        coordinate % 128 === 0
          ? "rgba(5,12,14,0.58)"
          : "rgba(71,131,139,0.1)";
      drawing.beginPath();
      drawing.moveTo(coordinate + 0.5, 0);
      drawing.lineTo(coordinate + 0.5, canvas.height);
      drawing.moveTo(0, coordinate + 0.5);
      drawing.lineTo(canvas.width, coordinate + 0.5);
      drawing.stroke();
    }

    drawing.lineJoin = "round";
    drawing.lineCap = "round";
    const traceColors = [
      "rgba(85,220,232,0.32)",
      "rgba(158,130,255,0.24)",
      "rgba(255,169,40,0.22)",
      "rgba(91,157,164,0.22)",
    ] as const;
    for (let trace = 0; trace < 52; trace += 1) {
      let x = Math.floor(random() * 16) * 32;
      let y = Math.floor(random() * 16) * 32;
      drawing.strokeStyle = traceColors[trace % traceColors.length]!;
      drawing.lineWidth = trace % 9 === 0 ? 3 : 1.25;
      drawing.beginPath();
      drawing.moveTo(x, y);
      const legs = 2 + Math.floor(random() * 4);
      for (let leg = 0; leg < legs; leg += 1) {
        if ((trace + leg) % 2 === 0) {
          x += (random() < 0.5 ? -1 : 1) * (24 + random() * 84);
        } else {
          y += (random() < 0.5 ? -1 : 1) * (24 + random() * 84);
        }
        drawing.lineTo(x, y);
      }
      drawing.stroke();
    }

    for (let via = 0; via < 150; via += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const radius = via % 17 === 0 ? 4.2 : 1.3 + random() * 1.8;
      drawing.strokeStyle =
        via % 9 === 0
          ? "rgba(255,169,40,0.38)"
          : "rgba(90,211,222,0.3)";
      drawing.lineWidth = 1.2;
      forEachWrappedCanvasPoint(canvas, x, y, (wrappedX, wrappedY) => {
        drawing.beginPath();
        drawing.arc(wrappedX, wrappedY, radius, 0, Math.PI * 2);
        drawing.stroke();
      });
    }

    drawing.fillStyle = "rgba(156,217,218,0.19)";
    drawing.font = "700 12px ui-monospace, monospace";
    drawing.textAlign = "left";
    for (const [label, x, y] of [
      ["0x2A", 22, 72],
      ["RX", 276, 156],
      ["IRQ", 398, 334],
      ["TTL", 92, 438],
    ] as const) {
      drawing.fillText(label, x, y);
    }
  }
  return configureRepeatingTexture(
    createTexture(canvas, "grid-etched-circuit-deck"),
    2.2,
    1.9,
  );
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
