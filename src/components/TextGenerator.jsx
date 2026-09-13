import { useState, useRef, useEffect } from 'react';
import { splitSentences } from '../utils/textUtils';
import { fetchPreparedReading } from '../utils/prepareReadingApi';
import { useSimulatedProgress } from '../hooks/useSimulatedProgress';

// 1文あたりの平均文字数の目安（スライダー表示の45〜60文字の中間値）。生成中の進捗率の推定に使う。
const AVG_CHARS_PER_SENTENCE = 52;

const THEMES = [
  'テクノロジー・AI', '環境・自然', '教育・学習', '歴史・文化',
  '科学・宇宙', '社会・経済', '健康・医療', 'スポーツ',
  '哲学・倫理', '言語・文学', '食・農業', '都市・建築',
];

const DIFFICULTY_OPTIONS = [
  { value: '小学1〜2年生', group: '小学校' },
  { value: '小学3〜4年生', group: '小学校' },
  { value: '小学5〜6年生', group: '小学校' },
  { value: '中学1年生', group: '中学校' },
  { value: '中学2年生', group: '中学校' },
  { value: '中学3年生', group: '中学校' },
  { value: '高校1年生', group: '高校' },
  { value: '高校2年生', group: '高校' },
  { value: '高校3年生', group: '高校' },
  { value: '大学1〜2年生', group: '大学' },
  { value: '大学3〜4年生', group: '大学' },
];

const SIMPLE_LENGTHS = [
  { label: '少なめ', sentences: 4, desc: '4文' },
  { label: '普通',   sentences: 6, desc: '6文' },
  { label: '多め',   sentences: 9, desc: '9文' },
];

// 生成中に表示するヒント（読解のコツ）
const TIPS = [
  '接続詞に注目すると文章の論理構造が見えてきます',
  '主語と述語のつながりを意識しながら読みましょう',
  '「筆者の主張」と「その根拠・具体例」を区別して読むと理解が深まります',
  '指示語（この・その・あの）が何を指しているか確認しながら読む習慣をつけましょう',
  '段落ごとに「何について書いているか」を一言でまとめる練習が効果的です',
];

export default function TextGenerator({ onUseText }) {
  const [theme, setTheme] = useState('');
  const [customTheme, setCustomTheme] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [difficulty, setDifficulty] = useState('中学3年生');
  const [lengthMode, setLengthMode] = useState('simple');
  const [simpleLength, setSimpleLength] = useState('普通');
  const [customLength, setCustomLength] = useState(6);
  const [generating, setGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [tipIndex, setTipIndex] = useState(0);
  const [preparedData, setPreparedData] = useState(null);
  const [preparingQuestions, setPreparingQuestions] = useState(false);
  const abortRef = useRef(null);
  const tipTimerRef = useRef(null);

  const activeTheme = useCustom ? customTheme : theme;
  const sentenceCount =
    lengthMode === 'custom'
      ? customLength
      : SIMPLE_LENGTHS.find((l) => l.label === simpleLength)?.sentences ?? 6;

  const canGenerate = activeTheme.trim().length > 0;

  // 実際に届いた文字数 ÷ 想定文字数で、生成の進み具合を概算する
  const estimatedChars = sentenceCount * AVG_CHARS_PER_SENTENCE;
  const genProgress = Math.min(99, Math.round((generatedText.length / estimatedChars) * 100));
  const prepProgress = useSimulatedProgress(preparingQuestions);

  const handleGenerate = async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setGenerating(true);
    setGeneratedText('');
    setDone(false);
    setError(null);
    setPreparedData(null);
    setPreparingQuestions(false);

    // ヒントをローテーション
    if (tipTimerRef.current) clearInterval(tipTimerRef.current);
    tipTimerRef.current = setInterval(() => {
      setTipIndex((i) => (i + 1) % TIPS.length);
    }, 3500);

    try {
      const res = await fetch('/api/generate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: activeTheme, sentenceCount, difficulty }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error('API error');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') { setDone(true); continue; }
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) setGeneratedText((prev) => prev + parsed.text);
          } catch { /* skip malformed chunk */ }
        }
      }
      setDone(true);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError('文章の生成に失敗しました。もう一度お試しください。');
      }
    } finally {
      setGenerating(false);
      clearInterval(tipTimerRef.current);
    }
  };

  useEffect(() => {
    if (!done || error || preparedData || preparingQuestions) return;
    setPreparingQuestions(true);
    fetchPreparedReading({
      content: generatedText,
      title: activeTheme,
      difficulty,
      questionCount: null,
      leadText: null,
    }).then((prepared) => {
      setPreparedData(prepared);
      setPreparingQuestions(false);
    });
  }, [done, error, generatedText, activeTheme, difficulty]);

  const handleUse = () => {
    if (!preparedData) return;
    const sentences = splitSentences(generatedText);
    onUseText({
      id: 'generated',
      title: activeTheme,
      topic: activeTheme,
      level: difficulty,
      source: 'AI生成',
      content: generatedText,
      sentences,
      ...preparedData,
    });
  };

  return (
    <div className="text-generator">
      {/* 設定フォーム */}
      <div className="gen-settings">

        {/* テーマ */}
        <div className="gen-field">
          <label className="gen-label">テーマ</label>
          <div className="theme-input-row">
            <select
              className="gen-select"
              value={useCustom ? '' : theme}
              onChange={(e) => { setTheme(e.target.value); setUseCustom(false); }}
              disabled={generating}
            >
              <option value="">テーマを選んでください</option>
              {THEMES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <span className="theme-or">または</span>
            <input
              type="text"
              className="text-input gen-custom-input"
              placeholder="自由に入力（例: 宇宙開発）"
              value={customTheme}
              onChange={(e) => {
                setCustomTheme(e.target.value);
                setUseCustom(e.target.value.length > 0);
              }}
              disabled={generating}
            />
          </div>
        </div>

        {/* 難易度 */}
        <div className="gen-field">
          <label className="gen-label">難易度</label>
          <select
            className="gen-select"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            disabled={generating}
          >
            {['小学校', '中学校', '高校', '大学'].map((group) => (
              <optgroup key={group} label={group}>
                {DIFFICULTY_OPTIONS.filter((o) => o.group === group).map((o) => (
                  <option key={o.value} value={o.value}>{o.value}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* 文章の分量 */}
        <div className="gen-field">
          <div className="gen-label-row">
            <label className="gen-label">文章の分量</label>
            <button
              className="detail-toggle"
              onClick={() => setLengthMode((m) => (m === 'simple' ? 'custom' : 'simple'))}
              disabled={generating}
            >
              {lengthMode === 'simple' ? '詳細設定を開く ▾' : 'シンプルに戻す ▴'}
            </button>
          </div>

          {lengthMode === 'simple' ? (
            <div className="simple-length-tabs">
              {SIMPLE_LENGTHS.map((opt) => (
                <button
                  key={opt.label}
                  className={`length-tab ${simpleLength === opt.label ? 'active' : ''}`}
                  onClick={() => setSimpleLength(opt.label)}
                  disabled={generating}
                >
                  {opt.label}
                  <span className="length-hint">{opt.desc}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="custom-length-slider">
              <div className="slider-value-display">
                <span className="slider-current">{customLength}文</span>
                <span className="slider-approx">約{customLength * 45}〜{customLength * 60}文字</span>
              </div>
              <input
                type="range"
                min={3}
                max={15}
                value={customLength}
                onChange={(e) => setCustomLength(Number(e.target.value))}
                className="length-slider"
                disabled={generating}
              />
              <div className="slider-endpoints">
                <span>3文（短め）</span>
                <span>15文（長め）</span>
              </div>
            </div>
          )}
        </div>

        <button
          className="btn-primary gen-btn"
          onClick={handleGenerate}
          disabled={!canGenerate || generating}
        >
          {generating ? `生成中... ${genProgress}%` : '文章を生成する'}
        </button>
      </div>

      {/* 出力エリア */}
      {(generating || generatedText || error) && (
        <div className="gen-output">

          {/* 生成の進捗 */}
          {generating && (
            <div className="gen-progress">
              <div className="progress-bar-container">
                <div className="progress-bar" style={{ width: `${genProgress}%` }} />
              </div>
              <span className="gen-progress-label">{genProgress}%</span>
            </div>
          )}

          {/* 最初のテキストが来る前のローディング表示 */}
          {generating && !generatedText && (
            <div className="gen-loading">
              <p className="gen-loading-text">
                「{activeTheme}」の文章を作成しています<span className="gen-loading-ellipsis">...</span>
              </p>
            </div>
          )}

          {/* ストリーミングテキスト表示 */}
          {generatedText && (
            <div className="gen-text-display">
              <p className="gen-text">
                {generatedText}
                {generating && <span className="gen-cursor" />}
              </p>
            </div>
          )}

          {/* 生成中のヒント（ローテーション） */}
          {generating && (
            <div className="gen-tip" key={tipIndex}>
              <span className="tip-mark">読解のコツ</span>
              <p>{TIPS[tipIndex]}</p>
            </div>
          )}

          {/* エラー */}
          {error && (
            <div className="error-message">
              {error}
              <button
                onClick={handleGenerate}
                style={{ marginLeft: 12, textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: 'inherit', fontFamily: 'inherit', fontSize: 'inherit' }}
              >
                再試行
              </button>
            </div>
          )}

          {/* 完了後のアクション */}
          {done && !generating && !error && (
            <div className="gen-actions">
              <button className="btn-primary" onClick={handleUse} disabled={!preparedData}>
                {preparedData ? 'この文章で精読練習を始める →' : `問題を準備しています... ${prepProgress}%`}
              </button>
              <button className="btn-secondary" onClick={handleGenerate}>
                もう一度生成する
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
