# 配布用共通マスター

このフォルダのJSONは`data/master-input/`の5 CSV（CHART_MASTER、UNOFFICIAL、ERETER、NOTES_RADAR、radar_data）から生成します。実データを配置済みです。JSONは手編集しません。

- `chart-master.json`: songsとchartsを分離した曲・譜面情報。chartId / songId / Alias / availabilityを保持します。
- `unofficial.json`: 非公式難易度。未設定はnullです。
- `ereter.json`: 共通ERETERのEC / HC / EXH値。
- `notes-radar.json`: values内の6属性とverified、lastUpdated。radar_dataの確認済みTRUEのみ出力します。
- `manifest.json`: ファイル名・バージョン・件数を管理します。

各JSONのschemaVersion / masterVersion / updatedAtを維持しています。確認済みの0.00は実値0として出力し、未確認値をverifiedとして出力しません。未確認譜面もchart-master等には残り、プレイヤー記録を削除しません。

現在のmasterVersionは`2026.10.15`、schemaVersionは1です。件数はchart-masterのchartsが2,491、unofficialが2,491、ereterが760、notes-radarが2,080です。未確認411譜面はnotes-radarだけから除外します。

```powershell
npm run generate:masters -- --version 2026.10.15
```

masterVersionはアプリのバージョンと独立しています。生成器は共通マスターの参照整合性を検証します。再生成後は関連テスト・型チェック・通常ビルド・Pagesビルドを確認してください。

PR #1の最終同期は入力CSVの識別情報と説明文のみの修正です。配布内容は変わらないため、再生成検証では既存の生成日時も指定し、JSON・manifestに差分がないことを確認します。後から追加された4譜面とNotes8件は別更新です。
