# Ver.1.2 Phase 4 総合検証結果

実施日：2026-11-05。
開始点：5349bb8cf7bece911b3b08c8d412c428150fe230。
ブランチ：codex/ver12-phase4。開始時はクリーンで、同名ブランチは未作成だった。

**実施可能なPC・隔離環境での検証は成功。実PLAYERとAndroid／iOS実機は未実施。**
実PLAYERバックアップは提供されていない。架空PLAYERの結果を実PLAYERの結果として扱わない。
push・PR・main merge・Pages公開・version変更・タグ操作は行わない。

## 1. 環境と隔離

- Windows、Microsoft Edge実行ファイルを使ったPlaywright headless実ブラウザ。
- ブラウザ156.0.4314.58、Node24.22.1、npm10.9.2、Vite8.3.5。
- ローカル127.0.0.1専用ポート、既存プロファイルを使わない非永続コンテキスト。
- DB破棄・初期化・CSV取込・復元・容量エラー・中断は架空PLAYERだけで実施。
- テストDBはランダムな専用名、または専用コンテキスト内のiidx-clear-tracker。
  公開版や利用者の既存ブラウザのIndexedDBには接続していない。
- 各ツールのfinallyでブラウザ／サーバーを閉じる。専用DBの削除は自分で作ったDBだけ。
- 既存の共通マスターを利用するが、実PLAYERやプレイ履歴を取得していない。

## 2. 自動テスト・ビルド・監査

| 検証 | 結果 |
| --- | --- |
| npm ci | 成功 |
| npm ls --all | 問題なし |
| 全自動テスト | 142/142成功、skip0 |
| アプリTypeScript型検査 | 成功 |
| 3つのIndexedDBブラウザテストの追加型検査 | 成功 |
| 通常build / Pages build | 両方成功 |
| Pages用PWAテスト再実行 | 3/3成功（全142件にも含む） |
| npm audit | 低4件のみ |
| npm audit --omit=dev | 0件 |
| git diff --check | 成功 |

監査JSONのvulnerabilities全体をB-2と比較し、Advisory・via・effects・nodes・影響範囲が同一で
あることを確認する。対象はdeepmerge、@rollup/plugin-node-resolve、workbox-build、
vite-plugin-pwa。根本AdvisoryはGHSA-gcqx-w48m-w2h4。新規・重大度上昇なし。
package.json、lockfile、overridesは変更しない。

## 3. Ver.1.2の実ブラウザ回帰

全て最終Pagesビルドで成功。合計47シナリオ（Node142件とは別枠）。

| 対象 | シナリオ | 主な確認 |
| --- | ---: | --- |
| Phase1 TRACKER | 13 | Radar6属性、0/欠損、複数展開、Enter/Space、検索条件、入力保存/戻る、PLAYER置換、390px |
| Phase2 NEXT TRAINING | 9 | 実マスター＋架空PLAYERで30候補・5目標、10回連続の直近3回回避、保存後再評価、空/単一候補、表示維持 |
| Phase3 WARM UP | 11 | 3役割・全8段階の例、独立入替、重複回避、ナビゲーション、入力後再評価、空/単一候補、390px |
| Phase3.5 NEXT PLAY | 14 | 3登録経路、別タブ競合、5件、Unicode100/101、空メモ、容量エラー/再試行、プロフィール/プレイ後保持、再起動、削除、バックアップ |

TRAINING全出力の既存42ケース比較が一致し、結果・順序・reason・上限5件を維持する。
HC比較の4件境界、個人ERETERの有無、主帯上限、挑戦例外、BP0/欠損、
Radar0/欠損などの条件は既存の自動テストで継続確認した。

既存UI回帰プローブは本セッションの検証用一時領域の
tracker-browser.cjs、phase2-browser.cjs、phase3-browser.cjs、phase35-browser.cjsを使用。
新規のPWA・レイアウト・保存・実PLAYER準備ツールはscriptsに収録する。

## 4. IndexedDB・旧データ・CSV

scripts/verify-phase4-storage.mjsで3ページを実行し、全28シナリオが成功。

- 既存browser-indexeddb：11。DB生成、v1→v2、旧PLAYER、保存/再読込、複数ストア中断、
  セットアップ確定、旧/新HISTORY、バックアップ、SCORE/BPリセット、全7ストア初期化。
- browser-next-play：11。2接続から7同時追加で5件、重複拒否、別PLAYER、プロフィール/
  Radar/個人ERETERとの最新PLAYER更新、100/101文字、容量エラー、put後中断、
  復元中断、旧バックアップで空、全初期化。
- 新規browser-phase4-csv：6。公式DP CSVのSCORE0/BP---、TRACKER CSVの空欄/
  BP0、既存数値・前回値保持、既存/追加HISTORY、不正CSV拒否、ラウンドトリップ、
  PLAYER・NEXT PLAY・他譜面の保持、リセット後のランプ/HISTORY保持。

保存構造や移行処理は変更しない。DB v2・7ストア、CSV、backup schemaVersion1を維持。
現行のSCORE/BPリセットを検証し、片方欠損のケースは既存自動テストでも確認する。
別々の新しいリセット機能は追加しない。

## 5. PWA追加検証

scripts/verify-phase4-pwa.mjsの7シナリオが成功。

1. 2タブが旧workerに制御され、専用DB v2/7ストアに架空データだけが存在する。
2. オフラインでHOME・共通マスター5ファイルを読め、全ユーザーストアが同一。
3. SW取得を503にしても旧workerと両タブが継続する。
4. precacheに存在しない検証専用URLを加え、インストール失敗後も旧版がオフライン起動する。
5. 成功更新はwaitingになり、両タブで旧workerが継続し、自動再読み込み/乗っ取りがない。
6. 片方だけ閉じても、残るタブを再読み込みしても待機が継続する。
7. 全制御タブ終了後の次回起動で新workerへ移り、全記録/HISTORY/NEXT PLAYが同一。

SWの版は試験サーバーが付けた専用MessageChannel応答で区別する。
元ビルドは書き換えず、故障注入や観測コードはサーバー応答だけに適用する。
自動のonline更新要求と競合しないよう、実際の版を確認して待機する。
PWA本体の更新方針は変更していない。

通常manifestはroot、Pagesは/IIDX-2/、standaloneを確認。
precacheの全体件数は通常17・Pages14。共通マスター5ファイルのURL/revisionと
アイコン等の静的対象はB-2基準と一致する。アプリCSS変更に伴うasset revision変更は正常。
マスターのGit blob・ビルド入力・配布JSONのバイト列もB-2と同じLFであることを確認する。

## 6. レイアウトと修正

scripts/verify-phase4-layout.mjsは固定乱数0.5、実マスターの長い曲名5譜面と
100コードポイントの非改行ASCII/絵文字メモを使う（記録は架空）。

確認結果：
- 390px：横スクロールなし、長文折り返し、ボタン44px以上。
- HOMEのスクロール位置を60px刻みで走査し、浮動ボタンが操作や入力を
  遮るかelementFromPointで検証。最終状態は干渉なし。
- 768/1280/1440px：横スクロールなし。

発見して修正した問題：

| 問題 | 原因 | 最小修正・再発確認 |
| --- | --- | --- |
| スクロール矢印がメモ欄・操作ボタンを覆う | 固定44pxボタンとコンテンツが同じ右端領域を使用 | 狭い画面で専用余白を確保。全走査のヒットテストで再確認 |
| 768pxでNEXTの長い理由が横にはみ出す | 共通行のnowrapがHOMEの理由にも適用 | NEXT TRAININGのspanだけ通常折り返し。固定乱数で再現→修正後成功 |
| HOMEのTRAININGボタンが43px | 標準の文字高とpaddingで44pxに1px不足 | スマホ幅のbuttonにmin-height44pxを指定。HOME全ボタンを実測 |
| 既存ブラウザテストの追加型検査がTS2775 | assertion arrow関数の宣言方式 | 関数宣言へ変更。型と実ブラウザの両方を再確認 |

製品コードの変更はCSSだけ。推薦条件・候補生成・保存ロジックに変更はない。
身体端末のsafe-area、仮想キーボード、OSブラウザバーを含む動作までは確認していない。

## 7. 架空PLAYERでの推薦例（実PLAYERではない）

実マスター＋架空のPERFORMANCE主帯12.4では、候補30、EASY/CLEAR/HARD/EXH/挑戦が各6。
条件外の埋め合わせ・chartId重複はなく、表示最大3・挑戦最大1。

私有取り込みツールの別の架空試運転（主帯12.5）では候補30、内訳8/0/8/7/7。
この入力は下位のランプがCLEAR/HARD/EXH/FCで、下位のEASY済みがないため
通常CLEAR目標0は仕様どおり。30件を揃えるための条件緩和はしていない。

| NEXT例 | 公式/非公式 | 現ランプ→目標 |
| --- | --- | --- |
| SAMURAI-Scramble DPL | 12/12.5 | FAILED→EASY |
| Kailua DPA | 12/11.6 | CLEAR→HARD |
| Liberation DPA | 12/11.8 | HARD→EXH |

| WARM役割 | 例 | 公式/非公式・ランプ | 理由 |
| --- | --- | --- | --- |
| 指慣らし | MOON RACE DPH | 10/10.7・FC | CLEAR以上、参考BP0、Radar最大負荷 |
| 基礎運指 | 雫 DPA | 11/11.4・HARD | CLEAR以上、参考BP0、NOTES/CHORD |
| 精度 | GALGALIM DPA | 12/12.1・HARD | HARD以上、参考BP0、Radar最大負荷 |

このWARM候補数は726/423/275。8攻略段階、空/不足時も別途ブラウザ検証済み。
テスト範囲内で適格条件の不一致は見つからなかった。
本人の負荷感・推薦の偏り・実用性をこの架空データから判断しない。

## 8. 実PLAYER準備と未実施事項

実バックアップ未提供のため、実PLAYERの主帯・候補内訳・推薦曲・品質は未実施。
docs/VER12_PHASE4_REAL_PLAYER_RUNBOOK.mdとscripts/verify-private-player.mjsを準備した。

試運転はGit外の架空JSONだけで行い、下記を確認した：
- Git内ファイルはコピー／ブラウザ起動前に拒否する。
- 不正な架空JSONも事前拒否し、失敗時の一時コピー削除を確認した。
- 元入力を読み取り、一時コピーから既存DATA復元UIで復元する。
- 初回DATA導線のための記録0件PLAYERは、復元で完全に置換される。
- 復元6配列、推薦候補と表示、閲覧後データ不変を照合する。
- 誤ってPLAYER名やIIDX IDを出力しない。
- 専用ブラウザ終了、一時コピー削除、元ファイルのハッシュ不変。
  試運転で自分が生成した架空入力も終了後削除した。

実PLAYERの情報はソース・fixture・Gitに存在しない。
本人の負荷評価と推薦品質は、提供後の私有環境で別途報告する。
Android／iOS実機のインストール・standalone起動・タッチ・OS更新動作は未実施。

## 9. 再実行

既存Node回帰：node --test tests/*.test.mjs（先にbuildを実施）。

PlaywrightのパッケージディレクトリをIIDX_PLAYWRIGHT_MODULE、
ブラウザ実行ファイルをIIDX_BROWSER_EXECUTABLEで指定できる。
依存は更新・追加しない。

- node scripts/verify-phase4-storage.mjs：Viteをloopbackで起動し、3つの隔離DBページを実行。
- node scripts/verify-phase4-pwa.mjs：事前にPages buildが必要。
- node scripts/verify-phase4-layout.mjs：同じPages buildで長文／干渉／幅を検証。
- node scripts/verify-private-player.mjs：提供時のみ。私有パスの手順はrunbookを参照。

新規ツールは実データをfixtureに生成せず、公開版や既存ブラウザへアクセスしない。
実データの結果出力をGit管理下へリダイレクトしないこと。

## 10. 保護対象と結論

マスター、依存、DB定義、CSV/JSON形式、推薦エンジン、アプリversion1.1.0、
v1.1.0タグを変更しない。コミットはPhase4の表示修正・検証・記録だけとする。

実施可能な範囲は成功した。残る必須確認は実PLAYERデータの品質とAndroid／iOS実機。
それらを成功扱いにせず、本報告後は停止する。
