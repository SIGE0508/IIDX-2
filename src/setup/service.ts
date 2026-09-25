import { CLEAR_LAMP_RANK, HIGHEST_DP_RANKS, RADAR_ATTRIBUTES, SETUP_REGISTRATION_METHODS } from "../domain/constants";
import { isCurrentlyPlayableChart, isManagedChart } from "../domain/chart";
import type { ChartMaster, ClearLamp, HighestDpRank, Player, PlayerChartRecord, SetupDraft, SetupRegistrationMethod } from "../domain/types";
import { UserDataRepository } from "../storage/repository";
import type { PlayerPlayDataSummary, PlayerProfilePatch, PlayerRadarValues, SetupDraftPayloadV1, SetupDraftState, SetupStep } from "./types";

const DRAFT_PAYLOAD_VERSION = 1 as const;
const SETUP_STEPS: readonly SetupStep[] = ["highest_dp_rank", "registration_method", "registration_review", "final_confirmation"];
const iso = (value: string): boolean => !Number.isNaN(Date.parse(value));
const isSetupStep = (value: string): value is SetupStep => (SETUP_STEPS as readonly string[]).includes(value);
const isRank = (value: unknown): value is HighestDpRank => typeof value === "string" && (HIGHEST_DP_RANKS as readonly string[]).includes(value);
const isMethod = (value: unknown): value is SetupRegistrationMethod => typeof value === "string" && (SETUP_REGISTRATION_METHODS as readonly string[]).includes(value);
function assertTimestamp(now: string): void { if (!iso(now)) throw new Error("A valid ISO timestamp is required."); }
function initialPayload(): SetupDraftPayloadV1 { return { version: DRAFT_PAYLOAD_VERSION, stagedRecords: [] }; }
function copyRecord(record: PlayerChartRecord): PlayerChartRecord { return { ...record }; }

/** Rejects malformed persisted drafts rather than silently changing pending registration data. */
export function readSetupDraftState(draft: SetupDraft): SetupDraftState {
  if (!isSetupStep(draft.step)) throw new Error("Setup draft has an unknown step.");
  if (draft.highestDpRank !== null && !isRank(draft.highestDpRank)) throw new Error("Setup draft has an invalid highest DP rank.");
  if (draft.selectedRegistrationMethod !== null && !isMethod(draft.selectedRegistrationMethod)) throw new Error("Setup draft has an invalid registration method.");
  const payload = draft.payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload) || (payload as { version?: unknown }).version !== DRAFT_PAYLOAD_VERSION || !Array.isArray((payload as { stagedRecords?: unknown }).stagedRecords)) throw new Error("Setup draft payload is invalid or unsupported.");
  const chartIds = new Set<string>();
  const stagedRecords = (payload as { stagedRecords: unknown[] }).stagedRecords.map((value) => {
    if (typeof value !== "object" || value === null) throw new Error("Setup draft contains an invalid staged record.");
    const record = value as PlayerChartRecord;
    if (record.playerId !== draft.playerId || typeof record.chartId !== "string" || !(record.clearLamp in CLEAR_LAMP_RANK) || !iso(record.updatedAt) || chartIds.has(record.chartId)) throw new Error("Setup draft contains an invalid staged record.");
    chartIds.add(record.chartId); return copyRecord(record);
  });
  return { draft: { ...draft, payload: { version: DRAFT_PAYLOAD_VERSION, stagedRecords: stagedRecords.map(copyRecord) } }, payload: { version: DRAFT_PAYLOAD_VERSION, stagedRecords } };
}
function draftFrom(state: SetupDraftState, changes: Partial<Pick<SetupDraft, "step" | "highestDpRank" | "selectedRegistrationMethod">>, records: readonly PlayerChartRecord[], now: string): SetupDraft {
  assertTimestamp(now);
  return { ...state.draft, ...changes, payload: { version: DRAFT_PAYLOAD_VERSION, stagedRecords: records.map(copyRecord) }, updatedAt: now };
}

export async function beginSetup(repository: UserDataRepository, playerId: string, now: string): Promise<SetupDraftState> {
  if (!playerId.trim()) throw new Error("A playerId is required to begin setup."); assertTimestamp(now);
  const existing = await repository.getSetupDraft(playerId); if (existing) return readSetupDraftState(existing);
  const draft: SetupDraft = { playerId, step: "highest_dp_rank", highestDpRank: null, selectedRegistrationMethod: null, payload: initialPayload(), updatedAt: now };
  await repository.saveSetupDraft(draft); return readSetupDraftState(draft);
}
export async function saveHighestDpRank(repository: UserDataRepository, state: SetupDraftState, highestDpRank: HighestDpRank, now: string): Promise<SetupDraftState> {
  if (!isRank(highestDpRank)) throw new Error("Highest DP rank is invalid.");
  const draft = draftFrom(state, { highestDpRank, step: "registration_method" }, state.payload.stagedRecords, now); await repository.saveSetupDraft(draft); return readSetupDraftState(draft);
}
export async function saveRegistrationMethod(repository: UserDataRepository, state: SetupDraftState, method: SetupRegistrationMethod, now: string): Promise<SetupDraftState> {
  if (!isMethod(method)) throw new Error("Setup registration method is invalid.");
  if (state.draft.highestDpRank === null) throw new Error("Highest DP rank must be selected before the registration method.");
  const draft = draftFrom(state, { selectedRegistrationMethod: method, step: method === "later" ? "final_confirmation" : "registration_review" }, state.payload.stagedRecords, now); await repository.saveSetupDraft(draft); return readSetupDraftState(draft);
}
/** Initial bulk registration can only raise existing staged lamps. */
export async function applyInitialBulkLamp(repository: UserDataRepository, state: SetupDraftState, charts: readonly ChartMaster[], officialLevel: 10 | 11 | 12, lamp: ClearLamp, now: string): Promise<SetupDraftState> {
  if (state.draft.selectedRegistrationMethod !== "manual") throw new Error("Bulk registration is available only for the manual setup route.");
  const byChartId = new Map(state.payload.stagedRecords.map((record) => [record.chartId, copyRecord(record)]));
  for (const chart of charts) {
    if (!isManagedChart(chart) || !isCurrentlyPlayableChart(chart) || chart.officialLevel !== officialLevel) continue;
    const existing = byChartId.get(chart.chartId)?.clearLamp ?? "NO_PLAY";
    if (CLEAR_LAMP_RANK[existing] < CLEAR_LAMP_RANK[lamp]) byChartId.set(chart.chartId, { playerId: state.draft.playerId, chartId: chart.chartId, clearLamp: lamp, score: null, bp: null, clearSource: "manual", scoreSource: null, bpSource: null, updatedAt: now });
  }
  const draft = draftFrom(state, { step: "registration_review" }, [...byChartId.values()], now); await repository.saveSetupDraft(draft); return readSetupDraftState(draft);
}
/** Individual initial corrections may raise or lower lamps, including NO_PLAY. */
export async function correctInitialLamp(repository: UserDataRepository, state: SetupDraftState, chart: ChartMaster, lamp: ClearLamp, now: string): Promise<SetupDraftState> {
  if (!isManagedChart(chart) || !isCurrentlyPlayableChart(chart)) throw new Error("The chart is not available for current initial setup.");
  if (state.draft.selectedRegistrationMethod !== "manual") throw new Error("Initial lamp correction is available only for the manual setup route.");
  const records = new Map(state.payload.stagedRecords.map((record) => [record.chartId, copyRecord(record)]));
  records.set(chart.chartId, { playerId: state.draft.playerId, chartId: chart.chartId, clearLamp: lamp, score: null, bp: null, clearSource: "manual", scoreSource: null, bpSource: null, updatedAt: now });
  const draft = draftFrom(state, { step: "registration_review" }, [...records.values()], now); await repository.saveSetupDraft(draft); return readSetupDraftState(draft);
}
/** Final confirmation is the only path that writes first-time records; it writes no HISTORY. */
export async function completeSetup(repository: UserDataRepository, state: SetupDraftState, now: string): Promise<Player> {
  assertTimestamp(now); const { highestDpRank, selectedRegistrationMethod } = state.draft;
  if (highestDpRank === null || selectedRegistrationMethod === null) throw new Error("DP highest rank and registration method are required to complete setup.");
  const player: Player = { playerId: state.draft.playerId, iidxId: null, playerName: null, highestDpRank, notesRadar: null, createdAt: now, updatedAt: now };
  await repository.completeInitialSetup(player, state.payload.stagedRecords); return player;
}
export async function discardSetup(repository: UserDataRepository, playerId: string): Promise<void> { await repository.deleteSetupDraft(playerId); }
export async function replaceSetupStagedRecords(repository: UserDataRepository, state: SetupDraftState, records: readonly PlayerChartRecord[], now: string): Promise<SetupDraftState> { const draft = draftFrom(state, { step: "registration_review" }, records, now); await repository.saveSetupDraft(draft); return readSetupDraftState(draft); }
export function radarTotal(values: PlayerRadarValues): number { return RADAR_ATTRIBUTES.reduce((total, attribute) => total + values[attribute], 0); }
export async function updatePlayerProfile(repository: UserDataRepository, player: Player, patch: PlayerProfilePatch, now: string): Promise<Player> {
  assertTimestamp(now); if (!isRank(patch.highestDpRank)) throw new Error("Highest DP rank is invalid.");
  const updated: Player = { ...player, ...patch, updatedAt: now }; await repository.savePlayer(updated); return updated;
}
export async function updatePlayerRadar(repository: UserDataRepository, player: Player, notesRadar: PlayerRadarValues, now: string): Promise<Player> {
  assertTimestamp(now); if (!RADAR_ATTRIBUTES.every((attribute) => Number.isFinite(notesRadar[attribute]))) throw new Error("All player NOTES RADAR values must be finite numbers.");
  const updated: Player = { ...player, notesRadar: { ...notesRadar }, updatedAt: now }; await repository.savePlayer(updated); return updated;
}
/** Common PLAYER aggregate: managed, currently playable ☆10–12 charts only. */
export function summarizePlayerPlayData(charts: readonly ChartMaster[], records: readonly PlayerChartRecord[]): PlayerPlayDataSummary {
  const lamps = new Map(records.map((record) => [record.chartId, record.clearLamp]));
  const levels = ([10, 11, 12] as const).map((officialLevel) => {
    const targetCharts = charts.filter((chart) => chart.officialLevel === officialLevel && isManagedChart(chart) && isCurrentlyPlayableChart(chart));
    const lampCounts: PlayerPlayDataSummary["levels"][number]["lampCounts"] = {}; let registeredCount = 0;
    for (const chart of targetCharts) { const lamp = lamps.get(chart.chartId) ?? "NO_PLAY"; if (lamp !== "NO_PLAY") { registeredCount += 1; lampCounts[lamp] = (lampCounts[lamp] ?? 0) + 1; } }
    return { officialLevel, registeredCount, totalCount: targetCharts.length, lampCounts };
  });
  return { levels };
}
