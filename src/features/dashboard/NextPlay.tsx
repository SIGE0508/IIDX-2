import { useEffect, useState } from "react";
import { countMemoCodePoints, PLAY_LIST_LIMIT, PLAY_LIST_MEMO_LIMIT } from "../../domain/play-list";
import type { PlayListEntry, PlayerChartRecord } from "../../domain/types";
import type { MasterSet } from "../../master/types";

export interface NextPlayActions {
  entries: readonly PlayListEntry[]; busy: boolean; onAdd: (chartId: string) => void;
}
export interface NextPlayController extends NextPlayActions {
  playerId: string;
  onMemo: (chartId: string, memo: string) => Promise<boolean>;
  onRemove: (chartId: string) => void;
}
export function NextPlayAddButton({ chartId, label, actions }: { chartId: string; label: string; actions: NextPlayActions }) {
  const registered = actions.entries.some(entry => entry.chartId === chartId), full = actions.entries.length >= PLAY_LIST_LIMIT;
  return <button type="button" className="secondary next-play-add" disabled={actions.busy || registered || full}
    aria-label={label + (registered ? "はNEXT PLAYに登録済み" : "をNEXT PLAYに追加")}
    onClick={() => actions.onAdd(chartId)}>
    {registered ? "登録済み" : full ? "上限5件" : actions.busy ? "保存中…" : "NEXT PLAYに追加"}
  </button>;
}
function NextPlayRow({ entry, master, records, controller, onSelect }: {
  entry: PlayListEntry; master: MasterSet; records: ReadonlyMap<string, PlayerChartRecord>;
  controller: NextPlayController; onSelect: (chartId: string) => void;
}) {
  const [memo, setMemo] = useState(entry.memo);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setMemo(entry.memo); }, [entry.memo, editing]);
  const chart = master.chartMaster.charts.find(chart => chart.chartId === entry.chartId);
  const song = master.chartMaster.songs.find(song => song.songId === chart?.songId);
  const difficulty = master.unofficial.records.find(row => row.chartId === entry.chartId)?.difficulty;
  const label = (song?.title ?? entry.chartId) + (chart ? " " + chart.chartType : "");
  const count = countMemoCodePoints(memo), tooLong = count > PLAY_LIST_MEMO_LIMIT;
  const memoId = "next-play-memo-" + entry.chartId, countId = memoId + "-count";
  return <div className="next-play-row" data-chart-id={entry.chartId}>
    <button type="button" className="chart-line" disabled={!chart || chart.availability === "unavailable"}
      onClick={() => onSelect(entry.chartId)}>
      <span><strong>{label}</strong> {chart && <small>☆{chart.officialLevel} / {difficulty == null ? "非公式 —" : difficulty.toFixed(1)}</small>}</span>
      <span>{(records.get(entry.chartId)?.clearLamp ?? "NO_PLAY").replaceAll("_", " ")}</span>
    </button>
    {(!chart || chart.availability === "unavailable") && <p className="hint">現在選曲できない譜面です。メモ編集・削除は可能です。</p>}
    <label htmlFor={memoId}>{label}のメモ</label>
    <textarea id={memoId} rows={2} value={memo} disabled={controller.busy}
      aria-describedby={countId} aria-invalid={tooLong}
      onChange={event => { setEditing(true); setMemo(event.target.value); }} />
    <p id={countId} className={tooLong ? "next-play-error" : "hint"}>{count} / {PLAY_LIST_MEMO_LIMIT}文字{tooLong ? "（100文字以内で入力してください）" : ""}</p>
    <div className="buttons">
      <button type="button" disabled={controller.busy || tooLong || memo === entry.memo}
        onClick={() => { void controller.onMemo(entry.chartId, memo).then(saved => { if (saved) setEditing(false); }); }}>メモを保存</button>
      <button type="button" className="secondary" disabled={controller.busy}
        onClick={() => controller.onRemove(entry.chartId)}>削除</button>
    </div>
  </div>;
}
export function NextPlaySection({ master, records, controller, onSelect }: {
  master: MasterSet; records: ReadonlyMap<string, PlayerChartRecord>; controller: NextPlayController;
  onSelect: (chartId: string) => void;
}) {
  return <section className="next-play" aria-labelledby="next-play-title">
    <div className="section-title"><h2 id="next-play-title">NEXT PLAY</h2><p>{controller.entries.length} / {PLAY_LIST_LIMIT}譜面</p></div>
    {controller.entries.length === 0 && <p className="hint">TRACKER・NEXT TRAINING・WARM UPから、次にプレイしたい譜面を登録できます。</p>}
    {controller.entries.map(entry => <NextPlayRow key={controller.playerId + "/" + entry.chartId}
      entry={entry} master={master} records={records} controller={controller} onSelect={onSelect} />)}
  </section>;
}
