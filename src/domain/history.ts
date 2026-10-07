import { CLEAR_LAMP_RANK } from "./constants";
import type { HistoryEntry, PlayerChartRecord, RecordSource } from "./types";
export type HistoryFilter = "ALL" | "LAMP" | "SCORE" | "BP";
export const hasLampUpdate = (entry: HistoryEntry) => CLEAR_LAMP_RANK[entry.newLamp] > CLEAR_LAMP_RANK[entry.oldLamp];
export const matchesHistoryFilter = (entry: HistoryEntry, filter: HistoryFilter) => filter === "ALL" || (filter === "LAMP" ? hasLampUpdate(entry) : filter === "SCORE" ? Boolean(entry.scoreUpdate) : Boolean(entry.bpUpdate));
export function createRecordHistory(before: PlayerChartRecord | undefined, after: PlayerChartRecord, source: RecordSource, date: string, historyId: () => string): HistoryEntry | undefined {
  const oldLamp = before?.clearLamp ?? "NO_PLAY";
  const oldScore = before?.score ?? null;
  const oldBp = before?.bp ?? null;
  const scoreUpdate = after.score !== null && (oldScore === null || after.score > oldScore) ? { before: oldScore, after: after.score } : undefined;
  const bpUpdate = after.bp !== null && (oldBp === null || after.bp < oldBp) ? { before: oldBp, after: after.bp } : undefined;
  if (CLEAR_LAMP_RANK[after.clearLamp] <= CLEAR_LAMP_RANK[oldLamp] && !scoreUpdate && !bpUpdate) return undefined;
  return { historyId: historyId(), playerId: after.playerId, chartId: after.chartId, date, oldLamp, newLamp: after.clearLamp, source, ...(scoreUpdate ? { scoreUpdate } : {}), ...(bpUpdate ? { bpUpdate } : {}) };
}
export function numericHistoryLabel(name: "SCORE" | "BP", update: { before: number | null; after: number }): string {
  if (update.before === null) return `${name} ${update.after}（初回登録）`;
  const difference = update.after - update.before;
  return `${name} ${update.before} → ${update.after} (${difference > 0 ? "+" : ""}${difference})`;
}
