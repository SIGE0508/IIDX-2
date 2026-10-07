import type { EreterPersonalHistory, HistoryEntry, Player, PlayerChartRecord, SetupDraft } from "../domain/types";
import { resetRecordScoreBp } from "../domain/record-reset";
import { openTrackerDatabase, requestResult, runTransaction, STORE_NAMES, transactionDone, type StoreName } from "./database";
import { assertAppMetaEntry, assertEreterPersonalHistory, assertHistoryEntry, assertPlayer, assertPlayerChartRecord, assertSetupDraft, assertUiSetting, assertUserDataCommit, type AppMetaEntry, type UiSetting, type UserDataCommit } from "./validation";

const storesFor = (commit: UserDataCommit): StoreName[] => STORE_NAMES.filter((store) => (commit[store] ?? []).length > 0);
export class UserDataRepository {
  constructor(private readonly database: IDBDatabase) {}
  static async open(): Promise<UserDataRepository> { return new UserDataRepository(await openTrackerDatabase()); }
  close(): void { this.database.close(); }
  /** Reads and updates the selected player's records in one transaction. */
  async resetScoreBp(playerId: string, now: string): Promise<void> {
    if (!playerId.trim() || Number.isNaN(Date.parse(now))) throw new Error("Reset target or timestamp is invalid.");
    await runTransaction(this.database, ["playerChartRecords"], "readwrite", transaction => {
      const request = transaction.objectStore("playerChartRecords").index("byPlayerId").openCursor(IDBKeyRange.only(playerId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        try {
          const record = cursor.value;
          assertPlayerChartRecord(record);
          if (record.score !== null || record.bp !== null) {
            const next = resetRecordScoreBp(record, now);
            assertPlayerChartRecord(next);
            cursor.update(next);
          }
          cursor.continue();
        } catch { transaction.abort(); }
      };
    });
  }
  /** Explicitly confirmed full reset; only the seven user-data stores exist here. */
  async initializeAllUserData(): Promise<void> {
    await runTransaction(this.database, STORE_NAMES, "readwrite", transaction => {
      for (const name of STORE_NAMES) transaction.objectStore(name).clear();
    });
  }
  async getPlayer(playerId: string): Promise<Player | undefined> { return this.get("players", playerId) as Promise<Player | undefined>; }
  async getPlayerChartRecord(playerId: string, chartId: string): Promise<PlayerChartRecord | undefined> { return this.get("playerChartRecords", [playerId, chartId]) as Promise<PlayerChartRecord | undefined>; }
  async getAppMeta(key: string): Promise<AppMetaEntry | undefined> { return this.get("appMeta", key) as Promise<AppMetaEntry | undefined>; }
  async listPlayerChartRecords(playerId: string): Promise<PlayerChartRecord[]> { return this.listByIndex("playerChartRecords", "byPlayerId", playerId) as Promise<PlayerChartRecord[]>; }
  async listHistory(playerId: string): Promise<HistoryEntry[]> { return this.listByIndex("history", "byPlayerDate", IDBKeyRange.bound([playerId, ""], [playerId, "\uffff"])) as Promise<HistoryEntry[]>; }
  async getEreterPersonalHistory(playerId: string): Promise<EreterPersonalHistory | undefined> { return this.get("ereterPersonalHistory", playerId) as Promise<EreterPersonalHistory | undefined>; }
  async getSetupDraft(playerId: string): Promise<SetupDraft | undefined> { return this.get("setupDrafts", playerId) as Promise<SetupDraft | undefined>; }
  async getUiSetting(key: string): Promise<UiSetting | undefined> { return this.get("uiSettings", key) as Promise<UiSetting | undefined>; }
  async listPlayers(): Promise<Player[]> { return this.listAll("players") as Promise<Player[]>; }
  async listHistoryAll(): Promise<HistoryEntry[]> { return this.listAll("history") as Promise<HistoryEntry[]>; }
  async listEreterPersonalHistoryAll(): Promise<EreterPersonalHistory[]> { return this.listAll("ereterPersonalHistory") as Promise<EreterPersonalHistory[]>; }
  async listSetupDrafts(): Promise<SetupDraft[]> { return this.listAll("setupDrafts") as Promise<SetupDraft[]>; }
  async listUiSettings(): Promise<UiSetting[]> { return this.listAll("uiSettings") as Promise<UiSetting[]>; }
  async listPlayerChartRecordsAll(): Promise<PlayerChartRecord[]> { return this.listAll("playerChartRecords") as Promise<PlayerChartRecord[]>; }
  async commit(commit: UserDataCommit): Promise<void> {
    assertUserDataCommit(commit); const stores = storesFor(commit); if (stores.length === 0) return;
    await runTransaction(this.database, stores, "readwrite", (transaction) => { for (const store of stores) { const objectStore = transaction.objectStore(store); for (const entry of commit[store] ?? []) objectStore.put(entry); } });
  }
  async savePlayer(player: Player): Promise<void> { assertPlayer(player); await this.commit({ players: [player] }); }
  async savePlayerChartRecord(record: PlayerChartRecord): Promise<void> { assertPlayerChartRecord(record); await this.commit({ playerChartRecords: [record] }); }
  async saveHistory(entry: HistoryEntry): Promise<void> { assertHistoryEntry(entry); await this.commit({ history: [entry] }); }
  async saveEreterPersonalHistory(history: EreterPersonalHistory): Promise<void> { assertEreterPersonalHistory(history); await this.commit({ ereterPersonalHistory: [history] }); }
  async saveSetupDraft(draft: SetupDraft): Promise<void> { assertSetupDraft(draft); await this.commit({ setupDrafts: [draft] }); }
  /** Removes only an unconfirmed setup draft. It never touches player data. */
  async deleteSetupDraft(playerId: string): Promise<void> {
    await runTransaction(this.database, ["setupDrafts"], "readwrite", (transaction) => {
      transaction.objectStore("setupDrafts").delete(playerId);
    });
  }
  /**
   * Finalizes first-time setup atomically. Initial registrations deliberately
   * do not create HISTORY entries; they represent pre-existing play data.
   */
  async completeInitialSetup(player: Player, records: readonly PlayerChartRecord[]): Promise<void> {
    assertPlayer(player);
    for (const record of records) assertPlayerChartRecord(record);
    const chartIds = records.map((record) => record.chartId);
    if (new Set(chartIds).size !== chartIds.length) throw new Error("Initial setup contains duplicate chart records.");
    await runTransaction(this.database, ["players", "playerChartRecords", "setupDrafts"], "readwrite", (transaction) => enqueueInitialSetup(transaction, player, records));
  }
  async replaceUserData(payload: Required<Pick<UserDataCommit, "players" | "playerChartRecords" | "history" | "ereterPersonalHistory" | "setupDrafts" | "uiSettings">>, restoredAt: string): Promise<void> {
    assertUserDataCommit(payload);
    await runTransaction(this.database, ["players", "playerChartRecords", "history", "ereterPersonalHistory", "setupDrafts", "uiSettings", "appMeta"], "readwrite", (transaction) => {
      const names: StoreName[] = ["players", "playerChartRecords", "history", "ereterPersonalHistory", "setupDrafts", "uiSettings"];
      for (const name of names) transaction.objectStore(name).clear();
      for (const player of payload.players) transaction.objectStore("players").put(player);
      for (const record of payload.playerChartRecords) transaction.objectStore("playerChartRecords").put(record);
      for (const entry of payload.history) transaction.objectStore("history").put(entry);
      for (const entry of payload.ereterPersonalHistory) transaction.objectStore("ereterPersonalHistory").put(entry);
      for (const entry of payload.setupDrafts) transaction.objectStore("setupDrafts").put(entry);
      for (const entry of payload.uiSettings) transaction.objectStore("uiSettings").put(entry);
      transaction.objectStore("appMeta").put({ key: "lastRestoreAt", value: restoredAt, updatedAt: restoredAt });
    });
  }
  async saveUiSetting(setting: UiSetting): Promise<void> { assertUiSetting(setting); await this.commit({ uiSettings: [setting] }); }
  async saveAppMeta(entry: AppMetaEntry): Promise<void> { assertAppMetaEntry(entry); await this.commit({ appMeta: [entry] }); }
  private async get(store: StoreName, key: IDBValidKey | IDBKeyRange): Promise<unknown> { const transaction = this.database.transaction(store, "readonly"); const request = transaction.objectStore(store).get(key); const [result] = await Promise.all([requestResult(request), transactionDone(transaction)]); return result === undefined ? undefined : result; }
  private async listByIndex(store: StoreName, index: string, query: IDBValidKey | IDBKeyRange): Promise<unknown[]> { const transaction = this.database.transaction(store, "readonly"); const request = transaction.objectStore(store).index(index).getAll(query); const [result] = await Promise.all([requestResult(request), transactionDone(transaction)]); return result; }
  private async listAll(store: StoreName): Promise<unknown[]> { const transaction = this.database.transaction(store, "readonly"); const request = transaction.objectStore(store).getAll(); const [result] = await Promise.all([requestResult(request), transactionDone(transaction)]); return result; }
}

/** Shared by the repository and the real-browser atomicity test. */
export function enqueueInitialSetup(transaction: IDBTransaction, player: Player, records: readonly PlayerChartRecord[]): void {
  transaction.objectStore("players").put(player);
  const chartRecords = transaction.objectStore("playerChartRecords");
  for (const record of records) chartRecords.put(record);
  transaction.objectStore("setupDrafts").delete(player.playerId);
}
