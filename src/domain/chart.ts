import type { ChartMaster, UnofficialDifficultyRecord } from "./types";

/** Current management scope: DP official ☆10–☆12. */
export const isManagedChart = (chart: Pick<ChartMaster, "officialLevel">) => chart.officialLevel >= 10 && chart.officialLevel <= 12;
/** Only confirmed unavailable charts are excluded. unknown remains eligible. */
export const isCurrentlyPlayableChart = (chart: Pick<ChartMaster, "availability">) => chart.availability !== "unavailable";
export const isTrainingEligibleChart = (chart: ChartMaster) => isManagedChart(chart) && isCurrentlyPlayableChart(chart);

/** Decimal half-up rounding that protects the x.x5 boundary from binary error. */
export function roundDifficultyToTenths(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Difficulty must be a finite number.");
  const sign = value < 0 ? -1 : 1;
  return sign * Math.floor(Math.abs(value) * 10 + 0.5 + 1e-9) / 10;
}
export const effectiveDifficulty = (chart: Pick<ChartMaster, "officialLevel">, unofficial: Pick<UnofficialDifficultyRecord, "difficulty"> | null | undefined) => unofficial == null ? chart.officialLevel : roundDifficultyToTenths(unofficial.difficulty);
