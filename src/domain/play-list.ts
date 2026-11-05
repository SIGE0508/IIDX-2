import type { PlayListEntry, Player } from "./types";

export const PLAY_LIST_LIMIT = 5;
export const PLAY_LIST_MEMO_LIMIT = 100;
export const countMemoCodePoints = (memo: string): number => Array.from(memo).length;
export function assertPlayList(value: unknown): asserts value is PlayListEntry[] {
  if (!Array.isArray(value) || value.length > PLAY_LIST_LIMIT) throw new Error("NEXT PLAYは最大5譜面です。");
  const ids = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || typeof entry.chartId !== "string" || !entry.chartId.trim()
      || typeof entry.memo !== "string" || countMemoCodePoints(entry.memo) > PLAY_LIST_MEMO_LIMIT)
      throw new Error("NEXT PLAYの譜面IDまたはメモが不正です。メモは100文字以内です。");
    if (ids.has(entry.chartId)) throw new Error("この譜面はNEXT PLAYに登録済みです。");
    ids.add(entry.chartId);
  }
}
export const playerPlayList = (player: Player): readonly PlayListEntry[] => player.playList ?? [];
export type PlayListChange =
  | { type: "add"; chartId: string }
  | { type: "memo"; chartId: string; memo: string }
  | { type: "remove"; chartId: string };
/** Pure mutation plan; the repository applies it to the latest Player in one transaction. */
export function changePlayList(player: Player, change: PlayListChange, now: string): Player {
  if (!["add", "memo", "remove"].includes(change.type)) throw new Error("NEXT PLAYの操作が不正です。");
  const entries = playerPlayList(player).map(entry => ({ ...entry }));
  assertPlayList(entries);
  const index = entries.findIndex(entry => entry.chartId === change.chartId);
  if (change.type === "add") {
    if (index >= 0) throw new Error("この譜面はNEXT PLAYに登録済みです。");
    if (entries.length >= PLAY_LIST_LIMIT) throw new Error("NEXT PLAYは最大5譜面です。先に削除してください。");
    entries.push({ chartId: change.chartId, memo: "" });
  } else {
    if (index < 0) throw new Error("この譜面は既にNEXT PLAYから削除されています。");
    if (change.type === "memo") entries[index] = { ...entries[index], memo: change.memo };
    else entries.splice(index, 1);
  }
  assertPlayList(entries);
  return { ...player, playList: entries, updatedAt: now };
}
