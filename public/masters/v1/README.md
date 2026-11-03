# 配布用共通マスター

このフォルダのJSONは`data/master-input/`の5 CSV（CHART_MASTER、UNOFFICIAL、ERETER、NOTES_RADAR、radar_data）から生成します。実データを配置済みです。JSONは手編集しません。

- `chart-master.json`: songsとchartsを分離した曲・譜面情報。chartId / songId / Alias / availabilityを保持します。
- `unofficial.json`: 非公式難易度。未設定はnullです。
- `ereter.json`: 共通ERETERのEC / HC / EXH値。
- `notes-radar.json`: values内の6属性とverified、lastUpdated。radar_dataの確認済みTRUEのみ出力します。
- `manifest.json`: ファイル名・バージョン・件数を管理します。

各JSONのschemaVersion / masterVersion / updatedAtを維持しています。確認済みの0.00は実値0として出力し、未確認値をverifiedとして出力しません。未確認譜面もchart-master等には残り、プレイヤー記録を削除しません。

現在のmasterVersionは`2026.11.01`、schemaVersionは1です。件数はchart-masterのchartsが2,503、unofficialが2,503、ereterが765、notes-radarが2,496です。未確認7譜面はnotes-radarだけから除外します。

```powershell
npm run generate:masters -- --version 2026.11.01
```

masterVersionはアプリのバージョンと独立しています。生成器は共通マスターの参照整合性を検証します。再生成後は関連テスト・型チェック・通常ビルド・Pagesビルドを確認してください。

2026-11-01更新では新規6曲・8譜面、非公式難易度の未設定解消13件、ERETER追加2件を反映しています。Radarは既存232譜面の確認完了と新規5譜面で計237件追加、確認解除・除外は0件です。CT_ID0327も確認済みTRUEとして配布します。未確認のCT_ID0631 / CT_ID2144 / CT_ID2439 / CT_ID2440 / CT_ID2502 / CT_ID2504 / CT_ID2505は譜面本体を保持し、Radarのみ除外します。再現性テストでは生成済みmanifestのmasterVersionとgeneratedAtを指定して一時フォルダへ再生成し、5 JSONの完全一致を確認します。
