import { INDEXED_DB_NAME, INDEXED_DB_VERSION, USER_DATA_SCHEMA_VERSION } from "../domain/constants";

export const STORE_NAMES = ["players", "playerChartRecords", "history", "ereterPersonalHistory", "setupDrafts", "uiSettings", "appMeta"] as const;
export type StoreName = (typeof STORE_NAMES)[number];
export const USER_DATA_SCHEMA_META_KEY = "userDataSchemaVersion";

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed.")); });
}
export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted.")); transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed.")); });
}
function storeForUpgrade(transaction: IDBTransaction, database: IDBDatabase, name: StoreName, options: IDBObjectStoreParameters): IDBObjectStore { return database.objectStoreNames.contains(name) ? transaction.objectStore(name) : database.createObjectStore(name, options); }
function ensureIndex(store: IDBObjectStore, name: string, keyPath: string | string[], options?: IDBIndexParameters): void { if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, options); }

export function applySchemaV1(database: IDBDatabase, transaction: IDBTransaction): void {
  const players = storeForUpgrade(transaction, database, "players", { keyPath: "playerId" }); ensureIndex(players, "byPlayerName", "playerName", { unique: false });
  const records = storeForUpgrade(transaction, database, "playerChartRecords", { keyPath: ["playerId", "chartId"] }); ensureIndex(records, "byPlayerId", "playerId"); ensureIndex(records, "byChartId", "chartId");
  const history = storeForUpgrade(transaction, database, "history", { keyPath: "historyId" }); ensureIndex(history, "byPlayerId", "playerId"); ensureIndex(history, "byPlayerDate", ["playerId", "date"]); ensureIndex(history, "byChartId", "chartId");
  storeForUpgrade(transaction, database, "ereterPersonalHistory", { keyPath: "playerId" });
  storeForUpgrade(transaction, database, "setupDrafts", { keyPath: "playerId" });
  storeForUpgrade(transaction, database, "uiSettings", { keyPath: "key" });
  const meta = storeForUpgrade(transaction, database, "appMeta", { keyPath: "key" });
  meta.put({ key: USER_DATA_SCHEMA_META_KEY, value: USER_DATA_SCHEMA_VERSION, updatedAt: new Date().toISOString() });
}

/** Adds only nullable/default Player fields. Existing records, keys, and stores remain intact. */
export function applySchemaV2(database: IDBDatabase, transaction: IDBTransaction): void {
  const players = transaction.objectStore("players");
  const request = players.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    const raw = cursor.value as Record<string, unknown>;
    const details = raw.notesRadarDetails && typeof raw.notesRadarDetails === "object" ? raw.notesRadarDetails : Object.fromEntries(["NOTES", "CHORD", "PEAK", "CHARGE", "SCRATCH", "SOF_LAN"].map(attribute => [attribute, []]));
    cursor.update({ ...raw, ereterOverall: typeof raw.ereterOverall === "number" && Number.isFinite(raw.ereterOverall) && raw.ereterOverall >= 0 ? raw.ereterOverall : null, notesRadarDetails: details });
    cursor.continue();
  };
  transaction.objectStore("appMeta").put({ key: USER_DATA_SCHEMA_META_KEY, value: USER_DATA_SCHEMA_VERSION, updatedAt: new Date().toISOString() });
}

/** databaseName is injectable only for isolated browser integration tests. */
export function openTrackerDatabase(factory: IDBFactory = globalThis.indexedDB, databaseName: string = INDEXED_DB_NAME): Promise<IDBDatabase> {
  if (!factory) return Promise.reject(new Error("IndexedDB is unavailable in this browser."));
  return new Promise((resolve, reject) => {
    const request = factory.open(databaseName, INDEXED_DB_VERSION);
    request.onupgradeneeded = event => {
      const transaction = request.transaction!;
      applySchemaV1(request.result, transaction);
      if (event.oldVersion < 2) applySchemaV2(request.result, transaction);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
    request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked by another open application tab."));
  });
}

export function runTransaction<T>(database: IDBDatabase, stores: readonly StoreName[], mode: IDBTransactionMode, enqueue: (transaction: IDBTransaction) => T): Promise<T> {
  const transaction = database.transaction([...stores], mode); let result: T;
  try { result = enqueue(transaction); } catch (error) { transaction.abort(); return Promise.reject(error); }
  return transactionDone(transaction).then(() => result);
}
