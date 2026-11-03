import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const requirePackage = createRequire(import.meta.url);
const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, fileName: filename }).outputText;
  const module = { exports: {} };
  cache.set(filename, module.exports);
  vm.runInNewContext(output, { module, exports: module.exports, require: source => {
    if (["react", "react/jsx-runtime"].includes(source)) return requirePackage(source);
    if (!source.startsWith(".")) throw new Error(`Unexpected import ${source}`);
    const base = path.resolve(path.dirname(filename), source);
    return load(existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`);
  } }, { filename });
  cache.set(filename, module.exports);
  return module.exports;
}


import { createHash } from "node:crypto";
import { trainingScenarios } from "./fixtures/training-scenarios.mjs";
const { calculateTraining, calculateTrainingWithCandidates } = load(path.join(root, "src/training/engine.ts"));
const { buildHomeCandidatePool, resolveHomeTarget } = load(path.join(root, "src/training/home-candidates.ts"));
const selection = load(path.join(root, "src/features/dashboard/next-training.ts"));
const { createNextTrainingState, synchronizeNextTraining, recordNextTrainingDisplay, replaceNextTraining, selectNextTraining, canReplaceNextTraining } = selection;
const plain = value => JSON.parse(JSON.stringify(value));
const ids = items => Array.from(items, item => item.chartId);
const now = "2026-11-03T00:00:00.000Z";
const attrs = { NOTES: 100, CHORD: 90, PEAK: 50, SCRATCH: 10, CHARGE: 20, SOF_LAN: 5 };
function inputFor(items, options = {}) {
  const player = { playerId: "p", playerName: "Test", iidxId: null, highestDpRank: options.rank ?? "TENTH",
    notesRadar: options.noPlayerRadar ? null : attrs, ereterOverall: options.personal ?? null,
    notesRadarDetails: { NOTES: [], CHORD: [], PEAK: [], SCRATCH: [], CHARGE: [], SOF_LAN: [] }, createdAt: now, updatedAt: now };
  const charts = items.map(x => ({ chartId: x.id, songId: "s-" + x.id, chartType: "DPA", officialLevel: x.level ?? 12, notes: 1000, availability: x.availability ?? "available" }));
  const master = {
    manifest: { schemaVersion: 1, masterVersion: "test", updatedAt: now, files: {} },
    chartMaster: { charts, songs: charts.map(c => ({ songId: c.songId, title: c.chartId, debutVersion: "test", debutVersionNumber: 1, aliases: {} })) },
    unofficial: { records: items.map(x => ({ chartId: x.id, difficulty: x.band, lastUpdated: now })) },
    ereter: { records: items.map(x => ({ chartId: x.id, ec: x.ec ?? null, hc: x.hc ?? null, exh: x.exh ?? null, lastUpdated: now })) },
    notesRadar: { records: items.filter(x => x.radar !== false).map(x => ({ chartId: x.id, values: attrs, verified: true, lastUpdated: now })) },
  };
  const records = items.filter(x => x.lamp).map(x => ({ playerId: "p", chartId: x.id, clearLamp: x.lamp, score: 100, bp: 10, updatedAt: now, clearSource: "manual", scoreSource: "manual", bpSource: "manual" }));
  return { player, records, master };
}
const group = (prefix, count, band, lamp, extra = {}) => Array.from({ length: count }, (_, i) => ({ id: prefix + String(i).padStart(2, "0"), band, lamp, ...extra }));
const mixedInput = () => inputFor([
  ...group("passed-", 3, 12, "CLEAR"), ...group("cleanup-", 1, 12, "FAILED"),
  ...group("hard-", 8, 12.1, "CLEAR", { hc: 8 }),
  ...group("exh-", 8, 12.1, "HARD_CLEAR", { exh: 10 }),
  ...group("easy-", 12, 12.2, "FAILED", { ec: 5 }),
  ...group("normal-", 8, 12.2, "EASY_CLEAR"),
  ...group("challenge-", 6, 12.3, "FAILED", { ec: 6 }),
], { personal: 1 });
const calculateHome = input => { const calculation = calculateTrainingWithCandidates(input); return { calculation, pool: buildHomeCandidatePool(input.player, calculation) }; };
function option(goal, extras = {}) {
  return { chartId: "x", goal, category: goal === "HARD" ? "HARD_TARGET" : "NORMAL_TARGET",
    reason: goal === "HARD" ? "HARD_UPGRADE" : "NORMAL_UPGRADE", priority: 0,
    targetLamp: goal === "HARD" ? "HARD_CLEAR" : "CLEAR", officialLevel: 12,
    effectiveDifficulty: 12.1, currentLamp: "EASY_CLEAR", ereterValue: goal === "HARD" ? 2 : null,
    radarScore: null, matchedAttributes: [], ...extras };
}
const drawPool = (count = 30) => Array.from({ length: count }, (_, i) => ({
  chartId: "c" + i, officialLevel: 12, effectiveDifficulty: 12.2, currentLamp: "FAILED",
  targetLamp: "EASY_CLEAR", goal: ["EASY", "CLEAR", "HARD", "EXH", "CHALLENGE"][i % 5],
  reasons: ["MAIN_BAND"], options: [],
}));

test("TRAINING remains byte-identical to the pre-Phase-2 result in all 42 fixed scenarios", () => {
  const snapshot = JSON.parse(readFileSync(path.join(root, "tests/fixtures/training-phase1-regression.json"), "utf8"));
  for (const { name, input } of trainingScenarios()) {
    const before = JSON.stringify(input), actual = calculateTraining(input);
    assert.equal(createHash("sha256").update(JSON.stringify(actual)).digest("hex"), snapshot.cases.find(c => c.name === name).sha256, name);
    assert.equal(JSON.stringify(input), before);
    for (const rows of Object.values(actual.recommendations)) assert.ok(rows.length <= 5);
  }
});
test("all five raw candidate lists reuse existing order/reasons while TRAINING keeps the first five", () => {
  const input = mixedInput(), before = JSON.stringify(input), { calculation } = calculateHome(input);
  assert.equal(calculation.training.mainBand, 12.2);
  assert.equal(calculation.candidates.clearTargets.length, 12);
  assert.equal(calculation.candidates.hardTargets.length, 8);
  assert.equal(calculation.candidates.exhTargets.length, 8);
  assert.equal(calculation.candidates.challengeTargets.length, 6);
  for (const [key, rows] of Object.entries(calculation.candidates)) assert.deepEqual(plain(calculation.training.recommendations[key]), plain(rows.slice(0, 5)));
  assert.deepEqual(plain(calculation.training), plain(calculateTraining(input)));
  assert.equal(JSON.stringify(input), before);
});
test("HOME fills thirty unique eligible charts by alternating five goal lists", () => {
  const { pool } = calculateHome(mixedInput());
  assert.equal(pool.length, 30);
  assert.equal(new Set(ids(pool)).size, 30);
  const counts = Object.fromEntries(["EASY", "CLEAR", "HARD", "EXH", "CHALLENGE"].map(goal => [goal, pool.filter(x => x.goal === goal).length]));
  assert.deepEqual(counts, { EASY: 6, CLEAR: 6, HARD: 6, EXH: 6, CHALLENGE: 6 });
  assert.ok(pool.every(x => x.goal === "CHALLENGE" || x.effectiveDifficulty <= 12.2));
});
test("a single eligible goal can supply twenty-four charts, without filling to thirty", () => {
  const { pool } = calculateHome(inputFor(group("only-", 24, 12.1, "FAILED")));
  assert.equal(pool.length, 24); assert.ok(pool.every(x => x.goal === "EASY"));
});
test("normal HOME candidates above the main band are excluded; only the existing challenge can cross it", () => {
  const input = inputFor([
    ...group("main-", 2, 12, "FAILED"),
    { id: "next", band: 12.1, lamp: "FAILED" },
    { id: "higher-hard", band: 12.2, lamp: "CLEAR", hc: 0 },
    { id: "higher-exh", band: 12.2, lamp: "HARD_CLEAR", exh: 0 },
    { id: "higher-normal", band: 12.2, lamp: "EASY_CLEAR" },
  ], { personal: 99 });
  const { calculation, pool } = calculateHome(input);
  assert.ok(calculation.training.recommendations.clearTargets.some(x => x.chartId === "next"), "legacy +0.1 supplementation remains");
  assert.equal(pool.find(x => x.chartId === "next").goal, "CHALLENGE");
  assert.ok(!pool.some(x => x.chartId.startsWith("higher-")));
});
test("EASY to CLEAR/HARD target resolution uses personal HC and the conservative relative-half rule", () => {
  const normal = option("CLEAR"), hard = option("HARD");
  assert.equal(resolveHomeTarget([normal], 12.2, 5, [1, 2, 3, 4]).option.goal, "CLEAR");
  assert.equal(resolveHomeTarget([normal, hard], 12.2, 2, []).option.goal, "HARD");
  assert.equal(resolveHomeTarget([normal, hard], 12.2, 1, [2, 3, 4, 5]).option.goal, "HARD");
  assert.equal(resolveHomeTarget([normal, hard], 12.2, null, [1, 2, 3, 4]).option.goal, "HARD");
  assert.equal(resolveHomeTarget([normal, hard], 12.2, null, [2, 3, 4]).option.goal, "CLEAR");
  assert.equal(resolveHomeTarget([normal, hard], 12.1, null, [1, 2, 3, 4]).option.goal, "CLEAR");
  assert.equal(resolveHomeTarget([normal, hard], 12.2, null, [1, 2, 2, 4]).option.goal, "CLEAR");
  assert.equal(resolveHomeTarget([normal, option("HARD", { ereterValue: 0 })], 12.2, 0, []).option.goal, "HARD");
});
test("HC peer count boundary is evaluated from playable same-band charts: three versus four", () => {
  for (const count of [3, 4]) {
    const input = inputFor([...Array.from({ length: count }, (_, i) => ({ id: "hc-" + i, band: 12.1, lamp: "EASY_CLEAR", hc: i + 1 })), { id: "main", band: 12.2, lamp: "FAILED" }]);
    const { pool } = calculateHome(input);
    assert.equal(pool.filter(x => x.goal === "HARD").length, count === 4 ? 2 : 0);
    const first = pool.find(x => x.chartId === "hc-0");
    assert.deepEqual(Array.from(new Set(first.options.map(x => x.goal))).sort(), ["CLEAR", "HARD"]);
    assert.equal(pool.filter(x => x.chartId === "hc-0").length, 1);
  }
});
test("CLEAR and HARD lamps keep eligible HARD/EXH goals even above personal ERETER; missing metrics stay ineligible", () => {
  const input = inputFor([
    { id: "hard", band: 12, lamp: "CLEAR", hc: 99 },
    { id: "exh", band: 12, lamp: "HARD_CLEAR", exh: 99 },
    { id: "missing-hc", band: 12, lamp: "CLEAR" },
    { id: "missing-exh", band: 12, lamp: "HARD_CLEAR" },
    { id: "full", band: 12, lamp: "FULL_COMBO", hc: 1, exh: 1 },
    { id: "main", band: 12.1, lamp: "FAILED" },
  ], { personal: 0 });
  const { pool } = calculateHome(input);
  assert.equal(pool.find(x => x.chartId === "hard").goal, "HARD");
  assert.equal(pool.find(x => x.chartId === "exh").goal, "EXH");
  assert.ok(!pool.some(x => ["missing-hc", "missing-exh", "full"].includes(x.chartId)));
});
test("availability and challenge Radar conditions are reused, with no out-of-scope filling", () => {
  const input = inputFor([{ id: "main", band: 12, lamp: "FAILED", availability: "unknown" },
    { id: "removed", band: 12, lamp: "FAILED", availability: "unavailable" },
    { id: "no-radar", band: 12.1, lamp: "FAILED", radar: false },
    { id: "too-high", band: 12.2, lamp: "FAILED" }]);
  assert.deepEqual(ids(calculateHome(input).pool), ["main"]);
  assert.deepEqual(ids(calculateHome({ ...input, player: { ...input.player, notesRadar: null } }).pool), ["main"]);
});
test("source categories and recommendation reasons merge without duplicating chart IDs", () => {
  const input = mixedInput(), calculation = calculateTrainingWithCandidates(input), first = calculation.candidates.clearTargets[0];
  calculation.candidates.cleanupTargets = [{ ...first, category: "CLEANUP", reason: "LOWER_BAND" }, ...calculation.candidates.cleanupTargets];
  const pool = buildHomeCandidatePool(input.player, calculation), item = pool.find(x => x.chartId === first.chartId);
  assert.equal(pool.filter(x => x.chartId === first.chartId).length, 1);
  assert.ok(item.reasons.includes("MAIN_BAND") && item.reasons.includes("LOWER_BAND"));
});
test("normal CLEAR goals do not use EC ordering, SCORE, BP or the selected practice attribute", () => {
  const input = inputFor([{ id: "a", band: 12, lamp: "EASY_CLEAR", ec: 99 }, { id: "z", band: 12, lamp: "EASY_CLEAR", ec: 0 }]);
  const first = calculateHome(input).pool;
  assert.deepEqual(ids(first), ["a", "z"]); assert.ok(first.every(x => x.options.every(o => o.ereterValue === null)));
  const changed = structuredClone(input); changed.master.ereter.records.reverse(); changed.records.forEach(r => { r.score = 9999; r.bp = 9999; });
  changed.selectedAttribute = "NOTES";
  assert.deepEqual(plain(calculateHome(changed).pool), plain(first));
});
test("no main band produces no invented candidates", () => {
  assert.equal(calculateHome(inputFor([])).pool.length, 0);
});
test("draws diversify goals, remain unique and admit at most one challenge", () => {
  const pool = drawPool(), before = JSON.stringify(pool), items = selectNextTraining(pool, [], () => 0.5);
  assert.equal(items.length, 3); assert.equal(new Set(ids(items)).size, 3);
  assert.equal(new Set(items.map(x => x.goal)).size, 3);
  assert.ok(items.filter(x => x.goal === "CHALLENGE").length <= 1);
  assert.equal(JSON.stringify(pool), before);
  assert.equal(selectNextTraining(pool.filter(x => x.goal === "CHALLENGE"), [], () => 0.5).length, 1);
});
test("twenty replacements avoid the last three displayed sets whenever the pool is sufficient", () => {
  const pool = drawPool(); let state = recordNextTrainingDisplay(synchronizeNextTraining(createNextTrainingState(), "p", pool, () => 0.5));
  for (let i = 0; i < 20; i++) {
    const recent = new Set(state.history.flat()), next = replaceNextTraining(state, pool, () => 0.5);
    assert.ok(next.items.every(x => !recent.has(x.chartId)));
    state = recordNextTrainingDisplay(next);
    assert.ok(state.history.length <= 3);
  }
});
test("shortage reuses the oldest last-seen charts and never adds outside candidates", () => {
  const pool = drawPool(4).map(x => ({ ...x, goal: "EASY" }));
  const history = [["c3"], ["c0", "c1", "c2"]];
  const selected = selectNextTraining(pool, history, () => 0.5);
  assert.equal(selected[0].chartId, "c3");
  assert.equal(selected.length, 3); assert.ok(selected.every(x => pool.includes(x)));
  assert.equal(selectNextTraining(pool.slice(0, 2), history, () => 0.5).length, 2);
});
test("chart history is shared across a changed goal and current candidate content is reevaluated", () => {
  const pool = drawPool(); const old = recordNextTrainingDisplay(synchronizeNextTraining(createNextTrainingState(), "p", pool, () => 0.5));
  const changed = pool.map(x => ({ ...x, goal: x.goal === "EASY" ? "HARD" : x.goal, currentLamp: "ASSIST_CLEAR" }));
  const next = synchronizeNextTraining(old, "p", changed, () => 0.5);
  assert.notEqual(next, old);
  assert.ok(next.items.every(x => !ids(old.items).includes(x.chartId)));
  assert.ok(next.items.every(x => x.currentLamp === "ASSIST_CLEAR"));
});
test("PLAYER changes reset recent history, while identical content never consumes randomness", () => {
  const pool = drawPool(), old = recordNextTrainingDisplay(synchronizeNextTraining(createNextTrainingState(), "p1", pool, () => 0.5));
  const same = synchronizeNextTraining(old, "p1", structuredClone(pool), () => { throw Error("unexpected shuffle"); });
  assert.equal(same, old);
  const other = synchronizeNextTraining(old, "p2", pool, () => 0.5);
  assert.equal(other.playerId, "p2"); assert.equal(other.history.length, 0);
});
test("hidden reevaluations and repeated display acknowledgements never create extra history entries", () => {
  const pool = drawPool(); let state = synchronizeNextTraining(createNextTrainingState(), "p", pool, () => 0.5);
  assert.equal(state.history.length, 0);
  state = synchronizeNextTraining(state, "p", pool.slice(1), () => 0.5);
  assert.equal(state.history.length, 0);
  const shown = recordNextTrainingDisplay(state);
  assert.equal(shown.history.length, 1);
  assert.equal(recordNextTrainingDisplay(shown), shown);
  assert.equal(synchronizeNextTraining(shown, "p", structuredClone(pool.slice(1)), () => { throw Error("navigation shuffled"); }), shown);
});
test("no alternative keeps the displayed set and disables replacement without using randomness", () => {
  for (const pool of [[], drawPool(1), drawPool(3).map(x => ({ ...x, goal: "EASY" }))]) {
    const state = recordNextTrainingDisplay(synchronizeNextTraining(createNextTrainingState(), "p", pool, () => 0.5));
    assert.equal(canReplaceNextTraining(state, pool), false);
    assert.equal(replaceNextTraining(state, pool, () => { throw Error("unnecessary shuffle"); }), state);
  }
});
test("unseen charts take precedence over reusing another goal for diversity", () => {
  const pool = drawPool(5).map((x, i) => ({ ...x, goal: i === 0 ? "HARD" : "EASY" }));
  assert.ok(selectNextTraining(pool, [["c0"]], () => 0.5).every(x => x.goal === "EASY"));
});
