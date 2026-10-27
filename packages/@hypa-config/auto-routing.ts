export type AutoTier = "language" | "overall" | "default" | "unscored";
export type BenchmarkStatus = "ok" | "no_scores" | "unavailable";
export type AutoAttemptOutcome =
  | "ok"
  | "error"
  | "timeout"
  | "skipped_cooldown";
export type AutoAttempt = {
  provider: string;
  model: string;
  displayName: string;
  outcome: AutoAttemptOutcome;
  ms: number;
};
export type AutoSummary = {
  policy: "auto-mt-1";
  herVersion: string;
  benchmarkStatus: BenchmarkStatus;
  tier: AutoTier;
  her?: number;
  sampleCount?: number;
  attempts: AutoAttempt[];
};
export type AutoPreview = {
  provider: string;
  model: string;
  displayName: string;
  tier: AutoTier;
  her?: number;
  sampleCount?: number;
  benchmarkStatus: BenchmarkStatus;
};
export type AutoProgressType = "attempt" | "fallback" | "completed" | "failed";
export type AutoProgress = {
  sequence: number;
  type: AutoProgressType;
  provider?: string;
  model?: string;
  displayName?: string;
};
