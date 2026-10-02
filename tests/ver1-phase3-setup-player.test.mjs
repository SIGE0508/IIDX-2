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
const setup = load("src/setup/service.ts");
const now = "2026-09-23T00:00:00.000Z";
const chart = (chartId, officialLevel, availability = "available") => ({ chartId, songId: `song-${chartId}`, chartType: "DPA", officialLevel, notes: null, availability });

class MemoryRepository {
  drafts = new Map(); players = []; records = []; deletions = [];
  async getSetupDraft(playerId) { return this.drafts.get(playerId); }
  async saveSetupDraft(draft) { this.drafts.set(draft.playerId, structuredClone(draft)); }
  async deleteSetupDraft(playerId) { this.deletions.push(playerId); this.drafts.delete(playerId); }
  async completeInitialSetup(player, records) { this.players.push(structuredClone(player)); this.records.push(...structuredClone(records)); this.drafts.delete(player.playerId); }
  async savePlayer(player) { this.players.push(structuredClone(player)); }
}

test("setup can start, resume and finish later route without records or HISTORY", async () => {
  const repository = new MemoryRepository();
  const start = await setup.beginSetup(repository, "player-1", now);
  const rank = await setup.saveHighestDpRank(repository, start, "NINTH", now);
  const selected = await setup.saveRegistrationMethod(repository, rank, "later", now);
  assert.equal(selected.draft.step, "final_confirmation");
  const resumed = await setup.beginSetup(repository, "player-1", now);
  assert.equal(resumed.draft.highestDpRank, "NINTH");
  await setup.completeSetup(repository, resumed, now);
  assert.equal(repository.players.length, 1); assert.equal(repository.records.length, 0); assert.equal(repository.drafts.has("player-1"), false);
});

test("manual bulk changes only upward, while individual correction can lower a lamp", async () => {
  const repository = new MemoryRepository();
  let state = await setup.beginSetup(repository, "player-1", now);
  state = await setup.saveHighestDpRank(repository, state, "CHUDEN", now);
  state = await setup.saveRegistrationMethod(repository, state, "manual", now);
  const active = chart("active", 12); const unknown = chart("unknown", 12, "unknown"); const removed = chart("removed", 12, "unavailable");
  state = await setup.applyInitialBulkLamp(repository, state, [active, unknown, removed], 12, "HARD_CLEAR", now);
  state = await setup.applyInitialBulkLamp(repository, state, [active, unknown, removed], 12, "EASY_CLEAR", now);
  assert.deepEqual(JSON.parse(JSON.stringify(state.payload.stagedRecords.map((record) => [record.chartId, record.clearLamp]).sort())), [["active", "HARD_CLEAR"], ["unknown", "HARD_CLEAR"]]);
  state = await setup.correctInitialLamp(repository, state, active, "EASY_CLEAR", now);
  assert.equal(state.payload.stagedRecords.find((record) => record.chartId === "active").clearLamp, "EASY_CLEAR");
});

test("PLAYER aggregate excludes unavailable charts and NO_PLAY, and radar total is derived", () => {
  const charts = [chart("c10", 10), chart("c11", 11, "unknown"), chart("old11", 11, "unavailable"), chart("c12", 12)];
  const records = [
    { playerId: "p", chartId: "c10", clearLamp: "CLEAR" },
    { playerId: "p", chartId: "c11", clearLamp: "NO_PLAY" },
    { playerId: "p", chartId: "old11", clearLamp: "HARD_CLEAR" },
  ];
  const summary = setup.summarizePlayerPlayData(charts, records);
  assert.deepEqual(JSON.parse(JSON.stringify(summary.levels.map((level) => [level.officialLevel, level.registeredCount, level.totalCount]))), [[10, 1, 1], [11, 0, 1], [12, 0, 1]]);
  assert.equal(setup.radarTotal({ NOTES: 100, CHORD: 100, PEAK: 100, CHARGE: 100, SCRATCH: 100, SOF_LAN: 100 }), 600);
});

test("PLAYER profile can change only profile fields, including highest DP rank, without touching play records", async () => {
  const repository = new MemoryRepository();
  const player = { playerId: "player-1", iidxId: null, playerName: null, highestDpRank: "NINTH", notesRadar: null, ereterOverall: null, notesRadarDetails: { NOTES: [], CHORD: [], PEAK: [], CHARGE: [], SCRATCH: [], SOF_LAN: [] }, createdAt: now, updatedAt: now };
  const recordsBefore = [{ playerId: "player-1", chartId: "c12", clearLamp: "HARD_CLEAR", score: 3000, bp: 12 }];
  const updated = await setup.updatePlayerProfile(repository, player, { playerName: "TEST", iidxId: "1234-5678", highestDpRank: "CHUDEN" }, "2026-09-24T00:00:00.000Z");
  assert.equal(updated.highestDpRank, "CHUDEN");
  assert.equal(updated.playerName, "TEST");
  assert.equal(updated.iidxId, "1234-5678");
  assert.equal(updated.createdAt, now);
  assert.deepEqual(recordsBefore, [{ playerId: "player-1", chartId: "c12", clearLamp: "HARD_CLEAR", score: 3000, bp: 12 }]);
  assert.equal(repository.players[0].highestDpRank, "CHUDEN");
});

test("PLAYER NOTES RADAR updates the existing Player field without changing rank or play records", async () => {
  const repository = new MemoryRepository();
  const player = { playerId: "player-1", iidxId: "1234-5678", playerName: "TEST", highestDpRank: "CHUDEN", notesRadar: null, ereterOverall: null, notesRadarDetails: { NOTES: [], CHORD: [], PEAK: [], CHARGE: [], SCRATCH: [], SOF_LAN: [] }, createdAt: now, updatedAt: now };
  const values = { NOTES: 100, CHORD: 90, PEAK: 80, CHARGE: 70, SCRATCH: 60, SOF_LAN: 50 };
  const updated = await setup.updatePlayerRadar(repository, player, values, "2026-09-24T00:00:00.000Z");
  assert.deepEqual(JSON.parse(JSON.stringify(updated.notesRadar)), values);
  assert.equal(updated.highestDpRank, "CHUDEN");
  assert.equal(updated.iidxId, "1234-5678");
  assert.equal(repository.players[0].highestDpRank, "CHUDEN");
});

test("PLAYER saves nullable personal ERETER and at most ten unique Radar details per attribute", async () => {
  const repository = new MemoryRepository();
  const player = { playerId: "player-1", iidxId: null, playerName: null, highestDpRank: "NINTH", notesRadar: null, ereterOverall: null, notesRadarDetails: { NOTES: [], CHORD: [], PEAK: [], CHARGE: [], SCRATCH: [], SOF_LAN: [] }, createdAt: now, updatedAt: now };
  const withEreter = await setup.updatePlayerEreterOverall(repository, player, 8.02, now);
  assert.equal(withEreter.ereterOverall, 8.02);
  const details = { NOTES: Array.from({ length: 10 }, (_, index) => ({ chartId: `c${index}`, value: 100 - index })), CHORD: [], PEAK: [], CHARGE: [], SCRATCH: [], SOF_LAN: [] };
  const withDetails = await setup.updatePlayerRadarDetails(repository, withEreter, details, now);
  assert.equal(withDetails.notesRadarDetails.NOTES.length, 10);
  await assert.rejects(() => setup.updatePlayerRadarDetails(repository, withDetails, { ...details, NOTES: [...details.NOTES, { chartId: "extra", value: 1 }] }, now), /invalid/);
  await assert.rejects(() => setup.updatePlayerRadarDetails(repository, withDetails, { ...details, NOTES: [{ chartId: "same", value: 1 }, { chartId: "same", value: 2 }] }, now), /invalid/);
  assert.equal((await setup.updatePlayerEreterOverall(repository, withDetails, null, now)).ereterOverall, null);
});

test("malformed or unsupported draft payload is rejected without normalization", () => {
  assert.throws(() => setup.readSetupDraftState({ playerId: "p", step: "highest_dp_rank", highestDpRank: null, selectedRegistrationMethod: null, payload: { version: 2, stagedRecords: [] }, updatedAt: now }), /invalid or unsupported/);
});
