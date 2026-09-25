import type { AliasSource, ChartMaster, ChartType, SongMaster } from "../domain/types";
export type ChartLookupResult = { status: "matched"; chart: ChartMaster } | { status: "unresolved" } | { status: "ambiguous"; chartIds: string[] };
export interface ChartLookupRequest { title: string; chartType: ChartType; source?: AliasSource; }
/** Exact official title or source-specific alias only; fuzzy matching is forbidden. */
export function resolveChart(request: ChartLookupRequest, songs: readonly SongMaster[], charts: readonly ChartMaster[]): ChartLookupResult {
  const songIds = new Set(songs.filter((song) => song.title === request.title || (request.source !== undefined && (song.aliases[request.source] ?? []).includes(request.title))).map((song) => song.songId));
  const candidates = charts.filter((chart) => chart.chartType === request.chartType && songIds.has(chart.songId));
  if (candidates.length === 0) return { status: "unresolved" };
  if (candidates.length === 1) return { status: "matched", chart: candidates[0] };
  return { status: "ambiguous", chartIds: candidates.map(({ chartId }) => chartId).sort() };
}
