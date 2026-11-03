import { useEffect, useState } from "react";
import type { HomeRecommendation } from "../../training/home-candidates";
import { canReplaceNextTraining, createNextTrainingState, recordNextTrainingDisplay, replaceNextTraining, synchronizeNextTraining } from "./next-training";

/** App-level state survives navigation; only actual HOME displays enter history. */
export function useNextTraining(playerId: string | undefined, candidates: readonly HomeRecommendation[], visible = true) {
  const [stored, setStored] = useState(createNextTrainingState);
  const current = synchronizeNextTraining(stored, playerId, candidates);
  if (current !== stored) setStored(current);
  useEffect(() => {
    if (visible) setStored(previous => recordNextTrainingDisplay(previous));
  }, [visible, current.key, current.items]);
  const replace = () => setStored(previous => replaceNextTraining(synchronizeNextTraining(previous, playerId, candidates), candidates));
  return { items: current.items, replace, canReplace: canReplaceNextTraining(current, candidates) };
}
