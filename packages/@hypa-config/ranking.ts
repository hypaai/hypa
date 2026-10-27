const Z95 = 1.96;

export function wilsonBound(
  p: number,
  n: number,
  pessimism: "upper" | "lower",
): number {
  if (n <= 0) return pessimism === "upper" ? 1 : 0;
  if (p > 1) return p;
  const clamped = Math.min(1, Math.max(0, p));
  const z2 = Z95 * Z95;
  const denom = 1 + z2 / n;
  const center = clamped + z2 / (2 * n);
  const margin =
    Z95 * Math.sqrt((clamped * (1 - clamped)) / n + z2 / (4 * n * n));
  const bound = pessimism === "upper" ? center + margin : center - margin;

  return Math.min(1, Math.max(0, bound / denom));
}
