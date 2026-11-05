import { NextPlayAddButton, type NextPlayActions } from "./NextPlay";
import type { ReactNode } from "react";
import type { MasterSet } from "../../master/types";
import { WARM_UP_LABELS, type WarmUpCandidate } from "../../training/warm-up";

export function WarmUpRow({ item, master, onSelect, actions }: {
  item: WarmUpCandidate; master: MasterSet; onSelect: (chartId: string) => void;
  /** Future sibling actions, without nesting buttons inside the chart action. */
  actions?: ReactNode;
}) {
  const chart = master.chartMaster.charts.find(value => value.chartId === item.chartId);
  const song = master.chartMaster.songs.find(value => value.songId === chart?.songId);
  return <div className="warm-up-row" data-chart-id={item.chartId} data-role={item.role}>
    <h3>{WARM_UP_LABELS[item.role]}</h3>
    <div className="warm-up-actions">
      <button type="button" className="chart-line" onClick={() => onSelect(item.chartId)}>
        <span><strong>{song?.title ?? item.chartId}</strong> <small>{chart?.chartType ?? ""} / ☆{item.officialLevel} / {item.difficulty === null ? "非公式 —" : item.difficulty.toFixed(1)}</small></span>
        <span>{item.currentLamp.replaceAll("_", " ")} · {item.reasons.join("・")}</span>
      </button>
      {actions}
    </div>
  </div>;
}
export function WarmUpSection({ items, master, onSelect, onReplace, canReplace, nextPlay }: {
  items: readonly WarmUpCandidate[]; master: MasterSet; onSelect: (chartId: string) => void;
  onReplace: () => void; canReplace: boolean; nextPlay?: NextPlayActions;
}) {
  return <section className="warm-up">
    <div className="section-title"><h2>WARM UP</h2>
      <button type="button" className="secondary" onClick={onReplace} disabled={!canReplace}>↻ 入れ替え</button>
    </div>
    {items.map(item => <WarmUpRow key={item.role} item={item} master={master} onSelect={onSelect} actions={nextPlay ? <NextPlayAddButton chartId={item.chartId} label={(master.chartMaster.songs.find(song => song.songId === master.chartMaster.charts.find(chart => chart.chartId === item.chartId)?.songId)?.title ?? item.chartId)} actions={nextPlay} /> : undefined} />)}
    {items.length === 0 && <p className="hint">現在の条件に合うWARM UP候補はありません。</p>}
    {items.length > 0 && !canReplace && <p className="hint">条件に合う代替候補はありません。</p>}
    <p className="hint">ランプを基準に選曲。BP・Radarは補助情報で、同一プレイの結果とは限りません。</p>
  </section>;
}
