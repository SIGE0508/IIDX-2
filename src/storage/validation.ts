import { CLEAR_LAMPS, HIGHEST_DP_RANKS, RADAR_ATTRIBUTES, RECORD_SOURCES, SETUP_REGISTRATION_METHODS } from "../domain/constants";
import type { EreterPersonalHistory, HistoryEntry, Player, PlayerChartRecord, SetupDraft } from "../domain/types";

export interface UiSetting { key: string; value: unknown; }
export interface AppMetaEntry { key: string; value: unknown; updatedAt: string; }
export interface UserDataCommit {
  players?: readonly Player[];
  playerChartRecords?: readonly PlayerChartRecord[];
  history?: readonly HistoryEntry[];
  ereterPersonalHistory?: readonly EreterPersonalHistory[];
  setupDrafts?: readonly SetupDraft[];
  uiSettings?: readonly UiSetting[];
  appMeta?: readonly AppMetaEntry[];
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === "string";
const nonBlank = (value: unknown): value is string => string(value) && value.trim() !== "";
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const iso = (value: unknown): value is string => string(value) && !Number.isNaN(Date.parse(value));
const nullableString = (value: unknown): value is string | null => value === null || string(value);
const nullableFinite = (value: unknown): value is number | null => value === null || finite(value);
const oneOf = <T extends string>(value: unknown, list: readonly T[]): value is T => string(value) && (list as readonly string[]).includes(value);
const radar = (value: unknown): boolean => object(value) && RADAR_ATTRIBUTES.every((attribute) => finite(value[attribute]));
const radarDetails = (value: unknown): boolean => object(value) && RADAR_ATTRIBUTES.every((attribute) => {
  const entries = value[attribute];
  if (!Array.isArray(entries) || entries.length > 10) return false;
  const chartIds = new Set<string>();
  return entries.every(entry => object(entry) && nonBlank(entry.chartId) && finite(entry.value) && entry.value >= 0 && !chartIds.has(entry.chartId) && Boolean(chartIds.add(entry.chartId)));
});

export function assertPlayer(value: unknown): asserts value is Player {
  if (!object(value) || !nonBlank(value.playerId) || !nullableString(value.iidxId) || !nullableString(value.playerName) || !oneOf(value.highestDpRank, HIGHEST_DP_RANKS) || (value.notesRadar !== null && !radar(value.notesRadar)) || !nullableFinite(value.ereterOverall) || (finite(value.ereterOverall) && value.ereterOverall < 0) || !radarDetails(value.notesRadarDetails) || !iso(value.createdAt) || !iso(value.updatedAt)) throw new Error("Player record is invalid.");
}
export function assertPlayerChartRecord(value: unknown): asserts value is PlayerChartRecord {
  if (object(value) && [value.previousScore, value.previousBp].some(item => item !== undefined && item !== null && (!finite(item) || !Number.isSafeInteger(item) || item < 0))) throw new Error("Previous SCORE/BP is invalid.");
  if (!object(value) || !nonBlank(value.playerId) || !nonBlank(value.chartId) || !oneOf(value.clearLamp, CLEAR_LAMPS) || !nullableFinite(value.score) || (finite(value.score) && (!Number.isSafeInteger(value.score) || value.score < 0)) || !nullableFinite(value.bp) || (finite(value.bp) && (!Number.isInteger(value.bp) || value.bp < 0)) || (value.clearSource !== null && !oneOf(value.clearSource, RECORD_SOURCES)) || (value.scoreSource !== null && !oneOf(value.scoreSource, RECORD_SOURCES)) || (value.bpSource !== null && !oneOf(value.bpSource, RECORD_SOURCES)) || !iso(value.updatedAt)) throw new Error("PlayerChartRecord is invalid.");
}
export function assertHistoryEntry(value: unknown): asserts value is HistoryEntry {
  const validUpdate = (update: unknown, lower: boolean): boolean => update === undefined || (object(update) && (update.before === null || (finite(update.before) && Number.isSafeInteger(update.before) && update.before >= 0)) && finite(update.after) && Number.isSafeInteger(update.after) && update.after >= 0 && (update.before === null || (lower ? update.after < update.before : update.after > update.before)));
  if (object(value) && (!validUpdate(value.scoreUpdate, false) || !validUpdate(value.bpUpdate, true))) throw new Error("History score/BP update is invalid.");
  if (!object(value) || !nonBlank(value.historyId) || !nonBlank(value.playerId) || !nonBlank(value.chartId) || !iso(value.date) || !oneOf(value.oldLamp, CLEAR_LAMPS) || !oneOf(value.newLamp, CLEAR_LAMPS) || !oneOf(value.source, RECORD_SOURCES)) throw new Error("History entry is invalid.");
}
export function assertEreterPersonalHistory(value: unknown): asserts value is EreterPersonalHistory {
  if (!object(value) || !nonBlank(value.playerId) || !nonBlank(value.iidxId) || !nonBlank(value.playerName) || !iso(value.fetchedAt) || !Array.isArray(value.records)) throw new Error("ERETER personal history is invalid.");
  const chartIds = new Set<string>();
  for (const record of value.records) {
    if (!object(record) || !nonBlank(record.chartId) || !nullableFinite(record.score) || (finite(record.score) && record.score < 0) || !nullableString(record.scoreRank) || !nullableFinite(record.scoreRate) || (chartIds.has(record.chartId) || !chartIds.add(record.chartId))) throw new Error("ERETER personal history chart record is invalid.");
  }
}
export function assertSetupDraft(value: unknown): asserts value is SetupDraft {
  if (!object(value) || !nonBlank(value.playerId) || !nonBlank(value.step) || (value.highestDpRank !== null && !oneOf(value.highestDpRank, HIGHEST_DP_RANKS)) || (value.selectedRegistrationMethod !== null && !oneOf(value.selectedRegistrationMethod, SETUP_REGISTRATION_METHODS)) || !iso(value.updatedAt)) throw new Error("Setup draft is invalid.");
}
export function assertUiSetting(value: unknown): asserts value is UiSetting { if (!object(value) || !nonBlank(value.key)) throw new Error("UI setting is invalid."); }
export function assertAppMetaEntry(value: unknown): asserts value is AppMetaEntry { if (!object(value) || !nonBlank(value.key) || !iso(value.updatedAt)) throw new Error("App metadata is invalid."); }

function noDuplicate<T>(items: readonly T[] | undefined, key: (item: T) => string, name: string): void {
  if (!items) return; const keys = items.map(key); if (new Set(keys).size !== keys.length) throw new Error(`${name} contains duplicate keys.`);
}
export function assertUserDataCommit(value: UserDataCommit): void {
  for (const player of value.players ?? []) assertPlayer(player);
  for (const record of value.playerChartRecords ?? []) assertPlayerChartRecord(record);
  for (const entry of value.history ?? []) assertHistoryEntry(entry);
  for (const history of value.ereterPersonalHistory ?? []) assertEreterPersonalHistory(history);
  for (const draft of value.setupDrafts ?? []) assertSetupDraft(draft);
  for (const setting of value.uiSettings ?? []) assertUiSetting(setting);
  for (const meta of value.appMeta ?? []) assertAppMetaEntry(meta);
  noDuplicate(value.players, (item) => item.playerId, "players");
  noDuplicate(value.playerChartRecords, (item) => `${item.playerId}\u0000${item.chartId}`, "playerChartRecords");
  noDuplicate(value.history, (item) => item.historyId, "history");
  noDuplicate(value.ereterPersonalHistory, (item) => item.playerId, "ereterPersonalHistory");
  noDuplicate(value.setupDrafts, (item) => item.playerId, "setupDrafts");
  noDuplicate(value.uiSettings, (item) => item.key, "uiSettings");
  noDuplicate(value.appMeta, (item) => item.key, "appMeta");
}
