import { useState } from "react";
import type { WarmUpPool } from "../../training/warm-up";
import { canReplaceWarmUp, createWarmUpState, replaceWarmUp, synchronizeWarmUp } from "./warm-up-selection";

/** Independent App-level memory; no persistent writes and no NEXT draw as a dependency. */
export function useWarmUp(playerId: string | undefined, pool: WarmUpPool, nextIds: readonly string[]) {
  const [stored, setStored] = useState(createWarmUpState);
  const current = synchronizeWarmUp(stored, playerId, pool, nextIds);
  if (current !== stored) setStored(current);
  const replace = () => setStored(previous => replaceWarmUp(synchronizeWarmUp(previous, playerId, pool, nextIds), pool, nextIds));
  return { items: current.items, replace, canReplace: canReplaceWarmUp(current, pool, nextIds) };
}
