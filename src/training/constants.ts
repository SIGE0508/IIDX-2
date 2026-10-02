import type { HighestDpRank } from "../domain/types";
import type { RankRangeMap } from "./types";

export const TRAINING_DATA_COVERAGE_THRESHOLD = 0.30;
export const TRAINING_PROGRESS_THRESHOLD = 0.75;
export const LEVEL_12_BANDS = [12.0, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7] as const;
export const INITIAL_TRAINING_RANGES: RankRangeMap = {
  UNOBTAINED: { min: 9.0, max: 10.5 },
  EIGHTH_OR_BELOW: { min: 9.0, max: 10.5 },
  NINTH: { min: 10.7, max: 11.6 },
  TENTH: { min: 12.0, max: 12.2 },
  CHUDEN: { min: 12.1, max: 12.5 },
  KAIDEN: { min: 12.4, max: 12.6 },
};
export const PERFORMANCE_START_LEVEL: Readonly<Record<HighestDpRank, 10 | 12>> = {
  UNOBTAINED: 10,
  EIGHTH_OR_BELOW: 10,
  NINTH: 10,
  TENTH: 12,
  CHUDEN: 12,
  KAIDEN: 12,
};
export const TRAINING_LIMITS = { clear: 5, cleanup: 5, hard: 5, exh: 5, challenge: 5, attributePractice: 5 } as const;
