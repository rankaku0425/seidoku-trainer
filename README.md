# 精読トレーナー

文章を**一文ずつ**丁寧に読み進め、語句や文章全体の理解を問う設問に答えることで「精読力」を鍛えるWebアプリです。問題文・設問・採点・総評はすべてAnthropic Claude APIが生成します。

## コンセプト

読解力の土台は「速く読む」ことではなく、一文一文を正確に読み取る「精読」の力にあります。しかし独学で精読を鍛えようとしても、自分の読み方が正しいか判定してくれる相手がいないと練習が難しいという課題があります。本アプリは、AIに文章・設問・採点・講評をすべて生成させることで、一人でも精読の反復練習ができる環境を提供します。

## 機能

- **一文ずつ読み進める精読モード**：本文をハイライトしながら1文ずつ読み、読み終えたら設問に回答
- **4つのテキスト入手方法**
  - サンプルテキスト（初級〜上級、複数ジャンル収録）
  - 自分でテキストを入力
  - AIによる文章生成（テーマ・難易度・分量を指定）
  - 青空文庫（著作権切れ作品）から検索・抜粋。抜粋の開始位置は「AIにおまかせ」「文章で指定」「本文から選ぶ（モーダルで文をクリック）」の3通りに対応。同名の別作品（訳者・校訂者違い）も検索結果で区別可能
- **AIによる自動採点・フィードバック**：設問ごとのコメントと模範解答、セッション全体の総評（読解スタイル・良かった点・改善点・次の練習）
- **難しい語句へのルビ・注釈**：学年を超える漢字や旧字体・古い言い回しに自動でルビ・言い換えを付与（不要な場合は無理に付与しない）
- **成長記録**：カテゴリ別（主旨把握・語彙・指示語・構造・心情・記述力）の正答率をレーダーチャートで可視化し、localStorageに蓄積
- **音読機能**：Web Speech APIによるテキスト読み上げ（速度・音声選択可）
- **縦書き表示**：横書き・縦書きを切り替えて読める

## 画面の流れ

```
テキスト選択 (select)
   │  サンプル / 自分で入力 / AI生成 / 青空文庫 から文章を選ぶ
   ▼
精読画面 (reading)
   │  一文ずつ読み進める → 全文読了後、設問（QuestionPanel）に回答
   │  回答ごとにAIが即時採点・フィードバック
   ▼
結果画面 (result)          成長記録 (dashboard)
   総合スコア・AIによる総評      過去セッションの正答率推移を
   （読解スタイル分析）           カテゴリ別レーダーチャートで確認
```

初回利用時は `OnboardingGuide` が使い方を案内します。

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

### コマンド一覧

| コマンド | 内容 |
|---|---|
| `npm run dev` | フロントエンド（Vite, port 5174）とバックエンド（Express, port 3001）を同時起動 |
| `npm run build` | フロントエンドを本番ビルド（`dist/`） |
| `npm start` | 本番モードでExpressサーバーを起動（ビルド済み`dist/`を配信） |
| `node --check server.js` | サーバーコードの構文チェック（バックエンドにはビルドコマンドがないため） |

## Vercelへのデプロイ

このリポジトリは [Vercel](https://vercel.com) にそのままデプロイできる構成になっています。

1. GitHubリポジトリをVercelにImport（`vercel.json` からビルド設定が自動で読み込まれます）
2. プロジェクト設定の **Environment Variables** に `ANTHROPIC_API_KEY` を追加
3. Deploy

`api/index.js` がExpressアプリ（`server.js`）をサーバーレス関数として公開し、`vercel.json` の `rewrites` によって `/api/*` へのリクエストがすべてそこに集約されます。AI生成系のエンドポイントは処理に時間がかかるため、`maxDuration: 60`（秒）を設定しています。

> **注意**：青空文庫作品一覧のキャッシュやレート制限はインメモリで保持しているため、サーバーレス環境ではインスタンスの再起動・並行実行によって効果が限定的になる場合があります（動作自体には影響しません）。

## API エンドポイント

| メソッド・パス | 内容 |
|---|---|
| `GET /api/aozora-search` | 青空文庫の作品検索（タイトル・著者名の部分一致） |
| `GET /api/aozora-fulltext` | 青空文庫作品の全文取得（抜粋開始位置選択モーダル用） |
| `POST /api/aozora-excerpt` | 青空文庫作品からの抜粋作成 |
| `POST /api/prepare-reading` | 文章へのマーキング・ルビ付与・設問生成・語句注釈の生成 |
| `POST /api/feedback` | 設問への回答に対する採点・フィードバック |
| `POST /api/summary` | セッション全体の総評生成 |
| `POST /api/generate-text` | AIによるオリジナル文章生成（SSEでストリーミング） |

AI呼び出しを伴うエンドポイントには1IPあたり15分間に30回、検索・全文取得系には15分間に60回のレート制限を設けています。

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
├── api/
│   └── index.js                  # Vercelサーバーレス関数のエントリーポイント（server.jsをそのまま公開）
├── vercel.json                   # Vercelのビルド・ルーティング設定
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
- 青空文庫の作品は著作権が切れている作品のみを検索・利用対象としています
