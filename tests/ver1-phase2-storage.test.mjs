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
  const module = { exports: {} }; cache.set(filename, module.exports);
  vm.runInNewContext(output, { module, exports: module.exports, require: (specifier) => load(path.relative(root, path.resolve(path.dirname(filename), `${specifier}.ts`))), Number, Math, Set, Map, Array, Object, Error, Date }, { filename });
  cache.set(filename, module.exports); return module.exports;
}
const validation = load("src/storage/validation.ts");
const migrations = load("src/storage/migrations.ts");
const now = "2026-09-23T00:00:00.000Z";
const player = { playerId: "player-1", iidxId: null, playerName: null, highestDpRank: "NINTH", notesRadar: null, ereterOverall: null, notesRadarDetails: { NOTES: [], CHORD: [], PEAK: [], CHARGE: [], SCRATCH: [], SOF_LAN: [] }, createdAt: now, updatedAt: now };

test("validates a user-data commit before IndexedDB is opened", () => {
  assert.doesNotThrow(() => validation.assertUserDataCommit({ players: [player], playerChartRecords: [{ playerId: "player-1", chartId: "chart-1", clearLamp: "CLEAR", score: null, bp: null, clearSource: null, scoreSource: null, bpSource: null, updatedAt: now }] }));
  assert.throws(() => validation.assertUserDataCommit({ playerChartRecords: [{ playerId: "player-1", chartId: "chart-1", clearLamp: "CLEAR", score: -1, bp: null, clearSource: null, scoreSource: null, bpSource: null, updatedAt: now }] }), /PlayerChartRecord/);
});

test("plans only exactly resolved legacy lamp records and leaves localStorage untouched", () => {
  const raw = JSON.stringify({ schemaVersion: 3, saved: { "legacy-a": "ec", "legacy-b": "hc", "legacy-no-lamp": null }, favorites: [], notes: {}, history: [], scores: {}, currentScores: {} });
  const storage = { getItem: (key) => key === migrations.LEGACY_V3_STORAGE_KEY ? raw : null };
  const plan = migrations.planLegacyLocalStorageMigration(storage, "player-1", (key) => ({ "legacy-a": "chart-a", "legacy-b": "chart-b" }[key] ?? null), now);
  assert.equal(plan.records.length, 2); assert.equal(plan.records[0].clearLamp, "EASY_CLEAR"); assert.deepEqual([...plan.skippedNoLampKeys], ["legacy-no-lamp"]); assert.equal(plan.unresolvedKeys.length, 0);
  assert.equal(storage.getItem(migrations.LEGACY_V3_STORAGE_KEY), raw);
});

test("refuses an incomplete legacy migration plan and unsupported serialized schema", () => {
  const storage = { getItem: (key) => key === migrations.LEGACY_LAMPS_STORAGE_KEY ? JSON.stringify({ unknown: "ec" }) : null };
  const plan = migrations.planLegacyLocalStorageMigration(storage, "player-1", () => null, now);
  assert.deepEqual([...plan.unresolvedKeys], ["unknown"]);
  assert.throws(() => migrations.migrateSerializedUserData({ schemaVersion: 3, payload: {} }), /future schema/);
});
