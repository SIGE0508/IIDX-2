import { useEffect, useState } from "react";
import type { WarmUpPool } from "../../training/warm-up";
import { canReplaceWarmUp, createWarmUpState, recordWarmUpDisplay, replaceWarmUp, synchronizeWarmUp } from "./warm-up-selection";

/** Only draws shown on HOME enter the in-memory history. */
export function useWarmUp(playerId: string | undefined, pool: WarmUpPool, nextIds: readonly string[], visible: boolean) {
  const [stored, setStored] = useState(createWarmUpState);
  const current = synchronizeWarmUp(stored, playerId, pool, nextIds);
  if (current !== stored) setStored(current);
  useEffect(() => {
    if (visible) setStored(previous => recordWarmUpDisplay(previous));
  }, [visible, current.key, current.items]);
  const replace = () => setStored(previous => replaceWarmUp(synchronizeWarmUp(previous, playerId, pool, nextIds), pool, nextIds));
  return { items: current.items, replace, canReplace: canReplaceWarmUp(current, pool, nextIds) };
}
