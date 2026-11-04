import { meetsLamp, RADAR_ATTRIBUTES } from "../domain/constants";
import type { ClearLamp, PlayerChartRecord } from "../domain/types";
import type { MasterSet } from "../master/types";
import type { TrainingCalculation, TrainingResult } from "./types";

export const WARM_UP_ROLES = ["LIGHT", "BASIC", "ACCURACY"] as const;
export type WarmUpRole = typeof WARM_UP_ROLES[number];
export const WARM_UP_LABELS: Record<WarmUpRole, string> = {
  LIGHT: "軽い指慣らし", BASIC: "基礎運指・安定性", ACCURACY: "精度練習",
};
export interface WarmUpRange { level: number; min: number; max: number; }
export interface WarmUpCandidate {
  chartId: string; role: WarmUpRole; officialLevel: number; difficulty: number | null;
  currentLamp: ClearLamp; score: number | null; bp: number | null; bpRate: number | null;
  radarLoad: number | null; radarBalance: number | null; reasons: string[];
}
export interface WarmUpPool {
  context: Pick<TrainingResult, "phase" | "mode" | "mainBand">;
  roles: Record<WarmUpRole, WarmUpCandidate[]>;
}
const range = (level: number, min: number, max: number): WarmUpRange => ({ level, min, max });
/** Inclusive official-level + unofficial bands; never subtract 12.x from lower levels. */
export function warmUpRanges(context: WarmUpPool["context"]): Record<WarmUpRole, WarmUpRange[]> {
  const { mainBand, mode } = context;
  if (mainBand === null) return { LIGHT: [], BASIC: [], ACCURACY: [] };
  const phase = mode === "INITIAL" && context.phase === 12 && mainBand < 12 ? 11 : context.phase;
  if (phase === 10) return {
    LIGHT: [range(10, -Infinity, 10)], BASIC: [range(10, -Infinity, 10.5)], ACCURACY: [range(10, -Infinity, 10.7)],
  };
  if (phase === 11) return {
    LIGHT: [range(10, 9.6, 10.2)], BASIC: [range(10, 10.2, 10.7)],
    ACCURACY: [range(10, 10.5, 11), range(11, 10.5, 11.2)],
  };
  if (mainBand >= 12 && mainBand <= 12.2) return {
    LIGHT: [range(10, 10.2, 10.7)], BASIC: [range(10, 10.5, 11), range(11, 10.7, 11.4)],
    ACCURACY: [range(11, 11.2, 11.8)],
  };
  if (mainBand >= 12.3 && mainBand <= 12.5) return {
    LIGHT: [range(10, 10.5, 10.7), range(11, 11, 11.4)], BASIC: [range(11, 11.4, 11.8)],
    ACCURACY: [range(11, 11.8, 12.1), range(12, 11.6, 12.1)],
  };
  if (mainBand >= 12.6 && mainBand <= 12.7) return {
    LIGHT: [range(11, 10.7, 11.4)], BASIC: [range(11, 11.4, 11.8)],
    ACCURACY: [range(11, 11.8, 12.1), range(12, 11.6, 12.2)],
  };
  return { LIGHT: [], BASIC: [], ACCURACY: [] };
}
export function warmUpBpRate(bp: number | null | undefined, notes: number | null): number | null {
  return bp != null && Number.isFinite(bp) && bp >= 0 && notes !== null && Number.isFinite(notes) && notes > 0 ? bp / notes : null;
}
const ascendingNullable = (a: number | null, b: number | null) => a === null ? (b === null ? 0 : 1) : b === null ? -1 : a - b;
export function buildWarmUpPool(calculation: TrainingCalculation, master: MasterSet, records: ReadonlyMap<string, PlayerChartRecord>): WarmUpPool {
  const { phase, mode, mainBand, playerId } = calculation.training;
  const context = { phase, mode, mainBand }, ranges = warmUpRanges(context);
  const roles: WarmUpPool["roles"] = { LIGHT: [], BASIC: [], ACCURACY: [] };
  const difficulties = new Map(master.unofficial.records.map(item => [item.chartId, item.difficulty]));
  const radar = new Map(master.notesRadar.records.map(item => [item.chartId, item]));
  for (const chart of calculation.charts) {
    if (mainBand === null || chart.effectiveDifficulty > mainBand || !meetsLamp(chart.currentLamp, "CLEAR")) continue;
    const known = difficulties.get(chart.chartId) != null;
    const reference = known ? chart.effectiveDifficulty : chart.officialLevel;
    const record = records.get(chart.chartId);
    const ownRecord = record?.playerId === playerId ? record : undefined;
    const bp = ownRecord?.bp ?? null, bpRate = warmUpBpRate(bp, chart.notes);
    const values = radar.get(chart.chartId)?.values;
    // Max avoids an artificial sum. Missing Radar stays null, never zero.
    const load = values ? Math.max(...RADAR_ATTRIBUTES.map(attribute => values[attribute])) : null;
    const balance = values ? Math.abs(values.NOTES - values.CHORD) / Math.max(1, values.NOTES, values.CHORD) : null;
    for (const role of WARM_UP_ROLES) {
      if (!ranges[role].some(band => chart.officialLevel === band.level && reference >= band.min && reference <= band.max)) continue;
      const reasons = [role === "ACCURACY" ? (meetsLamp(chart.currentLamp, "HARD_CLEAR") ? "HARD以上で精度練習" : "CLEAR済みで精度練習") : "CLEAR以上の確認済み譜面"];
      if (!known) reasons.push("難易度未登録・公式レベルを参考");
      if (bpRate !== null) reasons.push("参考BP率 " + (bpRate * 100).toFixed(2) + "%");
      if (values) reasons.push(role === "BASIC" ? "NOTES・CHORDのバランスを参考" : "Radar最大負荷を参考");
      roles[role].push({ chartId: chart.chartId, role, officialLevel: chart.officialLevel,
        difficulty: known ? chart.effectiveDifficulty : null, currentLamp: chart.currentLamp,
        score: ownRecord?.score ?? null, bp, bpRate, radarLoad: load, radarBalance: balance, reasons });
    }
  }
  for (const role of WARM_UP_ROLES) roles[role].sort((a, b) =>
    Number(a.difficulty === null) - Number(b.difficulty === null)
    || (role === "ACCURACY" ? Number(!meetsLamp(a.currentLamp, "HARD_CLEAR")) - Number(!meetsLamp(b.currentLamp, "HARD_CLEAR")) : 0)
    || ascendingNullable(a.bpRate, b.bpRate)
    || ascendingNullable(role === "BASIC" ? a.radarBalance : a.radarLoad, role === "BASIC" ? b.radarBalance : b.radarLoad)
    || a.chartId.localeCompare(b.chartId));
  return { context, roles };
}
