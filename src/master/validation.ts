import { ALIAS_SOURCES, AVAILABILITIES, CHART_TYPES, MASTER_SCHEMA_VERSION, RADAR_ATTRIBUTES } from "../domain/constants";
import type { AliasSource, ChartMaster, EreterChartDataRecord, NotesRadarRecord, SongMaster, UnofficialDifficultyRecord } from "../domain/types";
import type { ChartMasterFile, EreterMasterFile, MasterManifest, MasterSet, NotesRadarMasterFile, UnofficialMasterFile, VersionedMasterFile } from "./types";

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isDate = (value: unknown): value is string => isString(value) && !Number.isNaN(Date.parse(value));
const isOneOf = <T extends string>(value: unknown, options: readonly T[]): value is T => isString(value) && (options as readonly string[]).includes(value);
function version(value: unknown, name: string): asserts value is VersionedMasterFile {
  if (!isObject(value) || value.schemaVersion !== MASTER_SCHEMA_VERSION || !isString(value.masterVersion) || !isDate(value.updatedAt)) throw new Error(`${name} has an invalid version envelope.`);
}
function unique<T extends object>(records: readonly T[], key: Extract<keyof T, string>, name: string) {
  const values = records.map((record) => record[key]);
  if (values.some((value) => !isString(value)) || new Set(values).size !== values.length) throw new Error(`${name} contains a missing or duplicate ${key}.`);
}
function chartReference(value: unknown, name: string): Record<string, unknown> {
  if (!isObject(value) || !isString(value.chartId) || !isDate(value.lastUpdated)) throw new Error(`${name} record is invalid.`);
  return value;
}

export function validateChartMasterFile(value: unknown): ChartMasterFile {
  if (!isObject(value)) throw new Error("Chart master is invalid."); version(value, "Chart master");
  if (!Array.isArray(value.songs) || !Array.isArray(value.charts)) throw new Error("Chart master arrays are invalid.");
  const songs = value.songs.map((raw): SongMaster => {
    if (!isObject(raw) || !isString(raw.songId) || !isString(raw.title) || (raw.debutVersion !== null && !isString(raw.debutVersion)) || !isNumber(raw.debutVersionNumber) || !Number.isInteger(raw.debutVersionNumber) || raw.debutVersionNumber <= 0 || !isObject(raw.aliases)) throw new Error("Song master record is invalid.");
    const aliases: Partial<Record<AliasSource, string[]>> = {};
    for (const source of ALIAS_SOURCES) { const list = raw.aliases[source]; if (list !== undefined) { if (!Array.isArray(list) || !list.every(isString)) throw new Error(`Song alias list for ${source} is invalid.`); aliases[source] = [...list]; } }
    return { songId: raw.songId, title: raw.title, debutVersion: raw.debutVersion, debutVersionNumber: raw.debutVersionNumber, aliases };
  });
  const charts = value.charts.map((raw): ChartMaster => {
    if (!isObject(raw) || !isString(raw.chartId) || !isString(raw.songId) || !isOneOf(raw.chartType, CHART_TYPES) || !isNumber(raw.officialLevel) || !Number.isInteger(raw.officialLevel) || (raw.notes !== null && !isNumber(raw.notes)) || (isNumber(raw.notes) && (!Number.isInteger(raw.notes) || raw.notes <= 0)) || !isOneOf(raw.availability, AVAILABILITIES)) throw new Error("Chart master record is invalid.");
    return { chartId: raw.chartId, songId: raw.songId, chartType: raw.chartType, officialLevel: raw.officialLevel, notes: raw.notes as number | null, availability: raw.availability };
  });
  unique(songs, "songId", "Chart master songs"); unique(charts, "chartId", "Chart master charts");
  const songIds = new Set(songs.map(({ songId }) => songId)); if (charts.some(({ songId }) => !songIds.has(songId))) throw new Error("Chart references an unknown song.");
  return { schemaVersion: MASTER_SCHEMA_VERSION, masterVersion: value.masterVersion, updatedAt: value.updatedAt, songs, charts };
}
export function validateUnofficialMasterFile(value: unknown): UnofficialMasterFile {
  if (!isObject(value)) throw new Error("Unofficial master is invalid."); version(value, "Unofficial master"); if (!Array.isArray(value.records)) throw new Error("Unofficial records are invalid.");
  const records = value.records.map((raw): UnofficialDifficultyRecord => { const record = chartReference(raw, "Unofficial"); if (record.difficulty !== null && !isNumber(record.difficulty)) throw new Error("Unofficial difficulty is invalid."); return { chartId: record.chartId as string, difficulty: record.difficulty as number | null, lastUpdated: record.lastUpdated as string }; }); unique(records, "chartId", "Unofficial master");
  return { schemaVersion: MASTER_SCHEMA_VERSION, masterVersion: value.masterVersion, updatedAt: value.updatedAt, records };
}
export function validateEreterMasterFile(value: unknown): EreterMasterFile {
  if (!isObject(value)) throw new Error("ERETER master is invalid."); version(value, "ERETER master"); if (!Array.isArray(value.records)) throw new Error("ERETER records are invalid.");
  const records = value.records.map((raw): EreterChartDataRecord => { const record = chartReference(raw, "ERETER"); for (const key of ["ec", "hc", "exh"] as const) if (record[key] !== null && !isNumber(record[key])) throw new Error(`ERETER ${key} is invalid.`); return { chartId: record.chartId as string, ec: record.ec as number | null, hc: record.hc as number | null, exh: record.exh as number | null, lastUpdated: record.lastUpdated as string }; }); unique(records, "chartId", "ERETER master");
  return { schemaVersion: MASTER_SCHEMA_VERSION, masterVersion: value.masterVersion, updatedAt: value.updatedAt, records };
}
export function validateNotesRadarMasterFile(value: unknown): NotesRadarMasterFile {
  if (!isObject(value)) throw new Error("Notes radar master is invalid."); version(value, "Notes radar master"); if (!Array.isArray(value.records)) throw new Error("Notes radar records are invalid.");
  const records = value.records.map((raw): NotesRadarRecord => { const record = chartReference(raw, "Notes radar"); if (record.verified !== true || !isObject(record.values)) throw new Error("Notes radar record is unverified or invalid."); const values = {} as Record<(typeof RADAR_ATTRIBUTES)[number], number>; for (const key of RADAR_ATTRIBUTES) { if (!isNumber(record.values[key])) throw new Error(`Notes radar ${key} is invalid.`); values[key] = record.values[key] as number; } return { chartId: record.chartId as string, values, verified: true, lastUpdated: record.lastUpdated as string }; }); unique(records, "chartId", "Notes radar master");
  return { schemaVersion: MASTER_SCHEMA_VERSION, masterVersion: value.masterVersion, updatedAt: value.updatedAt, records };
}
export function validateMasterManifest(value: unknown): MasterManifest {
  if (!isObject(value)) throw new Error("Master manifest is invalid."); version(value, "Master manifest"); if (!isObject(value.files)) throw new Error("Master manifest files are invalid.");
  const names = ["chart-master.json", "unofficial.json", "ereter.json", "notes-radar.json"] as const; const files = {} as MasterManifest["files"];
  for (const name of names) { const entry = value.files[name]; if (!isObject(entry) || !isString(entry.path) || !isString(entry.masterVersion) || (entry.recordCount !== undefined && (!isNumber(entry.recordCount) || !Number.isInteger(entry.recordCount) || entry.recordCount < 0))) throw new Error(`Master manifest entry ${name} is invalid.`); files[name] = { path: entry.path, masterVersion: entry.masterVersion, ...(entry.recordCount === undefined ? {} : { recordCount: entry.recordCount }) }; }
  if (value.generatedAt !== undefined && !isDate(value.generatedAt)) throw new Error("Master manifest generatedAt is invalid.");
  return { schemaVersion: MASTER_SCHEMA_VERSION, masterVersion: value.masterVersion, updatedAt: value.updatedAt, ...(value.generatedAt === undefined ? {} : { generatedAt: value.generatedAt }), files };
}
export function validateMasterSet(value: MasterSet): MasterSet {
  const manifest = validateMasterManifest(value.manifest); const chartMaster = validateChartMasterFile(value.chartMaster); const unofficial = validateUnofficialMasterFile(value.unofficial); const ereter = validateEreterMasterFile(value.ereter); const notesRadar = validateNotesRadarMasterFile(value.notesRadar);
  const files = [["chart-master.json", chartMaster], ["unofficial.json", unofficial], ["ereter.json", ereter], ["notes-radar.json", notesRadar]] as const;
  for (const [name, file] of files) if (manifest.files[name].masterVersion !== file.masterVersion) throw new Error(`Master manifest version does not match ${name}.`);
  if (manifest.files["chart-master.json"].recordCount !== undefined && manifest.files["chart-master.json"].recordCount !== chartMaster.charts.length) throw new Error("Chart master manifest record count does not match.");
  if (manifest.files["unofficial.json"].recordCount !== undefined && manifest.files["unofficial.json"].recordCount !== unofficial.records.length) throw new Error("Unofficial manifest record count does not match.");
  if (manifest.files["ereter.json"].recordCount !== undefined && manifest.files["ereter.json"].recordCount !== ereter.records.length) throw new Error("ERETER manifest record count does not match.");
  if (manifest.files["notes-radar.json"].recordCount !== undefined && manifest.files["notes-radar.json"].recordCount !== notesRadar.records.length) throw new Error("Notes radar manifest record count does not match.");
  const chartIds = new Set(chartMaster.charts.map(({ chartId }) => chartId)); for (const records of [unofficial.records, ereter.records, notesRadar.records]) if (records.some(({ chartId }) => !chartIds.has(chartId))) throw new Error("External master record references an unknown chart.");
  return { manifest, chartMaster, unofficial, ereter, notesRadar };
}
