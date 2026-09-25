import { effectiveDifficulty, isTrainingEligibleChart, roundDifficultyToTenths } from "../domain/chart";
import { RADAR_ATTRIBUTES, meetsLamp } from "../domain/constants";
import type { ChartMaster, ClearLamp, EreterChartDataRecord, NotesRadarRecord, PlayerChartRecord, RadarAttribute } from "../domain/types";
import { INITIAL_TRAINING_RANGES, LEVEL_12_BANDS, PERFORMANCE_START_LEVEL, TRAINING_DATA_COVERAGE_THRESHOLD, TRAINING_LIMITS, TRAINING_PROGRESS_THRESHOLD } from "./constants";
import type { TrainingChart, TrainingInput, TrainingProgress, TrainingRate, TrainingRecommendation, TrainingResult } from "./types";

const sameBand = (left: number, right: number) => Math.round(left * 10) === Math.round(right * 10);
const targetLamp = (chart: Pick<ChartMaster, "officialLevel">): ClearLamp => chart.officialLevel === 12 ? "EASY_CLEAR" : "CLEAR";
const achieved = (chart: TrainingChart) => meetsLamp(chart.currentLamp, targetLamp(chart));
const stable = (left: TrainingChart, right: TrainingChart) => left.chartId.localeCompare(right.chartId);
const rate = (charts: readonly TrainingChart[]): TrainingRate => {
  const numerator = charts.filter(achieved).length;
  const denominator = charts.length;
  return { numerator, denominator, rate: denominator === 0 ? null : numerator / denominator };
};
const progress = (key: number, charts: readonly TrainingChart[]): TrainingProgress => {
  const value = rate(charts);
  return { key, ...value, skipped: value.denominator === 0, passed: value.rate !== null && value.rate >= TRAINING_PROGRESS_THRESHOLD };
};
const missingLastNumber = (left: number | null, right: number | null) => left === null ? right === null ? 0 : 1 : right === null ? -1 : left - right;

function recommendation(chart: TrainingChart, category: TrainingRecommendation["category"], reason: TrainingRecommendation["reason"], target: ClearLamp, ereterValue: number | null = null, radarScore: number | null = null, matchedAttributes: RadarAttribute[] = []): TrainingRecommendation {
  return { chartId: chart.chartId, category, reason, officialLevel: chart.officialLevel, effectiveDifficulty: chart.effectiveDifficulty, currentLamp: chart.currentLamp, targetLamp: target, ereterValue, radarScore, matchedAttributes };
}

export function getStrongAttributes(values: Readonly<Record<RadarAttribute, number>> | null): RadarAttribute[] {
  if (!values) return [];
  return [...RADAR_ATTRIBUTES].sort((left, right) => values[right] - values[left] || RADAR_ATTRIBUTES.indexOf(left) - RADAR_ATTRIBUTES.indexOf(right)).slice(0, 2);
}

export function calculateTraining(input: TrainingInput): TrainingResult {
  const records = new Map(input.records.filter(record => record.playerId === input.player.playerId).map(record => [record.chartId, record]));
  const unofficial = new Map(input.master.unofficial.records.map(record => [record.chartId, record]));
  const ereter = new Map(input.master.ereter.records.map(record => [record.chartId, record]));
  const radar = new Map(input.master.notesRadar.records.map(record => [record.chartId, record]));
  const charts: TrainingChart[] = input.master.chartMaster.charts.filter(isTrainingEligibleChart).map(chart => ({ ...chart, effectiveDifficulty: effectiveDifficulty(chart, unofficial.get(chart.chartId)), currentLamp: records.get(chart.chartId)?.clearLamp ?? "NO_PLAY" }));
  const initialRange = INITIAL_TRAINING_RANGES[input.player.highestDpRank];
  const initialCharts = charts.filter(chart => chart.effectiveDifficulty >= initialRange.min && chart.effectiveDifficulty <= initialRange.max);
  const registered = initialCharts.filter(chart => (records.get(chart.chartId)?.clearLamp ?? "NO_PLAY") !== "NO_PLAY").length;
  const coverage: TrainingRate = { numerator: registered, denominator: initialCharts.length, rate: initialCharts.length === 0 ? null : registered / initialCharts.length };
  const mode = coverage.rate !== null && coverage.rate >= TRAINING_DATA_COVERAGE_THRESHOLD ? "PERFORMANCE" : "INITIAL";
  const officialProgress: TrainingProgress[] = [];
  let phase: 10 | 11 | 12 = PERFORMANCE_START_LEVEL[input.player.highestDpRank];
  if (mode === "PERFORMANCE" && phase === 10) {
    const level10 = progress(10, charts.filter(chart => chart.officialLevel === 10)); officialProgress.push(level10);
    if (level10.passed) {
      phase = 11;
      const level11 = progress(11, charts.filter(chart => chart.officialLevel === 11)); officialProgress.push(level11);
      if (level11.passed) phase = 12;
    }
  }

  const level12Progress: TrainingProgress[] = [];
  let mainBand: number | null = null;
  if (mode === "INITIAL") {
    const unmetBands = initialCharts.filter(chart => !achieved(chart)).map(chart => chart.effectiveDifficulty).sort((left, right) => left - right);
    mainBand = unmetBands[0] ?? null;
    const initialBand = mainBand;
    const levelAtBand = initialBand === null ? null : initialCharts.find(chart => sameBand(chart.effectiveDifficulty, initialBand))?.officialLevel;
    phase = levelAtBand === 12 ? 12 : levelAtBand === 11 ? 11 : 10;
  } else if (phase === 12) {
    const existing: TrainingProgress[] = [];
    for (const band of LEVEL_12_BANDS) {
      const bandProgress = progress(band, charts.filter(chart => chart.officialLevel === 12 && sameBand(chart.effectiveDifficulty, band)));
      level12Progress.push(bandProgress);
      if (!bandProgress.skipped) existing.push(bandProgress);
    }
    for (const item of existing) { mainBand = item.key; if (!item.passed) break; }
  } else {
    const levelCharts = charts.filter(chart => chart.officialLevel === phase);
    mainBand = levelCharts.filter(chart => !achieved(chart)).map(chart => chart.effectiveDifficulty).sort((left, right) => left - right)[0] ?? levelCharts.map(chart => chart.effectiveDifficulty).sort((left, right) => left - right)[0] ?? null;
  }

  const introductionBands = [...new Set(charts.filter(chart => chart.officialLevel === 12 && chart.effectiveDifficulty < 12).map(chart => chart.effectiveDifficulty))].sort((left, right) => left - right);
  const ereterValue = (chart: TrainingChart, key: "ec" | "hc" | "exh") => ereter.get(chart.chartId)?.[key] ?? null;
  const sortByEreter = (key: "ec" | "hc" | "exh") => (left: TrainingChart, right: TrainingChart) => missingLastNumber(ereterValue(left, key), ereterValue(right, key)) || stable(left, right);

  let clearCandidates: TrainingChart[] = [];
  if (mainBand !== null) {
    if (mode === "INITIAL") clearCandidates = initialCharts.filter(chart => sameBand(chart.effectiveDifficulty, mainBand) && !achieved(chart));
    else if (phase === 12) clearCandidates = charts.filter(chart => chart.officialLevel === 12 && sameBand(chart.effectiveDifficulty, mainBand!) && !achieved(chart));
    else clearCandidates = charts.filter(chart => chart.officialLevel === phase && !achieved(chart));
  }
  clearCandidates.sort((left, right) => {
    if (left.officialLevel !== 12 || right.officialLevel !== 12) return left.effectiveDifficulty - right.effectiveDifficulty || stable(left, right);
    return sortByEreter("ec")(left, right);
  });
  const clearTargets = clearCandidates.slice(0, TRAINING_LIMITS.clear).map(chart => recommendation(chart, "CLEAR_TARGET", mode === "INITIAL" ? "INITIAL_BAND" : "MAIN_BAND", targetLamp(chart), chart.officialLevel === 12 ? ereterValue(chart, "ec") : null));

  let cleanupCandidates: TrainingChart[] = [];
  if (mode === "PERFORMANCE" && mainBand !== null) {
    cleanupCandidates = charts.filter(chart => chart.officialLevel === phase && chart.effectiveDifficulty < mainBand! && (phase !== 12 || chart.effectiveDifficulty >= 12) && !achieved(chart));
    cleanupCandidates.sort((left, right) => right.effectiveDifficulty - left.effectiveDifficulty || (phase === 12 ? sortByEreter("ec")(left, right) : stable(left, right)));
  }
  const cleanupTargets = cleanupCandidates.slice(0, TRAINING_LIMITS.cleanup).map(chart => recommendation(chart, "CLEANUP", "LOWER_BAND", targetLamp(chart), phase === 12 ? ereterValue(chart, "ec") : null));

  const hardScope = mode === "INITIAL" ? initialCharts : charts;
  const hardCandidates = phase === 12 ? hardScope.filter(chart => chart.officialLevel === 12 && (chart.currentLamp === "EASY_CLEAR" || chart.currentLamp === "CLEAR")).sort(sortByEreter("hc")) : [];
  const hardTargets = hardCandidates.slice(0, TRAINING_LIMITS.hard).map(chart => recommendation(chart, "HARD_TARGET", "HARD_UPGRADE", "HARD_CLEAR", ereterValue(chart, "hc")));
  const exhCandidates = phase === 12 ? hardScope.filter(chart => chart.officialLevel === 12 && chart.currentLamp === "HARD_CLEAR").sort(sortByEreter("exh")) : [];
  const exhTargets = exhCandidates.slice(0, TRAINING_LIMITS.exh).map(chart => recommendation(chart, "EXH_TARGET", "EXH_UPGRADE", "EX_HARD_CLEAR", ereterValue(chart, "exh")));

  const strongAttributes = getStrongAttributes(input.player.notesRadar);
  let challengeCandidates: Array<{ chart: TrainingChart; score: number }> = [];
  if (mainBand !== null && mainBand < 12.7 && strongAttributes.length === 2) {
    const challengeBand = roundDifficultyToTenths(mainBand + 0.1);
    let scope = charts.filter(chart => sameBand(chart.effectiveDifficulty, challengeBand));
    if (mode === "PERFORMANCE" && phase === 12) scope = scope.filter(chart => chart.officialLevel === 12);
    else if (mode === "PERFORMANCE" && phase === 11) scope = scope.filter(chart => chart.officialLevel === 11 || (chart.officialLevel === 12 && chart.effectiveDifficulty < 12));
    else if (mode === "PERFORMANCE") scope = scope.filter(chart => chart.officialLevel === phase);
    challengeCandidates = scope.filter(chart => !achieved(chart) && radar.has(chart.chartId)).map(chart => ({ chart, score: strongAttributes.reduce((sum, attribute) => sum + radar.get(chart.chartId)!.values[attribute], 0) / 2 }));
    challengeCandidates.sort((left, right) => {
      if (phase === 11 && left.chart.officialLevel !== right.chart.officialLevel) return left.chart.officialLevel === 11 ? -1 : 1;
      return right.score - left.score || stable(left.chart, right.chart);
    });
  }
  const challengeTargets = challengeCandidates.slice(0, TRAINING_LIMITS.challenge).map(({ chart, score }) => recommendation(chart, "CHALLENGE", "STRONG_ATTRIBUTE", targetLamp(chart), null, score, [...strongAttributes]));

  let attributePracticeCandidates: Array<{ chart: TrainingChart; diff: number; above: boolean; current: boolean; value: number }> = [];
  if (mainBand !== null && input.player.notesRadar && input.selectedAttribute) {
    const attribute = input.selectedAttribute;
    const playerValue = input.player.notesRadar[attribute];
    const allowed = [roundDifficultyToTenths(mainBand - 0.1), mainBand, roundDifficultyToTenths(mainBand + 0.1)];
    attributePracticeCandidates = charts.filter(chart => allowed.some(band => sameBand(chart.effectiveDifficulty, band)) && radar.has(chart.chartId)).map(chart => { const value = radar.get(chart.chartId)!.values[attribute]; return { chart, value, diff: Math.abs(value - playerValue), above: value >= playerValue, current: sameBand(chart.effectiveDifficulty, mainBand!) }; });
    attributePracticeCandidates.sort((left, right) => left.diff - right.diff || Number(right.above) - Number(left.above) || Number(right.current) - Number(left.current) || stable(left.chart, right.chart));
  }
  const attributePracticeTargets = attributePracticeCandidates.slice(0, TRAINING_LIMITS.attributePractice).map(({ chart, value }) => recommendation(chart, "ATTRIBUTE_PRACTICE", "ATTRIBUTE_MATCH", targetLamp(chart), null, value, input.selectedAttribute ? [input.selectedAttribute] : []));

  return { playerId: input.player.playerId, mode, initialRange, coverage, phase, mainBand, officialProgress, level12Progress, introductionBands, strongAttributes, attributePracticeAvailable: input.player.notesRadar !== null, recommendations: { clearTargets, cleanupTargets, hardTargets, exhTargets, challengeTargets, attributePracticeTargets } };
}
