import type { ChartMaster, ClearLamp, HighestDpRank, Player, PlayerChartRecord, RadarAttribute } from "../domain/types";
import type { MasterSet } from "../master/types";

export type TrainingMode = "INITIAL" | "PERFORMANCE";
export type TrainingCategory = "CLEAR_TARGET" | "CLEANUP" | "HARD_TARGET" | "EXH_TARGET" | "CHALLENGE" | "ATTRIBUTE_PRACTICE";
export type TrainingReason = "INITIAL_BAND" | "MAIN_BAND" | "LOWER_BAND" | "HARD_UPGRADE" | "EXH_UPGRADE" | "STRONG_ATTRIBUTE" | "ATTRIBUTE_MATCH" | "ATTRIBUTE_BASIC" | "ATTRIBUTE_STANDARD" | "ATTRIBUTE_CHALLENGE";
export interface InitialTrainingRange { min: number; max: number; }
export interface TrainingRate { numerator: number; denominator: number; rate: number | null; }
export interface TrainingProgress extends TrainingRate { key: number; skipped: boolean; passed: boolean; }
export interface TrainingRecommendation {
  chartId: string;
  category: TrainingCategory;
  reason: TrainingReason;
  officialLevel: number;
  effectiveDifficulty: number;
  currentLamp: ClearLamp;
  targetLamp: ClearLamp;
  ereterValue: number | null;
  radarScore: number | null;
  matchedAttributes: RadarAttribute[];
}
export interface TrainingInput {
  player: Player;
  records: readonly PlayerChartRecord[];
  master: MasterSet;
  selectedAttribute?: RadarAttribute;
}
export interface TrainingResult {
  playerId: string;
  mode: TrainingMode;
  initialRange: InitialTrainingRange;
  coverage: TrainingRate;
  phase: 10 | 11 | 12;
  mainBand: number | null;
  officialProgress: TrainingProgress[];
  level12Progress: TrainingProgress[];
  introductionBands: number[];
  strongAttributes: RadarAttribute[];
  attributePracticeAvailable: boolean;
  recommendations: Record<"clearTargets" | "cleanupTargets" | "hardTargets" | "exhTargets" | "challengeTargets" | "attributePracticeTargets", TrainingRecommendation[]>;
}

export interface TrainingChart extends ChartMaster {
  effectiveDifficulty: number;
  currentLamp: ClearLamp;
}

export type RankRangeMap = Readonly<Record<HighestDpRank, InitialTrainingRange>>;
