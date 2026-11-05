import type { NextPlayActions } from "./NextPlay";
import { useMemo, useState } from "react";
import { CLEAR_LAMPS } from "../../domain/constants";
import type { PlayerChartRecord } from "../../domain/types";
import type { MasterSet } from "../../master/types";
import { TrackerChartRow } from "./TrackerChartRow";
import { buildTrackerEntries, filterTrackerEntries, type TrackerFilters, type TrackerSort } from "./tracker";

export function TrackerScreen({ master, records, onSelect, filters, onFiltersChange, expandedChartIds, onToggleRadar, nextPlay }: {
  nextPlay?: NextPlayActions; master: MasterSet; records: ReadonlyMap<string, PlayerChartRecord>; onSelect: (chartId: string) => void;
  filters: TrackerFilters; onFiltersChange: (filters: TrackerFilters) => void;
  expandedChartIds: ReadonlySet<string>; onToggleRadar: (chartId: string) => void;
}) {
  // Only the name query is local: leaving TRACKER deliberately clears it.
  const [query, setQuery] = useState("");
  const entries = useMemo(() => buildTrackerEntries(master), [master]);
  const difficulties = useMemo(() => [...new Set(entries.map(entry => entry.difficulty))].sort((a, b) => a - b), [entries]);
  const versions = useMemo(() => [...new Map(entries.filter(entry => entry.versionNumber !== null && Boolean(entry.versionLabel))
    .map(entry => [entry.versionNumber!, entry.versionLabel!] as const)).entries()].sort(([a], [b]) => a - b), [entries]);
  const rows = useMemo(() => filterTrackerEntries(entries, records, filters, query), [entries, records, filters, query]);
  const change = <K extends keyof TrackerFilters>(key: K, value: TrackerFilters[K]) => onFiltersChange({ ...filters, [key]: value });
  return <section>
    <h2>TRACKER</h2>
    <div className="filters">
      <input type="search" aria-label="曲名検索" placeholder="曲名検索" value={query} onChange={event => setQuery(event.target.value)} />
      <select aria-label="公式レベル" value={filters.level} onChange={event => change("level", event.target.value)}>
        <option value="ALL">全レベル</option>{[10, 11, 12].map(value => <option key={value} value={value}>☆{value}</option>)}
      </select>
      <select aria-label="譜面種別" value={filters.type} onChange={event => change("type", event.target.value)}>
        <option value="ALL">全譜面種別</option>{["DPH", "DPA", "DPL"].map(value => <option key={value}>{value}</option>)}
      </select>
      <select aria-label="非公式難易度" value={filters.difficulty} onChange={event => change("difficulty", event.target.value)}>
        <option value="ALL">全非公式難易度</option>{difficulties.map(value => <option key={value} value={value}>{value.toFixed(1)}</option>)}
      </select>
      <select aria-label="VERSION" value={filters.version} onChange={event => change("version", event.target.value)}>
        <option value="ALL">全VERSION</option>{versions.map(([number, name]) => <option key={number} value={number}>{name}</option>)}
      </select>
      <select aria-label="クリアランプ" value={filters.lamp} onChange={event => change("lamp", event.target.value)}>
        <option value="ALL">全ランプ</option>{CLEAR_LAMPS.map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
      </select>
      <select aria-label="並び順" value={filters.sort} onChange={event => change("sort", event.target.value as TrackerSort)}>
        <option value="difficulty">難易度順</option><option value="unofficial">非公式難易度順</option>
        <option value="officialLevel">公式LEVEL順</option><option value="version">VERSION順</option>
        <option value="ec">ERETER EC順</option><option value="hc">ERETER HC順</option><option value="exh">ERETER EXH順</option>
      </select>
      <button type="button" className="sort-direction" onClick={() => change("direction", filters.direction === "asc" ? "desc" : "asc")}>
        {filters.direction === "asc" ? "↑ 昇順" : "↓ 降順"}
      </button>
    </div>
    <p className="hint">{rows.length}譜面</p>
    {rows.map(entry => <TrackerChartRow key={entry.chart.chartId} entry={entry}
      lamp={records.get(entry.chart.chartId)?.clearLamp ?? "NO_PLAY"}
      nextPlay={nextPlay} expanded={expandedChartIds.has(entry.chart.chartId)} onSelect={onSelect} onToggleRadar={onToggleRadar} />)}
  </section>;
}
