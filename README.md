# IIDX CLEAR TRACKER

現在の正式リリース: **Ver.1.1.0（2026-10-08）**

## Ver.1.1.0 リリース記録

- ANALYSISのERETER表示を修正。
- 上下スクロールボタンを追加。
- HISTORYにSCORE/BPの初回登録・自己ベスト更新を追加し、1回の更新を1件に統合。旧ランプ履歴との互換性を維持。
- 前回SCORE/BPの保存と、選択中PLAYERのSCORE/BPリセットを追加（リセット自体はHISTORY対象外）。
- 確認操作付きの全ユーザーデータ初期化を追加（共通マスターは対象外）。
- HOMEのNEXT TRAININGに「入れ替え」を追加。
- Android PWAインストール・standalone起動・オフライン利用に対応。

実機確認では、既存データ保持・追加機能・Android PWA・オフライン起動・CSV/JSON操作を含む全12項目が成功しました。
PWAの「マスターのみ更新」「更新取得失敗時の旧正常版継続」「複数タブでの更新待機」は、個別の実機検証が未完了です。
既存IndexedDB・Ver.1.0 JSONバックアップの互換性を維持しています。

beatmania IIDX のDPクリア状況をローカルブラウザで管理するWebアプリです。プレイヤーデータはサーバーではなく、ブラウザのIndexedDBに保存されます。

## 必要環境

- Node.js 22.13.0以上
- 依存ライブラリをインストール済みであること（`node_modules` がある状態）

## 開発サーバーの起動

このプロジェクトには `npm run dev` は定義されていません。次のコマンドでVite開発サーバーを起動します。

```powershell
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173
```

ブラウザで次を開きます。

```text
http://127.0.0.1:4173/
```

> 注意: IndexedDBはURLの「オリジン」ごとに別保存です。`127.0.0.1:4173` と `127.0.0.1:4174` は別の保存領域なので、ポートを変えると既存のプレイデータが表示されません。データが消えたわけではありません。

## 確認コマンド

```powershell
# 型チェック
npm run typecheck

# Phaseごとの自動テスト
npm run test:phase1
npm run test:phase2
npm run test:phase3
npm run test:phase4
npm run test:phase5

# 本番用ビルド
npm run build
```

## 実ブラウザでのIndexedDB確認

開発サーバー起動中に、次をブラウザで開きます。

```text
http://127.0.0.1:4173/tests/browser-indexeddb.html
```

この確認では、テスト専用の一時データベースを使い、以下を検証します。

- IndexedDBストア作成と更新
- 保存後の再読込
- 処理中断時に一部だけ保存されないこと
- 初回セットアップ確定時のPlayer・譜面記録保存と下書き削除の原子性

## 共通マスターの再生成

入力CSVは `data/master-input/`、生成先JSONは `public/masters/v1/` です。

```powershell
npm run generate:masters
```

生成後は、少なくともマスター関連テスト、型チェック、本番ビルドを実行してください。`chartId`はプレイヤーデータやバックアップから参照される永続IDのため、変更・再利用しないでください。

## PWA（ホーム画面へのインストール）

本番ビルドにはmanifestとService Workerを含めます。開発サーバーでは登録しません。
Android ChromeではHTTPSの公開ページを開き、ブラウザメニューからインストールします。
初回のキャッシュ完了後は、アプリと共通マスターをオフラインで利用できます。
更新は起動時・オンライン復帰時に確認し、利用中の強制再読み込みは行いません。
新しい版を適用するには、インストール版と同じサイトのブラウザタブをすべて閉じてから開き直してください。
キャッシュとIndexedDBは別管理です。端末間の同期はなく、JSONバックアップを推奨します。

依存関係の再現は `npm ci` を使用します。Pagesの公開は引き続きActionsの手動実行のみです。
ローカルの本番確認は `npm run build` の後に `npx vite preview --port 4174` を使用できます。
既存ユーザーデータ確認用の4173とは別の保存領域になる点に注意してください。
PWA関連テストは本番ビルド後に `node --test tests/ver11-phase4-pwa.test.mjs` で実行します。

## データ保護について

- DATA画面のJSONバックアップは、CSV取込やマスター更新、実装変更の前に作成してください。
- ブラウザのサイトデータを削除すると、端末内のプレイヤーデータも削除されます。
- JSON復元はユーザーデータ全体をバックアップ内容で置換します。復元前に現在のバックアップを作成してください。
- 詳細な開発時の安全ルールは [AGENTS.md](AGENTS.md) を参照してください。
