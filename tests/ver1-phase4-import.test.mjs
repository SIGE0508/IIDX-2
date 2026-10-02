import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const cache = new Map();
function load(relativePath) {
  const filename = path.resolve(root, relativePath);
  if (cache.has(filename)) return cache.get(filename);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, fileName: filename }).outputText;
  const module = { exports: {} };
  cache.set(filename, module.exports);
  vm.runInNewContext(output, { module, exports: module.exports, require: source => load(path.relative(root, path.resolve(path.dirname(filename), `${source}.ts`))), Number, Math, Set, Map, Array, Object, Error, Date, JSON, String, RegExp }, { filename });
  cache.set(filename, module.exports);
  return module.exports;
}

const official = load("src/import/official-csv.ts");
const tracker = load("src/import/clear-tracker-csv.ts");
const backup = load("src/import/backup.ts");
const operations = load("src/import/operations.ts");
const now = "2026-09-23T00:00:00.000Z";
const song = { songId: "s1", title: "Song, One", debutVersion: "1st", debutVersionNumber: 1, aliases: { officialCsv: ["Song, One"] } };
const chart = { chartId: "c1", songId: "s1", chartType: "DPA", officialLevel: 12, notes: 1000, availability: "available" };
const headers = ["タイトル", "NORMAL 難易度", "NORMAL スコア", "NORMAL ミスカウント", "NORMAL クリアタイプ", "HYPER 難易度", "HYPER スコア", "HYPER ミスカウント", "HYPER クリアタイプ", "ANOTHER 難易度", "ANOTHER スコア", "ANOTHER ミスカウント", "ANOTHER クリアタイプ", "LEGGENDARIA 難易度", "LEGGENDARIA スコア", "LEGGENDARIA ミスカウント", "LEGGENDARIA クリアタイプ"];
const row = ["Song, One", "0", "0", "---", "NO PLAY", "0", "0", "---", "NO PLAY", "12", "0", "---", "FULLCOMBO CLEAR", "0", "0", "---", "NO PLAY"];
const csv = values => `${headers.join(",")}\n${values.map(value => value.includes(",") ? `"${value}"` : value).join(",")}`;
const prior = { playerId: "p", chartId: "c1", clearLamp: "CLEAR", score: 1234, bp: 20, clearSource: null, scoreSource: null, bpSource: null, updatedAt: now };

test("official CSV uses real Japanese DP headers, preserves SCORE 0 / BP ---, and rejects SCORE above Notes cap", () => {
  const result = official.previewOfficialCsv(csv(row), "p", [song], [chart], [prior], now);
  assert.equal(result.errors.length, 0);
  assert.equal(result.records[0].clearLamp, "FULL_COMBO");
  assert.equal(result.records[0].score, 1234);
  assert.equal(result.records[0].bp, 20);
  const invalid = [...row]; invalid[10] = "invalid";
  assert.equal(official.previewOfficialCsv(csv(invalid), "p", [song], [chart], [prior], now).errors.length, 1);
  const tooHigh = [...row]; tooHigh[10] = "2001";
  assert.equal(official.previewOfficialCsv(csv(tooHigh), "p", [song], [chart], [prior], now).records.length, 0);
});

test("official CSV skips unresolved out-of-scope charts per chart while importing matched managed charts", () => {
  const hyper = { ...chart, chartId: "c2", chartType: "DPH", officialLevel: 10 };
  const mixed = [...row]; mixed[1] = "7"; mixed[5] = "10"; mixed[6] = "1000"; mixed[8] = "CLEAR";
  const result = official.previewOfficialCsv(csv(mixed), "p", [song], [chart, hyper], [], now);
  assert.equal(result.errors.length, 0);
  assert.equal(result.records.map(record => record.chartId).join(","), "c2,c1");
  const missingManaged = [...mixed]; missingManaged[5] = "11";
  assert.equal(official.previewOfficialCsv(csv(missingManaged), "p", [song], [chart], [], now).errors.length, 1);
});

test("official CSV trims title edges before exact official-alias matching without changing internal spaces", () => {
  const padded = [...row]; padded[0] = " Song, One ";
  const result = official.previewOfficialCsv(csv(padded), "p", [song], [chart], [], now);
  assert.equal(result.errors.length, 0);
  assert.equal(result.records[0].chartId, "c1");
});

test("CLEAR TRACKER CSV round-trips quoted titles and rejects out-of-scope or over-cap scores", () => {
  const text = tracker.exportClearTrackerCsv([chart], [song], new Map(), []);
  assert.ok(text.startsWith("\ufeff"));
  assert.equal(tracker.previewClearTrackerCsv(text, "p", [chart], [], now).errors.length, 0);
  const outside = { ...chart, chartId: "c9", officialLevel: 9 };
  assert.equal(tracker.previewClearTrackerCsv(text.replaceAll("c1", "c9"), "p", [outside], [], now).errors.length, 1);
  assert.equal(tracker.previewClearTrackerCsv(text.replace("NO PLAY,,", "NO PLAY,2001,"), "p", [chart], [], now).errors.length, 1);
});

test("backup requires all six arrays", () => {
  assert.throws(() => backup.parseBackup(JSON.stringify({ schemaVersion: 1, backupCreatedAt: now, payload: { players: [] } })), /supported/);
  assert.throws(() => backup.parseBackup("{"), /invalid/);
  assert.throws(() => backup.parseBackup(JSON.stringify({ schemaVersion: 0, backupCreatedAt: now, payload: { players: [], playerChartRecords: [], history: [], ereterPersonalHistory: [], setupDrafts: [], uiSettings: [] } })), /supported/);
  assert.throws(() => backup.parseBackup(JSON.stringify({ schemaVersion: 2, backupCreatedAt: now, payload: { players: [], playerChartRecords: [], history: [], ereterPersonalHistory: [], setupDrafts: [], uiSettings: [] } })), /supported/);
  assert.doesNotThrow(() => backup.parseBackup(JSON.stringify({ schemaVersion: 1, backupCreatedAt: now, payload: { players: [], playerChartRecords: [], history: [], ereterPersonalHistory: [], setupDrafts: [], uiSettings: [] } })));
});

test("QUICK INPUT creates HISTORY only for upward lamp changes, caps SCORE, and preserves score/BP bests", async () => {
  let saved;
  const current = { playerId: "p", chartId: "c1", clearLamp: "CLEAR", score: null, bp: null, clearSource: "manual", scoreSource: null, bpSource: null, updatedAt: now };
  const repository = { getPlayerChartRecord: async () => current, commit: async value => { saved = value; } };
  await operations.updateQuickInput(repository, "p", chart, "HARD_CLEAR", 2000, 12, now, () => "h1");
  assert.equal(saved.history.length, 1);
  assert.equal(saved.playerChartRecords[0].score, 2000);
  assert.equal(saved.playerChartRecords[0].bp, 12);
  await operations.updateQuickInput(repository, "p", chart, "EASY_CLEAR", undefined, undefined, now, () => "h2");
  assert.equal(saved.history.length, 0);
  await assert.rejects(() => operations.updateQuickInput(repository, "p", chart, "CLEAR", 2001, undefined, now, () => "h3"), /exceeds/);
  current.score = 2000; current.bp = 12;
  await operations.updateQuickInput(repository, "p", chart, "CLEAR", 1999, 13, now, () => "h4");
  assert.equal(saved.playerChartRecords[0].score, 2000);
  assert.equal(saved.playerChartRecords[0].bp, 12);
});

test("backup rejects orphan player and unknown chart references", () => {
  const parsed = backup.parseBackup(JSON.stringify({ schemaVersion: 1, backupCreatedAt: now, payload: { players: [], playerChartRecords: [{ playerId: "missing", chartId: "c1", clearLamp: "CLEAR", score: null, bp: null, clearSource: null, scoreSource: null, bpSource: null, updatedAt: now }], history: [], ereterPersonalHistory: [], setupDrafts: [], uiSettings: [] } }));
  assert.throws(() => backup.validateBackupReferences(parsed, new Set(["c1"])), /missing player/);
});

test("schemaVersion 1 backup supplies new nullable Player fields without changing records", () => {
  const legacy = { schemaVersion: 1, backupCreatedAt: now, payload: { players: [{ playerId: "p", iidxId: null, playerName: null, highestDpRank: "NINTH", notesRadar: null, createdAt: now, updatedAt: now }], playerChartRecords: [], history: [], ereterPersonalHistory: [], setupDrafts: [], uiSettings: [] } };
  const parsed = backup.parseBackup(JSON.stringify(legacy));
  assert.equal(parsed.payload.players[0].ereterOverall, null);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.payload.players[0].notesRadarDetails)), { NOTES: [], CHORD: [], PEAK: [], CHARGE: [], SCRATCH: [], SOF_LAN: [] });
});
