import { CLEAR_LAMP_RANK } from "../domain/constants";
import { validateScoreForChart } from "../domain/score";
import type { ChartMaster, ClearLamp, HistoryEntry, PlayerChartRecord, RecordSource } from "../domain/types";
import { UserDataRepository } from "../storage/repository";
import type { ClearTrackerImportPreview } from "./clear-tracker-csv";

const changed = (a: PlayerChartRecord | undefined, b: PlayerChartRecord) => !a || a.clearLamp !== b.clearLamp || a.score !== b.score || a.bp !== b.bp;
export async function commitRecordImport(repository: UserDataRepository, playerId: string, incoming: readonly PlayerChartRecord[], existing: readonly PlayerChartRecord[], source: Extract<RecordSource, "official_csv" | "tracker_template">, now: string, historyId: () => string, initialSetup = false): Promise<{ records: number; history: number }> {
  const before = new Map(existing.map((record) => [record.chartId, record])); const records = incoming.filter((record) => changed(before.get(record.chartId), record)); const history: HistoryEntry[] = initialSetup ? [] : records.filter((record) => CLEAR_LAMP_RANK[record.clearLamp] > CLEAR_LAMP_RANK[before.get(record.chartId)?.clearLamp ?? "NO_PLAY"]).map((record) => ({ historyId: historyId(), playerId, date: now, chartId: record.chartId, oldLamp: before.get(record.chartId)?.clearLamp ?? "NO_PLAY", newLamp: record.clearLamp, source }));
  await repository.commit({ playerChartRecords: records, history }); return { records: records.length, history: history.length };
}
export async function commitClearTrackerPreview(repository: UserDataRepository, preview: ClearTrackerImportPreview, playerId: string, now: string, historyId: () => string): Promise<{ records: number; history: number }> { if (preview.errors.length) throw new Error("CLEAR TRACKER CSV contains errors and cannot be partially imported."); return commitRecordImport(repository, playerId, preview.changes.map((change) => change.after), preview.changes.flatMap((change) => change.before ? [change.before] : []), "tracker_template", now, historyId); }

export async function updateQuickInput(repository: UserDataRepository, playerId: string, chart: ChartMaster, clearLamp: ClearLamp, score: number | undefined, bp: number | undefined, now: string, historyId: () => string): Promise<PlayerChartRecord> {
  validateScoreForChart(score, chart);
  if (bp !== undefined && (!Number.isInteger(bp) || bp < 0)) throw new Error("BP must be a non-negative integer.");
  const before = await repository.getPlayerChartRecord(playerId, chart.chartId);
  // QUICK INPUT preserves a personal best: only a higher SCORE or lower BP replaces it.
  const nextScore = score === undefined || (before?.score !== null && before?.score !== undefined && score <= before.score) ? before?.score ?? null : score;
  const nextBp = bp === undefined || (before?.bp !== null && before?.bp !== undefined && bp >= before.bp) ? before?.bp ?? null : bp;
  const after: PlayerChartRecord = { playerId, chartId: chart.chartId, clearLamp, score: nextScore, bp: nextBp, clearSource: clearLamp === before?.clearLamp ? before.clearSource : "manual", scoreSource: nextScore === before?.score ? before?.scoreSource ?? null : "manual", bpSource: nextBp === before?.bp ? before?.bpSource ?? null : "manual", updatedAt: now }; const history = CLEAR_LAMP_RANK[clearLamp] > CLEAR_LAMP_RANK[before?.clearLamp ?? "NO_PLAY"] ? [{ historyId: historyId(), playerId, date: now, chartId: chart.chartId, oldLamp: before?.clearLamp ?? "NO_PLAY" as ClearLamp, newLamp: clearLamp, source: "manual" as const }] : [];
  await repository.commit({ playerChartRecords: [after], history }); return after;
}
