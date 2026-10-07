import type { TrainingRecommendation } from "../../training/types";

/** Select only from the engine's clear-target candidates; never change them. */
export function selectNextTraining(
  candidates: readonly TrainingRecommendation[],
  previous: readonly TrainingRecommendation[] = [],
  random: () => number = Math.random,
): TrainingRecommendation[] {
  const unique = [...new Map(candidates.map(item => [item.chartId, item])).values()];
  const previousIds = new Set(previous.map(item => item.chartId));
  const shuffle = (items: TrainingRecommendation[]) => {
    for (let index = items.length - 1; index > 0; index--) {
      const swap = Math.floor(random() * (index + 1));
      [items[index], items[swap]] = [items[swap], items[index]];
    }
    return items;
  };
  return [
    ...shuffle(unique.filter(item => !previousIds.has(item.chartId))),
    ...shuffle(unique.filter(item => previousIds.has(item.chartId))),
  ].slice(0, 3);
}

export interface NextTrainingState { key: string; items: TrainingRecommendation[]; }
/** Content key avoids changing HOME on unrelated object/state recreation. */
export function synchronizeNextTraining(
  state: NextTrainingState,
  playerId: string | undefined,
  candidates: readonly TrainingRecommendation[],
  random: () => number = Math.random,
): NextTrainingState {
  const key = JSON.stringify([playerId ?? null, candidates]);
  return state.key === key ? state : { key, items: selectNextTraining(candidates, [], random) };
}
