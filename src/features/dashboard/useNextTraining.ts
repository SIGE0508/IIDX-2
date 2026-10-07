import { useState } from "react";
import type { TrainingRecommendation } from "../../training/types";
import { selectNextTraining, synchronizeNextTraining, type NextTrainingState } from "./next-training";

/** Kept at App level so navigation/QUICK INPUT cannot discard the selection. */
export function useNextTraining(playerId: string | undefined, candidates: readonly TrainingRecommendation[]) {
  const [stored, setStored] = useState<NextTrainingState>({ key: "", items: [] });
  const current = synchronizeNextTraining(stored, playerId, candidates);
  // React restarts this render when the candidate content changes; no stale set
  // is displayed while waiting for an effect after a PLAYER/data update.
  if (current !== stored) setStored(current);
  const replace = () => setStored(previous => ({
    key: current.key,
    items: selectNextTraining(candidates, previous.key === current.key ? previous.items : []),
  }));
  return { items: current.items, replace };
}
