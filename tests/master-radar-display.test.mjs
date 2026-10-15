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

test("TRACKER renders six new charts and retains charts without distributed Radar", () => {
  const read = name => JSON.parse(readFileSync(path.join(root, "public/masters/v1", name), "utf8"));
  const master = { chartMaster: read("chart-master.json"), unofficial: read("unofficial.json"), ereter: read("ereter.json"), notesRadar: read("notes-radar.json"), manifest: read("manifest.json") };
  const { TrackerScreen } = load(path.join(root, "src/features/dashboard/Screens.tsx"));
  const records = new Map();
  const before = JSON.stringify(master);
  const html = renderToStaticMarkup(React.createElement(TrackerScreen, { master, records, onSelect: () => {} }));
  const songs = new Map(master.chartMaster.songs.map(row => [row.songId, row]));
  const radarIds = new Set(master.notesRadar.records.map(row => row.chartId));
  const newCharts = master.chartMaster.charts.filter(row => Number(row.chartId.slice(5)) >= 2488);
  assert.equal(newCharts.length, 6);
  for (const chart of newCharts) {
    const text = renderToStaticMarkup(React.createElement("strong", null, songs.get(chart.songId).title));
    assert.ok(html.includes(`${text} <small>${chart.chartType} / ☆${chart.officialLevel}`));
  }
  const unconfirmed = master.chartMaster.charts.filter(row => !radarIds.has(row.chartId) && row.availability !== "unavailable" && row.chartType !== "DPN");
  assert.ok(unconfirmed.length > 0);
  for (const chart of unconfirmed) assert.ok(html.includes(renderToStaticMarkup(React.createElement("strong", null, songs.get(chart.songId).title))));
  assert.equal(records.size, 0);
  assert.equal(JSON.stringify(master), before);
});
