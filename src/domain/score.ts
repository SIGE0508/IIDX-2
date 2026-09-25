import type { ChartMaster } from "./types";

/** Validates a player SCORE against immutable chart-master information. */
export function validateScoreForChart(score: number | null | undefined, chart: Pick<ChartMaster, "chartId" | "notes">): void {
  if (score === null || score === undefined) return;
  if (!Number.isSafeInteger(score) || score < 0) throw new Error("SCORE must be a non-negative integer.");
  if (chart.notes !== null && score > chart.notes * 2) throw new Error(`SCORE exceeds the maximum (${chart.notes * 2}) for chart '${chart.chartId}'.`);
}

export function maximumScore(chart: Pick<ChartMaster, "notes">): number | null {
  return chart.notes === null ? null : chart.notes * 2;
}
