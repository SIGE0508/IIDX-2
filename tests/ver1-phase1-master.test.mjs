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
  // Fingerprints of the complete Ver.1.1.0 master arrays, excluding only new IDs.
  assert.equal(hash(set.chartMaster.charts.filter(row => Number(row.chartId.slice(5)) < 2488)), "08b50a5d06d60284d7a1803de529b12bfb6907e6d273770dd17f9cf5810ffe27");
  assert.equal(hash(set.chartMaster.songs.filter(row => Number(row.songId.slice(1)) < 1764)), "e2c400ee835a6e7d29f126e0892f8483aa746f024d90e2f768bc9020d5db88ac");
  assert.equal(set.chartMaster.charts.length, 2491);
  assert.equal(set.notesRadar.records.length, 2080);
  const radarMap = new Map(set.notesRadar.records.map(row => [row.chartId, row]));
  assert.equal(radarMap.get("CT_ID0125").values.SOF_LAN, 177.65);
  const statusLines = readFileSync(path.join(root, "data/master-input/radar_data.csv"), "utf8").trim().split(/\r?\n/);
  // IDs and TRUE/FALSE are checked through published membership, not CSV title parsing.
  const falseIds = statusLines.slice(1).filter(line => /,FALSE,/.test(line)).map(line => line.split(",")[0]);
  assert.equal(falseIds.length, 411);
  for (const id of falseIds) assert.equal(radarMap.has(id), false);
  for (const id of ["CT_ID2488", "CT_ID2489", "CT_ID2490", "CT_ID2491", "CT_ID2492", "CT_ID2493"]) {
    const item = set.chartMaster.charts.find(row => row.chartId === id);
    const song = set.chartMaster.songs.find(row => row.songId === item.songId);
    assert.equal(lookup.resolveChart({ title: song.title, chartType: item.chartType, source: "officialCsv" }, set.chartMaster.songs, set.chartMaster.charts).chart.chartId, id);
    assert.equal(radarMap.has(id), true);
    assert.equal(chart.effectiveDifficulty(item, set.unofficial.records.find(row => row.chartId === id)), item.officialLevel);
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
