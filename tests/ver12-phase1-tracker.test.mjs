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


const { buildTrackerEntries, filterTrackerEntries, createTrackerFilters, toggleTrackerRadar, formatTrackerRadarValue } = load(path.join(root, "src/features/dashboard/tracker.ts"));
const { TrackerChartRow } = load(path.join(root, "src/features/dashboard/TrackerChartRow.tsx"));
const fixture = () => ({
  chartMaster: { songs: [
    { songId: "s1", title: "Alpha", debutVersion: "FIRST", debutVersionNumber: 1 },
    { songId: "s2", title: "Beta", debutVersion: "SECOND", debutVersionNumber: 2 },
    { songId: "s3", title: "Gamma", debutVersion: "THIRD", debutVersionNumber: 3 },
  ], charts: [
    { chartId: "a", songId: "s1", chartType: "DPA", officialLevel: 12, notes: 1000, availability: "available" },
    { chartId: "b", songId: "s1", chartType: "DPH", officialLevel: 11, notes: 900, availability: "available" },
    { chartId: "c", songId: "s2", chartType: "DPL", officialLevel: 12, notes: 1100, availability: "available" },
    { chartId: "d", songId: "s3", chartType: "DPH", officialLevel: 10, notes: 800, availability: "unknown" },
    { chartId: "removed", songId: "s1", chartType: "DPA", officialLevel: 12, availability: "unavailable" },
    { chartId: "normal", songId: "s1", chartType: "DPN", officialLevel: 10, availability: "available" },
  ] },
  unofficial: { records: [{ chartId: "a", difficulty: 12.1 }, { chartId: "b", difficulty: null }, { chartId: "c", difficulty: 12 }, { chartId: "d", difficulty: 10.5 }] },
  ereter: { records: [{ chartId: "a", ec: 2, hc: 4, exh: 6 }, { chartId: "b", ec: 3, hc: 1, exh: 5 }, { chartId: "c", ec: 1, hc: 5, exh: 7 }] },
  notesRadar: { records: [
    { chartId: "a", verified: true, values: { NOTES: 0, PEAK: 1, SCRATCH: 2, SOF_LAN: 3, CHARGE: 4, CHORD: 5 } },
    { chartId: "b", verified: true, values: { NOTES: 99, PEAK: 0, SCRATCH: 0, SOF_LAN: 0, CHARGE: 0, CHORD: 0 } },
  ] },
});
const ids = rows => Array.from(rows, row => row.chart.chartId);
const records = new Map([["a", { clearLamp: "EASY_CLEAR" }], ["b", { clearLamp: "CLEAR" }], ["c", { clearLamp: "FAILED" }]]);
const renderRow = (entry, expanded) => renderToStaticMarkup(React.createElement(TrackerChartRow, { entry, expanded, lamp: "EASY_CLEAR", onSelect: () => {}, onToggleRadar: () => {} }));

test("tracker joins Radar by chart ID, retains missing Radar and unknown availability without mutating masters", () => {
  const master = fixture(), before = JSON.stringify(master);
  const entries = buildTrackerEntries(master);
  assert.deepEqual(ids(entries), ["a", "b", "c", "d"]);
  assert.equal(entries[0].radar.values.NOTES, 0);
  assert.equal(entries[1].radar.values.NOTES, 99);
  assert.equal(entries[2].radar, undefined);
  assert.equal(entries[1].difficulty, 11);
  assert.equal(JSON.stringify(master), before);
});
test("tracker applies every retained filter together with case-insensitive title search", () => {
  const entries = buildTrackerEntries(fixture());
  const filters = { ...createTrackerFilters(), level: "12", difficulty: "12.1", type: "DPA", lamp: "EASY_CLEAR", version: "1", sort: "ec", direction: "desc" };
  assert.deepEqual(ids(filterTrackerEntries(entries, records, filters, "ALPHA")), ["a"]);
  for (const [key, value] of [["level", "11"], ["difficulty", "12"], ["type", "DPL"], ["lamp", "CLEAR"], ["version", "2"]]) {
    assert.deepEqual(ids(filterTrackerEntries(entries, records, { ...filters, [key]: value }, "")), []);
  }
  assert.deepEqual(ids(filterTrackerEntries(entries, records, { ...createTrackerFilters(), lamp: "NO_PLAY" }, "")), ["d"]);
});
test("tracker preserves sort choices, tie breaks and missing values last in both directions", () => {
  const entries = buildTrackerEntries(fixture()), before = JSON.stringify(entries);
  const expected = {
    difficulty: [["d", "b", "c", "a"], ["a", "c", "b", "d"]],
    unofficial: [["d", "b", "c", "a"], ["a", "c", "b", "d"]],
    officialLevel: [["d", "b", "a", "c"], ["a", "c", "b", "d"]],
    version: [["a", "b", "c", "d"], ["d", "c", "a", "b"]],
    ec: [["c", "a", "b", "d"], ["b", "a", "c", "d"]],
    hc: [["b", "a", "c", "d"], ["c", "a", "b", "d"]],
    exh: [["b", "a", "c", "d"], ["c", "a", "b", "d"]],
  };
  for (const [sort, pair] of Object.entries(expected)) for (const [i, direction] of ["asc", "desc"].entries()) {
    assert.deepEqual(ids(filterTrackerEntries(entries, records, { ...createTrackerFilters(), sort, direction }, "")), pair[i]);
  }
  assert.equal(JSON.stringify(entries), before);
});
test("tracker recalculates the same filters with another PLAYER's records and lamp changes", () => {
  const entries = buildTrackerEntries(fixture()), filters = { ...createTrackerFilters(), lamp: "EASY_CLEAR" }, before = JSON.stringify(filters);
  assert.deepEqual(ids(filterTrackerEntries(entries, records, filters, "")), ["a"]);
  const otherPlayer = new Map([["a", { clearLamp: "CLEAR" }], ["c", { clearLamp: "EASY_CLEAR" }]]);
  assert.deepEqual(ids(filterTrackerEntries(entries, otherPlayer, filters, "")), ["c"]);
  assert.equal(JSON.stringify(filters), before);
});
test("multiple Radar expansions toggle independently without changing prior state", () => {
  const initial = new Set(), first = toggleTrackerRadar(initial, "a"), both = toggleTrackerRadar(first, "b"), last = toggleTrackerRadar(both, "a");
  assert.equal(initial.size, 0);
  assert.deepEqual(Array.from(first), ["a"]);
  assert.deepEqual(Array.from(both), ["a", "b"]);
  assert.deepEqual(Array.from(last), ["b"]);
});
test("collapsed Radar has linked accessible controls, no values and two non-nested buttons", () => {
  const html = renderRow(buildTrackerEntries(fixture())[0], false);
  assert.ok(html.includes('aria-expanded="false"'));
  assert.ok(html.includes('aria-controls="tracker-radar-a"'));
  assert.ok(html.includes('id="tracker-radar-a"'));
  assert.ok(html.includes('hidden=""'));
  assert.ok(!html.includes("<dt>"));
  const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g);
  assert.equal(buttons.length, 2);
  assert.ok(buttons.every(button => (button.match(/<button\b/g) ?? []).length === 1));
});
test("expanded Radar uses the six display attributes in order and formats confirmed zero", () => {
  const html = renderRow(buildTrackerEntries(fixture())[0], true);
  assert.deepEqual(Array.from(html.matchAll(/<dt>(.*?)<\/dt>/g), m => m[1]), ["NOTES", "PEAK", "SCRATCH", "SOF-LAN", "CHARGE", "CHORD"]);
  assert.deepEqual(Array.from(html.matchAll(/<dd>(.*?)<\/dd>/g), m => m[1]), ["0.00", "1.00", "2.00", "3.00", "4.00", "5.00"]);
  assert.ok(html.includes('aria-expanded="true"'));
  assert.ok(!html.includes('hidden=""'));
});
test("a chart without Radar remains selectable and displays six missing values instead of zeros", () => {
  const html = renderRow(buildTrackerEntries(fixture())[2], true);
  assert.ok(html.includes("Beta DPLを入力"));
  assert.equal((html.match(/<dd>—<\/dd>/g) ?? []).length, 6);
  assert.equal(formatTrackerRadarValue(null), "—");
  assert.equal(formatTrackerRadarValue(undefined), "—");
  assert.equal(formatTrackerRadarValue(0), "0.00");
});
