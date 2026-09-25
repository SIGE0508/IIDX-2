import type { ClearLamp, Player, PlayerChartRecord, RadarAttribute, SetupDraft } from "../domain/types";

/** Internal, versioned payload placed in SetupDraft.payload. */
export interface SetupDraftPayloadV1 { version: 1; stagedRecords: PlayerChartRecord[]; }
export type SetupStep = "highest_dp_rank" | "registration_method" | "registration_review" | "final_confirmation";
export interface SetupDraftState { draft: SetupDraft; payload: SetupDraftPayloadV1; }
export interface PlayerPlayDataLevelSummary {
  officialLevel: 10 | 11 | 12;
  registeredCount: number;
  totalCount: number;
  lampCounts: Partial<Record<Exclude<ClearLamp, "NO_PLAY">, number>>;
}
export interface PlayerPlayDataSummary { levels: PlayerPlayDataLevelSummary[]; }
export type PlayerProfilePatch = Pick<Player, "iidxId" | "playerName" | "highestDpRank">;
export type PlayerRadarValues = Record<RadarAttribute, number>;
