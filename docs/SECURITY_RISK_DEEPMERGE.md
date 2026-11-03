# deepmerge残存リスクの記録

評価日: 2026-11-03。Ver.1.2 Phase 1開始にあたり、ユーザー承認のもと現行経路での残存リスクを記録する。

## 対象と未修正事項

- Advisory: GHSA-gcqx-w48m-w2h4（https://github.com/advisories/GHSA-gcqx-w48m-w2h4）。deepmerge 4.3.1は未修正。評価時点で公表された修正版はない。
- npm auditはdeepmerge、@rollup/plugin-node-resolve 16.0.3、workbox-build 7.4.1、vite-plugin-pwa 2.0.0の低4件として同一Advisoryを波及表示する。本番用依存の監査は0件。
- 特定のマージ先形状と制御された__proto__キーにより、返却オブジェクトのプロトタイプが汚染される。問題自体はメモリ上で再現できており、誤検知として扱わない。

## 現在の到達経路と評価の前提

Vite本番ビルド → vite-plugin-pwa generateSW → workbox-buildのSWバンドル → @rollup/plugin-node-resolve → deepMerge({}, defaults)。

node-resolveのモジュール初期化で、固定の既定設定を複製して凍結する呼び出しである。利用者設定はオブジェクトの展開で扱われる。現行実装ではPLAYER、IndexedDB、CSV、JSONバックアップ、マスター値など外部入力がこのdeepmerge引数へ到達する経路は確認されていない。devDependencyであることだけを根拠に安全とは判断していない。

この評価は信頼できるソース・設定・lockfile・依存コードを前提とする。未レビューのコードや外部設定を公開権限のある環境で実行せず、npm ciで固定版を使用する。audit全体や低重大度を一律に無効化しない。

## 再評価条件

依存版・ビルド設定・呼び出し箇所・入力の流れが変わった場合、外部JSON等のマージにdeepmergeを追加する場合、Advisoryや上流修正が更新された場合、および公開前に再評価する。今回の低リスク判断を将来へ無条件に適用しない。修正版は専用変更として監査、型検査、全テスト、通常／Pagesビルド、PWA・オフライン・更新待機・データ保持を確認する。

## Workbox限定overridesの保守

workbox-build@7.4.1配下だけにglob 14.0.3と@trickfilm400/rollup-plugin-off-main-thread 4.0.0を指定している。全minimatchやEJS単独の強制差し替えではない。Workboxの版が変わると対象条件から外れるため、npm lsとauditで実際の解決結果を確認する。親の正規依存が対応したら、検証して不要なoverrideを取り除く。

## マスターJSONの改行

.gitattributesでpublic/masters/v1/*.jsonだけをtext eol=lfに固定する。Git blob・作業ツリー・ビルド配布物を同じバイト列にし、Windowsのcore.autocrlfによるprecache revisionの差を防ぐ。比較時に改行差を隠すのではなく、実ファイルをLFに統一する。CSVや他のファイルにはこの指定を広げない。
