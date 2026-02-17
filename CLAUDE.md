# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Turbopack dev server @ localhost:3000
npm run build      # TypeScript検証 + production build（テストランナー・リンター未導入）
npm start          # production起動
```

**注意:** プロジェクトパスにスペースを含む（`my app list/Agri-Buddyv2`）。Bash操作時は必ずダブルクォートで囲むこと。

## Architecture

音声駆動の営農日誌。長崎県茂木町の枇杷ハウス栽培に特化。Next.js 16 + React 19、ソースは4ファイルのみ。

| File | Role |
|---|---|
| `app/page.tsx` | 全フロントエンド。単一`'use client'`コンポーネント。音声UI・状態マシン・カレンダー・レポート生成・確認画面 |
| `app/api/diagnose/route.ts` | POSTエンドポイント。音声テキストからスロット抽出 → Gemini 2.0 Flash or Mock正規表現 |
| `app/layout.tsx` | ルートレイアウト。Noto Sans JP、暗めオーバーレイの農園背景 |
| `app/globals.css` | Tailwind v4テーマ（`@import "tailwindcss"`構文）、カスタムアニメーション群 |

### State Machine

`Phase`: `IDLE → LISTENING → THINKING → FOLLOW_UP ⇄ BREATHING → CONFIRM → IDLE`

- **FOLLOW_UP**: 未入力フィールド（肥料/病害虫/収穫/費用/作業時間）を順次質問
- **BREATHING**: 質問間の1.5s自然間隔 + 波形アニメーション
- **CONFIRM**: カード形式の編集・確認画面。保存前に全項目を一覧表示

Follow-upはrefsベース（`followUpActiveRef`, `followUpQueueRef`, `pendingDataRef`, `advanceFollowUpRef`）。async境界でのstale closure回避のため。

### API Dual Mode

`NEXT_PUBLIC_MOCK_MODE`で切替:
- `true`: 正規表現スロット抽出。APIキー不要、高速、決定的
- `false`: Gemini 2.0 Flash。完全なNLU + JSON構造化出力

両モード共通: 常に`status: "complete"`を返す（Silent Completionパターン）。不足項目は`missing_hints`で通知のみ。

### Data Flow

音声 → `/api/diagnose` → `ApiResponse` → Follow-up（ローカル処理、追加API呼び出しなし） → Confirm画面 → `saveRec()` → localStorage (`agri-buddy-records`)

起動時に`sanitizeRecords()`が走り、不正データ（-20~60℃外の気温、0~100%外の湿度）をnull化。

## Critical Conventions

- **nullポリシー**: 欠損データにデフォルト値を絶対に使わない。`house_data`は実測値なしなら`null`。表示は`fmtVal()`で"-"
- **バリデーション**: `isValidTemp()` (-20~60℃), `isValidHumidity()` (0~100%) — 抽出時とsanitize時の二重ガード
- **UIアイコン**: lucide-react SVGのみ。絵文字禁止
- **アドバイストーン**: 断定禁止。「〜の可能性」「〜が推奨されます（要確認）」
- **ガラス定数**: `GLASS = 'bg-white/80 backdrop-blur-xl border border-white/30 shadow-lg'`
- **音声コマンド**: `PHOTO_RE = /写真|カメラ|撮って|撮影|撮るよ/`, `SKIP_RE`でスキップ検出
- **Tailwind v4**: `@import "tailwindcss"` 構文。v3の`@tailwind`ディレクティブは使えない
- **全テキスト日本語**: speech `lang="ja-JP"`、UIラベルも全て日本語

## Environment (.env.local)

```
GOOGLE_GEMINI_API_KEY=...        # Gemini APIキー（mock off時必須）
NEXT_PUBLIC_MOCK_MODE=true       # true=正規表現mock, false=Gemini API
NEXT_PUBLIC_APP_NAME=Agri-Buddy  # アプリ表示名
```
