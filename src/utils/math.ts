import type { Point } from '../types';

export const calculateAngle = (a: Point, b: Point, c: Point): number => {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs(radians * 180.0 / Math.PI);
  if (angle > 180.0) angle = 360 - angle;
  return angle;
};

// Normalizes a value between min and max to a 0-1 scale
// Inverse option is for when smaller angles mean "more effort" (like a squat)
export const normalize = (value: number, min: number, max: number, inverse: boolean = false): number => {
  let normalized = (value - min) / (max - min);
  normalized = Math.max(0, Math.min(1, normalized)); // Clamp 0-1
  return inverse ? 1 - normalized : normalized;
};