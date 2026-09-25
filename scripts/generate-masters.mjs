#!/usr/bin/env node
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

const SCHEMA_VERSION = 1;
const DEFAULT_VERSION = "0.1.0-dev";
const INPUT_FILES = {
  chart: "CHART_MASTER.csv",
  unofficial: "UNOFFICIAL.csv",
  ereter: "ERETER.csv",
  radar: "NOTES_RADAR.csv",
};
const HEADERS = {
  chart: ["chartId", "songID", "タイトル", "譜面", "公式レベル", "初出Ver", "初出Ver（数）", "Notes", "availability", "公式CSV Alias", "非公式Alias", "ereter Alias", "Radar Alias", "備考"],
  unofficial: ["chartId", "songID", "タイトル", "譜面", "公式レベル", "初出Ver", "初出Ver（数）", "非公式難易度表"],
  ereter: ["CHART_ID", "SongID", "曲名", "譜面", "EC", "HC", "EXH"],
  radar: ["chartId", "SongID", "タイトル", "譜面", "公式LV", "初出Ver", "初出Ver(数)", "NOTES", "CHORD", "PEAK", "CHARGE", "SCRATCH", "SOF-LAN"],
};
const TYPES = new Set(["DPN", "DPH", "DPA", "DPL"]);
const AVAILABILITY = new Set(["available", "unavailable", "unknown"]);

function usage() {
  return "Usage: node scripts/generate-masters.mjs [--input data/master-input] [--output public/masters/v1] [--version 0.1.0-dev] [--generated-at ISO-8601]";
}
function args(argv) {
  const options = { input: "data/master-input", output: "public/masters/v1", version: DEFAULT_VERSION, generatedAt: new Date().toISOString() };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help") { console.log(usage()); process.exit(0); }
    const key = { "--input": "input", "--output": "output", "--version": "version", "--generated-at": "generatedAt" }[flag];
    if (!key || argv[index + 1] === undefined) throw new Error(usage());
    options[key] = argv[index + 1]; index += 1;
  }
  if (!options.version.trim() || Number.isNaN(Date.parse(options.generatedAt))) throw new Error("masterVersion and generatedAt must be valid.");
  return options;
}
/** RFC 4180-style CSV parser, including escaped quotes and quoted newlines. */
function parseCsv(source, label) {
  const text = source.replace(/^\uFEFF/, ""); const rows = [[]]; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) { if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; } else if (char === '"') quoted = false; else cell += char; continue; }
    if (char === '"') { if (cell !== "") throw new Error(`${label}: quote must begin at a cell boundary.`); quoted = true; }
    else if (char === ",") { rows.at(-1).push(cell); cell = ""; }
    else if (char === "\n") { rows.at(-1).push(cell.replace(/\r$/, "")); rows.push([]); cell = ""; }
    else cell += char;
  }
  if (quoted) throw new Error(`${label}: unclosed quoted cell.`);
  if (cell !== "" || rows.at(-1).length > 0) rows.at(-1).push(cell);
  if (rows.length && rows.at(-1).length === 0) rows.pop();
  if (rows.length === 0) throw new Error(`${label}: file is empty.`);
  return rows;
}
function records(text, headers, label) {
  const rows = parseCsv(text, label); const found = rows[0];
  if (new Set(found).size !== found.length) throw new Error(`${label}: duplicate header.`);
  for (const header of headers) if (!found.includes(header)) throw new Error(`${label}: required header '${header}' is missing.`);
  return rows.slice(1).filter((row) => row.some((cell) => cell.trim() !== "")).map((row, rowOffset) => {
    if (row.length > found.length) throw new Error(`${label}: row ${rowOffset + 2} has too many cells.`);
    const result = Object.fromEntries(found.map((header, index) => [header, row[index] ?? ""]));
    return { row: rowOffset + 2, values: result };
  });
}
const required = (value, label) => { if (value.trim() === "") throw new Error(`${label} is required.`); return value.trim(); };
function integer(value, label, { positive = false } = {}) { const normalized = required(value, label); if (!/^[+-]?\d+$/.test(normalized)) throw new Error(`${label} must be an integer.`); const number = Number(normalized); if (!Number.isSafeInteger(number) || (positive && number <= 0)) throw new Error(`${label} is out of range.`); return number; }
function finite(value, label, { nullable = false, star = false } = {}) { const normalized = value.trim(); if (normalized === "") { if (nullable) return null; throw new Error(`${label} is required.`); } const numberText = star ? normalized.replace(/^★/, "") : normalized; if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(numberText)) throw new Error(`${label} must be a finite number.`); const number = Number(numberText); if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number.`); return number; }
function notes(value, label) { if (value.trim() === "") return null; return integer(value, label, { positive: true }); }
function aliases(value) { const alias = value.trim(); return alias === "" ? [] : [alias]; }
function envelope(masterVersion, updatedAt, body) { return { schemaVersion: SCHEMA_VERSION, masterVersion, updatedAt, ...body }; }

function buildChartMaster(rows) {
  const chartIds = new Set(); const songs = new Map(); const charts = []; const sourceRows = new Map();
  for (const { row, values } of rows) {
    const prefix = `CHART_MASTER row ${row}`; const chartId = required(values.chartId, `${prefix} chartId`); const songId = required(values.songID, `${prefix} songID`); const title = required(values.タイトル, `${prefix} タイトル`); const chartType = required(values.譜面, `${prefix} 譜面`); const officialLevel = integer(values.公式レベル, `${prefix} 公式レベル`, { positive: true });
    if (!TYPES.has(chartType)) throw new Error(`${prefix}: invalid chart type '${chartType}'.`);
    if (!AVAILABILITY.has(values.availability)) throw new Error(`${prefix}: availability must be exactly available, unavailable, or unknown.`);
    if (chartIds.has(chartId)) throw new Error(`${prefix}: duplicate chartId '${chartId}'.`); chartIds.add(chartId);
    const incomingAliases = { officialCsv: aliases(values["公式CSV Alias"]), unofficialDifficulty: aliases(values["非公式Alias"]), ereter: aliases(values["ereter Alias"]), notesRadar: aliases(values["Radar Alias"]) };
    const oldSong = songs.get(songId);
    if (oldSong && (oldSong.title !== title || oldSong.debutVersion !== (values["初出Ver"].trim() || null))) throw new Error(`${prefix}: songId '${songId}' conflicts with an earlier title or debut version.`);
    const song = oldSong ?? { songId, title, debutVersion: values["初出Ver"].trim() || null, aliases: { officialCsv: [], unofficialDifficulty: [], ereter: [], notesRadar: [] } };
    for (const source of Object.keys(incomingAliases)) song.aliases[source] = [...new Set([...song.aliases[source], ...incomingAliases[source]])];
    songs.set(songId, song);
    charts.push({ chartId, songId, chartType, officialLevel, notes: notes(values.Notes, `${prefix} Notes`), availability: values.availability });
    sourceRows.set(chartId, { chartId, songId, title, chartType, officialLevel, debutVersion: values["初出Ver"].trim(), debutVersionNumber: values["初出Ver（数）"].trim() });
  }
  const bySong = new Map([...songs.values()].map((song) => [song.songId, song]));
  const uniqueness = new Map();
  for (const chart of charts) { const song = bySong.get(chart.songId); for (const source of ["officialCsv", "unofficialDifficulty", "ereter", "notesRadar"]) for (const alias of song.aliases[source]) { const key = `${source}\u0000${chart.chartType}\u0000${alias}`; const prior = uniqueness.get(key); if (prior && prior !== chart.chartId) throw new Error(`Alias '${alias}' for ${source} and ${chart.chartType} resolves to multiple chartIds.`); uniqueness.set(key, chart.chartId); } }
  const canonical = new Map(); for (const chart of charts) { const title = bySong.get(chart.songId).title; const key = `${chart.chartType}\u0000${title}`; const prior = canonical.get(key); if (prior && prior !== chart.chartId) throw new Error(`Title '${title}' and ${chart.chartType} resolve to multiple chartIds.`); canonical.set(key, chart.chartId); }
  return { songs: [...songs.values()].sort((a, b) => a.songId.localeCompare(b.songId)), charts: charts.sort((a, b) => a.chartId.localeCompare(b.chartId)), sourceRows };
}
function assertMatch(reference, values, row, fields, label) { for (const [input, expected] of fields) if (required(values[input], `${label} row ${row} ${input}`) !== String(reference[expected] ?? "")) throw new Error(`${label} row ${row}: ${input} does not match CHART_MASTER chartId '${reference.chartId}'.`); }
function noDuplicate(rows, key, label) { const found = new Set(); for (const { row, values } of rows) { const value = required(values[key], `${label} row ${row} ${key}`); if (found.has(value)) throw new Error(`${label} row ${row}: duplicate ${key} '${value}'.`); found.add(value); } }
function externalRows(rows, sourceRows, key, label, fields) { noDuplicate(rows, key, label); return rows.map(({ row, values }) => { const chartId = required(values[key], `${label} row ${row} ${key}`); const reference = sourceRows.get(chartId); if (!reference) throw new Error(`${label} row ${row}: chartId '${chartId}' is not in CHART_MASTER.`); assertMatch(reference, values, row, fields, label); return { row, values, chartId }; }); }
function buildExternal(inputs, master, updatedAt) {
  const unofficialRows = externalRows(inputs.unofficial, master.sourceRows, "chartId", "UNOFFICIAL", [["songID", "songId"], ["タイトル", "title"], ["譜面", "chartType"], ["公式レベル", "officialLevel"], ["初出Ver", "debutVersion"], ["初出Ver（数）", "debutVersionNumber"]]);
  const ereterRows = externalRows(inputs.ereter, master.sourceRows, "CHART_ID", "ERETER", [["SongID", "songId"], ["曲名", "title"], ["譜面", "chartType"]]);
  const radarRows = externalRows(inputs.radar, master.sourceRows, "chartId", "NOTES_RADAR", [["SongID", "songId"], ["タイトル", "title"], ["譜面", "chartType"], ["公式LV", "officialLevel"], ["初出Ver", "debutVersion"], ["初出Ver(数)", "debutVersionNumber"]]);
  return {
    unofficial: unofficialRows.map(({ chartId, row, values }) => ({ chartId, difficulty: finite(values["非公式難易度表"], `UNOFFICIAL row ${row} 非公式難易度表`), lastUpdated: updatedAt })),
    ereter: ereterRows.map(({ chartId, row, values }) => ({ chartId, ec: finite(values.EC, `ERETER row ${row} EC`, { nullable: true, star: true }), hc: finite(values.HC, `ERETER row ${row} HC`, { nullable: true, star: true }), exh: finite(values.EXH, `ERETER row ${row} EXH`, { nullable: true, star: true }), lastUpdated: updatedAt })),
    radar: radarRows.map(({ chartId, row, values }) => ({ chartId, values: { NOTES: finite(values.NOTES, `NOTES_RADAR row ${row} NOTES`), CHORD: finite(values.CHORD, `NOTES_RADAR row ${row} CHORD`), PEAK: finite(values.PEAK, `NOTES_RADAR row ${row} PEAK`), CHARGE: finite(values.CHARGE, `NOTES_RADAR row ${row} CHARGE`), SCRATCH: finite(values.SCRATCH, `NOTES_RADAR row ${row} SCRATCH`), SOF_LAN: finite(values["SOF-LAN"], `NOTES_RADAR row ${row} SOF-LAN`) }, verified: true, lastUpdated: updatedAt })),
  };
}
async function main() {
  const option = args(process.argv.slice(2)); const input = path.resolve(option.input); const output = path.resolve(option.output); const updatedAt = new Date(option.generatedAt).toISOString();
  const read = async (file) => readFile(path.join(input, file), "utf8");
  const [chartText, unofficialText, ereterText, radarText] = await Promise.all([read(INPUT_FILES.chart), read(INPUT_FILES.unofficial), read(INPUT_FILES.ereter), read(INPUT_FILES.radar)]);
  const chart = buildChartMaster(records(chartText, HEADERS.chart, "CHART_MASTER")); const external = buildExternal({ unofficial: records(unofficialText, HEADERS.unofficial, "UNOFFICIAL"), ereter: records(ereterText, HEADERS.ereter, "ERETER"), radar: records(radarText, HEADERS.radar, "NOTES_RADAR") }, chart, updatedAt);
  const files = { "chart-master.json": envelope(option.version, updatedAt, { songs: chart.songs, charts: chart.charts }), "unofficial.json": envelope(option.version, updatedAt, { records: external.unofficial }), "ereter.json": envelope(option.version, updatedAt, { records: external.ereter }), "notes-radar.json": envelope(option.version, updatedAt, { records: external.radar }) };
  const manifest = envelope(option.version, updatedAt, { generatedAt: updatedAt, files: Object.fromEntries(Object.entries(files).map(([name, file]) => [name, { path: name, masterVersion: option.version, recordCount: name === "chart-master.json" ? file.charts.length : file.records.length }])) });
  await mkdir(output, { recursive: true });
  const stage = await mkdtemp(path.join(tmpdir(), "iidx-clear-tracker-masters-"));
  try { for (const [name, data] of Object.entries({ ...files, "manifest.json": manifest })) await writeFile(path.join(stage, name), `${JSON.stringify(data, null, 2)}\n`, "utf8"); for (const name of [...Object.keys(files), "manifest.json"]) await rename(path.join(stage, name), path.join(output, name)); console.log(`Generated ${Object.keys(files).length} master files and manifest in ${output}.`); } finally { await rm(stage, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(`Master generation failed: ${error.message}`); process.exitCode = 1; });
