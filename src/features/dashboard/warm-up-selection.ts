import { WARM_UP_ROLES, type WarmUpCandidate, type WarmUpPool } from "../../training/warm-up";
import { meetsLamp } from "../../domain/constants";

const POOL_LIMIT = 30;
const HISTORY_LIMIT = 3;
const RANK_DECAY = 10;
const BP_GAP_SCALE = 0.005; // A 0.5 percentage-point gap halves the BP weight.

export interface WarmUpState {
  key: string;
  playerId: string | undefined;
  items: WarmUpCandidate[];
  history: string[][];
  displayed: boolean;
}
export const createWarmUpState = (): WarmUpState => ({ key: "", playerId: undefined, items: [], history: [], displayed: false });

type Assignment = { items: WarmUpCandidate[]; cost: number[] };
const better = (left: Assignment, right: Assignment): boolean => {
  for (let i = 0; i < left.cost.length; i++) if (left.cost[i] !== right.cost[i]) return left.cost[i] < right.cost[i];
  return false;
};

function weightedCost(rank: number, gap: number, random: () => number): number {
  const weight = Math.exp(-rank / RANK_DECAY) / (1 + gap / BP_GAP_SCALE);
  // Independent exponential draws put an item first with probability proportional to its weight.
  return -Math.log1p(-random()) / weight;
}

/** Maximize filled roles, then minimize overlap while choosing from each role's best 30. */
export function selectWarmUp(
  pool: WarmUpPool,
  nextIds: readonly string[],
  recentIds: readonly string[] = [],
  random: () => number = Math.random,
  currentIds: readonly string[] = [],
): WarmUpCandidate[] {
  const next = new Set(nextIds), recent = new Set(recentIds), current = new Set(currentIds);
  const byChart = new Map<string, { item: WarmUpCandidate; bit: number; cost: number[] }[]>();
  for (const [index, role] of WARM_UP_ROLES.entries()) {
    const candidates = pool.roles[role].slice(0, POOL_LIMIT);
    const bestBp = candidates[0]?.bpRate ?? null;
    let bpGap = 0;
    candidates.forEach((item, rank) => {
      // Missing BP and lower quality tiers must not reverse the existing ranking.
      if (bestBp !== null && item.bpRate !== null) bpGap = Math.max(bpGap, item.bpRate - bestBp);
      const options = byChart.get(item.chartId) ?? [];
      const cost = [
        Number(recent.has(item.chartId)),
        Number(current.has(item.chartId)),
        Number(next.has(item.chartId)),
        Number(item.difficulty === null),
        Number(role === "ACCURACY" && !meetsLamp(item.currentLamp, "HARD_CLEAR")),
        weightedCost(rank, bpGap, random),
      ];
      options.push({ item, bit: 1 << index, cost });
      byChart.set(item.chartId, options);
    });
  }
  const empty: Assignment = { items: [], cost: [0, 0, 0, 0, 0, 0] };
  let states = new Map<number, Assignment>([[0, empty]]);
  for (const options of byChart.values()) {
    const updated = new Map(states);
    for (const [mask, assignment] of states) for (const { item, bit, cost } of options) {
      if (mask & bit) continue;
      const candidate = { items: [...assignment.items, item], cost: assignment.cost.map((value, i) => value + cost[i]) };
      const current = updated.get(mask | bit);
      if (!current || better(candidate, current)) updated.set(mask | bit, candidate);
    }
    states = updated;
  }
  let best = empty;
  for (const candidate of states.values()) if (candidate.items.length > best.items.length
    || (candidate.items.length === best.items.length && better(candidate, best))) best = candidate;
  return [...best.items].sort((a, b) => WARM_UP_ROLES.indexOf(a.role) - WARM_UP_ROLES.indexOf(b.role));
}

export function synchronizeWarmUp(state: WarmUpState, playerId: string | undefined, pool: WarmUpPool, nextIds: readonly string[], random: () => number = Math.random): WarmUpState {
  // NEXT's current draw is intentionally not part of the key.
  const key = JSON.stringify([playerId ?? null, pool]);
  if (key === state.key) return state;
  const eligible = new Set(WARM_UP_ROLES.flatMap(role => pool.roles[role].map(item => item.chartId)));
  const history = playerId === state.playerId ? state.history.map(ids => ids.filter(id => eligible.has(id))) : [];
  return { key, playerId, items: selectWarmUp(pool, nextIds, history.flat(), random), history, displayed: false };
}

export function recordWarmUpDisplay(state: WarmUpState): WarmUpState {
  if (state.displayed || !state.items.length) return state;
  const ids = state.items.map(item => item.chartId);
  return { ...state, displayed: true, history: [...state.history, ids].slice(-HISTORY_LIMIT) };
}

function drawReplacement(state: WarmUpState, pool: WarmUpPool, nextIds: readonly string[], random: () => number): WarmUpCandidate[] {
  const displayed = recordWarmUpDisplay(state);
  return selectWarmUp(pool, nextIds, displayed.history.flat(), random, state.items.map(item => item.chartId));
}

export function canReplaceWarmUp(state: WarmUpState, pool: WarmUpPool, nextIds: readonly string[]): boolean {
  return drawReplacement(state, pool, nextIds, () => 0.5).some(item => !state.items.some(current => current.chartId === item.chartId));
}

export function replaceWarmUp(state: WarmUpState, pool: WarmUpPool, nextIds: readonly string[], random: () => number = Math.random): WarmUpState {
  if (!canReplaceWarmUp(state, pool, nextIds)) return state;
  return { ...recordWarmUpDisplay(state), items: drawReplacement(state, pool, nextIds, random), displayed: false };
}
