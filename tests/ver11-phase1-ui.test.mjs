import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const filename = new URL("../src/features/common/scroll-state.ts", import.meta.url);
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module, exports: module.exports, Math });
const state = module.exports.scrollButtonState;
test("scroll buttons hide on short pages and switch at each edge", () => {
  for (const [top, viewport, height, up, down] of [[0, 800, 800, false, false], [0, 800, 820, false, false], [0, 800, 2400, false, true], [600, 800, 2400, true, true], [1600, 800, 2400, true, false], [1590.5, 800, 2400, true, false], [0, 700, 2400, false, true]]) {
    assert.equal(state(top, viewport, height).up, up);
    assert.equal(state(top, viewport, height).down, down);
  }
});
test("mobile bottom fluctuations do not repeatedly reveal the down button", () => {
  let previous = state(1600, 800, 2400);
  for (const top of [1590, 1570, 1599, 1610, 1560, 1600]) {
    previous = state(top, 800, 2400, previous);
    assert.equal(previous.down, false);
  }
  assert.equal(state(1500, 800, 2400, previous).down, true);
  assert.equal(state(-20, 800, 2400).up, false);
});
test("ANALYSIS delegates level-12 ERETER display to the shared chart row", () => {
  const source = readFileSync(new URL("../src/features/dashboard/Screens.tsx", import.meta.url), "utf8");
  assert.ok(source.includes('detail={chart.officialLevel === 12 ? undefined : ereterDetail(master, chart.chartId)}'));
  assert.ok(source.includes('const ereter = chart.officialLevel === 12 ? ereterDetail(master, chartId) : undefined'));
});
