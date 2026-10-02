import { RADAR_ATTRIBUTES } from "../domain/constants";
import type { EreterPersonalHistory, HistoryEntry, Player, PlayerChartRecord, SetupDraft } from "../domain/types";
import type { UiSetting, UserDataCommit } from "../storage/validation";
import { assertUserDataCommit } from "../storage/validation";
import { UserDataRepository } from "../storage/repository";

export interface BackupFileV1 { schemaVersion: 1; backupCreatedAt: string; payload: Required<Pick<UserDataCommit, "players" | "playerChartRecords" | "history" | "ereterPersonalHistory" | "setupDrafts" | "uiSettings">>; }
const validDate = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));
const emptyRadarDetails = () => Object.fromEntries(RADAR_ATTRIBUTES.map(attribute => [attribute, []])) as unknown as Player["notesRadarDetails"];
/** Additive v2 Player fields are supplied for schemaVersion 1 backups before validation. */
function normalizePlayer(player: unknown): unknown {
  if (typeof player !== "object" || player === null || Array.isArray(player)) return player;
  const value = player as Record<string, unknown>;
  return { ...value, ereterOverall: typeof value.ereterOverall === "number" && Number.isFinite(value.ereterOverall) && value.ereterOverall >= 0 ? value.ereterOverall : null, notesRadarDetails: value.notesRadarDetails ?? emptyRadarDetails() };
}
export async function createBackup(repository: UserDataRepository, backupCreatedAt: string): Promise<BackupFileV1> {
  if (!validDate(backupCreatedAt)) throw new Error("backupCreatedAt must be an ISO timestamp.");
  const [players, playerChartRecords, history, ereterPersonalHistory, setupDrafts, uiSettings] = await Promise.all([repository.listPlayers(), repository.listPlayerChartRecordsAll(), repository.listHistoryAll(), repository.listEreterPersonalHistoryAll(), repository.listSetupDrafts(), repository.listUiSettings()]);
  const payload = { players, playerChartRecords, history, ereterPersonalHistory, setupDrafts, uiSettings }; assertUserDataCommit(payload); return { schemaVersion: 1, backupCreatedAt, payload };
}
export function parseBackup(text: string): BackupFileV1 { let value: unknown; try { value = JSON.parse(text); } catch { throw new Error("Backup JSON is invalid."); } if (typeof value !== "object" || value === null) throw new Error("Backup JSON is invalid."); const backup = value as Partial<BackupFileV1>; const payload=backup.payload as Record<string,unknown>|undefined; const keys=["players","playerChartRecords","history","ereterPersonalHistory","setupDrafts","uiSettings"]; if (backup.schemaVersion !== 1 || !validDate(backup.backupCreatedAt) || !payload || !keys.every(key=>Array.isArray(payload[key]))) throw new Error("Backup JSON is not a supported CLEAR TRACKER backup."); const normalized = { ...payload, players: (payload.players as unknown[]).map(normalizePlayer) } as unknown as UserDataCommit; assertUserDataCommit(normalized); return { schemaVersion: 1, backupCreatedAt: backup.backupCreatedAt, payload: normalized as BackupFileV1["payload"] }; }
export async function restoreBackup(repository: UserDataRepository, backup: BackupFileV1, restoredAt: string): Promise<void> { if (!validDate(restoredAt)) throw new Error("Restore timestamp must be an ISO timestamp."); assertUserDataCommit(backup.payload); await repository.replaceUserData(backup.payload, restoredAt); }
export function validateBackupReferences(backup: BackupFileV1, chartIds: ReadonlySet<string>): void { const players=new Set(backup.payload.players.map(p=>p.playerId));const check=(id:string)=>{if(!players.has(id))throw new Error(`Backup references missing player '${id}'.`)};for(const r of backup.payload.playerChartRecords){check(r.playerId);if(!chartIds.has(r.chartId))throw new Error(`Backup references unknown chart '${r.chartId}'.`)}for(const h of backup.payload.history){check(h.playerId);if(!chartIds.has(h.chartId))throw new Error(`Backup history references unknown chart '${h.chartId}'.`)}for(const e of backup.payload.ereterPersonalHistory){check(e.playerId);for(const r of e.records)if(!chartIds.has(r.chartId))throw new Error(`Backup ereter data references unknown chart '${r.chartId}'.`)} }
