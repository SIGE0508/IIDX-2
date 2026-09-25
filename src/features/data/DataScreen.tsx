import { useState } from "react";

type TextAction = (text: string) => Promise<string>;

export function DataScreen({ onOfficial, onTracker, onTrackerExport, onBackup, onRestore }: {
  onOfficial: TextAction;
  onTracker: TextAction;
  onTrackerExport: () => Promise<void>;
  onBackup: () => Promise<void>;
  onRestore: TextAction;
}) {
  const [message, setMessage] = useState("");
  const [officialText, setOfficialText] = useState("");
  const [trackerText, setTrackerText] = useState("");
  const run = (action: TextAction, text: string) => void action(text).then(setMessage).catch(error => setMessage(String(error)));
  const read = (file: File | null, action: TextAction) => { if (file) void file.text().then(action).then(setMessage).catch(error => setMessage(String(error))); };

  return <section>
    <h2>DATA</h2>
    <label>公式CSVファイル<input type="file" accept=".csv,text/csv" onChange={event => read(event.target.files?.[0] ?? null, onOfficial)} /></label>
    <details><summary>公式CSVを貼り付ける</summary><textarea value={officialText} onChange={event => setOfficialText(event.target.value)} /><button disabled={!officialText} onClick={() => run(onOfficial, officialText)}>貼り付け内容を確認</button></details>
    <label>CLEAR TRACKER CSVファイル<input type="file" accept=".csv,text/csv" onChange={event => read(event.target.files?.[0] ?? null, onTracker)} /></label>
    <details><summary>CLEAR TRACKER CSVを貼り付ける</summary><textarea value={trackerText} onChange={event => setTrackerText(event.target.value)} /><button disabled={!trackerText} onClick={() => run(onTracker, trackerText)}>貼り付け内容を確認</button></details>
    <button onClick={() => void onTrackerExport()}>CLEAR TRACKER CSVを書き出す</button>
    <button onClick={() => void onBackup()}>バックアップを作成</button>
    <label>バックアップ復元<input type="file" accept=".json,application/json" onChange={event => read(event.target.files?.[0] ?? null, onRestore)} /></label>
    <output>{message}</output>
  </section>;
}
