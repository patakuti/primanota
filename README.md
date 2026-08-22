# PrimaNota

クラシックピアノ名曲の「冒頭の一音」を聴き、画面上の鍵盤で音を確かめながら
音名・作曲家・曲名を当てて楽しむ、フロントエンド完結型のWebアプリです。

## 概要

- ランダムに選ばれた1曲の冒頭音（単音 or 和音）を、和音のみ/0.5秒/1秒の3段階の
  長さで再生（いずれも実際の演奏を再現するSoundFontシンセで再生）
- 画面上のピアノ鍵盤をクリック、またはPCキーボード（QWERTY配列）で自由に演奏できる
  （正誤判定はしない）。Ctrlキーを押している間はサスティンペダルのように和音を重ねられる
- 「回答を見る」で音名・作曲家・曲名・冒頭数小節の楽譜を表示し、該当する鍵盤をハイライト
- 回答表示後は曲全体を再生・停止・シークできる
- 主要な操作（試聴・回答・次の問題・プレイバック）にワンキーのショートカットがあり、
  マウスに触れずキーボードだけでも一通り操作できる

## 構成

このリポジトリは2つのパートで構成されています。

- `tools/` — MIDIデータの取得・解析・データセット生成を行うオフライン前処理（Python）
- `web/` — クイズ本体のWebアプリ（Vite + TypeScript）

前処理の成果物である `web/src/data/pieces.json` を通じてのみ両者は接続されており、
Webアプリの実行時にMIDIファイルを扱うことはありません。

## セットアップ

### 前処理（tools/）

```
cd tools
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

MIDIのダウンロードからデータセット生成までは以下の順で実行します
（`data/midi/` はGit管理外のため、手元で再取得が必要です）。

```
python3 fetch_catalog.py      # piano-midi.de から曲目一覧を取得 -> catalog_raw.yaml
python3 download_midi.py      # catalog.yaml に載っている28曲をダウンロード
python3 analyze_midi.py       # 冒頭音を抽出 -> report.md
python3 build_dataset.py      # web/src/data/pieces.json と web/public/playback/*.mid を生成
```

### Webアプリ（web/）

```
cd web
npm install
npm run dev      # 開発サーバー
npm run build    # 本番ビルド (dist/)
```

## データソースとライセンス

出題対象の楽曲そのもの（バッハ、ショパンなど）はいずれも各国の著作権保護期間が
終了したパブリックドメインの作品です。以下のライセンス表記は、その演奏を収録した
**MIDIデータ**（演奏情報）の著作権に関するものであり、楽曲自体に著作権が存在するわけ
ではありません。

MIDIデータは [piano-midi.de](http://piano-midi.de/)（Bernd Krueger氏）より、
[CC BY-SA 3.0 Germany](http://creativecommons.org/licenses/by-sa/3.0/de/deed.en)
ライセンスのもと使用しています。[copy.htm](http://piano-midi.de/copy.htm) には
「著作権者名（Bernd Krueger）と出典（http://www.piano-midi.de）を表示すること」
「（改変物を含め）再配布・公開再生は同一ライセンス条件でのみ許可する」の2点が
明記されており、前者はフッタに、後者は本セクション・`web/src/data/LICENSE`・
`web/public/playback/LICENSE`（後述）で満たしています。
冒頭音の試聴（3段階）・回答パネルでの曲全体プレイバックはいずれも、元のMIDIファイルではなく、
音符・ペダル情報から自前で再生成した派生MIDIファイル（`web/public/playback/`、曲ごとに
`<id>.mid`（曲全体）/ `<id>_chord.mid`（和音のみ）/ `<id>_0500.mid`（0.5秒）/
`<id>_1000.mid`（1秒）の4種）を使用しています。画面上の鍵盤をクリック/キーボードで
弾いたときの音だけは、この派生MIDIとは別の自作の加算合成シンセ（サンプル音源なし）で鳴らしています。

冒頭音の試聴・回答パネルの音源プレイバックには、以下のサードパーティ製ソフトウェアを使用しています。

- [spessasynth_lib](https://github.com/spessasus/spessasynth_lib)（Apache License 2.0） —
  SoundFontベースのMIDI再生ライブラリ
- [GeneralUser GS](https://github.com/mrbumpy409/GeneralUser-GS)（S. Christian Collins氏、
  GeneralUser GS License v2.0） — ピアノ音色を含むSoundFont。私的利用・商用利用ともに
  改変・再配布が無償で許可されており、帰属表示の義務もありません（同梱ファイルへの
  直接リンクは避けてほしいとのみ要望されているため、本リポジトリでは実体をローカルに
  同梱しています）。ライセンス全文は `web/public/soundfonts/GeneralUser-GS-LICENSE.txt`
  に同梱しています

## ライセンス

本リポジトリのソースコード（`tools/`, `web/`。ただし下記を除く）は MIT License の
もとで公開しています。
MIDIデータ由来の派生データ（`web/src/data/pieces.json` 内の音高・音価・楽譜情報、
および `web/public/playback/` の派生MIDIファイル）は、元データのライセンス
（上記 CC BY-SA 3.0 Germany）を継承し、MITではありません。誤って混同されないよう、
`web/src/data/LICENSE` と `web/public/playback/LICENSE` にそれぞれの適用範囲・
ライセンス条件を明記しています。同梱のSoundFont（`web/public/soundfonts/`）は
上記の通りさらに別ライセンス（GeneralUser GS License v2.0）です。
