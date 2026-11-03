import type { HomeRecommendation } from "../../training/home-candidates";

export interface NextTrainingState {
  key: string; playerId: string | null; items: HomeRecommendation[];
  /** Oldest to newest; a set is recorded only after actual HOME display. */
  history: string[][]; displayed: boolean;
}
export const createNextTrainingState = (): NextTrainingState => ({ key: "", playerId: null, items: [], history: [], displayed: false });
export function selectNextTraining(candidates: readonly HomeRecommendation[], history: readonly (readonly string[])[] = [], random: () => number = Math.random): HomeRecommendation[] {
  const unique = [...new Map(candidates.map(item => [item.chartId, item])).values()];
  const lastSeen = new Map<string, number>();
  history.slice(-3).forEach((batch, index) => batch.forEach(id => lastSeen.set(id, index)));
  const tiers = new Map<number, HomeRecommendation[]>();
  for (const item of unique) {
    const age = lastSeen.get(item.chartId) ?? -1, list = tiers.get(age) ?? [];
    list.push(item); tiers.set(age, list);
  }
  const result: HomeRecommendation[] = [], usedGoals = new Set<string>();
  // Recency wins over diversity; the one-challenge quota can exhaust a tier.
  for (const age of [...tiers.keys()].sort((a, b) => a - b)) {
    const tier = tiers.get(age)!;
    for (let i = tier.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [tier[i], tier[j]] = [tier[j], tier[i]]; }
    while (result.length < 3) {
      const available = tier.filter(item => !result.some(picked => picked.chartId === item.chartId)
        && (item.goal !== "CHALLENGE" || !usedGoals.has("CHALLENGE")));
      if (!available.length) break;
      const next = available.find(item => !usedGoals.has(item.goal)) ?? available[0];
      result.push(next); usedGoals.add(next.goal);
    }
    if (result.length === 3) break;
  }
  return result;
}
export function synchronizeNextTraining(state: NextTrainingState, playerId: string | undefined, candidates: readonly HomeRecommendation[], random: () => number = Math.random): NextTrainingState {
  const key = JSON.stringify([playerId ?? null, candidates]);
  if (state.key === key) return state;
  const history = state.playerId === (playerId ?? null) ? state.history : [];
  return { key, playerId: playerId ?? null, items: selectNextTraining(candidates, history, random), history, displayed: false };
}
export function recordNextTrainingDisplay(state: NextTrainingState): NextTrainingState {
  if (state.displayed || state.items.length === 0) return state;
  return { ...state, displayed: true, history: [...state.history, state.items.map(item => item.chartId)].slice(-3) };
}
export function canReplaceNextTraining(state: NextTrainingState, candidates: readonly HomeRecommendation[]): boolean {
  return candidates.some(item => !state.items.some(current => current.chartId === item.chartId));
}
export function replaceNextTraining(state: NextTrainingState, candidates: readonly HomeRecommendation[], random: () => number = Math.random): NextTrainingState {
  if (!canReplaceNextTraining(state, candidates)) return state;
  const displayed = recordNextTrainingDisplay(state);
  return { ...displayed, items: selectNextTraining(candidates, displayed.history, random), displayed: false };
}
