import * as THREE from "three";
import type { MightymaticaZoneContext } from "./types";

const symbols = [
  { glyph: "✦", name: "four-pointed star" },
  { glyph: "●", name: "filled circle" },
  { glyph: "△", name: "triangle" },
  { glyph: "◇", name: "diamond" },
  { glyph: "☾", name: "crescent moon" },
  { glyph: "⌁", name: "double curve" },
  { glyph: "⊕", name: "circled cross" },
  { glyph: "∞", name: "infinity loop" },
] as const;
const exhibitScale = 1.8;
const answerRevealDuration = 0.72;
const answerBaseScale = 1.2;
const orbAssemblyScale = 0.65;
const panelScale = 0.68;
const portraitPanelScale = 0.78;
// The instructions stay west of the walkable chart while the portrait becomes
// a distinct focal panel at its north edge.
const instructionPanelPosition = [-4.35, 1.78, -0.37] as const;
// Keep the portrait just screen-right of the physical assembly so the
// photographed and modeled orbs read as one staged composition.
const portraitPanelPosition = [-1.14, 1.39, -4.37] as const;
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
  private readonly instructionTexture: THREE.CanvasTexture;
  private readonly portraitTexture: THREE.Texture;
  private readonly portrait: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  >;
  private readonly answerCanvas = document.createElement("canvas");
  private readonly answerTexture: THREE.CanvasTexture;
  private readonly answer: THREE.Sprite;
  private readonly orb: THREE.Mesh<
    THREE.SphereGeometry,
    THREE.MeshStandardMaterial
  >;
  private readonly orbLight: THREE.PointLight;
  private phase: "idle" | "armed" | "revealed" | "explained" = "idle";
  private round = 0;
  private targetSymbolIndex = 0;
  private answerRevealAge = answerRevealDuration;
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

    this.chartCanvas.width = 600;
    this.chartCanvas.height = 1000;
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
    chartBacking.position.set(-0.95, 0.075, -0.05);
    chartBacking.receiveShadow = true;
    this.group.add(chartBacking);
    const chart = new THREE.Mesh(
      new THREE.PlaneGeometry(3.54, 6.3),
      chartMaterial,
    );
    // A thin floor plaque clears the Sierpiński tiles without rebuilding the
    // old chest-high table.
    chart.position.set(-0.95, 0.117, -0.05);
    chart.rotation.x = -Math.PI / 2;
    chart.renderOrder = 2;
    this.group.add(chart);

    this.instructionTexture = createInstructionTexture();
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

    const instructionPanel = new THREE.Group();
    instructionPanel.name = "mind-reader-instruction-panel";
    // Match the default isometric camera basis. Setting pitch and yaw as Euler
    // angles introduces visible roll after the parent transform.
    instructionPanel.position.set(...instructionPanelPosition);
    instructionPanel.quaternion.setFromRotationMatrix(panelFacing);
    instructionPanel.scale.setScalar(panelScale);
    this.group.add(instructionPanel);

    const instructions = new THREE.Mesh(
      new THREE.PlaneGeometry(3.95, 2.5),
      new THREE.MeshBasicMaterial({
        map: this.instructionTexture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    instructions.name = "mind-reader-playable-instructions";
    instructions.renderOrder = 3;
    instructionPanel.add(instructions);

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
    const orbAssembly = new THREE.Group();
    orbAssembly.name = "mind-reader-crystal-ball-assembly";
    orbAssembly.position.set(...orbAssemblyPosition);
    orbAssembly.scale.setScalar(orbAssemblyScale);
    this.group.add(orbAssembly);

    this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 14), orbMaterial);
    this.orb.position.set(0, 2.06, 0);
    this.orb.castShadow = false;
    orbAssembly.add(this.orb);

    const orbRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.045, 5, 28),
      brassMaterial,
    );
    orbRim.position.set(0, this.orb.position.y - 0.62, 0);
    orbRim.rotation.x = Math.PI / 2;
    orbAssembly.add(orbRim);

    const orbCup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.9, 0.32, 16),
      brassMaterial,
    );
    orbCup.name = "mind-reader-raised-orb-cup";
    orbCup.position.set(0, this.orb.position.y - 0.78, 0);
    orbAssembly.add(orbCup);
    const orbStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.3, 1.02, 12),
      brassMaterial,
    );
    orbStem.name = "mind-reader-orb-pedestal-stem";
    orbStem.position.set(0, 0.62, 0);
    orbAssembly.add(orbStem);
    const orbFoot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.62, 0.16, 14),
      brassMaterial,
    );
    orbFoot.name = "mind-reader-orb-pedestal-foot";
    orbFoot.position.set(0, 0.13, 0);
    orbAssembly.add(orbFoot);

    this.orbLight = new THREE.PointLight(0xb784ff, 2.1, 4.2, 2);
    this.orbLight.position.copy(this.orb.position);
    orbAssembly.add(this.orbLight);

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
      .copy(this.orb.position)
      .addScaledVector(panelToCamera, 0.72);
    this.answer.scale.setScalar(answerBaseScale);
    this.answer.renderOrder = 5;
    this.answer.visible = false;
    orbAssembly.add(this.answer);

    context.addInteraction({
      id: "math-mind-reader",
      label: "Begin the five-step mind-reader ritual",
      x: this.group.position.x,
      z: this.group.position.z,
      radius: 6.4,
      action: () => this.interact(),
    });
    this.startRound(false);
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
    this.updateAnswerReveal(delta);
    if (this.context.reducedMotion) {
      this.orb.scale.setScalar(1);
      this.orbLight.intensity =
        this.phase === "revealed" || this.phase === "explained" ? 4.2 : 2.1;
      return;
    }
    const revealed = this.phase === "revealed" || this.phase === "explained";
    const revealBoost = revealed ? 1.6 : 0;
    const pulse = Math.sin(elapsed * (revealed ? 7 : 2.4));
    this.orb.scale.setScalar(1 + pulse * (revealed ? 0.055 : 0.018));
    this.orb.rotation.y += 0.006;
    this.orbLight.intensity = 2.15 + revealBoost + pulse * 0.35;
  }

  dispose(): void {
    this.disposed = true;
    this.chartTexture.dispose();
    this.instructionTexture.dispose();
    this.portraitTexture.dispose();
    this.answerTexture.dispose();
    this.portrait.material.dispose();
    this.answer.material.dispose();
  }

  private interact(): void {
    if (this.phase === "idle") {
      this.phase = "armed";
      this.context.updateInteractionLabel(
        "math-mind-reader",
        "Ask the orb for its answer",
      );
      this.context.onStatus(
        "1) Choose any two-digit number. 2) Add its two digits. 3) Subtract that sum from the original number. 4) Find and remember the symbol beside the result. 5) Ask the orb for its answer.",
      );
      return;
    }

    if (this.phase === "armed") {
      this.phase = "revealed";
      const target = symbols[this.targetSymbolIndex] ?? symbols[0];
      this.renderAnswer(target.glyph);
      this.answer.visible = true;
      this.answerRevealAge = this.context.reducedMotion
        ? answerRevealDuration
        : 0;
      this.updateAnswerReveal(0);
      this.orb.material.color.setHex(0xfff8d8);
      this.orb.material.emissive.setHex(0xff4fc8);
      this.context.updateInteractionLabel(
        "math-mind-reader",
        "Inspect how the trick worked",
      );
      this.context.onStatus(
        `The crystal ball reveals ${target.glyph}, the ${target.name}. Was it the symbol you remembered?`,
        { kind: "achievement", title: "MIND OVER MATH" },
      );
      return;
    }

    if (this.phase === "revealed") {
      this.phase = "explained";
      this.context.updateInteractionLabel(
        "math-mind-reader",
        "Reset the mind reader",
      );
      this.context.onStatus(
        "After the reveal: subtracting a two-digit number’s digit sum always leaves a multiple of nine, and the chart quietly gives every such result the same symbol.",
      );
      return;
    }

    this.startRound(true);
  }

  private startRound(announce: boolean): void {
    this.round += 1;
    this.targetSymbolIndex = this.round % symbols.length;
    this.phase = "idle";
    this.answer.visible = false;
    this.answer.material.opacity = 0;
    this.answerRevealAge = answerRevealDuration;
    this.orb.material.color.setHex(0xf7f5ff);
    this.orb.material.emissive.setHex(0x8f4cff);
    this.context.updateInteractionLabel(
      "math-mind-reader",
      "Begin the five-step mind-reader ritual",
    );
    this.renderChart();
    if (announce) {
      this.context.onStatus(
        "The chart quietly rebuilds. Choose a fresh two-digit number, follow the five visible steps, and remember the symbol before asking the orb.",
      );
    }
  }

  private renderAnswer(glyph: string): void {
    const drawing = this.answerCanvas.getContext("2d");
    if (!drawing) return;
    drawing.clearRect(0, 0, this.answerCanvas.width, this.answerCanvas.height);
    const glow = drawing.createRadialGradient(128, 128, 12, 128, 128, 116);
    glow.addColorStop(0, "rgba(255, 255, 244, 0.98)");
    glow.addColorStop(0.58, "rgba(241, 223, 255, 0.8)");
    glow.addColorStop(1, "rgba(158, 104, 255, 0)");
    drawing.fillStyle = glow;
    drawing.fillRect(0, 0, 256, 256);
    drawing.textAlign = "center";
    drawing.textBaseline = "middle";
    drawing.fillStyle = "#251337";
    drawing.strokeStyle = "rgba(255, 255, 255, 0.9)";
    drawing.lineWidth = 8;
    drawing.font = "700 144px Georgia, serif";
    drawing.strokeText(glyph, 128, 132);
    drawing.fillText(glyph, 128, 132);
    this.answerTexture.needsUpdate = true;
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

    const width = this.chartCanvas.width;
    const height = this.chartCanvas.height;
    drawing.clearRect(0, 0, width, height);
    drawing.fillStyle = "#f7f1e7";
    drawing.fillRect(0, 0, width, height);

    const columns = 5;
    const rows = 20;
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
        const symbolIndex =
          number % 9 === 0
            ? this.targetSymbolIndex
            : seededIndex(number + this.round * 103, symbols.length - 1);
        const adjustedIndex =
          symbolIndex >= this.targetSymbolIndex && number % 9 !== 0
            ? symbolIndex + 1
            : symbolIndex;
        const symbol = symbols[adjustedIndex % symbols.length] ?? symbols[0];
        const left = column * cellWidth;
        const centerY = row * cellHeight + cellHeight * 0.5;
        drawing.fillStyle = "#bd1747";
        drawing.font = "700 25px ui-monospace, monospace";
        drawing.fillText(String(number), left + 31, centerY);
        drawing.fillStyle = "#17111f";
        drawing.font = "32px Georgia, serif";
        drawing.fillText(symbol.glyph, left + 83, centerY + 1);
      }
    }

    this.chartTexture.needsUpdate = true;
  }
}
