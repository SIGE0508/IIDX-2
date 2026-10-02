import { openTrackerDatabase, runTransaction, STORE_NAMES, transactionDone } from "../src/storage/database";
import { enqueueInitialSetup, UserDataRepository } from "../src/storage/repository";
import type { Player, PlayerChartRecord, SetupDraft } from "../src/domain/types";

const result = document.querySelector<HTMLPreElement>("#result")!;
const now = "2026-09-23T00:00:00.000Z";
const dbName = `iidx-clear-tracker-browser-test-${crypto.randomUUID()}`;
const player: Player = { playerId: "browser-player", iidxId: null, playerName: null, highestDpRank: "NINTH", notesRadar: null, ereterOverall: null, notesRadarDetails: { NOTES: [], CHORD: [], PEAK: [], CHARGE: [], SCRATCH: [], SOF_LAN: [] }, createdAt: now, updatedAt: now };
const record: PlayerChartRecord = { playerId: player.playerId, chartId: "browser-chart", clearLamp: "CLEAR", score: null, bp: null, clearSource: "manual", scoreSource: null, bpSource: null, updatedAt: now };
const draft: SetupDraft = { playerId: player.playerId, step: "final_confirmation", highestDpRank: "NINTH", selectedRegistrationMethod: "later", payload: { version: 1, stagedRecords: [] }, updatedAt: now };
const ok = (condition: unknown, message: string): asserts condition => { if (!condition) throw new Error(message); };
const removeDatabase = (name: string) => new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(name); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("Test database deletion was blocked.")); });
const openLegacyV1 = (name: string) => new Promise<void>((resolve, reject) => {
  const request = indexedDB.open(name, 1);
  request.onupgradeneeded = () => {
    const database = request.result;
    const players = database.createObjectStore("players", { keyPath: "playerId" }); players.createIndex("byPlayerName", "playerName", { unique: false });
    database.createObjectStore("playerChartRecords", { keyPath: ["playerId", "chartId"] });
    database.createObjectStore("history", { keyPath: "historyId" }); database.createObjectStore("ereterPersonalHistory", { keyPath: "playerId" }); database.createObjectStore("setupDrafts", { keyPath: "playerId" }); database.createObjectStore("uiSettings", { keyPath: "key" }); database.createObjectStore("appMeta", { keyPath: "key" });
    players.put({ playerId: "legacy-player", iidxId: null, playerName: null, highestDpRank: "NINTH", notesRadar: null, createdAt: now, updatedAt: now });
  };
  request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => reject(request.error);
});

async function main(): Promise<void> {
  const legacyName = `${dbName}-legacy`;
  await openLegacyV1(legacyName);
  const migrated = await openTrackerDatabase(indexedDB, legacyName);
  const migratedPlayer = await new UserDataRepository(migrated).getPlayer("legacy-player");
  ok(migratedPlayer?.ereterOverall === null, "v1 Player must gain a nullable ereterOverall field.");
  ok(migratedPlayer?.notesRadarDetails.NOTES.length === 0, "v1 Player must gain empty Radar detail lists.");
  migrated.close(); await removeDatabase(legacyName);

  const database = await openTrackerDatabase(indexedDB, dbName);
  ok(STORE_NAMES.every((store) => database.objectStoreNames.contains(store)), "All Phase 2 stores must be created during upgrade.");
  database.close();

  const reopened = await openTrackerDatabase(indexedDB, dbName);
  const repository = new UserDataRepository(reopened);
  await repository.savePlayer(player);
  reopened.close();
  const reloaded = await openTrackerDatabase(indexedDB, dbName);
  const reloadedRepository = new UserDataRepository(reloaded);
  ok((await reloadedRepository.getPlayer(player.playerId))?.highestDpRank === "NINTH", "Saved Player must survive a close/reopen cycle.");

  try {
    await runTransaction(reloaded, ["players", "playerChartRecords"], "readwrite", (transaction) => {
      transaction.objectStore("players").put({ ...player, playerId: "abort-player" });
      transaction.objectStore("playerChartRecords").put({ ...record, playerId: "abort-player" });
      transaction.abort();
    });
    throw new Error("Aborted transaction unexpectedly completed.");
  } catch { /* Abort is expected. */ }
  ok(await reloadedRepository.getPlayer("abort-player") === undefined, "Aborted transaction must not persist Player.");
  ok(await reloadedRepository.getPlayerChartRecord("abort-player", record.chartId) === undefined, "Aborted transaction must not persist chart record.");

  const abortedPlayer: Player = { ...player, playerId: "aborted-setup-player" };
  const abortedRecord: PlayerChartRecord = { ...record, playerId: abortedPlayer.playerId };
  const abortedDraft: SetupDraft = { ...draft, playerId: abortedPlayer.playerId };
  await reloadedRepository.saveSetupDraft(abortedDraft);
  try {
    const transaction = reloaded.transaction(["players", "playerChartRecords", "setupDrafts"], "readwrite");
    enqueueInitialSetup(transaction, abortedPlayer, [abortedRecord]);
    transaction.abort();
    await transactionDone(transaction);
  } catch { /* Abort is expected. */ }
  ok(await reloadedRepository.getPlayer(abortedPlayer.playerId) === undefined, "Aborted setup finalization must not write Player.");
  ok(await reloadedRepository.getPlayerChartRecord(abortedPlayer.playerId, record.chartId) === undefined, "Aborted setup finalization must not write PlayerChartRecord.");
  ok((await reloadedRepository.getSetupDraft(abortedPlayer.playerId)) !== undefined, "Aborted setup finalization must not delete setupDraft.");

  await reloadedRepository.completeInitialSetup(player, [record]);
  ok((await reloadedRepository.getPlayerChartRecord(player.playerId, record.chartId))?.clearLamp === "CLEAR", "Completed setup must save PlayerChartRecord.");
  ok(await reloadedRepository.getSetupDraft(player.playerId) === undefined, "Completed setup must delete setupDraft atomically.");

  const invalidRestore = { players: [{ ...player, playerId: "" }], playerChartRecords: [], history: [], ereterPersonalHistory: [], setupDrafts: [], uiSettings: [] };
  try {
    await reloadedRepository.replaceUserData(invalidRestore, now);
    throw new Error("Invalid restore unexpectedly completed.");
  } catch { /* Validation failure is expected before any store is cleared. */ }
  ok((await reloadedRepository.getPlayer(player.playerId))?.highestDpRank === "NINTH", "Invalid restore must preserve existing Player data.");

  reloaded.close(); await removeDatabase(dbName);
  result.textContent = "PASS\nstore creation / v1-to-v2 upgrade\nsave and reload\ntransaction abort atomicity\nsetup finalization atomicity\ninvalid restore preserves existing data";
}
main().catch((error: unknown) => { result.textContent = `FAIL\n${error instanceof Error ? error.stack ?? error.message : String(error)}`; });
