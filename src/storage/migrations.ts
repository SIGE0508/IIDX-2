import { USER_DATA_SCHEMA_VERSION } from "../domain/constants";
import type { ClearLamp, PlayerChartRecord } from "../domain/types";
import { UserDataRepository } from "./repository";
import { assertUserDataCommit, type AppMetaEntry, type UserDataCommit } from "./validation";

export const LEGACY_V3_STORAGE_KEY = "iidx-clear-tracker-data-v3";
export const LEGACY_LAMPS_STORAGE_KEY = "iidx-clear-tracker-lamps-v2";
export const LEGACY_EXTRAS_STORAGE_KEY = "iidx-clear-tracker-extras-v1";
export const LEGACY_MIGRATION_META_KEY = "legacyLocalStorageMigrationV1";

export interface LegacyStorageReader { getItem(key: string): string | null; }
export type LegacyChartResolver = (legacyChartKey: string) => string | null;
export interface LegacyMigrationPlan {
  playerId: string;
  sourceKeys: string[];
  records: PlayerChartRecord[];
  skippedNoLampKeys: string[];
  unresolvedKeys: string[];
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const legacyLamp = (value: unknown): value is "ec" | "nc" | "hc" | "exh" | null => value === null || value === "ec" || value === "nc" || value === "hc" || value === "exh";
const lampMap: Readonly<Record<"ec" | "nc" | "hc" | "exh", ClearLamp>> = { ec: "EASY_CLEAR", nc: "CLEAR", hc: "HARD_CLEAR", exh: "EX_HARD_CLEAR" };

function parseJson(raw: string, key: string): unknown { try { return JSON.parse(raw); } catch { throw new Error(`Legacy localStorage key '${key}' is not valid JSON.`); } }
function legacySaved(reader: LegacyStorageReader): { sourceKeys: string[]; saved: Record<string, "ec" | "nc" | "hc" | "exh" | null> } | null {
  const v3 = reader.getItem(LEGACY_V3_STORAGE_KEY);
  if (v3 !== null) {
    const parsed = parseJson(v3, LEGACY_V3_STORAGE_KEY);
    if (!object(parsed) || parsed.schemaVersion !== 3 || !object(parsed.saved) || !Object.values(parsed.saved).every(legacyLamp)) throw new Error("Legacy v3 localStorage data is invalid.");
    return { sourceKeys: [LEGACY_V3_STORAGE_KEY], saved: parsed.saved as Record<string, "ec" | "nc" | "hc" | "exh" | null> };
  }
  const lamps = reader.getItem(LEGACY_LAMPS_STORAGE_KEY); const extras = reader.getItem(LEGACY_EXTRAS_STORAGE_KEY);
  if (lamps === null && extras === null) return null;
  const parsedLamps = lamps === null ? {} : parseJson(lamps, LEGACY_LAMPS_STORAGE_KEY);
  if (!object(parsedLamps) || !Object.values(parsedLamps).every(legacyLamp)) throw new Error("Legacy lamp localStorage data is invalid.");
  return { sourceKeys: [LEGACY_LAMPS_STORAGE_KEY, LEGACY_EXTRAS_STORAGE_KEY].filter((key) => reader.getItem(key) !== null), saved: parsedLamps as Record<string, "ec" | "nc" | "hc" | "exh" | null> };
}

/**
 * Creates a plan only. No localStorage key or IndexedDB record is changed here.
 * Old score/history fields intentionally remain in localStorage: their legacy
 * meanings cannot be safely mapped to the Ver.1 current-work / ereter models.
 */
export function planLegacyLocalStorageMigration(reader: LegacyStorageReader, playerId: string, resolveChartId: LegacyChartResolver, now: string): LegacyMigrationPlan | null {
  if (!playerId.trim() || Number.isNaN(Date.parse(now))) throw new Error("A playerId and ISO timestamp are required for legacy migration.");
  const source = legacySaved(reader); if (source === null) return null;
  const unresolvedKeys: string[] = []; const skippedNoLampKeys: string[] = []; const byChartId = new Map<string, PlayerChartRecord>();
  for (const [legacyKey, lamp] of Object.entries(source.saved)) {
    if (lamp === null) { skippedNoLampKeys.push(legacyKey); continue; }
    const chartId = resolveChartId(legacyKey); if (chartId === null) { unresolvedKeys.push(legacyKey); continue; }
    const record: PlayerChartRecord = { playerId, chartId, clearLamp: lampMap[lamp], score: null, bp: null, clearSource: null, scoreSource: null, bpSource: null, updatedAt: now };
    const previous = byChartId.get(chartId); if (previous && previous.clearLamp !== record.clearLamp) throw new Error(`Legacy keys resolve to conflicting lamps for chartId '${chartId}'.`);
    byChartId.set(chartId, record);
  }
  return { playerId, sourceKeys: source.sourceKeys, records: [...byChartId.values()], skippedNoLampKeys, unresolvedKeys };
}

/** Commits only a fully resolved plan. Original localStorage is intentionally never deleted. */
export async function commitLegacyLocalStorageMigration(repository: UserDataRepository, plan: LegacyMigrationPlan, now: string): Promise<void> {
  if (plan.unresolvedKeys.length > 0) throw new Error("Legacy migration has unresolved chart keys and cannot be committed.");
  const player = await repository.getPlayer(plan.playerId); if (!player) throw new Error("A valid Ver.1 Player must exist before legacy migration can be committed.");
  if (await repository.getAppMeta(LEGACY_MIGRATION_META_KEY)) throw new Error("Legacy localStorage migration was already committed.");
  const marker: AppMetaEntry = { key: LEGACY_MIGRATION_META_KEY, value: { sourceKeys: plan.sourceKeys, migratedRecordCount: plan.records.length, skippedNoLampCount: plan.skippedNoLampKeys.length, completedAt: now }, updatedAt: now };
  const commit: UserDataCommit = { playerChartRecords: plan.records, appMeta: [marker] };
  assertUserDataCommit(commit); await repository.commit(commit);
}

export interface SerializedUserDataV1 { schemaVersion: 1; payload: UserDataCommit; }
/** Future backup/schema migrations must be explicit one-step entries in this table. */
export function migrateSerializedUserData(value: unknown): UserDataCommit {
  if (!object(value) || typeof value.schemaVersion !== "number" || !object(value.payload)) throw new Error("Serialized user data envelope is invalid.");
  if (value.schemaVersion > USER_DATA_SCHEMA_VERSION) throw new Error("Serialized user data uses an unsupported future schema version.");
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) throw new Error(`No migration is registered from schema version ${value.schemaVersion}.`);
  const raw = value.payload as UserDataCommit;
  const emptyDetails = () => Object.fromEntries(["NOTES", "CHORD", "PEAK", "CHARGE", "SCRATCH", "SOF_LAN"].map(attribute => [attribute, []]));
  const payload: UserDataCommit = { ...raw, players: (raw.players ?? []).map(player => ({ ...player, ereterOverall: player.ereterOverall ?? null, notesRadarDetails: player.notesRadarDetails ?? emptyDetails() })) };
  assertUserDataCommit(payload); return payload;
}
