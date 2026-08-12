export type IgnitionPanicPhase =
  | "idle"
  | "startle"
  | "run"
  | "drop"
  | "roll"
  | "recover";

export interface IgnitionPanicFrame {
  active: boolean;
  phase: IgnitionPanicPhase;
  movementSpeed: number;
  headingOffset: number;
  proneBlend: number;
  rollAngle: number;
  flailStrength: number;
  flameStrength: number;
  smokeStrength: number;
}

export const ignitionPanicDuration = 4.6;
export const reducedIgnitionPanicDuration = 1.15;

function smoothstep(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function resetFrame(frame: IgnitionPanicFrame): void {
  frame.active = false;
  frame.phase = "idle";
  frame.movementSpeed = 0;
  frame.headingOffset = 0;
  frame.proneBlend = 0;
  frame.rollAngle = 0;
  frame.flailStrength = 0;
  frame.flameStrength = 0;
  frame.smokeStrength = 0;
}

/**
 * Samples the short loss-of-control sequence used after spectral ignition.
 * The caller owns the output so the render loop can reuse one object.
 */
export function sampleIgnitionPanic(
  age: number,
  reducedMotion: boolean,
  frame: IgnitionPanicFrame,
): void {
  resetFrame(frame);
  if (age < 0) return;

  const duration = reducedMotion
    ? reducedIgnitionPanicDuration
    : ignitionPanicDuration;
  if (age >= duration) return;

  frame.active = true;
  frame.flameStrength = 1;
  if (reducedMotion) {
    if (age < 0.24) {
      frame.phase = "startle";
      frame.flailStrength = 0.72;
      return;
    }
    if (age < 0.75) {
      const progress = (age - 0.24) / 0.51;
      frame.phase = "run";
      frame.movementSpeed = 3.4 + Math.sin(progress * Math.PI) * 0.8;
      frame.headingOffset = progress * 0.42;
      frame.flailStrength = 0.68;
      return;
    }
    frame.phase = "recover";
    frame.flailStrength =
      0.5 * (1 - smoothstep((age - 0.75) / 0.4));
    frame.flameStrength = 0.18;
    frame.smokeStrength = 0.72;
    return;
  }

  if (age < 0.28) {
    frame.phase = "startle";
    frame.flailStrength = 1;
    return;
  }
  if (age < 2.25) {
    const progress = (age - 0.28) / 1.97;
    frame.phase = "run";
    frame.movementSpeed =
      5.85 + Math.sin(progress * Math.PI * 4) * 0.62;
    // A retained random-walk heading is layered on by the game runtime.
    // This small irregular weave prevents the sampled pose from looking rigid.
    frame.headingOffset =
      Math.sin(age * 7.1) * 0.11 + Math.sin(age * 13.7) * 0.045;
    frame.flailStrength = 1;
    return;
  }
  if (age < 2.65) {
    const progress = smoothstep((age - 2.25) / 0.4);
    frame.phase = "drop";
    frame.movementSpeed = 4.8 * (1 - progress) + 0.8;
    frame.headingOffset = 0;
    frame.proneBlend = progress;
    frame.flailStrength = 1 - progress * 0.45;
    frame.smokeStrength = progress * 0.22;
    return;
  }
  if (age < 3.85) {
    const progress = (age - 2.65) / 1.2;
    frame.phase = "roll";
    frame.movementSpeed = 0.72;
    frame.headingOffset = 0;
    frame.proneBlend = 1;
    frame.rollAngle = progress * Math.PI * 4;
    frame.flailStrength = 0.28;
    frame.flameStrength = 1 - smoothstep(progress) * 0.82;
    frame.smokeStrength = 0.28 + smoothstep(progress) * 0.72;
    return;
  }

  const progress = smoothstep((age - 3.85) / 0.75);
  frame.phase = "recover";
  frame.proneBlend = 1 - progress;
  // Two complete revolutions end at the same orientation, allowing a clean
  // handoff to ordinary movement without a reverse-spin correction.
  frame.rollAngle = Math.PI * 4;
  frame.flailStrength = 0.34 * (1 - progress);
  frame.flameStrength = 0.18 * (1 - progress * 0.72);
  frame.smokeStrength = 1 - progress * 0.18;
}
