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

const { calculateTraining } = load("src/training/engine.ts");
const now = "2026-09-23T00:00:00.000Z";
const player = (highestDpRank = "NINTH", notesRadar = null) => ({ playerId: "p", iidxId: null, playerName: null, highestDpRank, notesRadar, createdAt: now, updatedAt: now });
const chart = (chartId, officialLevel, difficulty, availability = "available") => ({ chart: { chartId, songId: `s-${chartId}`, chartType: "DPA", officialLevel, notes: 1000, availability }, unofficial: difficulty === null ? null : { chartId, difficulty, lastUpdated: now } });
const record = (chartId, clearLamp) => ({ playerId: "p", chartId, clearLamp, score: 999999, bp: 999999, clearSource: "manual", scoreSource: "manual", bpSource: "manual", updatedAt: now });
function master(items, ereter = [], radar = []) {
  const charts = items.map(item => item.chart);
  return {
    manifest: { schemaVersion: 1, masterVersion: "test", updatedAt: now, files: {} },
    chartMaster: { schemaVersion: 1, masterVersion: "test", updatedAt: now, songs: charts.map(item => ({ songId: item.songId, title: item.chartId, debutVersion: null, aliases: {} })), charts },
    unofficial: { schemaVersion: 1, masterVersion: "test", updatedAt: now, records: items.flatMap(item => item.unofficial ? [item.unofficial] : []) },
    ereter: { schemaVersion: 1, masterVersion: "test", updatedAt: now, records: ereter },
    notesRadar: { schemaVersion: 1, masterVersion: "test", updatedAt: now, records: radar },
  };
}
const many = (count, prefix, level, difficulty, availability = "available") => Array.from({ length: count }, (_, index) => chart(`${prefix}${String(index).padStart(3, "0")}`, level, difficulty, availability));
const run = (items, records, options = {}) => calculateTraining({ player: player(options.rank, options.playerRadar ?? null), records, master: master(items, options.ereter, options.radar), selectedAttribute: options.attribute });

test("coverage switches at exactly 30%, ignores unavailable, includes unknown, and ignores SCORE/BP", () => {
  const items = [...many(99, "a", 10, 10.7), chart("unknown", 10, 10.7, "unknown"), chart("removed", 10, 10.7, "unavailable")];
  const records29 = items.slice(0, 29).map(item => record(item.chart.chartId, "FAILED"));
  const at29 = run(items, records29);
  assert.equal(at29.coverage.denominator, 100);
  assert.equal(at29.coverage.numerator, 29);
  assert.equal(at29.mode, "INITIAL");
  const at30 = run(items, [...records29, record(items[29].chart.chartId, "FAILED")]);
  assert.equal(at30.mode, "PERFORMANCE");
});

test("TRAINING calculation does not mutate PlayerChartRecord or master inputs", () => {
  const items = [chart("immutable", 10, 10.7)];
  const records = [record("immutable", "FAILED")];
  const input = { player: player(), records, master: master(items) };
  const before = JSON.stringify(input);
  calculateTraining(input);
  assert.equal(JSON.stringify(input), before);
});

test("official level progress stays at 74% and advances at 75%", () => {
  const items = [...many(100, "l10-", 10, 10.7), chart("l11", 11, 11.0)];
  const lamps = count => items.slice(0, 100).map((item, index) => record(item.chart.chartId, index < count ? "CLEAR" : "FAILED"));
  assert.equal(run(items, lamps(74)).phase, 10);
  const at75 = run(items, lamps(75));
  assert.equal(at75.phase, 11);
  assert.equal(at75.officialProgress[0].rate, 0.75);
});

test("75% in both official levels advances from level 10 through level 11 to level 12", () => {
  const level10 = many(4, "ten-", 10, 10.7);
  const level11 = many(4, "eleven-", 11, 11.0);
  const items = [...level10, ...level11, chart("twelve", 12, 12.0)];
  const records = [...level10, ...level11].map((item, index) => record(item.chart.chartId, index % 4 < 3 ? "CLEAR" : "FAILED"));
  const result = run(items, records);
  assert.equal(result.phase, 12);
  assert.deepEqual(JSON.parse(JSON.stringify(result.officialProgress.map(item => [item.key, item.rate]))), [[10, 0.75], [11, 0.75]]);
  assert.equal(result.mainBand, 12.0);
});

test("level 12 starts at 12.0, skips empty bands, excludes introduction bands from gates and normal targets", () => {
  const band120 = many(100, "b120-", 12, 12.0);
  const intro = chart("intro", 12, 11.8);
  const band122 = [chart("b122", 12, 12.2)];
  const records = band120.map((item, index) => record(item.chart.chartId, index < 75 ? "EASY_CLEAR" : "FAILED"));
  const result = run([...band120, intro, ...band122], records, { rank: "TENTH" });
  assert.equal(result.mode, "PERFORMANCE");
  assert.equal(result.mainBand, 12.2);
  assert.equal(result.level12Progress.find(item => item.key === 12.1).skipped, true);
  assert.deepEqual([...result.introductionBands], [11.8]);
  assert.equal(result.recommendations.clearTargets.some(item => item.chartId === "intro"), false);
  assert.equal(result.recommendations.cleanupTargets.some(item => item.chartId === "intro"), false);
});

test("missing unofficial difficulty falls back to official level and missing ERETER preserves deterministic order", () => {
  const items = [chart("z-chart", 12, null), chart("a-chart", 12, null)];
  const result = run(items, [record("z-chart", "FAILED"), record("a-chart", "FAILED")], { rank: "TENTH" });
  assert.equal(result.mainBand, 12);
  assert.deepEqual(result.recommendations.clearTargets.map(item => item.chartId), ["a-chart", "z-chart"]);
  assert.ok(result.recommendations.clearTargets.every(item => item.ereterValue === null));
});

test("ERETER EC/HC/EXH sort their own categories with missing values last", () => {
  const items = [chart("a", 12, 12), chart("b", 12, 12), chart("c", 12, 12), chart("d", 12, 12), chart("e", 12, 12), chart("f", 12, 12)];
  const records = [record("a", "FAILED"), record("b", "FAILED"), record("c", "FAILED"), record("d", "EASY_CLEAR"), record("e", "CLEAR"), record("f", "HARD_CLEAR")];
  const ereter = [
    { chartId: "a", ec: 5, hc: null, exh: null, lastUpdated: now },
    { chartId: "b", ec: 6, hc: null, exh: null, lastUpdated: now },
    { chartId: "d", ec: null, hc: 7, exh: null, lastUpdated: now },
    { chartId: "e", ec: null, hc: 6, exh: null, lastUpdated: now },
    { chartId: "f", ec: null, hc: null, exh: 8, lastUpdated: now },
  ];
  const result = run(items, records, { rank: "TENTH", ereter });
  assert.deepEqual(result.recommendations.clearTargets.map(item => item.chartId), ["a", "b", "c"]);
  assert.deepEqual(result.recommendations.hardTargets.map(item => item.chartId), ["e", "d"]);
  assert.deepEqual(result.recommendations.exhTargets.map(item => item.chartId), ["f"]);
});

test("cleanup prefers the nearest lower band", () => {
  const lower = many(4, "lower-", 12, 12.0);
  const nearer = many(4, "nearer-", 12, 12.1);
  const current = [chart("current", 12, 12.2)];
  const records = [...lower, ...nearer].map((item, index) => record(item.chart.chartId, index % 4 < 3 ? "EASY_CLEAR" : "FAILED"));
  const result = run([...lower, ...nearer, ...current], records, { rank: "TENTH" });
  assert.equal(result.mainBand, 12.2);
  assert.equal(result.recommendations.cleanupTargets[0].chartId, "nearer-003");
});

test("Radar absence keeps normal recommendations but disables challenge and attribute practice", () => {
  const items = [chart("main", 12, 12), chart("next", 12, 12.1)];
  const result = run(items, [record("main", "FAILED")], { rank: "TENTH" });
  assert.equal(result.recommendations.clearTargets.length, 1);
  assert.equal(result.recommendations.challengeTargets.length, 0);
  assert.equal(result.recommendations.attributePracticeTargets.length, 0);
  assert.equal(result.attributePracticeAvailable, false);
});

test("challenge uses the next band and strong-attribute average, while 12.7 has no challenge", () => {
  const attrs = { NOTES: 100, CHORD: 90, PEAK: 1, CHARGE: 1, SCRATCH: 1, SOF_LAN: 1 };
  const values = (chartId, notes, chord) => ({ chartId, values: { NOTES: notes, CHORD: chord, PEAK: 0, CHARGE: 0, SCRATCH: 0, SOF_LAN: 0 }, verified: true, lastUpdated: now });
  const items = [chart("main", 12, 12.6), chart("best", 12, 12.7), chart("second", 12, 12.7), chart("missing", 12, 12.7)];
  const result = run(items, [record("main", "FAILED")], { rank: "KAIDEN", playerRadar: attrs, radar: [values("best", 10, 10), values("second", 9, 9)] });
  assert.deepEqual(result.recommendations.challengeTargets.map(item => item.chartId), ["best", "second"]);
  const top = run([chart("passed", 12, 12.6), chart("top", 12, 12.7)], [record("passed", "EASY_CLEAR"), record("top", "FAILED")], { rank: "KAIDEN", playerRadar: attrs, radar: [values("top", 10, 10)] });
  assert.equal(top.mainBand, 12.7);
  assert.equal(top.recommendations.challengeTargets.length, 0);
});

test("level 11 challenge prioritizes level 11 before a level 12 introduction chart at the same band", () => {
  const attrs = { NOTES: 100, CHORD: 90, PEAK: 1, CHARGE: 1, SCRATCH: 1, SOF_LAN: 1 };
  const radar = (chartId, score) => ({ chartId, values: { NOTES: score, CHORD: score, PEAK: 0, CHARGE: 0, SCRATCH: 0, SOF_LAN: 0 }, verified: true, lastUpdated: now });
  const level10 = many(4, "ten-", 10, 10.7);
  const items = [...level10, chart("main11", 11, 11.5), chart("challenge11", 11, 11.6), chart("intro12", 12, 11.6)];
  const records = level10.map((item, index) => record(item.chart.chartId, index < 3 ? "CLEAR" : "FAILED"));
  const result = run(items, records, { playerRadar: attrs, radar: [radar("challenge11", 1), radar("intro12", 100)] });
  assert.equal(result.phase, 11);
  assert.deepEqual(result.recommendations.challengeTargets.map(item => item.chartId), ["challenge11", "intro12"]);
});

test("attribute practice follows distance, above-on-tie, current-band, then chartId", () => {
  const attrs = { NOTES: 100, CHORD: 0, PEAK: 0, CHARGE: 0, SCRATCH: 0, SOF_LAN: 0 };
  const radar = (chartId, value) => ({ chartId, values: { NOTES: value, CHORD: 0, PEAK: 0, CHARGE: 0, SCRATCH: 0, SOF_LAN: 0 }, verified: true, lastUpdated: now });
  const items = [chart("below", 12, 12.2), chart("above", 12, 12.4), chart("current-b", 12, 12.3), chart("current-a", 12, 12.3)];
  const result = run(items, [record("below", "EASY_CLEAR"), record("current-a", "FAILED")], { rank: "CHUDEN", playerRadar: attrs, radar: [radar("below", 95), radar("above", 105), radar("current-b", 110), radar("current-a", 110)], attribute: "NOTES" });
  assert.deepEqual(result.recommendations.attributePracticeTargets.map(item => item.chartId), ["above", "below", "current-a", "current-b"]);
});
