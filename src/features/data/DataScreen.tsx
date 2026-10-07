import { useState } from "react";

type TextAction = (text: string) => Promise<string>;

export function DataScreen({ onOfficial, onTracker, onTrackerExport, onBackup, onRestore, playerLabel, onResetScoreBp, onInitializeAll }: {
  playerLabel: string;
  onResetScoreBp: () => Promise<string>;
  onInitializeAll: () => Promise<void>;
  onOfficial: TextAction;
  onTracker: TextAction;
  onTrackerExport: () => Promise<void>;
  onBackup: () => Promise<void>;
  onRestore: TextAction;
}) {
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<"scores" | "all" | null>(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [busy, setBusy] = useState(false);
  const executeReset = async () => {
    if (busy || !confirmation || (confirmation === "all" && confirmationText !== "全データ初期化")) return;
    setBusy(true);
    try {
      if (confirmation === "scores") setMessage(await onResetScoreBp());
      else await onInitializeAll();
      setConfirmation(null); setConfirmationText("");
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  };
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
    <h3>SCORE/BPリセット</h3>
    <p>対象PLAYER：{playerLabel}</p>
    <button disabled={busy} onClick={() => { setConfirmation("scores"); setConfirmationText(""); }}>SCORE/BPリセットを確認</button>
    <h3>全データ初期化</h3>
    <button disabled={busy} onClick={() => { setConfirmation("all"); setConfirmationText(""); }}>全データ初期化を確認</button>
    {confirmation && <div role="region" aria-label="リセットの確認">
      <h3>{confirmation === "scores" ? "SCORE/BPリセットの確認" : "全データ初期化の確認"}</h3>
      <p>対象：{confirmation === "scores" ? playerLabel : "全PLAYER（すべてのユーザーデータ）"}</p>
      <p>{confirmation === "scores" ? "現在SCORE/BPを前回値へ退避し、現在値を未登録にします。現在値がない項目の前回値は保持します。ランプ・HISTORY・PLAYER設定・個人ERETER・NOTES RADAR・他PLAYERは保持します。" : "全PLAYER・譜面記録・HISTORY・個人ereter履歴・セットアップ下書き・画面設定・アプリ管理情報の7ストアを初期化します。共通マスターは保持し、初回セットアップへ戻ります。"}</p>
      <p>この操作は元に戻せません。実行前にJSONバックアップを作成してください。</p>
      {confirmation === "all" && <label>確認のため「全データ初期化」と入力<input value={confirmationText} onChange={event => setConfirmationText(event.target.value)} /></label>}
      <div className="buttons"><button disabled={busy || (confirmation === "all" && confirmationText !== "全データ初期化")} onClick={() => void executeReset()}>{busy ? "処理中…" : "確認して実行"}</button><button disabled={busy} onClick={() => setConfirmation(null)}>キャンセル</button></div>
    </div>}
  </section>;
}
