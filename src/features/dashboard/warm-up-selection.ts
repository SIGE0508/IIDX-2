import { WARM_UP_ROLES, type WarmUpCandidate, type WarmUpPool } from "../../training/warm-up";
import { meetsLamp } from "../../domain/constants";

export interface WarmUpState { key: string; items: WarmUpCandidate[]; }
export const createWarmUpState = (): WarmUpState => ({ key: "", items: [] });
type Assignment = { items: WarmUpCandidate[]; cost: number[] };
const better = (left: Assignment, right: Assignment): boolean => {
  for (let i = 0; i < left.cost.length; i++) if (left.cost[i] !== right.cost[i]) return left.cost[i] < right.cost[i];
  return false;
};
/** 3-role matching in O(charts * 8 * 3), so a scarce role cannot be blocked by a shared chart. */
export function selectWarmUp(pool: WarmUpPool, nextIds: readonly string[], previousIds: readonly string[] = [], random: () => number = Math.random): WarmUpCandidate[] {
  const next = new Set(nextIds), previous = new Set(previousIds);
  const byChart = new Map<string, { item: WarmUpCandidate; rank: number }[]>();
  for (const role of WARM_UP_ROLES) pool.roles[role].forEach((item, rank) => {
    const options = byChart.get(item.chartId) ?? [];
    options.push({ item, rank }); byChart.set(item.chartId, options);
  });
  let states = new Map<number, Assignment>([[0, { items: [], cost: [0, 0, 0, 0, 0] }]]);
  for (const options of byChart.values()) {
    const updated = new Map(states);
    for (const [mask, assignment] of states) for (const { item, rank } of options) {
      const bit = 1 << WARM_UP_ROLES.indexOf(item.role);
      if (mask & bit) continue;
      // Fill roles first; then avoid NEXT, previous charts, unknown bands and CLEAR-only accuracy.
      const addition = [Number(next.has(item.chartId)), Number(previous.has(item.chartId)),
        Number(item.difficulty === null), Number(item.role === "ACCURACY" && !meetsLamp(item.currentLamp, "HARD_CLEAR")),
        rank + random() * 3];
      const candidate = { items: [...assignment.items, item], cost: assignment.cost.map((cost, i) => cost + addition[i]) };
      const current = updated.get(mask | bit);
      if (!current || better(candidate, current)) updated.set(mask | bit, candidate);
    }
    states = updated;
  }
  let best: Assignment = { items: [], cost: [0, 0, 0, 0, 0] };
  for (const candidate of states.values()) if (candidate.items.length > best.items.length
    || (candidate.items.length === best.items.length && better(candidate, best))) best = candidate;
  return [...best.items].sort((a, b) => WARM_UP_ROLES.indexOf(a.role) - WARM_UP_ROLES.indexOf(b.role));
}
export function synchronizeWarmUp(state: WarmUpState, playerId: string | undefined, pool: WarmUpPool, nextIds: readonly string[], random: () => number = Math.random): WarmUpState {
  // NEXT's current draw is intentionally not part of the key.
  const key = JSON.stringify([playerId ?? null, pool]);
  return key === state.key ? state : { key, items: selectWarmUp(pool, nextIds, [], random) };
}
export function canReplaceWarmUp(state: WarmUpState, pool: WarmUpPool, nextIds: readonly string[]): boolean {
  const ids = state.items.map(item => item.chartId);
  return selectWarmUp(pool, nextIds, ids, () => 0.5).some(item => !ids.includes(item.chartId));
}
export function replaceWarmUp(state: WarmUpState, pool: WarmUpPool, nextIds: readonly string[], random: () => number = Math.random): WarmUpState {
  return canReplaceWarmUp(state, pool, nextIds) ? { ...state, items: selectWarmUp(pool, nextIds, state.items.map(item => item.chartId), random) } : state;
}
