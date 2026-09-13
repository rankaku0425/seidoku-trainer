# 精読トレーナー（01_精読トレーナー）

## 概要
文章を一文ずつ丁寧に読み進め、語句の意味や文章全体の内容を問う設問に答えることで「精読力」を鍛える学習アプリ。
問題文・設問・講評はすべて Anthropic Claude API（`claude-sonnet-4-6`）が生成する。青空文庫（著作権切れの文学作品）からの出題にも対応している。

## 技術スタック
- フロントエンド: React 18 + Vite
- バックエンド: Express.js（`server.js`）
- AI: `@anthropic-ai/sdk`（Claude API）
- 青空文庫連携: `adm-zip`（作品一覧のZIP展開）, `iconv-lite`（Shift_JIS/UTF-8デコード）

## 開発コマンド
- `npm run dev` — フロント（Vite, port 5174）とバックエンド（Express）を同時起動
- `npm run build` — フロントエンドを本番ビルド（`dist/`）
- `npm start` — 本番モードでサーバー起動（`NODE_ENV=production`）
- `node --check server.js` — サーバーコードの構文チェック（ビルドコマンドが存在しないため）

変更後は必ず `npm run build` と `node --check server.js` の両方で確認すること。

## ディレクトリ構成
- `server.js` — Express サーバー。Claude APIへのプロンプト構築・呼び出し、青空文庫の検索・本文取得・抜粋作成のAPIをすべて集約
- `src/App.jsx` — 画面遷移の管理（`select` → `reading` → `result` / `dashboard`）
- `src/components/` — 各画面・UI部品
  - `TextSelector.jsx` — 文章の選び方（サンプル/AI生成/青空文庫）の入口
  - `TextGenerator.jsx` — AIによるオリジナル文章生成
  - `AozoraSelector.jsx` / `AozoraFullTextModal.jsx` — 青空文庫の検索・抜粋設定・開始位置選択モーダル
  - `SentenceReader.jsx` — 一文ずつ読み進める精読画面
  - `QuestionPanel.jsx` — 設問回答UI
  - `ResultSummary.jsx` — 採点結果・AIによる総評
  - `GrowthDashboard.jsx` / `RadarChart.jsx` — 成長記録（カテゴリ別正答率の推移）
  - `OnboardingGuide.jsx` — 初回利用時の使い方ガイド
- `src/hooks/useSimulatedProgress.js` — ストリーミングされないAI呼び出し用の疑似進捗率表示フック（経過時間から指数関数的に95%へ漸近）
- `src/utils/textUtils.js` — マーカー記法 `【①語句】` ・ルビ記法 `漢字《かんじ》` のパース、文分割など
- `src/utils/growthHistory.js` — 成長記録の保存・集計（localStorage）
- `src/data/` — サンプル文章・デフォルト設問・スキルカテゴリ定義

## 重要な設計・実装ルール

### マーカー記法とルビ記法
- 下線部（マーキング）は `【①語句】`〜`【⑩語句】` の丸数字10種類のみ。`src/utils/textUtils.js` の `parseMarkedText` でパースする
- ルビは `漢字《かんじ》` 形式。`parseRubyText` でパースする
- **マーキングした語句は必ずどれか1つの設問（`markerRef`）から参照されなければならない**。AIの出力だけでは保証できないため、`server.js` の `reconcileMarkers()` がサーバー側で未使用マーカーを本文から除去し、残りを①から連番に振り直す後処理を行っている。マーカー関連のプロンプトを変更する際はこの関数の整合性も確認すること

### AIプロンプトの構成（server.js）
- `/api/prepare-reading` — 文章へのマーキング・ルビ付与・設問生成・語句注釈の生成を1回のAI呼び出しでまとめて行う
- `/api/aozora-excerpt` — 青空文庫作品からの抜粋作成。抜粋開始位置は3モード対応
  - `auto`（デフォルト）: AIが冒頭付近から自動選定
  - `text`: ユーザーが「〜というところから」のような説明文を入力し、AIが該当箇所を探す
  - `offset`: `AozoraFullTextModal` で選んだ文の文字位置（`startOffset`）を渡し、AIにその位置から開始させる
- `/api/aozora-fulltext` — モーダル表示用に作品全文を返す（`fetchAozoraWork` を再利用）
- `/api/summary` — 採点結果に基づく総評（読解スタイル・良かった点・改善点・次の練習）を生成

### 旧字体・古い言い回しへの対応
青空文庫作品には「午后」「云う」のような旧字体・古い訓読みが頻出するため、`/api/prepare-reading` のプロンプトで以下を明示している。
- 現代では読みづらい旧字体・古い訓読みにはルビを振る（青空文庫系の文章はルビをやや多めに許容）
- 「午后」→「午後のこと」のように、現代表記・言い方を注釈（annotations）で示す

## CSS・デザインのルール
- 全体のデザイン言語は「フラット・枠線ベースの紙のような質感」。`--card` / `--border` / `--radius` / `--radius-sm` などのCSS変数を使い、既存コンポーネント（`.onboarding-modal`, `.simple-length-tabs` など）のパターンを踏襲すること
- **AIっぽい過剰装飾（シャドウのみのカード、パステルカラーのバッジ、跳ねるドットのローダーなど）は使わない** — 過去に指摘され除去された経緯がある
- 縦書きモード（`.text-vertical`）は、本文列（`.preview-text` / `.full-text`）にのみ `height: 100%` を適用すること。リード文・注釈など短い内容の列に同じ高さを適用すると、枠いっぱいに間延びして見切れたように見えるバグが過去に発生した。行間・余白は詰めすぎても読みにくくなるため、変更時はスクリーンショットで確認しながら調整する

## 進捗表示
AI呼び出し（採点・総評・問題準備・抜粋作成など）はストリーミングされないため、`useSimulatedProgress(active)` フックで疑似的な%表示を行う。実測できない処理なので、離散的なジャンプではなく指数関数的に95%へ滑らかに近づく実装にしていること（100%で止まらず、95%で待ち続ける形にする）。
