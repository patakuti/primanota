# PrimaNota

クラシックピアノ名曲の「冒頭の一音」を聴き、画面上の鍵盤で音を確かめながら
音名・作曲家・曲名を当てて楽しむ、フロントエンド完結型のWebアプリです。

## 概要

- ランダムに選ばれた1曲の冒頭音（単音 or 和音）を再生
- 画面上のピアノ鍵盤をクリックして自由に音を確認できる（正誤判定はしない）
- 「回答を見る」で音名・作曲家・曲名・冒頭数小節の楽譜を表示

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
python3 build_dataset.py      # web/src/data/pieces.json を生成
```

### Webアプリ（web/）

```
cd web
npm install
npm run dev      # 開発サーバー
npm run build    # 本番ビルド (dist/)
```

## データソースとライセンス

MIDIデータは [piano-midi.de](http://piano-midi.de/)（Bernd Krueger氏）より、
[CC BY-SA 3.0 Germany](http://creativecommons.org/licenses/by-sa/3.0/de/deed.en)
ライセンスのもと使用しています（[copy.htm](http://piano-midi.de/copy.htm) の記載を確認し、
求められている表記要件（著作権者名・出典元へのリンク）を満たす形でフッタに掲載しています）。

## ライセンス

本リポジトリのソースコード（`tools/`, `web/`）は MIT License のもとで公開しています。
MIDIデータ由来の派生データ（`web/src/data/pieces.json` 内の音高・音価・楽譜情報）は、
元データのライセンス（上記 CC BY-SA 3.0 Germany）を継承します。
