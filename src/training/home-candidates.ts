import type { ClearLamp, Player } from "../domain/types";
import type { TrainingCalculation, TrainingCategory, TrainingReason, TrainingRecommendation } from "./types";

export const HOME_POOL_LIMIT = 30;
export const HOME_GOALS = ["EASY", "CLEAR", "HARD", "EXH", "CHALLENGE"] as const;
export type HomeGoal = (typeof HOME_GOALS)[number];
export type HomeReason = TrainingReason | "NORMAL_UPGRADE" | "HC_PERSONAL" | "HC_LOWER";
export interface HomeGoalOption extends Omit<TrainingRecommendation, "category" | "reason"> {
  category: TrainingCategory | "NORMAL_TARGET"; reason: HomeReason; goal: HomeGoal; priority: number;
}
export interface HomeRecommendation {
  chartId: string; officialLevel: number; effectiveDifficulty: number; currentLamp: ClearLamp;
  targetLamp: ClearLamp; goal: HomeGoal; reasons: HomeReason[];
  /** Retain all eligible source categories/reasons, including alternate goals. */
  options: HomeGoalOption[];
}
export function resolveHomeTarget(options: readonly HomeGoalOption[], mainBand: number, personal: number | null, peerHc: readonly number[]): { option: HomeGoalOption; reason?: HomeReason } {
  const normal = options.find(option => option.goal === "CLEAR"), hard = options.find(option => option.goal === "HARD");
  if (normal && hard && normal.currentLamp === "EASY_CLEAR") {
    if (personal !== null && hard.ereterValue !== null && hard.ereterValue <= personal) return { option: hard, reason: "HC_PERSONAL" };
    // Include all ties at the boundary; chartId cannot make a tied HC easier.
    if (hard.effectiveDifficulty < mainBand && hard.ereterValue !== null && peerHc.length >= 4
      && peerHc.filter(value => value <= hard.ereterValue!).length <= Math.floor(peerHc.length / 2)) return { option: hard, reason: "HC_LOWER" };
    return { option: normal };
  }
  return { option: options[0] };
}
export function buildHomeCandidatePool(player: Player, calculation: TrainingCalculation): HomeRecommendation[] {
  const { training, candidates, charts, ereter } = calculation;
  if (training.mainBand === null) return [];
  const mainBand = training.mainBand, byId = new Map<string, HomeGoalOption[]>(), peers = new Map<number, number[]>();
  for (const chart of charts) {
    const hc = ereter.get(chart.chartId)?.hc;
    if (chart.officialLevel !== 12 || hc == null) continue;
    const band = Math.round(chart.effectiveDifficulty * 10), list = peers.get(band) ?? [];
    list.push(hc); peers.set(band, list);
  }
  const priority = new Map<HomeGoal, number>();
  const add = (item: Omit<HomeGoalOption, "priority">) => {
    const options = byId.get(item.chartId) ?? [];
    if (options.some(option => option.goal === item.goal && option.category === item.category && option.reason === item.reason)) return;
    const position = priority.get(item.goal) ?? 0;
    options.push({ ...item, priority: position }); priority.set(item.goal, position + 1); byId.set(item.chartId, options);
  };
  for (const key of ["clearTargets", "cleanupTargets", "hardTargets", "exhTargets", "challengeTargets"] as const) for (const item of candidates[key]) {
    const challenge = key === "challengeTargets";
    if (!challenge && item.effectiveDifficulty > mainBand) continue;
    const goal: HomeGoal = challenge ? "CHALLENGE" : item.targetLamp === "EASY_CLEAR" ? "EASY"
      : item.targetLamp === "HARD_CLEAR" ? "HARD" : item.targetLamp === "EX_HARD_CLEAR" ? "EXH" : "CLEAR";
    add({ ...item, goal });
  }
  // EC is not a normal-CLEAR metric. Rank new CLEAR targets by nearby band.
  const normal = charts.filter(chart => chart.officialLevel === 12 && chart.currentLamp === "EASY_CLEAR" && chart.effectiveDifficulty <= mainBand)
    .sort((a, b) => b.effectiveDifficulty - a.effectiveDifficulty || a.chartId.localeCompare(b.chartId));
  for (const chart of normal) add({
    chartId: chart.chartId, officialLevel: chart.officialLevel, effectiveDifficulty: chart.effectiveDifficulty,
    currentLamp: chart.currentLamp, targetLamp: "CLEAR", goal: "CLEAR", category: "NORMAL_TARGET",
    reason: "NORMAL_UPGRADE", ereterValue: null, radarScore: null, matchedAttributes: [],
  });
  const groups = new Map<HomeGoal, Array<{ item: HomeRecommendation; priority: number }>>(HOME_GOALS.map(goal => [goal, []]));
  for (const options of byId.values()) {
    const selected = resolveHomeTarget(options, mainBand, player.ereterOverall, peers.get(Math.round(options[0].effectiveDifficulty * 10)) ?? []);
    const option = selected.option;
    const reasons = [...new Set(options.filter(value => value.goal === option.goal).map(value => value.reason))];
    if (selected.reason) reasons.push(selected.reason);
    const item: HomeRecommendation = { chartId: option.chartId, officialLevel: option.officialLevel,
      effectiveDifficulty: option.effectiveDifficulty, currentLamp: option.currentLamp, targetLamp: option.targetLamp,
      goal: option.goal, reasons, options };
    groups.get(option.goal)!.push({ item, priority: option.priority });
  }
  for (const group of groups.values()) group.sort((a, b) => a.priority - b.priority || a.item.chartId.localeCompare(b.item.chartId));
  const result: HomeRecommendation[] = [];
  for (let row = 0; result.length < HOME_POOL_LIMIT; row++) {
    let added = false;
    for (const goal of HOME_GOALS) {
      const next = groups.get(goal)![row]; if (!next) continue;
      result.push(next.item); added = true; if (result.length === HOME_POOL_LIMIT) break;
    }
    if (!added) break;
  }
  return result;
}
