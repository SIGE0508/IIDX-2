import { openTrackerDatabase, STORE_NAMES } from "../src/storage/database";
import { UserDataRepository } from "../src/storage/repository";
import { updatePlayList } from "../src/play-list/service";
import { updatePlayerProfile, updatePlayerEreterOverall, updatePlayerRadar, updatePlayerRadarDetails } from "../src/setup/service";
import { createBackup, parseBackup, restoreBackup } from "../src/import/backup";
import type { Player } from "../src/domain/types";
import type { MasterSet } from "../src/master/types";

const result = document.querySelector<HTMLPreElement>("#result")!;
const now = "2026-11-05T00:00:00Z";
const base: Player = { playerId: "next-play-test-p", playerName: "SYNTHETIC", iidxId: null, highestDpRank: "CHUDEN", notesRadar: null,
  ereterOverall: null, notesRadarDetails: { NOTES: [], CHORD: [], PEAK: [], SCRATCH: [], CHARGE: [], SOF_LAN: [] }, createdAt: now, updatedAt: now };
const chartIds = Array.from({ length: 8 }, (_, i) => "synthetic-" + i);
const master = { chartMaster: { charts: chartIds.map(chartId => ({ chartId, songId: "song", chartType: "DPA", officialLevel: 12, notes: 1000, availability: "available" })), songs: [] } } as unknown as MasterSet;
const ok = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
const checks: string[] = [];
const expectFailure = async (operation: () => Promise<unknown>) => { let failed = false; try { await operation(); } catch { failed = true; } ok(failed, "operation must fail"); };
async function main() {
  const name = "iidx-next-play-test-" + crypto.randomUUID();
  const db = await openTrackerDatabase(indexedDB, name), db2 = await openTrackerDatabase(indexedDB, name);
  const repo = new UserDataRepository(db), other = new UserDataRepository(db2);
  const update = (r: UserDataRepository, id: string, change: Parameters<typeof updatePlayList>[3]) => updatePlayList(r, id, master, change, now);
  const originalPut = IDBObjectStore.prototype.put;
  try {
    ok(db.version === 2 && db.objectStoreNames.length === 7 && STORE_NAMES.every(store => db.objectStoreNames.contains(store)), "DB version/stores");
    await repo.savePlayer(base);
    repo.close();
    const reopened = await openTrackerDatabase(indexedDB, name), reader = new UserDataRepository(reopened);
    const legacy = await reader.getPlayer(base.playerId);
    ok(legacy?.playList === undefined, "legacy record must not be bulk rewritten");
    reader.close();
    checks.push("DB v2/7 stores and legacy Player remain unchanged on reopen");

    // First repository was deliberately closed for the reopen test; use the second connection.
    const active = other;
    const db3 = await openTrackerDatabase(indexedDB, name), concurrent = new UserDataRepository(db3);
    try {
      const add = (id: string, i: number) => update(i % 2 ? active : concurrent, base.playerId, { type: "add", chartId: id });
      const attempts = await Promise.allSettled(chartIds.slice(0, 7).map(add));
      const current = (await active.getPlayer(base.playerId))!;
      ok(attempts.filter(value => value.status === "fulfilled").length === 5, "exactly five adds");
      ok(current.playList?.length === 5 && new Set(current.playList.map(entry => entry.chartId)).size === 5, "no duplicate/overflow");
      checks.push("two connections / seven concurrent adds enforce maximum five");

      await active.updatePlayer(base.playerId, latest => ({ ...latest, playList: [] }));
      const duplicate = await Promise.allSettled([active, concurrent].map(r => update(r, base.playerId, { type: "add", chartId: chartIds[0] })));
      ok(duplicate.filter(value => value.status === "fulfilled").length === 1, "concurrent duplicate");
      const secondPlayer: Player = { ...base, playerId: "next-play-test-other" };
      await active.savePlayer(secondPlayer);
      await update(concurrent, secondPlayer.playerId, { type: "add", chartId: chartIds[0] });
      ok((await active.getPlayer(secondPlayer.playerId))?.playList?.length === 1, "independent player");
      checks.push("duplicate races rejected; same chart allowed for separate Players");

      await Promise.all([
        update(active, base.playerId, { type: "add", chartId: chartIds[1] }),
        updatePlayerProfile(concurrent, base, { playerName: "UPDATED", iidxId: null, highestDpRank: "KAIDEN" }, now),
        updatePlayerEreterOverall(active, base, 9, now),
        updatePlayerRadar(concurrent, base, { NOTES: 1, CHORD: 2, PEAK: 3, SCRATCH: 4, CHARGE: 5, SOF_LAN: 6 }, now),
        updatePlayerRadarDetails(active, base, { ...base.notesRadarDetails, NOTES: [{ chartId: chartIds[0], value: 1 }] }, now),
      ]);
      const merged = (await active.getPlayer(base.playerId))!;
      ok(merged.playList?.length === 2 && merged.playerName === "UPDATED" && merged.highestDpRank === "KAIDEN"
        && merged.ereterOverall === 9 && merged.notesRadar?.NOTES === 1 && merged.notesRadarDetails.NOTES.length === 1, "stale profile overwrite");
      await Promise.all([
        update(active, base.playerId, { type: "memo", chartId: chartIds[0], memo: "😀".repeat(100) }),
        update(concurrent, base.playerId, { type: "memo", chartId: chartIds[1], memo: "other memo" }),
      ]);
      ok((await active.getPlayer(base.playerId))!.playList!.map(entry => entry.memo).join("|") === "😀".repeat(100) + "|other memo", "separate edits must merge");
      checks.push("stale profile/Radar/ERETER and separate memo updates merge atomically");

      let before = JSON.stringify(await active.getPlayer(base.playerId));
      await expectFailure(() => update(active, base.playerId, { type: "memo", chartId: chartIds[0], memo: "😀".repeat(101) }));
      ok(JSON.stringify(await active.getPlayer(base.playerId)) === before, "invalid memo must not save");
      await update(active, base.playerId, { type: "remove", chartId: chartIds[1] });
      await expectFailure(() => update(concurrent, base.playerId, { type: "memo", chartId: chartIds[1], memo: "stale resurrection" }));
      await expectFailure(() => active.updatePlayer("missing-player", latest => latest));
      checks.push("101-codepoint memo/missing Player/deleted-chart edits reject without partial changes");

      before = JSON.stringify(await active.getPlayer(base.playerId));
      let injected = false;
      IDBObjectStore.prototype.put = function(value: unknown, key?: IDBValidKey) {
        if (this.name === "players" && !injected) { injected = true; throw new DOMException("Synthetic quota failure", "QuotaExceededError"); }
        return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
      };
      await expectFailure(() => update(active, base.playerId, { type: "add", chartId: chartIds[2] }));
      IDBObjectStore.prototype.put = originalPut;
      ok(injected && JSON.stringify(await active.getPlayer(base.playerId)) === before, "failed put changes Player");
      checks.push("injected QuotaExceededError aborts and preserves complete Player");

      injected = false;
      IDBObjectStore.prototype.put = function(value: unknown, key?: IDBValidKey) {
        const request = key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
        if (this.name === "players" && !injected) { injected = true; this.transaction.abort(); }
        return request;
      };
      await expectFailure(() => update(active, base.playerId, { type: "memo", chartId: chartIds[0], memo: "must roll back" }));
      IDBObjectStore.prototype.put = originalPut;
      ok(injected && JSON.stringify(await active.getPlayer(base.playerId)) === before, "late abort changes Player");
      checks.push("abort after queued put rolls back Player and rejects success");

      // Use active repository for snapshots after the initial repo was closed.
      const saved = await createBackup(active, now);
      const text = JSON.stringify(saved);
      const known = new Set(chartIds);
      await restoreBackup(active, parseBackup(text), now, known);
      ok(JSON.stringify((await active.getPlayer(base.playerId))?.playList) === JSON.stringify(saved.payload.players.find(p => p.playerId === base.playerId)?.playList), "backup roundtrip");
      const invalid = parseBackup(text);
      invalid.payload.players[0].playList = [{ chartId: "unknown-chart", memo: "" }];
      const allBefore = JSON.stringify(await createBackup(active, now));
      await expectFailure(() => restoreBackup(active, invalid, now, known));
      ok(JSON.stringify(await createBackup(active, now)) === allBefore, "reference failure must preserve data");
      checks.push("schema1 list roundtrip and unknown-chart restore rejection preserve data");

      injected = false;
      IDBObjectStore.prototype.put = function(value: unknown, key?: IDBValidKey) {
        const request = key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
        if (this.name === "players" && !injected) { injected = true; this.transaction.abort(); }
        return request;
      };
      await expectFailure(() => restoreBackup(active, parseBackup(text), now, known));
      IDBObjectStore.prototype.put = originalPut;
      ok(injected && JSON.stringify(await createBackup(active, now)) === allBefore, "failed restore loses old data");
      checks.push("restore abort after store clears preserves all original data atomically");

      await active.resetScoreBp(base.playerId, now);
      ok(JSON.stringify((await active.getPlayer(base.playerId))?.playList) === JSON.stringify(saved.payload.players.find(p => p.playerId === base.playerId)?.playList), "score/BP reset clears list");
      const old = parseBackup(text);
      for (const p of old.payload.players) delete p.playList;
      const normalized = parseBackup(JSON.stringify(old));
      await restoreBackup(active, normalized, now, known);
      ok(normalized.schemaVersion === 1 && (await active.getPlayer(base.playerId))?.playList?.length === 0, "legacy restore must clear the current list");
      checks.push("SCORE/BP reset retains lists; old backup replaces them with empty lists");

      await update(active, base.playerId, { type: "add", chartId: chartIds[0] });
      await active.initializeAllUserData();
      const empty = await createBackup(active, now);
      ok(Object.values(empty.payload).every(entries => entries.length === 0), "full reset must delete lists with players");
      checks.push("full reset removes NEXT PLAY together with all user stores");
    } finally { concurrent.close(); }
    result.textContent = "PASS\n" + checks.join("\n");
  } finally {
    IDBObjectStore.prototype.put = originalPut;
    repo.close(); other.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("isolated test cleanup blocked"));
    });
  }
}
main().catch(error => { result.textContent = "FAIL\n" + String(error?.stack ?? error); });
