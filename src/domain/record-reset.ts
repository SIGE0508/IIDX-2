import type { PlayerChartRecord } from "./types";

/** Reset numeric current values without changing lamp, history or identity. */
export function resetRecordScoreBp(record: PlayerChartRecord, now: string): PlayerChartRecord {
  return { ...record, previousScore: record.score ?? record.previousScore ?? null, previousBp: record.bp ?? record.previousBp ?? null, score: null, bp: null, scoreSource: null, bpSource: null, updatedAt: now };
}
