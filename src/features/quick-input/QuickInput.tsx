import { useEffect, useMemo, useState } from "react";
import { CLEAR_LAMPS } from "../../domain/constants";
import { maximumScore } from "../../domain/score";
import type { ChartMaster, ClearLamp, PlayerChartRecord } from "../../domain/types";

export interface QuickChartChoice { chart: ChartMaster; title: string; }
const lampLabel = (lamp: ClearLamp) => lamp.replaceAll("_", " ");

export function QuickInput({ charts, records, selectedChartId, onSave, onCancel }: {
  charts: readonly QuickChartChoice[];
  records: ReadonlyMap<string, PlayerChartRecord>;
  selectedChartId?: string;
  onSave: (chart: ChartMaster, lamp: ClearLamp, score: number | undefined, bp: number | undefined) => Promise<void>;
  onCancel?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [songId, setSongId] = useState("");
  const [chartId, setChartId] = useState(selectedChartId ?? "");
  const [lamp, setLamp] = useState<ClearLamp>("EASY_CLEAR");
  const [scoreText, setScoreText] = useState("");
  const [bpText, setBpText] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { if (selectedChartId) setChartId(selectedChartId); }, [selectedChartId]);
  const selected = charts.find(item => item.chart.chartId === chartId)?.chart;
  useEffect(() => {
    if (!selected) return;
    setSongId(selected.songId); const record = records.get(selected.chartId);
    setLamp(record?.clearLamp ?? "NO_PLAY"); setScoreText(""); setBpText("");
  }, [chartId, selected?.chartId]);
  const songs = useMemo(() => [...new Map(charts.map(item => [item.chart.songId, item.title])).entries()]
    .filter(([, title]) => !query.trim() || title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => a[1].localeCompare(b[1], "ja")), [charts, query]);
  const songCharts = charts.filter(item => item.chart.songId === songId).sort((a, b) => a.chart.chartType.localeCompare(b.chart.chartType));
  const maxScore = selected ? maximumScore(selected) : null;
  const existing = selected ? records.get(selected.chartId) : undefined;
  const validInteger = (value: string) => value === "" || /^\d+$/.test(value);
  const scoreValid = validInteger(scoreText) && (maxScore === null || scoreText === "" || Number(scoreText) <= maxScore);
  const bpValid = validInteger(bpText);
  const save = () => {
    if (!selected || !scoreValid || !bpValid) return;
    setMessage("");
    void onSave(selected, lamp, scoreText === "" ? undefined : Number(scoreText), bpText === "" ? undefined : Number(bpText))
      .then(() => setMessage("更新しました"))
      .catch(error => setMessage(error instanceof Error ? error.message : String(error)));
  };
  return <section className="quick-input">
    <div className="section-title"><h2>QUICK INPUT</h2>{onCancel && <button className="secondary" onClick={onCancel}>戻る</button>}</div>
    <label>曲名検索<input type="search" value={query} onChange={event => { setQuery(event.target.value); setSongId(""); setChartId(""); }} placeholder="曲名を入力" /></label>
    <label>曲名<select value={songId} onChange={event => { setSongId(event.target.value); setChartId(""); }}><option value="">選択してください</option>{songs.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>
    <label>譜面種別<select value={chartId} onChange={event => setChartId(event.target.value)} disabled={!songId}><option value="">選択してください</option>{songCharts.map(item => <option key={item.chart.chartId} value={item.chart.chartId}>{item.chart.chartType} / ☆{item.chart.officialLevel}</option>)}</select></label>
    {selected && <>
      <label>クリアランプ<select value={lamp} onChange={event => setLamp(event.target.value as ClearLamp)}>{CLEAR_LAMPS.map(value => <option key={value} value={value}>{lampLabel(value)}</option>)}</select></label>
      <label>SCORE（空欄は変更なし）<input inputMode="numeric" max={maxScore ?? undefined} value={scoreText} onChange={event => setScoreText(event.target.value)} /></label>
      <p className="hint">SCORE: 現在値 {existing?.score ?? "未登録"} / 最大値 {maxScore ?? "Notes未登録のため上限なし"}。現在値より高い値だけ更新します。</p>
      <label>BP（空欄は変更なし）<input inputMode="numeric" value={bpText} onChange={event => setBpText(event.target.value)} /></label>
      <p className="hint">BP: 現在値 {existing?.bp ?? "未登録"}。現在値より低い値だけ更新します。</p>
    </>}
    {!scoreValid && <p role="alert">SCOREは最大値 {maxScore} 以下の整数で入力してください。</p>}
    {!bpValid && <p role="alert">BPは0以上の整数で入力してください。</p>}
    <button onClick={save} disabled={!selected || !scoreValid || !bpValid}>保存</button>
    <output>{message}</output>
  </section>;
}
