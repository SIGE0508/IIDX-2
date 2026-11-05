import { isCurrentlyPlayableChart, isManagedChart } from "../domain/chart";
import { changePlayList, type PlayListChange } from "../domain/play-list";
import type { Player } from "../domain/types";
import type { MasterSet } from "../master/types";
import type { UserDataRepository } from "../storage/repository";

export async function updatePlayList(repository: UserDataRepository, playerId: string, master: MasterSet, change: PlayListChange, now: string): Promise<Player> {
  if (Number.isNaN(Date.parse(now))) throw new Error("保存日時が不正です。");
  if (change.type === "add") {
    const chart = master.chartMaster.charts.find(chart => chart.chartId === change.chartId);
    if (!chart || !isManagedChart(chart) || !isCurrentlyPlayableChart(chart)) throw new Error("この譜面は現在NEXT PLAYに追加できません。");
  }
  return repository.updatePlayer(playerId, latest => changePlayList(latest, change, now));
}
