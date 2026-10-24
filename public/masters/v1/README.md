# 配布用共通マスター

このフォルダのJSONは`data/master-input/`の5 CSV（CHART_MASTER、UNOFFICIAL、ERETER、NOTES_RADAR、radar_data）から生成します。実データを配置済みです。JSONは手編集しません。

- `chart-master.json`: songsとchartsを分離した曲・譜面情報。chartId / songId / Alias / availabilityを保持します。
- `unofficial.json`: 非公式難易度。未設定はnullです。
- `ereter.json`: 共通ERETERのEC / HC / EXH値。
- `notes-radar.json`: values内の6属性とverified、lastUpdated。radar_dataの確認済みTRUEのみ出力します。
- `manifest.json`: ファイル名・バージョン・件数を管理します。

各JSONのschemaVersion / masterVersion / updatedAtを維持しています。確認済みの0.00は実値0として出力し、未確認値をverifiedとして出力しません。未確認譜面もchart-master等には残り、プレイヤー記録を削除しません。

現在のmasterVersionは`2026.10.24`、schemaVersionは1です。件数はchart-masterのchartsが2,495、unofficialが2,495、ereterが763、notes-radarが2,259です。未確認236譜面はnotes-radarだけから除外します。

```powershell
npm run generate:masters -- --version 2026.10.24
```

masterVersionはアプリのバージョンと独立しています。生成器は共通マスターの参照整合性を検証します。再生成後は関連テスト・型チェック・通常ビルド・Pagesビルドを確認してください。

2026-10-24更新では新規4譜面、既存Notes追加8件、非公式難易度変更44件を反映しています。Radarは180件追加・1件除外で、CT_ID0327は確認済みFALSEのため配布Radarから除外します（譜面本体・ユーザー記録は削除しません）。再現性テストでは生成済みmanifestのmasterVersionとgeneratedAtを指定して一時フォルダへ再生成し、5 JSONの完全一致を確認します。
