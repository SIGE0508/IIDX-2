import { effectiveDifficulty, isTrainingEligibleChart } from "../../domain/chart";
import type { ChartMaster, ClearLamp, EreterChartDataRecord, NotesRadarRecord } from "../../domain/types";
import type { MasterSet } from "../../master/types";

export type TrackerSort = "difficulty" | "unofficial" | "officialLevel" | "version" | "ec" | "hc" | "exh";
export interface TrackerFilters {
  level: string; difficulty: string; type: string; lamp: string; version: string;
  sort: TrackerSort; direction: "asc" | "desc";
}
export const createTrackerFilters = (): TrackerFilters => ({
  level: "ALL", difficulty: "ALL", type: "ALL", lamp: "ALL", version: "ALL",
  sort: "difficulty", direction: "asc",
});
export interface TrackerEntry {
  chart: ChartMaster; title: string; difficulty: number;
  versionNumber: number | null; versionLabel: string | null;
  radar: NotesRadarRecord | undefined; ereter: EreterChartDataRecord | undefined;
}
/** Join each shared master once, by permanent IDs; never join Radar by song. */
export function buildTrackerEntries(master: MasterSet): TrackerEntry[] {
  const songs = new Map(master.chartMaster.songs.map(song => [song.songId, song]));
  const unofficial = new Map(master.unofficial.records.map(row => [row.chartId, row]));
  const radar = new Map(master.notesRadar.records.map(row => [row.chartId, row]));
  const ereter = new Map(master.ereter.records.map(row => [row.chartId, row]));
  return master.chartMaster.charts.filter(chart => isTrainingEligibleChart(chart) && chart.chartType !== "DPN").map(chart => {
    const song = songs.get(chart.songId);
    return { chart, title: song?.title ?? chart.chartId,
      difficulty: effectiveDifficulty(chart, unofficial.get(chart.chartId)),
      versionNumber: song?.debutVersionNumber ?? null, versionLabel: song?.debutVersion ?? null,
      radar: radar.get(chart.chartId), ereter: ereter.get(chart.chartId) };
  });
}
export function filterTrackerEntries(entries: readonly TrackerEntry[], records: ReadonlyMap<string, { clearLamp: ClearLamp }>, filters: TrackerFilters, query: string): TrackerEntry[] {
  const { level, difficulty, type, lamp, version, sort, direction } = filters;
  const search = query.toLocaleLowerCase();
  const value = (entry: TrackerEntry): number | null => {
    if (sort === "difficulty" || sort === "unofficial") return entry.difficulty;
    if (sort === "officialLevel") return entry.chart.officialLevel;
    if (sort === "version") return entry.versionNumber;
    return entry.ereter?.[sort] ?? null;
  };
  return entries.filter(entry =>
    (!search || entry.title.toLocaleLowerCase().includes(search))
    && (level === "ALL" || entry.chart.officialLevel === Number(level))
    && (difficulty === "ALL" || Math.round(entry.difficulty * 10) === Math.round(Number(difficulty) * 10))
    && (type === "ALL" || entry.chart.chartType === type)
    && (lamp === "ALL" || (records.get(entry.chart.chartId)?.clearLamp ?? "NO_PLAY") === lamp)
    && (version === "ALL" || entry.versionNumber === Number(version))
  ).sort((left, right) => {
    const a = value(left), b = value(right);
    const fallback = () => left.title.localeCompare(right.title, "ja") || left.chart.chartId.localeCompare(right.chart.chartId);
    if (a === null) return b === null ? fallback() : 1;
    if (b === null) return -1;
    return (a - b) * (direction === "asc" ? 1 : -1) || fallback();
  });
}
export function toggleTrackerRadar(current: ReadonlySet<string>, chartId: string): ReadonlySet<string> {
  const next = new Set(current);
  if (next.has(chartId)) next.delete(chartId); else next.add(chartId);
  return next;
}
export const formatTrackerRadarValue = (value: number | null | undefined): string => value == null ? "—" : value.toFixed(2);
