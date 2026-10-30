import { jumpDisplacement, jumpVelocityAfter } from "./JumpMotion.ts";
import type { SampleWalkHeight, WalkPoint } from "./GuidedWalkingRoute.ts";

type LandingHeight = (
  previousX: number, previousZ: number, previousFeet: number,
  x: number, z: number, feet: number,
) => number | null;

/**
 * A drop runs along its supported approach and then steps off without a jump
 * impulse. Check the whole body, the first landing, and the ordinary river bed.
 * Sampling both release-delay bounds covers the render-frame delay between
 * leaving support and the first gravity update (up to the runtime's 50 ms cap).
 */
export function hasGuidedDropClearance(
  from: WalkPoint, to: WalkPoint, speed: number,
  sample: SampleWalkHeight,
  isClear: (x: number, z: number, feet: number, ascending: boolean) => boolean,
  landingHeight: LandingHeight,
  groundHeight: (x: number, z: number) => number,
): boolean {
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  if (!Number.isFinite(distance) || !Number.isFinite(from.y) || !Number.isFinite(to.y) ||
    !Number.isFinite(speed) || speed <= 0 || distance < 0.01 || distance > 5.35 ||
    from.y - to.y < 0.08 || from.y - to.y > 6.2) return false;
  const step = Math.min(1 / 60, 0.1 / speed);

  const check = (releaseDelay: number): boolean => {
    let x = from.x;
    let z = from.z;
    let feet = from.y;
    let velocity = 0;
    let travel = 0;
    let falling = false;
    for (let index = 0; index < 256; index += 1) {
      const previousX = x, previousZ = z, previousFeet = feet;
      travel = Math.min(distance, travel + speed * step);
      x = from.x + (to.x - from.x) * travel / distance;
      z = from.z + (to.z - from.z) * travel / distance;
      if (!falling) {
        const support = sample(x, z, feet);
        if (support !== null) {
          feet = support;
          if (travel === distance) return false; // This is a walk, not a drop.
          continue;
        }
        falling = true;
      }
      const delayed = Math.min(step, releaseDelay);
      releaseDelay -= delayed;
      feet += jumpDisplacement(step - delayed, velocity);
      velocity = jumpVelocityAfter(step - delayed, velocity);
      let landed = landingHeight(previousX, previousZ, previousFeet, x, z, feet);
      const ground = groundHeight(x, z);
      if (feet <= ground && previousFeet >= ground && (landed === null || ground > landed)) landed = ground;
      if (landed !== null) {
        return Math.abs(landed - to.y) < 0.08 &&
          Math.hypot(x - to.x, z - to.z) < 0.15 && isClear(x, z, landed, false);
      }
      if (!isClear(x, z, feet, false)) return false;
    }
    return false;
  };
  return check(0) && check(0.05);
}
