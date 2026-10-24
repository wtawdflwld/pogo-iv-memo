# IVメモ — ポケモンGO個体値チェッカーPWA

ライブ画面共有を主機能とする、端末内で解析・保存する静的PWAです。「ライブキャプチャ」→ iPhoneの画面共有 → ポケモンGOへ切替 → IVメモに戻って共有終了 → 解析、の流れで使います。複数スクショと保存済み動画の取り込みも利用できます。

**アプリの配信先：[IVメモ](https://wtawdflwld.github.io/pogo-iv-memo/)** ／ [ソース](https://github.com/wtawdflwld/pogo-iv-memo) ／ [配信ワークフロー](https://github.com/wtawdflwld/pogo-iv-memo/actions/workflows/pages.yml)。`main`へのpushで自動配信します。iPhone実機と実際のゲーム画面の認識精度は未検証です。検証済みと未検証の区分は [docs/VERIFICATION.md](docs/VERIFICATION.md) にあります。

## Windowsで起動する

1. Node.jsを用意します。開発時に実行したバージョンは24.22.1、GitHub Actionsは22を指定しています。ビルド・起動にnpmパッケージの追加インストールは不要です。
2. このREADMEのあるフォルダーでPowerShellを開き、次を実行します。

```powershell
node --test tests/*.test.mjs
node scripts/build.mjs
node scripts/serve.mjs
```

3. PCのブラウザーで `http://localhost:4173/pogo/` を開きます。終了はPowerShellでCtrl+Cです。

`/pogo/` はGitHub Pagesのプロジェクト配下を模した検証用パスです。`http://localhost:4173/` でも起動します。別パスでは別の保存領域になります。HTMLを直接ダブルクリックして `file://` で開く方法は、Worker・IndexedDB・Service Workerの実行用には使えません。

ソースは `public/`。変更したら `node scripts/build.mjs` を実行し直します。更新が検出されたらアプリの「更新する」を押します。初回のオフライン資材は約32MiB（HTTP圧縮前）です。モデルとライブラリは取得済みなので、通常のテスト・ビルドにネット接続は不要です。

任意で `npm run dev` / `npm run build` / `npm test` も使えます。開発サーバーはPC内専用で、iPhoneへの配信は次のGitHub Pagesを使います。

## GitHubへ保存し、GitHub Pagesで公開する

このプロジェクトのリポジトリは [wtawdflwld/pogo-iv-memo](https://github.com/wtawdflwld/pogo-iv-memo) です。以下は別のアカウントや新しいリポジトリへ導入する場合の手順です。他のプロジェクトを上書きせず、新しい空のリポジトリを作ってください。

Gitが利用できるPowerShellで、プロジェクトフォルダーから次を実行します。`YOUR_ACCOUNT`と`YOUR_REPOSITORY`は実際の値に置き換えてください。

```powershell
git init -b main
git add .
git commit -m "Implement local Pokemon GO IV checker PWA"
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

動画・スクショをこのフォルダーへ置く必要はありません。個人のメディアはコミットしないでください。`.gitignore` は `imports/`、動画、HEIC、テスト生成物、ダウンロード作業領域、ZIP、`dist/` を除外します。アプリの個体データはブラウザーのIndexedDB内にあり、Git管理対象になりません。

1. GitHubのリポジトリで **Settings → Pages → Build and deployment → Source → GitHub Actions** を選びます。
2. **Actions → Deploy IV memo to GitHub Pages → Run workflow** を実行します。以後は `main` へのpushでも自動実行します。
3. ワークフローは38件の基本テスト、構文確認を含む静的ビルド、Pagesへの配信を行います。
4. 完了したdeployジョブのURL（通常は `https://YOUR_ACCOUNT.github.io/YOUR_REPOSITORY/`）を開きます。

`public/` 配下のOCR本体・WASM・言語モデル・種族データ・ライセンスも必ずpushします。CIでは外部データの再取得を行わず、同梱した内容をビルドします。URLやリポジトリ名をソースへ埋め込む設定は不要です。asset、Worker、manifest、Service Workerは相対URLで動きます。

GitHubプランや組織の制限によりPages利用条件は異なります。手順の出典：[GitHub公式のPagesカスタムワークフロー](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。**このアプリはPagesの配信ページにアクセス制限を実装していません。** 個人利用・端末内保存と、Webサイトの非公開配信は別です。

更新時は修正をcommit・pushするだけです。

```powershell
git add .
git commit -m "Update IV memo"
git push
```

アプリはファイル内容から生成した版ごとのキャッシュを作り、新版を待機させます。解析中・未保存の読み取り結果がある間・確認画面を開いている間は更新ボタンを無効にし、強制更新しません。ユーザーが新版を適用したときだけ再読み込みします。更新ではIndexedDBを削除しません。

## iPhoneで初回設定する

1. ネット接続中、Safariで自分のGitHub PagesのHTTPS URLを開きます。
2. 上部の表示が **「オフライン利用の準備完了」** になるまで前面に保ちます。未完了・失敗の場合は通信と空き容量を確認し「準備・再確認」を押します。
3. Safariの共有メニューから **ホーム画面に追加** を選びます。OSの表示に「Webアプリとして開く」があれば有効にして追加します。メニュー名・配置はiOSによって異なります。[Apple公式手順](https://support.apple.com/guide/iphone/iph42ab2f3a7/ios)。
4. ホーム画面のIVメモを起動し、そこでも準備完了を確認します。Safariとホーム画面アプリの保存領域が異なる環境に備え、以後は同じ入口から使ってください。
5. ライブキャプチャを使える状態にした後で、機内モードで起動・共有・解析・保存できるか確認します。iCloud内だけにあるメディアは、先に端末へダウンロードしてください。

通常起動時の更新確認はオンラインなら実行されますが、解析のためのCDN・外部画像認識API・バックエンド通信はありません。画像・動画・個体の外部送信処理は実装していません。

## v1.1：ライブキャプチャの使い方

対象として想定している実機は **iOS 27.0.1** です。iOS 27以降のSafariでは `getDisplayMedia()` が互換性データに登録されていますが、ホーム画面PWAやポケモンGOへの切り替え中の記録継続は実機で未検証です。ブラウザーの実機能を確認し、APIがなければ開始ボタンを無効にして案内します。ホーム画面で使えない場合はSafariで開いてください。

1. アプリに「新しいバージョン」が出たら「更新する」を押し、画面が「ライブキャプチャ」に変わったことを確認します。未保存結果・共有中は更新できません。
2. 「ライブキャプチャ」を押し、iPhoneの共有画面で端末画面の共有を許可します。許可は毎回必要です。
3. ポケモンGOへ切り替え、「調べてもらう」の各個体を約2秒ずつ表示します。
4. IVメモに戻り、「共有を終了して解析」を押します。OS側で先に終了した場合も、IVメモが前面に戻ってから解析します。
5. 自動読取候補を確認・修正し、必要な個体を確定した後「すべて保存」を押します。要確認もまとめて保存します。

映像だけを取得し、音声は要求しません。`getDisplayMedia()` の呼び出しはクリックの同期処理内で行います。共有中はブラウザーの `MediaRecorder` で記録し、終了後に最終データとIndexedDBへの書き込み完了を待って既存の共通動画解析へ渡します。バックグラウンドでJavaScriptのフレーム抽出・OCRを動かし続ける設計にはしていません。

映像のチャンクは別のIndexedDBへ一時保存し、個体保存の成功後に削除します。アプリが閉じられたり解析・保存が失敗した場合は「キャプチャの一時記録」から再解析できます。ただし、OSによる強制終了などで最終データが欠けた記録は、再生・復旧できない場合があります。不要な一時記録は確認画面から削除できます。保存済み個体のデータベースやスキーマは変更しません。

Safari・OSによって映像が一時停止・終了する可能性は残ります。トラックの一時停止を検知した場合や、記録時間が共有時間より大幅に短い場合は結果確認を促します。動画コンテナに長さがない場合は、共有時間を上限に解析し、その旨を表示します。映っていない場面を復元することはできません。共有対象にはゲーム以外に表示した画面も入りうるため、共有画面で対象を確認してください。

画面共有の非対応やキャンセル時は、原因を表示します。ライブキャプチャを押しても保存済み動画のファイル選択へ置き換える処理はありません。保存済み動画は別の補助メニューから明示的に選ぶ方式です。

一次資料：[MDNのiOS 27対応データ修正](https://github.com/mdn/browser-compat-data/pull/30732)、[getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)、[最終データとstopイベントの順序](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/stop_event)。

## 使い方と実装済み機能

### 保存済み動画取り込み（補助機能）

- ポケモンGOの「調べてもらう」画面を表示して画面収録します。3本の評価バーが表示されてから各個体を約2秒静止して切り替える運用を想定しています。
- 保存した動画を「保存済み動画を使う場合」から選択できます。複数動画も順番に処理します。
- `HTMLVideoElement`で0.45秒間隔にシークしてCanvasへ取り込みます。画面の粗い特徴量が連続して安定し、連続フレームのバー値が一致した場面を解析します。
- 連続する同一画面は一度だけ候補化します。画面変化を挟む別場面、別動画・別取り込みは、種類・IV・CPが同じでも値の一致だけで統合しません。
- 処理時間位置、抽出件数、サンプル数、バー未検出によるスキップ数を表示し、中止できます。中止は現在のデコード／OCR処理が終わった時点で反映し、抽出済み候補は残ります。
- 画像判定・OCR・順位計算はWeb Workerで実行。全フレーム・元動画を永続保存しません。
- 安定場面でもバーを検出できなければスキップし、件数を報告します。短い表示や見た目が同じ個体の見えない切替、画面揺れ、通知、バー色の変化などには取りこぼし・重複が残りえます。足りない場面はスクショで追加してください。

形式は実行ブラウザーの動画デコーダーに依存します。ファイル選択はMP4、MOV、M4V、`video/*`を許可していますが、拡張子だけで対応を保証しません。iPhone画面収録のHEVC/H.264、HDRや長時間動画は未検証です。再生・シーク失敗や時間切れはエラーとして通知し、要確認の候補も残します。

### スクショ・確認・修正

- JPEG、PNGなどブラウザーでデコードできる画像を1枚／複数まとめて選択。
- 動画と同じ解析・結果カード・確認画面を使用。
- 3本の評価バーを色と位置から検出し、攻撃・防御・HPのIVを0〜15で推定。日本語・英語OCRで名前とCPを読み取り。
- 全件をまず要確認にし、手動で「確認して確定」するまで順位は表示しません。
- 名前は正規化後の完全一致のみで照合。ニックネーム・判読不能・複数フォルムがある種類は自動で別の種類に決めません。
- 種類・フォルムを日本語名／英語名／図鑑番号で検索し、IV・CPを編集。未認識は `null` とし、0とは別に管理します。
- バー検出に失敗した静止画は「バー位置を指定」で攻撃の左端・右端、防御の左端、HPの左端を順にタップし、再読取できます。バーの中央を指定します。
- 進化制限判定用の性別、および「進化できない衣装など（現在の姿のみ）」を指定できます。
- 一覧を作るための手動追加も可能です。画像を開けない場合も、失敗理由を表示した要確認候補を作ります。

認識対象は日本語の縦向きの評価画面を主に想定し、画面を最大幅720pxに縮小して解析・確認用画像を作ります。回転・横向き・トリミング済み画像は自動認識が難しい場合があります。HEIC等を開けなければJPEG/PNGに変換してください。画面のHP実数値（例83/83）とHP IV（0〜15）は別です。

### 保存・一覧

- 読み取り結果を「すべて保存」でまとめてIndexedDBへ保存します。要確認を含み、順位による選別はしません。
- バッチは1つのトランザクションで保存。失敗時は成功表示をせず、未保存の結果を残してエラーを表示します。
- 保存した個体を一覧・名前検索・要確認絞り込み・新しい順／スーパー順位順／ハイパー順位順で表示。
- 保存後も種類・IV・CP等を修正して再計算・保存できます。個別削除も可能です。
- 並べ替えは参加可能と推定できる現在の姿・進化先の最良順位を使い、要確認・計算不能・参加不可・参加可否不明は末尾にします。同順位では新しい順です。
- 静止画のJPEG Blobだけを確認用として保存。取り込んだ元動画・元スクショの全件複製は保持しません。ライブ共有の一時記録は個体の保存成功まで保持します。未保存候補はメモリー内にあり、閉じると失われます。

IndexedDBはプロジェクトURLごとの名前で分離しています。アプリの更新で記録を消すコードはありませんが、OSの容量整理、履歴／サイトデータの消去、別URLへの移転、プライベートブラウズの終了等で保存を失う場合があります。バックアップ入出力・クラウド同期は今回の対象外です。

## 順位の計算条件・採用した前提

| 項目 | 初版の条件 |
|---|---|
| スーパー／ハイパー | CP1,500以下／CP2,500以下 |
| レベル | ポケモンレベル1〜50、0.5刻み。相棒ブーストなし |
| 比較 | 同じ種類・フォルムのIV4,096通り。入手方法別IV下限なし |
| 指標 | 最大強化時の攻撃実数値×防御実数値×HP実数値 |
| CP | `max(10, floor((A+a)×sqrt(D+d)×sqrt(H+h)×CPM²÷10))` |
| HP | `max(10, floor((H+h)×CPM))` |
| 同順位 | 積の差が10⁻⁷以下を同順位とする競技順位（1、1、3位） |
| 進化 | 現在から先のみ。途中・最終・分岐をそれぞれ評価 |
| 参加可否 | 現在種族・IV・現在CPと一致するLv.1〜50を列挙して判定 |

`A,D,H`は種族値、`a,d,h`はIVです。表には順位、1位の積に対する比率、到達CP、到達レベル、進化条件を表示します。技、入手可否を含む実戦の総合順位や勝率ではありません。入手不可能なIVを含む理論比較になる場合があり、GOボックス等との完全一致は保証していません。

現在CPが上限を超えている個体、現在レベルで進化するとCP上限を超える候補は「参加不可」と表示します。数値を参考として残す場合は「理論」と明示し、有利な育成順位として並べません。CP未認識・不整合・複数レベルの候補によって可否が変わる場合は「参加可否未確認」。相棒ブースト中のCPは、解除後のCPへ修正する前提です。性別が必要なのに未指定なら、その進化先も参加可否未確認にします。その他の相棒・アイテム・時間帯条件は注記し、達成状況はゲームで確認する運用です。

進化関係はPvPokeのfamilyだけに依存せず、取得時のGO Game Masterの進化先・フォルム・性別・アイテム・時間帯・相棒条件を監査しています。通常進化できないストライク→バサギリ、オドシシ→アヤシシは候補にしません。期間限定のカラカラ→アローラガラガラ等は常設候補から外しています。バルキーは実際のIV最大値に一致する分岐だけを表示し、同値のランダム性を注記します。たそがれへ進化できるイワンコは別項目として手動で選択します。

**対象データは1,074種類・フォルム**（PvPokeのreleased=trueである通常・フォルム項目1,073件＋たそがれ進化可能イワンコ）。メガ・ゲンシ、未配信扱い、重複alias、シャドウの別データ項目は除外しています。シャドウのIV順位・CPは同種族値の通常個体と共通に扱い、ダメージ補正は計算しません。リトレーンによるIV変化や特殊衣装の全制限、データ元にない種類の計算は実装対象にしません。未収録・新配信項目はデータ更新が必要です。

## データ・ライブラリの出典と利用条件

取得日：**2026-10-24**。ゲームの将来の更新を自動追跡しません。

| 用途 | 出典・固定版 | 条件・保存先 |
|---|---|---|
| 種族値・基礎進化関係・CP倍率 | [PvPoke](https://github.com/pvpoke/pvpoke)、commit `38f70320d190e38c2e6c778f572662b4c4e8185d`、Game Master表示更新日時2026-10-21 03:50:13 | MIT。[原文](public/licenses/PvPoke.txt)を同梱 |
| 日本語名 | [PokéAPI](https://github.com/PokeAPI/pokeapi)、commit `2bf639e5572812a67d2b94903fdcb9d095f5aeb2`、`pokemon_species_names.csv` の言語1 | BSD 3-Clause。[原文](public/licenses/PokeAPI.txt)を同梱 |
| GO進化条件の監査 | [PokeMiners Game Master](https://github.com/PokeMiners/game_masters)、commit `8e227be44f288d34463e23bf04e9b564d3c16f79` | ゲームの事実パラメータのみ抽出。コード利用ライセンスは確認できていないため全文・ゲーム素材は同梱しない。取得元・SHA-256は `public/data/evolution-audit.json` |
| OCR API / Worker | [Tesseract.js](https://github.com/naptha/tesseract.js) 6.0.1 | Apache-2.0。npm公開パッケージのdistを同梱 |
| OCR WASM | [Tesseract.js-core](https://github.com/naptha/tesseract.js-core) 6.0.0 | Apache-2.0。4系統のloaderとWASMを同梱 |
| 日本語・英語モデル | [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast)、`tessdata.projectnaptha.com/4.0.0_fast/`のjpn/eng | Apache-2.0。gzip版を同梱、ハッシュを記録 |

ライセンス原文は `public/licenses/` と配信先の `licenses/` で読めます。ダウンロード元・固定コミット・SHA-256は `public/data/sources.json`。フォルムの表示名は主に独自の日本語対応表とデータ元の英語ラベルです。進化チャレンジの具体的な内容が対応表にない場合は、条件があることを表示し、ゲーム内での確認を求めます。

補足した条件の一次資料例：[ウーラオスへの分岐](https://pokemongo.com/news/final-strike-2025)、[カジッチュ・カミッチュ](https://pokemongo.com/news/harvest-festival-2025?hl=en)、[ドドゲザン](https://pokemongo.com/news/crown-clash-2025)、[バサギリの通常進化不可の告知](https://pokemongo.com/news/kleavor-raid-day?hl=en)、[アローラガラガラの期間限定進化](https://pokemongo.com/news/alola-to-alola)。イベントによる条件緩和までは反映しません。

参考アプリのコード・独自素材、ポケモンのイラストは使っていません。アイコンと画面は独自実装です。Pokémon、Pokémon GO等の名称・商標・キャラクターの権利は各権利者に帰属します。ライブラリの利用条件がゲームの知的財産に対する許諾を与えるものではありません。

### 同梱資材を再取得する場合だけ

```powershell
node scripts/prepare-assets.mjs
node scripts/icons.mjs
node --test tests/*.test.mjs
node scripts/build.mjs
```

`prepare-assets.mjs`は公開GitHub・npmレジストリ・モデル配布先へのネット接続と、OSの`tar`コマンドを使います。`.downloads/`に取得した固定コミットと元ファイルを保持し、そのキャッシュを再利用します。将来のデータへ更新するときは、この作業用キャッシュを別名へ退避してから再取得し、READMEの版・取得日・検証も更新してください。通常の利用・ビルド・GitHub Actionsではこの処理は不要です。

## ファイル構成

```text
public/                 配信元ソース
  app.js                取り込み・確認・一覧のUI
  lib/capture.js        画面共有・MediaRecorder・共有終了処理
  lib/capture-store.js  映像チャンクの一時保存・復旧・削除
  lib/media.js          動画シーク／スクショ／OCRの共通処理
  lib/vision*.js        バー検出・安定場面抽出、画像解析Worker
  lib/ranking.js        CP・実数値・順位・進化経路・参加可否
  lib/rank-worker.js    順位計算Worker
  lib/storage.js        IndexedDBの一括保存・修正・削除
  data/                 同梱種族・倍率・出典
  vendor/               OCR本体・Worker・WASM・日本語英語モデル
  licenses/             ライセンス原文
scripts/                ビルド・開発サーバー・資材取得・任意OCR確認
tests/                  38件の基本テスト
.github/workflows/      GitHub Pages自動配信
docs/VERIFICATION.md    完了範囲と未検証事項
dist/                   ビルド済み配信物（Git管理せずCIで生成）
```

対象外：共有中のリアルタイム順位表示、ゲーム上への小窓、技推薦、レイド対策、対戦シミュレーション、広告・課金、アカウント、クラウド同期、相棒Lv.51、育成コスト、バックアップ入出力。
