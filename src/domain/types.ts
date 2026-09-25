/** Stable Phase 1 domain contracts. */
export type ChartType = "DPN" | "DPH" | "DPA" | "DPL";
export type Availability = "available" | "unavailable" | "unknown";
export type AliasSource = "officialCsv" | "unofficialDifficulty" | "ereter" | "notesRadar";
export type HighestDpRank = "UNOBTAINED" | "EIGHTH_OR_BELOW" | "NINTH" | "TENTH" | "CHUDEN" | "KAIDEN";
export type ClearLamp = "NO_PLAY" | "FAILED" | "ASSIST_CLEAR" | "EASY_CLEAR" | "CLEAR" | "HARD_CLEAR" | "EX_HARD_CLEAR" | "FULL_COMBO";
export type RecordSource = "manual" | "tracker_template" | "official_csv";
export type RadarAttribute = "NOTES" | "CHORD" | "PEAK" | "CHARGE" | "SCRATCH" | "SOF_LAN";

export interface SongMaster {
  songId: string;
  title: string;
  debutVersion: string | null;
  aliases: Partial<Record<AliasSource, string[]>>;
}
export interface ChartMaster {
  chartId: string;
  songId: string;
  chartType: ChartType;
  officialLevel: number;
  /** Null until the chart's note count has been entered in the source master. */
  notes: number | null;
  availability: Availability;
}
export interface UnofficialDifficultyRecord { chartId: string; difficulty: number; lastUpdated: string; }
export interface EreterChartDataRecord { chartId: string; ec: number | null; hc: number | null; exh: number | null; lastUpdated: string; }
export interface NotesRadarRecord { chartId: string; values: Record<RadarAttribute, number>; verified: true; lastUpdated: string; }

/** User-owned data. Shared masters never contain these records. */
export interface Player {
  playerId: string;
  iidxId: string | null;
  playerName: string | null;
  highestDpRank: HighestDpRank;
  notesRadar: Record<RadarAttribute, number> | null;
  createdAt: string;
  updatedAt: string;
}
export interface PlayerChartRecord {
  playerId: string;
  chartId: string;
  clearLamp: ClearLamp;
  score: number | null;
  bp: number | null;
  clearSource: RecordSource | null;
  scoreSource: RecordSource | null;
  bpSource: RecordSource | null;
  updatedAt: string;
}
export interface HistoryEntry {
  historyId: string;
  playerId: string;
  date: string;
  chartId: string;
  oldLamp: ClearLamp;
  newLamp: ClearLamp;
  source: RecordSource;
}
export type SetupRegistrationMethod = "official_csv" | "manual" | "later";
export interface SetupDraft {
  playerId: string;
  step: string;
  highestDpRank: HighestDpRank | null;
  selectedRegistrationMethod: SetupRegistrationMethod | null;
  payload: unknown;
  updatedAt: string;
}
export type EreterScoreRank = string;
export interface EreterPersonalChartRecord {
  chartId: string;
  score: number | null;
  scoreRank: EreterScoreRank | null;
  scoreRate: number | null;
}
export interface EreterPersonalHistory {
  playerId: string;
  iidxId: string;
  playerName: string;
  fetchedAt: string;
  records: EreterPersonalChartRecord[];
}
