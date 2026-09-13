import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import Anthropic from '@anthropic-ai/sdk';
import AdmZip from 'adm-zip';
import iconv from 'iconv-lite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
// Vercel等のリバースプロキシ経由でも実クライアントIPを取得できるようにする（express-rate-limitの精度に必要）
app.set('trust proxy', 1);
// 長文の貼り付け・青空文庫の抜粋も想定し、デフォルト(100kb)より大きめに上限を設定する
app.use(express.json({ limit: '2mb' }));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Claude APIを呼び出すエンドポイント用のレート制限（コスト増大・乱用を防ぐ）
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'リクエストが多すぎます。しばらく待ってから再度お試しください。' },
});

// 検索・全文取得などAI呼び出しを伴わない軽量エンドポイント用のレート制限
const lightLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'リクエストが多すぎます。しばらく待ってから再度お試しください。' },
});

const difficultyGuide = {
  '小学1〜2年生': 'ひらがな中心・非常に平易な問い。主語と述語の確認が中心。選択肢形式を多用。',
  '小学3〜4年生': '平易な言葉で問う。接続詞や指示語の初歩的な問いを含める。',
  '小学5〜6年生': '説明文の構造を意識した問い。接続詞・指示語・文の役割。',
  '中学1年生': '基本的な読解問題。主語・文の役割・接続関係の確認。',
  '中学2年生': '標準的な読解問題。指示語・接続詞・文の機能を問う。',
  '中学3年生': '高校入試レベル。文の論理的役割・語彙・論理関係を問う。',
  '高校1年生': '論理的な読解問題。文の機能・論証の構造・語彙。',
  '高校2年生': '大学入試を意識した問い。抽象的な内容の把握・含意。',
  '高校3年生': '最難関レベル。批判的な読み・メタな問い・論証評価。',
  '大学1〜2年生': '学術的な読解問題。論証の評価・概念の把握・含意の分析。',
  '大学3〜4年生': '高度な批判的読解。論理構造の分析・専門的な議論の評価。',
};

const levelMap = {
  '初級': '中学1年生', '初級〜中級': '中学2年生', '中級': '中学3年生',
  '中級〜上級': '高校1年生', '上級': '高校3年生',
};

/* ===== 青空文庫連携 ===== */

const AOZORA_LIST_URL = 'https://www.aozora.gr.jp/index_pages/list_person_all_extended_utf8.zip';
const AOZORA_LIST_TTL_MS = 24 * 60 * 60 * 1000; // 24時間。長期起動時も青空文庫側の更新をいずれ反映する
let aozoraListCache = null;
let aozoraListCachedAt = 0;
let aozoraListLoading = null;

// ダブルクォート囲みのCSV1行をパースする（フィールド内カンマ・エスケープされた""に対応）
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

// 青空文庫の全作品一覧を取得し、著作権切れ（作品・著者ともに）の作品のみを抽出してキャッシュする
async function getAozoraList() {
  if (aozoraListCache && Date.now() - aozoraListCachedAt < AOZORA_LIST_TTL_MS) return aozoraListCache;
  if (aozoraListLoading) return aozoraListLoading;

  aozoraListLoading = (async () => {
    const res = await fetch(AOZORA_LIST_URL);
    if (!res.ok) throw new Error('青空文庫の一覧取得に失敗しました');
    const buf = Buffer.from(await res.arrayBuffer());
    const zip = new AdmZip(buf);
    const entry = zip.getEntries().find((e) => e.entryName.endsWith('.csv'));
    const csvText = zip.readFile(entry).toString('utf8').replace(/^\uFEFF/, '');
    const lines = csvText.split(/\r?\n/).filter(Boolean);

    const header = parseCsvLine(lines[0]);
    const col = (name) => header.indexOf(name);
    const iWorkId = col('作品ID');
    const iTitle = col('作品名');
    const iWorkFlag = col('作品著作権フラグ');
    const iPersonFlag = col('人物著作権フラグ');
    const iLastName = col('姓');
    const iFirstName = col('名');
    const iRole = col('役割フラグ');
    const iHtmlUrl = col('XHTML/HTMLファイルURL');
    const iHtmlEncoding = col('XHTML/HTMLファイル符号化方式');
    const iCardUrl = col('図書カードURL');

    // CSVは「作品×人物」の組み合わせごとに1行のため、同じ作品でも著者・翻訳者・校訂者が別々の行に分かれている。
    // 作品IDでグループ化し、役割フラグ（著者/翻訳者/編者/校訂者）ごとに人名をまとめる。
    // これにより「同じタイトルだが訳者が違う」別作品（例: 同名の海外小説の異なる訳者版）を見分けられるようにする
    const worksById = new Map();
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (cols[iWorkFlag] !== 'なし' || cols[iPersonFlag] !== 'なし') continue; // 著作権切れのみ
      if (!cols[iHtmlUrl]) continue; // 本文ファイルがあるもののみ

      const workId = cols[iWorkId];
      if (!worksById.has(workId)) {
        worksById.set(workId, {
          workId,
          title: cols[iTitle],
          htmlUrl: cols[iHtmlUrl],
          htmlEncoding: cols[iHtmlEncoding] || 'ShiftJIS',
          cardUrl: cols[iCardUrl],
          authors: [],
          translators: [],
          editors: [],
        });
      }
      const work = worksById.get(workId);
      const name = `${cols[iLastName]}${cols[iFirstName]}`;
      if (cols[iRole] === '著者') work.authors.push(name);
      else if (cols[iRole] === '翻訳者') work.translators.push(name);
      else if (cols[iRole] === '編者' || cols[iRole] === '校訂者') work.editors.push(name);
    }

    const list = [...worksById.values()].map((w) => {
      let note = null;
      if (w.translators.length) note = `${w.translators.join('・')}訳`;
      else if (w.editors.length) note = `${w.editors.join('・')}校訂`;
      return {
        workId: w.workId,
        title: w.title,
        author: w.authors.length ? w.authors.join('・') : (w.editors[0] ?? ''),
        note,
        htmlUrl: w.htmlUrl,
        htmlEncoding: w.htmlEncoding,
        cardUrl: w.cardUrl,
      };
    });
    aozoraListCache = list;
    aozoraListCachedAt = Date.now();
    return list;
  })();

  try {
    return await aozoraListLoading;
  } finally {
    aozoraListLoading = null;
  }
}

// 青空文庫の作品検索（タイトル・著者名の部分一致、著作権切れのみ）
app.get('/api/aozora-search', lightLimiter, async (req, res) => {
  const q = (req.query.q ?? '').trim();
  if (!q) return res.json({ results: [] });

  try {
    const list = await getAozoraList();
    const keywords = q.split(/\s+/).filter(Boolean);
    const results = list
      .filter((item) => keywords.every((kw) => item.title.includes(kw) || item.author.includes(kw)))
      .slice(0, 30)
      .map(({ workId, title, author, note, cardUrl }) => ({ workId, title, author, note, cardUrl }));
    res.json({ results });
  } catch (err) {
    console.error('aozora-search error:', err);
    res.status(500).json({ error: '青空文庫の検索に失敗しました' });
  }
});

// 青空文庫のXHTML本文からルビ等を除去してプレーンテキスト化する
function extractAozoraPlainText(html) {
  const match = html.match(/<div class="main_text">([\s\S]*?)<div class="bibliographical_information"/);
  let body = match ? match[1] : html;

  body = body.replace(/<rt>[\s\S]*?<\/rt>/g, '');   // ふりがなの読みを除去
  body = body.replace(/<rp>[\s\S]*?<\/rp>/g, '');   // ふりがなの括弧を除去
  body = body.replace(/<br\s*\/?>/g, '\n');         // 改行に変換
  body = body.replace(/<[^>]+>/g, '');              // 残りのタグを除去
  body = body.replace(/〔[^〕]*〕/g, '');            // 入力者注記（外字・傍点指定等）を除去

  body = body
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');

  return body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

// 指定作品の本文を取得（Shift_JIS/UTF-8を自動判定してデコード）
async function fetchAozoraWork(workId) {
  const list = await getAozoraList();
  const item = list.find((w) => w.workId === workId);
  if (!item) throw new Error('作品が見つかりません（著作権切れの作品のみ利用できます）');

  const res = await fetch(item.htmlUrl);
  if (!res.ok) throw new Error('本文の取得に失敗しました');
  const buf = Buffer.from(await res.arrayBuffer());
  const encoding = item.htmlEncoding === 'UTF-8' ? 'utf8' : 'Shift_JIS';
  const html = iconv.decode(buf, encoding);

  return { item, plainText: extractAozoraPlainText(html) };
}

// 作品全文を取得（開始位置をユーザーが自分で選ぶモーダル用）
app.get('/api/aozora-fulltext', lightLimiter, async (req, res) => {
  const { workId } = req.query;

  try {
    const { item, plainText } = await fetchAozoraWork(workId);
    res.json({ title: item.title, author: item.author, content: plainText });
  } catch (err) {
    console.error('aozora-fulltext error:', err);
    res.status(500).json({ error: '全文の取得に失敗しました' });
  }
});

// AIによる抜粋作成（原文はそのまま抜き出し、必要な場合のみリード文を付す）
app.post('/api/aozora-excerpt', aiLimiter, async (req, res) => {
  const { workId, difficulty, sentenceCount, startMode, startText, startOffset } = req.body;

  try {
    const { item, plainText } = await fetchAozoraWork(workId);
    const resolvedDifficulty = levelMap[difficulty] ?? difficulty ?? '中学3年生';
    const guide = difficultyGuide[resolvedDifficulty] ?? '中学3年生向けの標準的な読解問題。';
    const targetSentences = sentenceCount || 8;

    // 開始位置の指定方法によって、AIに渡す原文の範囲と開始位置の指示を変える
    // - offset: モーダルで選んだ文の文字位置がそのまま渡ってくる（最も正確）
    // - text: 「〜というところから」のような説明文が渡ってくる（AIが該当箇所を探す）
    // - それ以外（未指定）: 従来通りAIが冒頭付近から自動で選ぶ
    let sourceText;
    let startInstruction;
    if (startMode === 'offset' && typeof startOffset === 'number') {
      const before = plainText.slice(Math.max(0, startOffset - 1000), startOffset);
      const after = plainText.slice(startOffset, startOffset + 10000);
      sourceText = `${before}\n\n【ここから抜粋を開始する指定位置】\n\n${after}`;
      // マーカーが長い文章の中に埋もれて見落とされることがあるため、
      // 指定位置の直前・直後の短い文字列も明示的に引用して、開始位置をより確実に伝える
      const ANCHOR_CHARS = 60;
      const beforeAnchor = plainText.slice(Math.max(0, startOffset - ANCHOR_CHARS), startOffset);
      const afterAnchor = plainText.slice(startOffset, startOffset + ANCHOR_CHARS);
      startInstruction = `・抜粋の開始位置は「【ここから抜粋を開始する指定位置】」の直後の文から始めること。それより前の部分は抜粋には含めず、リード文作成のための文脈把握にのみ使うこと
・指定位置の目印: 直前は「…${beforeAnchor}」で終わり、直後は「${afterAnchor}…」から始まる箇所である。この文字列に一致する箇所を必ず正確に探して開始位置とすること`;
    } else if (startMode === 'text' && startText) {
      sourceText = plainText.slice(0, 20000);
      startInstruction = `・抜粋の開始位置は、原文中で「${startText}」が示す箇所（またはその説明に意味的に最も近い箇所）から始めること`;
    } else {
      sourceText = plainText.slice(0, 10000);
      startInstruction = '・抜粋の開始位置はこの範囲内から、精読練習として適切な箇所をAIが判断して選ぶこと';
    }

    const prompt = `あなたは日本語の国語教材編集者です。青空文庫で公開されている著作権切れの文学作品から、精読練習用の抜粋を作成してください。

【作品情報】
タイトル: ${item.title}
作者: ${item.author}

【原文（この範囲内から選ぶこと）】
${sourceText}

【条件】
・難易度: ${resolvedDifficulty}（${guide}）
・文の数: ちょうど${targetSentences}文程度
${startInstruction}
・原文の表現を一切変更せず、そのまま抜き出すこと（要約・言い換え・現代語訳は禁止）
・意味のまとまりがあり、精読練習として読みやすい一続きの箇所を選ぶこと
・句点「。」の直後で始まり、句点で終わるようにすること
・選んだ箇所が原文の冒頭から始まっていない場合のみ、読者が状況をつかめるよう、原文中でそれより前に書かれている内容にもとづいた短いリード文（2〜3文程度）を作成すること
・選んだ箇所が原文の冒頭からそのまま始まる場合はリード文をnullにすること
・リード文は原文に書かれていない出来事を創作しないこと

以下のJSON形式のみで返してください（説明不要）:
{
  "leadText": "リード文（不要な場合はnull）",
  "excerpt": "原文からそのまま抜き出した本文"
}`;

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('JSON not found');
    const data = JSON.parse(match[0]);

    res.json({
      title: item.title,
      author: item.author,
      source: `青空文庫「${item.title}」${item.author}`,
      cardUrl: item.cardUrl,
      leadText: data.leadText || null,
      content: (data.excerpt ?? '').trim(),
    });
  } catch (err) {
    console.error('aozora-excerpt error:', err);
    res.status(500).json({ error: '抜粋の作成に失敗しました' });
  }
});

// 精読準備：下線部マーキング + 全文を通した問題生成
app.post('/api/prepare-reading', aiLimiter, async (req, res) => {
  const { content, title, difficulty, questionCount, leadText } = req.body;

  const resolvedDifficulty = levelMap[difficulty] ?? difficulty ?? '中学3年生';
  const guide = difficultyGuide[resolvedDifficulty] ?? '中学3年生向けの標準的な読解問題。';
  const countInstruction = questionCount ? `ちょうど${questionCount}問` : '4〜6問';

  const prompt = `あなたは日本語読解教育の専門家です。以下の文章を精読練習用に加工し、問題を作成してください。

【文章タイトル】
${title}
${leadText ? `\n【リード文（本文の前置き。マーキング・問題作成の対象外、文脈把握のみに使用）】\n${leadText}\n` : ''}
【文章本文】
${content}

【難易度】${resolvedDifficulty}（${guide}）

【指示】
1. 文章中の重要な語句・表現を4〜6箇所選び、「【①語句】」「【②語句】」...の形式でマーキングしてください
   ・マーキングは文章の流れを変えずに語句をそのまま囲むこと
   ・丸数字は①②③④⑤⑥のみ使用すること
   ・マーキングは【文章本文】の範囲内のみに行い、リード文には行わないこと
   ・マーキングした語句は必ずすべて、対応する設問（questionsのmarkerRefでその番号を参照するもの）を作成すること。設問にしない語句にはマーキングしないこと
2. マークした語句を参照した問題と、文章全体を通した問題を合わせて${countInstruction}作成してください
   ・「下線部①の〜とはどういう意味か」などの語句問題
   ・文章全体の主旨・筆者の意図・論理構造・段落の役割など
   ・難易度に応じた問い方にすること（低学年は選択肢多め、高学年は記述多め）
   ・各設問には、その設問がどの読解スキルを測るかを示す"category"を必ず次のいずれか1つで指定してください
     - "main_idea"（主旨・要点把握）
     - "vocabulary"（語句・語彙理解）
     - "reference"（指示語・接続語の理解）
     - "structure"（論理構造・段落関係の把握）
     - "emotion"（心情・意図の読み取り）
     - "expression"（記述・要約力）
   ・設問全体でカテゴリーが偏りすぎないよう、できるだけ多様なcategoryを含めること
3. 選択肢（radio）は3〜5個程度
4. 記述問題（text）のうち1問以上は、文字数を指定した設問にしてください
   ・例:「〜を40字以内で説明しなさい」「〜を30〜40字でまとめなさい」
   ・その場合は質問文に文字数条件を明記し、charLimitフィールドに具体的な数値を設定すること
   ・文字数指定のない記述問題はcharLimitをnullにすること
5. ルビは「漢字《かんじ》」の形式でmarkedContent内の該当箇所に直接埋め込んでください。ただし振りすぎないよう、対象は次のいずれかに該当するものだけに厳しく絞ること
   ・その学年の教育漢字・常用漢字の学習範囲を明らかに超える漢字（学年より2〜3学年以上上で習う漢字など）
   ・音読み・訓読み以外の特殊な読み方（熟字訓、当て字、人名・地名の特殊読みなど）
   ・同じ漢字でも文脈によって読みが変わり誤読しやすいもの
   ・旧字体や古い漢字表記・現代ではあまり使われない訓読み（例:「云う」の「云」に「い」、「這入る」に「はいる」など）で、現代の読み方に馴染みがなく読み間違えやすいもの
   　（例）中学生であれば「協力」「困難」「経験」のような、その学年で当然読めると考えられる標準的な熟語にはルビを振らないこと。学年の読解力を過小評価しないこと
   ・青空文庫の作品など、旧仮名遣い・古い言い回しが多く読みにくい文章の場合は、上記の基準に該当する語句にはルビをやや多めに振ってよい
   ・ルビの追加以外は元の文章の文字・語順・句読点を一切変更しないこと
   ・①〜⑩でマーキングした語句の内部にルビを振っても構いません
6. 【難易度】の学年にとって特に意味が難しく、取り上げる必要性が高い語句がある場合のみ、annotationsフィールドに「term」（語句）と「explanation」（ごく短いやさしい言い換え）として出力してください
   ・該当する語句がなければannotationsは空配列[]で構いません。無理に語句を探して数を埋める必要はありません
   ・①〜⑩でマーキングして意味を問う設問にしている語句は、annotationsには含めないこと（設問と注釈で意味の説明が重複しないようにする）
   ・「午后」「兎に角」「所謂」のような旧字体・古い漢字表記や、現代ではあまり使われない言い回しが含まれる場合は積極的に取り上げ、現代での表記・言い方を示すこと（例:「午后」→「午後のこと」）
   ・explanationは10〜20字程度の短い言い換えのみとし、詳しい説明や背景解説は書かないこと
   ・本文（markedContent）には注釈番号などは一切埋め込まないこと。本文への追加はマーキングとルビのみ

以下のJSON形式のみで返してください（説明不要）:
{
  "markedContent": "【①重要語句】やルビ「漢字《かんじ》」を埋め込んだ文章本文（改行なし、元の文章と同じ構造）",
  "questions": [
    {
      "id": "q1",
      "type": "text",
      "question": "下線部①の「語句」とはどういう意味ですか？",
      "hint": "ヒント（不要ならnull）",
      "markerRef": 1,
      "charLimit": null,
      "category": "vocabulary"
    },
    {
      "id": "q2",
      "type": "radio",
      "question": "この文章全体で筆者が最も言いたいことはどれですか？",
      "hint": null,
      "options": ["選択肢1", "選択肢2", "選択肢3"],
      "markerRef": null,
      "charLimit": null,
      "category": "main_idea"
    },
    {
      "id": "q3",
      "type": "text",
      "question": "この文章の要旨を40字以内でまとめなさい。",
      "hint": null,
      "markerRef": null,
      "charLimit": { "min": null, "max": 40 },
      "category": "expression"
    }
  ],
  "annotations": [
    { "term": "難しい語句", "explanation": "その学年向けのやさしい説明" }
  ]
}`;

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('JSON not found');
    const data = JSON.parse(match[0]);
    const { markedContent, questions } = reconcileMarkers(data.markedContent, data.questions);
    res.json({ ...data, markedContent, questions });
  } catch (err) {
    console.error('prepare-reading error:', err);
    res.status(500).json({ error: '問題準備に失敗しました' });
  }
});

// AIがマーキングした①〜⑩のうち、どの設問からも参照されていないものを本文から取り除き、
// 残ったマーカーを①から連番に振り直す（設問のmarkerRefも合わせて付け替える）。
// プロンプト指示だけではAIの出力ミスを完全には防げないため、サーバー側で保証する
function reconcileMarkers(markedContent, questions) {
  const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
  if (!markedContent) return { markedContent, questions };

  const usedRefs = new Set((questions ?? []).map((q) => q.markerRef).filter((r) => r != null));

  const markerMap = new Map(); // 元の番号 -> 新しい番号（未使用なら null）
  let nextNumber = 1;
  const findRegex = /【([①②③④⑤⑥⑦⑧⑨⑩])([^】]+)】/g;
  let match;
  while ((match = findRegex.exec(markedContent)) !== null) {
    const oldNumber = CIRCLED.indexOf(match[1]) + 1;
    if (!markerMap.has(oldNumber)) {
      markerMap.set(oldNumber, usedRefs.has(oldNumber) ? nextNumber++ : null);
    }
  }

  const newMarkedContent = markedContent.replace(
    /【([①②③④⑤⑥⑦⑧⑨⑩])([^】]+)】/g,
    (full, circle, word) => {
      const newNumber = markerMap.get(CIRCLED.indexOf(circle) + 1);
      return newNumber == null ? word : `【${CIRCLED[newNumber - 1]}${word}】`;
    }
  );

  const newQuestions = (questions ?? []).map((q) => {
    if (q.markerRef == null) return q;
    return { ...q, markerRef: markerMap.get(q.markerRef) ?? null };
  });

  return { markedContent: newMarkedContent, questions: newQuestions };
}

// 文字数指定の条件を満たしているかチェック
function checkCharLimit(charLimit, text) {
  if (!charLimit || (charLimit.min == null && charLimit.max == null)) return null;
  const len = (text ?? '').length;
  const { min, max } = charLimit;
  const ok = (min == null || len >= min) && (max == null || len <= max);
  const label = min != null && max != null
    ? `${min}〜${max}字`
    : max != null ? `${max}字以内`
    : `${min}字以上`;
  return { ok, len, label };
}

// 文字数条件を無視した模範解答が来た場合に、その設問の模範解答だけを作り直す
async function regenerateModelAnswer(question, label, title, content, leadText) {
  const prompt = `あなたは日本語読解指導の専門家です。次の文章と設問について、模範解答を1つ作成してください。

【文章タイトル】${title}
${leadText ? `\n【リード文（本文の前置き）】\n${leadText}\n` : ''}
【文章本文】
${content}

【設問】
${question}

【条件】
・模範解答は必ず${label}に収まる文字数で書くこと（この条件を最優先で厳守すること）
・文章の内容に基づいた自然な日本語で書くこと

以下のJSON形式のみで返してください（説明不要）:
{ "actual": "模範解答の文章" }`;

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]).actual ?? null;
  } catch (err) {
    console.error('regenerateModelAnswer error:', err);
    return null;
  }
}

// 全文を通したフィードバック生成
app.post('/api/feedback', aiLimiter, async (req, res) => {
  const { content, title, questions, answers, leadText } = req.body;

  // AIの正誤判定に頼らず、文字数指定の設問は事前にチェックしておく
  const charChecks = {};
  for (const q of questions ?? []) {
    const check = checkCharLimit(q.charLimit, answers?.[q.id]);
    if (check) charChecks[q.id] = check;
  }

  const answersText = (questions ?? []).map((q, i) => {
    const check = charChecks[q.id];
    let note = '';
    if (check) {
      note = check.ok
        ? `\n   [文字数チェック: OK（${check.label}の条件を満たす ${check.len}字）]`
        : `\n   [文字数チェック: NG（${check.label}の条件を満たさない ${check.len}字）※このため内容に関わらず誤答です]`;
      note += `\n   [この設問のactual（模範解答）は必ず${check.label}に収まる文字数で書くこと]`;
    }
    return `Q${i + 1}. ${q.question}\n   回答: 「${answers?.[q.id] || '（未回答）'}」${note}`;
  }).join('\n');

  const prompt = `あなたは日本語読解指導の専門家です。生徒が文章全体を読んで問題に回答した内容を評価してください。

【文章タイトル】${title}
${leadText ? `\n【リード文（本文の前置き）】\n${leadText}\n` : ''}
【文章本文（下線部マーキング済み）】
${content}

【問題と回答】
${answersText}

【評価方針】
・記述問題は完全一致でなくても、意味が合っていれば正解とする
・下線部に関する問いは、文脈から意味を正しく読み取れているか評価する
・選択肢問題は明確に正誤判定する
・各問いへのコメントは励ましを含む1文で
・文字数条件が指定されている設問のactual（模範解答）は、必ずその条件の文字数に収まるように書くこと。条件を無視して長い/短い模範解答を書かないこと

以下のJSON形式のみで返答してください（説明不要）:
{
  "feedbackItems": [
    {
      "id": "q1",
      "correct": true,
      "actual": "正解の答え（または正解の方向性）",
      "comment": "この問いについての短いコメント（1文）"
    }
  ],
  "overallComment": "全体的な励ましとアドバイス（1〜2文）"
}`;

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('JSON not found in response');
    const data = JSON.parse(match[0]);

    const questionById = Object.fromEntries((questions ?? []).map((q) => [q.id, q]));

    // AIの判定を鵜呑みにせず、文字数NGの設問は強制的に誤答扱いにする
    // また、模範解答（actual）が文字数条件を無視していた場合はその設問だけ作り直す
    data.feedbackItems = await Promise.all((data.feedbackItems ?? []).map(async (item) => {
      let result = item;

      const userCheck = charChecks[item.id];
      if (userCheck && !userCheck.ok) {
        result = {
          ...result,
          correct: false,
          comment: `文字数指定（${userCheck.label}）を満たしていません。あなたの回答は${userCheck.len}字でした。文字数を調整して書き直してみましょう。`,
        };
      }

      const q = questionById[item.id];
      if (q?.charLimit) {
        const actualCheck = checkCharLimit(q.charLimit, result.actual);
        if (actualCheck && !actualCheck.ok) {
          const regenerated = await regenerateModelAnswer(q.question, actualCheck.label, title, content, leadText);
          if (regenerated) {
            result = { ...result, actual: regenerated };
          }
        }
      }

      return result;
    }));

    res.json(data);
  } catch (err) {
    console.error('feedback error:', err);
    res.status(500).json({ error: 'フィードバック生成に失敗しました' });
  }
});

// セッション終了後の総評生成
app.post('/api/summary', aiLimiter, async (req, res) => {
  const { title, content, result, leadText } = req.body;

  const questionLog = (result.questions ?? []).map((q, i) => {
    const fi = (result.feedbackItems ?? []).find((f) => f.id === q.id);
    return `Q${i + 1}. ${q.question}\n   回答: 「${result.answers?.[q.id] || 'なし'}」 / 正解: 「${fi?.actual || '—'}」 / ${fi?.correct ? '○' : '×'}\n   コメント: ${fi?.comment || '—'}`;
  }).join('\n\n');

  const prompt = `以下は生徒が「${title}」という文章全体を精読した結果です。
${leadText ? `\n【リード文（本文の前置き）】\n${leadText}\n` : ''}
【文章本文】
${content}

【問題と回答の記録】
${questionLog}

以下のJSON形式のみで総評を返してください:
{
  "score": 75,
  "strongPoints": ["良かった点1", "良かった点2"],
  "weakPoints": ["改善点1"],
  "readingPattern": "この生徒の読解パターンを1文で（例: '語句の意味把握は得意ですが、文章全体の論理構造を読み取るのが苦手な傾向があります'）",
  "nextSteps": "次回の練習で意識すべきことを具体的に1〜2文で"
}`;

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('JSON not found');
    res.json(JSON.parse(match[0]));
  } catch (err) {
    console.error('summary error:', err);
    res.status(500).json({ error: '総評生成に失敗しました' });
  }
});

// 文章生成（ストリーミング SSE）
app.post('/api/generate-text', aiLimiter, async (req, res) => {
  const { theme, sentenceCount, difficulty } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const diffGuide = {
    '小学1〜2年生': 'ひらがな・カタカナ中心、漢字は小学1〜2年生レベル。1文は20〜30字程度と短く。身近でわかりやすい内容。',
    '小学3〜4年生': '漢字は小学3〜4年生レベル。少し論理的な説明文。わかりやすい接続詞を使う。',
    '小学5〜6年生': '漢字は小学5〜6年生レベル。説明文の形式を意識した論理展開。',
    '中学1年生': '基本的な評論文の語彙と表現。接続詞を意識した論理的な文章。',
    '中学2年生': '標準的な評論文。やや抽象的な概念も扱う。',
    '中学3年生': '高校入試レベルの評論文。明確な主張と根拠の構造。',
    '高校1年生': '難度の高い語彙と論理展開。',
    '高校2年生': '大学入試を意識した評論文レベル。',
    '高校3年生': '大学入試最難関レベル。哲学・社会・文化への深い考察を含む。',
    '大学1〜2年生': '学術的な語彙と論理構造。専門用語の初歩的な使用。',
    '大学3〜4年生': '高度な学術的文章。専門的な議論と深い論考を含む。',
  };

  const guide = diffGuide[difficulty] ?? '中学3年生向けの標準的な評論文。';

  const prompt = `あなたは日本語教育の専門家です。精読練習用の文章を生成してください。

【条件】
・テーマ: ${theme}
・難易度: ${difficulty}（${guide}）
・文数: ちょうど${sentenceCount}文
・各文は必ず「。」で終わること
・文章全体が一つのテーマについて論じる、まとまりのある評論文・説明文にすること
・論理的な構造（主張→理由→具体例→まとめ、または問題提起→考察→結論など）を必ず持たせること
・接続詞（しかし・なぜなら・例えば・したがって・つまり・また・さらに・一方で）を自然に使うこと
・精読トレーニングとして、文間の論理関係が明確になるよう意識すること

文章本文のみを出力してください。タイトル・番号・説明・前置きは一切不要です。`;

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    stream.on('text', (text) => {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    stream.on('error', (err) => {
      console.error('stream error:', err);
      res.write(`data: ${JSON.stringify({ error: '生成中にエラーが発生しました' })}\n\n`);
      res.end();
    });

    await stream.finalMessage();
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('generate error:', err);
    res.write(`data: ${JSON.stringify({ error: '文章生成に失敗しました' })}\n\n`);
    res.end();
  }
});

// 本番環境: Reactビルドを配信（Vercelでは静的ファイルはプラットフォーム側が配信するため不要）
if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  app.use(express.static(join(__dirname, 'dist')));
  app.get('*', (_, res) => res.sendFile(join(__dirname, 'dist', 'index.html')));
}

// Vercel（サーバーレス関数）ではapp.listenせず、api/index.jsからこのExpressアプリをそのままエクスポートする
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`APIサーバー起動: http://localhost:${PORT}`);
  });
}

export default app;
