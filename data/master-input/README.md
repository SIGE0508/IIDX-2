# 共通マスターCSV入力

Googleスプレッドシートから、次の4シートをUTF-8 CSVとしてこのフォルダへ保存してください。ファイル名とヘッダー名は生成器が厳密に検証します。

- `CHART_MASTER.csv`
- `UNOFFICIAL.csv`
- `ERETER.csv`
- `NOTES_RADAR.csv`

生成コマンド:

```powershell
npm run generate:masters
```

開発用の既定バージョンは `0.1.0-dev` です。公開版を作る場合は `npm run generate:masters -- --version 1.0.0` のように指定します。出力先は `public/masters/v1/` です。JSONは手編集しません。
