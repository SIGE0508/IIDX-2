# 共通マスターCSV入力

Googleスプレッドシートを元に、次の5ファイルをUTF-8 CSVとして配置します。ファイル名とヘッダー名は生成器が検証します。

- `CHART_MASTER.csv`
- `UNOFFICIAL.csv`
- `ERETER.csv`
- `NOTES_RADAR.csv`
- `radar_data.csv`

## 確認済みフラグ

`radar_data.csv`の必須列は`chartId`と`確認済み`です。確認済みはTRUE/FALSEで指定します。フラグ欠落・不正値・chartId重複・未照合は生成エラーです。

現在は元シートの17列（chartId / SongID / タイトル / 譜面 / LV / 初出Ver / 初出Ver(数) / 確認済み / ノーツ数 / 不足項目 / 不足項目数 / NOTES / CHORD / PEAK / CHARGE / SCRATCH / SOF-LAN）を保持しています。存在しない列を推測で追加しません。

TRUEの譜面だけを`notes-radar.json`に`verified: true`として出力します。確認済みの0.00は実値0として保持します。FALSEは一部に数値があっても配布せず、自動でTRUEへ変更しません。他のマスターから譜面を削除する意味ではありません。

曲・譜面の識別情報はCHART_MASTERとNOTES_RADARを正とし、radar_dataの確認状態をchartIdで参照します。radar_dataに識別情報がある場合、songID・曲名の不一致は警告、譜面種別の不一致はエラーです。既存ID・Alias・availabilityは維持し、新規譜面や数値変更は承認済みの範囲だけを反映してください。

UNOFFICIALの難易度空欄はnullとして出力します。ERETERは個人履歴ではなく共通EC / HC / EXH、NOTES_RADARは6属性の値を保持します。

生成コマンド:

```powershell
npm run generate:masters -- --version 2026.10.15
```

masterVersionはアプリのバージョンと独立しています。省略時は開発用`0.1.0-dev`です。出力先は`public/masters/v1/`で、chart-master / unofficial / ereter / notes-radarの4 JSONとmanifestを生成します。JSONは手編集しません。

PR #1対象は2,491譜面、確認済み2,080譜面、未確認411譜面です。修正後の元シートとのsongID・曲名不一致は0件です。後から追加された4譜面とNotes8件は今回の同期対象外です。
