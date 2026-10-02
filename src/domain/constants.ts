import type { AliasSource, Availability, ChartType, ClearLamp, HighestDpRank, RadarAttribute, RecordSource, SetupRegistrationMethod } from "./types";

export const CHART_TYPES: readonly ChartType[] = ["DPN", "DPH", "DPA", "DPL"];
export const AVAILABILITIES: readonly Availability[] = ["available", "unavailable", "unknown"];
export const ALIAS_SOURCES: readonly AliasSource[] = ["officialCsv", "unofficialDifficulty", "ereter", "notesRadar"];
export const HIGHEST_DP_RANKS: readonly HighestDpRank[] = ["UNOBTAINED", "EIGHTH_OR_BELOW", "NINTH", "TENTH", "CHUDEN", "KAIDEN"];
export const CLEAR_LAMPS: readonly ClearLamp[] = ["NO_PLAY", "FAILED", "ASSIST_CLEAR", "EASY_CLEAR", "CLEAR", "HARD_CLEAR", "EX_HARD_CLEAR", "FULL_COMBO"];
export const RECORD_SOURCES: readonly RecordSource[] = ["manual", "tracker_template", "official_csv"];
export const SETUP_REGISTRATION_METHODS: readonly SetupRegistrationMethod[] = ["official_csv", "manual", "later"];
export const RADAR_ATTRIBUTES: readonly RadarAttribute[] = ["NOTES", "CHORD", "PEAK", "CHARGE", "SCRATCH", "SOF_LAN"];
/** Display-only order for the PLAYER radar graph and attribute picker. */
export const RADAR_DISPLAY_ORDER: readonly RadarAttribute[] = ["NOTES", "PEAK", "SCRATCH", "SOF_LAN", "CHARGE", "CHORD"];
export const CLEAR_LAMP_RANK: Readonly<Record<ClearLamp, number>> = { NO_PLAY: 0, FAILED: 1, ASSIST_CLEAR: 2, EASY_CLEAR: 3, CLEAR: 4, HARD_CLEAR: 5, EX_HARD_CLEAR: 6, FULL_COMBO: 7 };
export const MASTER_SCHEMA_VERSION = 1 as const;
export const USER_DATA_SCHEMA_VERSION = 2 as const;
export const INDEXED_DB_NAME = "iidx-clear-tracker";
export const INDEXED_DB_VERSION = 2;
export const MASTER_ASSET_ROOT = "/masters/v1";
export const meetsLamp = (lamp: ClearLamp, threshold: ClearLamp) => CLEAR_LAMP_RANK[lamp] >= CLEAR_LAMP_RANK[threshold];
