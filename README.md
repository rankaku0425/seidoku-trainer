# 精読トレーナー

文章を**一文ずつ**丁寧に読み進め、語句や文章全体の理解を問う設問に答えることで「精読力」を鍛えるWebアプリです。問題文・設問・採点・総評はすべてAnthropic Claude APIが生成します。

## 機能

- **一文ずつ読み進める精読モード**：本文をハイライトしながら1文ずつ読み、読み終えたら設問に回答
- **4つのテキスト入手方法**
  - サンプルテキスト
  - 自分でテキストを入力
  - AIによる文章生成（テーマ・難易度・分量を指定）
  - 青空文庫（著作権切れ作品）から検索・抜粋。抜粋の開始位置は「AIにおまかせ」「文章で指定」「本文から選ぶ（モーダルで文をクリック）」の3通りに対応
- **AIによる自動採点・フィードバック**：設問ごとのコメントと模範解答、セッション全体の総評（読解スタイル・良かった点・改善点）
- **難しい語句へのルビ・注釈**：学年を超える漢字や旧字体・古い言い回しに自動でルビ・言い換えを付与
- **成長記録**：カテゴリ別（主旨把握・語彙・指示語・構造・心情・記述力）の正答率をレーダーチャートで可視化
- **音読機能**：Web Speech APIによるテキスト読み上げ（速度・音声選択可）
- **縦書き表示**：横書き・縦書きを切り替えて読める

## セットアップ

### 1. パッケージインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.example` をコピーして `.env` を作成し、APIキーを設定します。

```bash
cp .env.example .env
```

```
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### 3. 開発サーバー起動

```bash
npm run dev
```

ブラウザで `http://localhost:5174` を開く（フロントエンド:5174 + バックエンド:3001が同時に起動します）。

### 4. 本番ビルド・起動

```bash
npm run build
npm start
```

`npm start` は `NODE_ENV=production` でExpressサーバーを起動し、ビルド済みの `dist/` を配信します（ポートは `.env` の `PORT`、省略時は3001）。

## 技術スタック

| 役割 | 技術 |
|---|---|
| フロントエンド | React 18 + Vite |
| バックエンド | Node.js + Express |
| AI | Claude claude-sonnet-4-6 (Anthropic) |
| 青空文庫連携 | adm-zip（作品一覧のZIP展開）, iconv-lite（Shift_JIS/UTF-8デコード） |
| レート制限 | express-rate-limit |
| スタイル | CSS Variables（フレームワーク不使用） |

## ファイル構成

```
01_精読トレーナー/
├── server.js                     # Express APIサーバー（Claude API呼び出し・青空文庫連携）
├── index.html
├── vite.config.js                # Vite設定（APIプロキシ含む）
├── package.json
└── src/
    ├── App.jsx                   # 画面遷移管理
    ├── index.css                 # 全スタイル
    ├── data/
    │   ├── sampleTexts.js        # サンプルテキスト
    │   ├── defaultQuestions.js   # AI生成失敗時のフォールバック設問
    │   └── skillCategories.js    # 読解スキルのカテゴリ定義
    ├── hooks/
    │   ├── useSimulatedProgress.js # AI呼び出し中の疑似進捗率表示
    │   └── useReadAloud.js       # 音読（Web Speech API）制御
    ├── utils/
    │   ├── textUtils.js          # マーカー・ルビ記法のパース、文分割
    │   ├── growthHistory.js      # 成長記録の保存・集計（localStorage）
    │   └── prepareReadingApi.js  # 問題準備APIの呼び出しラッパー
    └── components/
        ├── TextSelector.jsx      # テキスト選択画面（入口）
        ├── TextGenerator.jsx     # AIによる文章生成
        ├── AozoraSelector.jsx    # 青空文庫の検索・抜粋設定
        ├── AozoraFullTextModal.jsx # 抜粋開始位置を本文から選ぶモーダル
        ├── SentenceReader.jsx    # 精読メイン画面
        ├── QuestionPanel.jsx     # 設問回答UI
        ├── FeedbackPanel.jsx     # AIフィードバック表示
        ├── ResultSummary.jsx     # 結果・総評画面
        ├── GrowthDashboard.jsx   # 成長記録画面
        ├── RadarChart.jsx        # レーダーチャート描画
        └── OnboardingGuide.jsx   # 初回利用時の使い方ガイド
```

## 注意事項

- 本アプリはAnthropic Claude APIを都度呼び出すため、**利用にはAPI利用料金が発生**します
- 乱用・コスト増大を防ぐため、AI呼び出しを伴うAPI（文章生成・問題準備・採点・総評・青空文庫抜粋）には1IPあたり15分間に30回、検索・全文取得系には15分間に60回のレート制限を設けています
- 青空文庫の作品は著作権が切れている作品のみを検索・利用対象としています
