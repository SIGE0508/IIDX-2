import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";
import { createHash } from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const cache = new Map();
function load(relativePath) {
  const filename = path.resolve(root, relativePath);
  if (cache.has(filename)) return cache.get(filename);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, fileName: filename }).outputText;
  const module = { exports: {} }; cache.set(filename, module.exports);
  vm.runInNewContext(output, { module, exports: module.exports, require: (specifier) => { if (!specifier.startsWith(".")) throw new Error(`Unexpected module: ${specifier}`); return load(path.relative(root, path.resolve(path.dirname(filename), `${specifier}.ts`))); }, Number, Math, Set, Map, Array, Object, Error, Date }, { filename });
  cache.set(filename, module.exports); return module.exports;
}
const chart = load("src/domain/chart.ts"); const validation = load("src/master/validation.ts"); const lookup = load("src/master/lookup.ts"); const loader = load("src/master/loader.ts");
const ereterFormat = load("src/domain/ereter.ts");
const updatedAt = "2026-09-22T00:00:00.000Z";
const manifest = { schemaVersion: 1, masterVersion: "2026.09.22", updatedAt, files: Object.fromEntries(["chart-master.json", "unofficial.json", "ereter.json", "notes-radar.json"].map((path) => [path, { path, masterVersion: "2026.09.22" }])) };
const chartMaster = { schemaVersion: 1, masterVersion: "2026.09.22", updatedAt, songs: [{ songId: "s1", title: ".59", debutVersion: "1st", debutVersionNumber: 1, aliases: { officialCsv: ["0.59"] } }, { songId: "s2", title: "Shared", debutVersion: null, debutVersionNumber: 2, aliases: { ereter: ["same"] } }, { songId: "s3", title: "Other", debutVersion: null, debutVersionNumber: 2, aliases: { ereter: ["same"] } }], charts: [{ chartId: "c1", songId: "s1", chartType: "DPA", officialLevel: 12, notes: null, availability: "available" }, { chartId: "c2", songId: "s2", chartType: "DPA", officialLevel: 11, notes: 1000, availability: "unknown" }, { chartId: "c3", songId: "s3", chartType: "DPA", officialLevel: 11, notes: 900, availability: "unavailable" }] };
const unofficial = { schemaVersion: 1, masterVersion: "2026.09.22", updatedAt, records: [{ chartId: "c1", difficulty: 12.15, lastUpdated: updatedAt }] };
const ereter = { schemaVersion: 1, masterVersion: "2026.09.22", updatedAt, records: [{ chartId: "c1", ec: 1, hc: null, exh: null, lastUpdated: updatedAt }] };
const radar = { schemaVersion: 1, masterVersion: "2026.09.22", updatedAt, records: [{ chartId: "c1", values: { NOTES: 1, CHORD: 1, PEAK: 1, CHARGE: 1, SCRATCH: 1, SOF_LAN: 1 }, verified: true, lastUpdated: updatedAt }] };

test("availability and management remain distinct", () => {
  assert.equal(chart.isManagedChart({ officialLevel: 12 }), true); assert.equal(chart.isManagedChart({ officialLevel: 9 }), false);
  assert.equal(chart.isCurrentlyPlayableChart(chartMaster.charts[1]), true); assert.equal(chart.isCurrentlyPlayableChart(chartMaster.charts[2]), false);
  assert.equal(chart.roundDifficultyToTenths(12.15), 12.2);
  assert.equal(chart.effectiveDifficulty(chartMaster.charts[0], { difficulty: null }), 12);
});
test("shared ERETER display values keep one decimal place", () => {
  assert.equal(ereterFormat.formatEreterValue(1), "1.0");
  assert.equal(ereterFormat.formatEreterValue(7.3), "7.3");
  assert.equal(ereterFormat.formatEreterValue(null), "－");
});
test("master validation rejects a broken source reference and version mismatch", () => {
  assert.equal(validation.validateMasterSet({ manifest, chartMaster, unofficial, ereter, notesRadar: radar }).chartMaster.charts.length, 3);
  assert.throws(() => validation.validateMasterSet({ manifest, chartMaster, unofficial: { ...unofficial, records: [{ ...unofficial.records[0], chartId: "missing" }] }, ereter, notesRadar: radar }), /unknown chart/);
  assert.throws(() => validation.validateMasterSet({ manifest: { ...manifest, files: { ...manifest.files, "ereter.json": { ...manifest.files["ereter.json"], masterVersion: "other" } } }, chartMaster, unofficial, ereter, notesRadar: radar }), /version/);
});
test("lookup is exact and source-specific", () => {
  assert.equal(lookup.resolveChart({ title: "0.59", chartType: "DPA", source: "officialCsv" }, chartMaster.songs, chartMaster.charts).status, "matched");
  assert.equal(lookup.resolveChart({ title: "0.5", chartType: "DPA", source: "officialCsv" }, chartMaster.songs, chartMaster.charts).status, "unresolved");
  assert.equal(lookup.resolveChart({ title: "same", chartType: "DPA", source: "ereter" }, chartMaster.songs, chartMaster.charts).status, "ambiguous");
});
test("loader only requests manifest-declared bundled paths", async () => {
  const values = new Map([["/masters/v1/manifest.json", manifest], ["/masters/v1/chart-master.json", chartMaster], ["/masters/v1/unofficial.json", unofficial], ["/masters/v1/ereter.json", ereter], ["/masters/v1/notes-radar.json", radar]]);
  const loaded = await loader.loadMasterSet(async (url) => { if (!values.has(url)) throw new Error(`Unexpected URL ${url}`); return values.get(url); }); assert.equal(loaded.ereter.records.length, 1);
});

test("generator emits a Phase 0-compatible development master from header-based CSV input", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "iidx-master-test-")); const input = path.join(folder, "input"); const output = path.join(folder, "output");
  await mkdir(input);
  const write = (name, text) => writeFile(path.join(input, name), text);
  await Promise.all([
    write("CHART_MASTER.csv", "chartId,songID,タイトル,譜面,公式レベル,初出Ver,初出Ver（数）,Notes,availability,公式CSV Alias,非公式Alias,ereter Alias,Radar Alias,備考\nc1,s1,Song,DPA,12,1st,1,,available,Song CSV,Song U,Song E,Song R,\n"),
    write("UNOFFICIAL.csv", "chartId,songID,タイトル,譜面,公式レベル,初出Ver,初出Ver（数）,非公式難易度表\nc1,s1,Song,DPA,12,1st,1,\n"),
    write("ERETER.csv", "CHART_ID,SongID,曲名,譜面,EC,HC,EXH\nc1,s1,Song,DPA,★0.7,,\n"),
    write("NOTES_RADAR.csv", "chartId,SongID,タイトル,譜面,公式LV,初出Ver,初出Ver(数),NOTES,CHORD,PEAK,CHARGE,SCRATCH,SOF-LAN\nc1,s1,Song,DPA,12,1st,1,1,2,3,4,5,6\n"),
    write("radar_data.csv", "chartId,確認済み\nc1,TRUE\n"),
  ]);
  try {
    execFileSync(process.execPath, [path.join(root, "scripts/generate-masters.mjs"), "--input", input, "--output", output, "--generated-at", updatedAt], { encoding: "utf8" });
    const fetcher = async (url) => JSON.parse(await readFile(path.join(output, path.basename(url)), "utf8"));
    const loaded = await loader.loadMasterSet(fetcher); assert.equal(loaded.chartMaster.charts[0].notes, null); assert.equal(loaded.chartMaster.songs[0].debutVersionNumber, 1); assert.equal(loaded.unofficial.records[0].difficulty, null); assert.equal(loaded.ereter.records[0].ec, 0.7); assert.equal(loaded.notesRadar.records[0].values.SOF_LAN, 6);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("Radar confirmation is mandatory and FALSE never publishes even populated values", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "iidx-radar-confirmation-"));
  const input = path.join(folder, "input"); const output = path.join(folder, "output");
  await mkdir(input);
  const write = (name, text) => writeFile(path.join(input, name), text);
  const generate = () => execFileSync(process.execPath, [path.join(root, "scripts/generate-masters.mjs"), "--input", input, "--output", output, "--generated-at", updatedAt], { encoding: "utf8", stdio: "pipe" });
  try {
    await Promise.all([
      write("CHART_MASTER.csv", "chartId,songID,タイトル,譜面,公式レベル,初出Ver,初出Ver（数）,Notes,availability,公式CSV Alias,非公式Alias,ereter Alias,Radar Alias,備考\nc1,s1,Song,DPA,12,1st,1,,available,,,,,\nc2,s2,Other,DPA,11,1st,1,,available,,,,,\n"),
      write("UNOFFICIAL.csv", "chartId,songID,タイトル,譜面,公式レベル,初出Ver,初出Ver（数）,非公式難易度表\n"),
      write("ERETER.csv", "CHART_ID,SongID,曲名,譜面,EC,HC,EXH\n"),
      write("NOTES_RADAR.csv", "chartId,SongID,タイトル,譜面,公式LV,初出Ver,初出Ver(数),NOTES,CHORD,PEAK,CHARGE,SCRATCH,SOF-LAN\nc1,s1,Song,DPA,12,1st,1,100,0.00,50,0,10,0\nc2,s2,Other,DPA,11,1st,1,200,100,100,100,100,100\n"),
      write("radar_data.csv", "chartId,SongID,タイトル,譜面,確認済み\nc1,stale,Old title,DPA,TRUE\nc2,s2,Other,DPA,FALSE\n"),
    ]);
    generate();
    const published = JSON.parse(await readFile(path.join(output, "notes-radar.json"), "utf8"));
    assert.equal(published.records.length, 1);
    assert.equal(published.records[0].chartId, "c1");
    assert.equal(published.records[0].values.CHORD, 0);
    assert.equal(published.records[0].verified, true);
    assert.equal(JSON.parse(await readFile(path.join(output, "chart-master.json"), "utf8")).charts.length, 2);
    for (const invalid of [
      "chartId,確認済み\nc1,\nc2,FALSE\n",
      "chartId,確認済み\nc1,true\nc2,FALSE\n",
      "chartId,確認済み\nc1,TRUE\n",
      "chartId,確認済み\nc1,TRUE\nc1,FALSE\nc2,FALSE\n",
      "chartId,確認済み\nc1,TRUE\nc2,FALSE\nmissing,TRUE\n",
      "chartId\nc1\nc2\n",
      "chartId,譜面,確認済み\nc1,DPH,TRUE\nc2,DPA,FALSE\n",
    ]) {
      await write("radar_data.csv", invalid);
      assert.throws(generate);
      assert.equal(await readFile(path.join(output, "notes-radar.json"), "utf8"), JSON.stringify(published, null, 2) + "\n");
    }
    await rm(path.join(input, "radar_data.csv"));
    assert.throws(generate);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("October Radar sync preserves all existing identities, aliases and availability", async () => {
  const readMaster = name => JSON.parse(readFileSync(path.join(root, "public/masters/v1", name), "utf8"));
  const set = validation.validateMasterSet({ manifest: readMaster("manifest.json"), chartMaster: readMaster("chart-master.json"), unofficial: readMaster("unofficial.json"), ereter: readMaster("ereter.json"), notesRadar: readMaster("notes-radar.json") });
  const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  // Preserve the original fingerprint, reversing only the eight approved Notes
  // additions for comparison. Every other existing field remains protected.
  const addedNotes = new Map([["CT_ID2477", 1431], ["CT_ID2478", 1602], ["CT_ID2479", 1585], ["CT_ID2480", 1508], ["CT_ID2481", 2009], ["CT_ID2482", 1940], ["CT_ID2483", 1588], ["CT_ID2484", 1638]]);
  for (const [id, notes] of addedNotes) assert.equal(set.chartMaster.charts.find(row => row.chartId === id).notes, notes);
  assert.equal(hash(set.chartMaster.charts.filter(row => Number(row.chartId.slice(5)) < 2488).map(row => addedNotes.has(row.chartId) ? { ...row, notes: null } : row)), "08b50a5d06d60284d7a1803de529b12bfb6907e6d273770dd17f9cf5810ffe27");
  assert.equal(hash(set.chartMaster.songs.filter(row => Number(row.songId.slice(1)) < 1764)), "e2c400ee835a6e7d29f126e0892f8483aa746f024d90e2f768bc9020d5db88ac");
  assert.equal(set.chartMaster.charts.length, 2503);
  assert.equal(set.notesRadar.records.length, 2496);
  const radarMap = new Map(set.notesRadar.records.map(row => [row.chartId, row]));
  assert.equal(radarMap.get("CT_ID0125").values.SOF_LAN, 177.65);
  const statusLines = readFileSync(path.join(root, "data/master-input/radar_data.csv"), "utf8").trim().split(/\r?\n/);
  // IDs and TRUE/FALSE are checked through published membership, not CSV title parsing.
  const falseIds = statusLines.slice(1).filter(line => /,FALSE,/.test(line)).map(line => line.split(",")[0]);
  assert.equal(falseIds.length, 7);
  for (const id of falseIds) assert.equal(radarMap.has(id), false);
  for (const id of ["CT_ID2488", "CT_ID2489", "CT_ID2490", "CT_ID2491", "CT_ID2492", "CT_ID2493"]) {
    const item = set.chartMaster.charts.find(row => row.chartId === id);
    const song = set.chartMaster.songs.find(row => row.songId === item.songId);
    assert.equal(lookup.resolveChart({ title: song.title, chartType: item.chartType, source: "officialCsv" }, set.chartMaster.songs, set.chartMaster.charts).chart.chartId, id);
    assert.equal(radarMap.has(id), true);
    const expectedDifficulty = { CT_ID2488: 10.5, CT_ID2489: 12.1, CT_ID2490: 11.6, CT_ID2491: 10, CT_ID2492: 10, CT_ID2493: 12.2 };
    assert.equal(chart.effectiveDifficulty(item, set.unofficial.records.find(row => row.chartId === id)), expectedDifficulty[id]);
  }
  const { calculateTraining } = load("src/training/engine.ts");
  const player = { playerId: "test", highestDpRank: "CHUDEN", notesRadar: { NOTES: 100, CHORD: 100, PEAK: 100, CHARGE: 100, SCRATCH: 100, SOF_LAN: 100 }, ereterOverall: null, notesRadarDetails: {} };
  const inputBefore = JSON.stringify(set);
  for (const attribute of Object.keys(player.notesRadar)) {
    const result = calculateTraining({ player, records: [], master: set, selectedAttribute: attribute });
    for (const item of result.recommendations.attributePracticeTargets) assert.ok(radarMap.get(item.chartId).values[attribute] > 0);
  }
  assert.equal(JSON.stringify(set), inputBefore);
});

test("November distribution retains October additions with the newly confirmed difficulty values", () => {
  const read = name => JSON.parse(readFileSync(path.join(root, "public/masters/v1", name), "utf8"));
  const set = validation.validateMasterSet({ manifest: read("manifest.json"), chartMaster: read("chart-master.json"), unofficial: read("unofficial.json"), ereter: read("ereter.json"), notesRadar: read("notes-radar.json") });
  assert.equal(set.manifest.masterVersion, "2026.11.01");
  assert.equal(set.unofficial.records.length, 2503);
  assert.equal(set.ereter.records.length, 765);
  const charts = new Map(set.chartMaster.charts.map(row => [row.chartId, row]));
  const unofficial = new Map(set.unofficial.records.map(row => [row.chartId, row.difficulty]));
  const radar = new Map(set.notesRadar.records.map(row => [row.chartId, row]));
  for (const [id, songId, type, level, notes] of [["CT_ID2494", "S001768", "DPA", 11, 1342], ["CT_ID2495", "S001769", "DPA", 11, 1275], ["CT_ID2496", "S001770", "DPH", 10, 1257], ["CT_ID2497", "S001770", "DPA", 12, 1806]]) {
    const item = charts.get(id);
    assert.equal(item.songId, songId); assert.equal(item.chartType, type); assert.equal(item.officialLevel, level);
    assert.equal(item.notes, notes); assert.equal(item.availability, "available");
    const expectedDifficulty = { CT_ID2494: 11.8, CT_ID2495: 10.7, CT_ID2496: 10, CT_ID2497: 12.4 };
    assert.equal(unofficial.get(id), expectedDifficulty[id]); assert.equal(chart.effectiveDifficulty(item, { difficulty: null }), level);
    assert.equal(radar.get(id).verified, true);
    const song = set.chartMaster.songs.find(row => row.songId === songId);
    assert.equal(lookup.resolveChart({ title: song.title, chartType: type, source: "officialCsv" }, set.chartMaster.songs, set.chartMaster.charts).chart.chartId, id);
  }
  assert.equal(unofficial.get("CT_ID2485"), 11.4); assert.equal(unofficial.get("CT_ID2486"), 12.3); assert.equal(unofficial.get("CT_ID2487"), 12.5);
  assert.equal(set.unofficial.records.filter(row => row.difficulty === null).length, 6);
  for (const id of ["CT_ID2489", "CT_ID2493", "CT_ID2497"]) {
    const row = set.ereter.records.find(row => row.chartId === id);
    assert.equal(row.ec, null); assert.equal(row.hc, null); assert.equal(row.exh, null);
  }
  assert.equal(radar.get("CT_ID0327").verified, true);
  assert.equal(radar.get("CT_ID0327").values.CHORD, 42.01);
  assert.equal(radar.get("CT_ID0327").values.SOF_LAN, 57.14);
  assert.equal(charts.has("CT_ID0327"), true);
  assert.equal(radar.get("CT_ID1273").values.NOTES, 103.42);
  assert.equal(radar.get("CT_ID2496").values.CHARGE, 0);
  assert.equal(radar.get("CT_ID1642").values.CHARGE, 162.30);
  assert.equal(radar.get("CT_ID1859").values.SOF_LAN, 173.38);
});

test("November 1 master preserves October identities and outputs only the confirmed Radar set", () => {
  const read = name => JSON.parse(readFileSync(path.join(root, "public/masters/v1", name), "utf8"));
  const set = validation.validateMasterSet({ manifest: read("manifest.json"), chartMaster: read("chart-master.json"), unofficial: read("unofficial.json"), ereter: read("ereter.json"), notesRadar: read("notes-radar.json") });
  const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  // Entire October 24 arrays: all existing IDs, Notes, aliases and availability.
  assert.equal(hash(set.chartMaster.charts.filter(row => Number(row.chartId.slice(5)) < 2498)), "93d58fd1986d7bd5f100cf6e8bc9bf8db8a78b09200b08ed9fa46cec6a533a32");
  assert.equal(hash(set.chartMaster.songs.filter(row => Number(row.songId.slice(1)) < 1771)), "f3438129a812217c05fe25d9a8d9b3a8e6d655494f143258e19a9d48dd6f8df6");
  assert.equal(set.chartMaster.songs.length, 1774);
  const charts = new Map(set.chartMaster.charts.map(row => [row.chartId, row]));
  const radar = new Map(set.notesRadar.records.map(row => [row.chartId, row]));
  const difficulty = new Map(set.unofficial.records.map(row => [row.chartId, row.difficulty]));
  const unconfirmed = ["CT_ID0631", "CT_ID2144", "CT_ID2439", "CT_ID2440", "CT_ID2502", "CT_ID2504", "CT_ID2505"];
  assert.equal(set.chartMaster.charts.length - set.notesRadar.records.length, unconfirmed.length);
  for (const id of unconfirmed) { assert.equal(charts.has(id), true); assert.equal(radar.has(id), false); }
  for (const [id, songId, type, level, notes] of [
    ["CT_ID2498", "S001771", "DPA", 11, 1363], ["CT_ID2499", "S001772", "DPA", 11, 1533],
    ["CT_ID2500", "S001773", "DPH", 10, 914], ["CT_ID2501", "S001773", "DPA", 12, 1286],
    ["CT_ID2502", "S001774", "DPH", 10, null], ["CT_ID2503", "S001774", "DPA", 12, 1915],
    ["CT_ID2504", "S001775", "DPA", 10, 1305], ["CT_ID2505", "S001776", "DPA", 10, 1154],
  ]) {
    const item = charts.get(id);
    assert.equal(item.songId, songId); assert.equal(item.chartType, type); assert.equal(item.officialLevel, level);
    assert.equal(item.notes, notes); assert.equal(item.availability, "available");
    assert.equal(radar.has(id), !unconfirmed.includes(id));
    const song = set.chartMaster.songs.find(row => row.songId === songId);
    assert.equal(lookup.resolveChart({ title: song.title, chartType: type, source: "officialCsv" }, set.chartMaster.songs, set.chartMaster.charts).chart.chartId, id);
  }
  for (const [id, value] of [["CT_ID2477", 12.1], ["CT_ID2478", 12.4], ["CT_ID2479", 12.1], ["CT_ID2480", 12.1], ["CT_ID2481", 12.4], ["CT_ID2482", 12.3], ["CT_ID2483", 12.2], ["CT_ID2484", 12.3], ["CT_ID2493", 12.2], ["CT_ID2494", 11.8], ["CT_ID2495", 10.7], ["CT_ID2496", 10], ["CT_ID2497", 12.4]]) assert.equal(difficulty.get(id), value);
  for (const id of ["CT_ID2501", "CT_ID2503"]) {
    const item = set.ereter.records.find(row => row.chartId === id);
    assert.equal(item.ec, null); assert.equal(item.hc, null); assert.equal(item.exh, null);
  }
  assert.equal(radar.get("CT_ID2498").values.SOF_LAN, 0);
  for (const row of set.notesRadar.records) assert.equal(row.verified, true);
  for (const file of [set.chartMaster, set.unofficial, set.ereter, set.notesRadar]) { assert.equal(file.schemaVersion, 1); assert.equal(file.masterVersion, set.manifest.masterVersion); }
});

test("current input CSV regenerates every distributed master exactly and loads through the loader", async () => {
  const output = await mkdtemp(path.join(tmpdir(), "iidx-current-master-"));
  const current = JSON.parse(readFileSync(path.join(root, "public/masters/v1/manifest.json"), "utf8"));
  try {
    execFileSync(process.execPath, [path.join(root, "scripts/generate-masters.mjs"), "--input", path.join(root, "data/master-input"), "--output", output, "--version", current.masterVersion, "--generated-at", current.generatedAt], { encoding: "utf8" });
    for (const name of ["manifest.json", ...Object.keys(current.files)]) {
      assert.equal(await readFile(path.join(output, name), "utf8"), readFileSync(path.join(root, "public/masters/v1", name), "utf8"), name);
    }
    const loaded = await loader.loadMasterSet(async url => JSON.parse(await readFile(path.join(output, path.basename(url)), "utf8")));
    for (const [name, count] of [["chart-master.json", loaded.chartMaster.charts.length], ["unofficial.json", loaded.unofficial.records.length], ["ereter.json", loaded.ereter.records.length], ["notes-radar.json", loaded.notesRadar.records.length]]) assert.equal(count, current.files[name].recordCount);
  } finally { await rm(output, { recursive: true, force: true }); }
});
