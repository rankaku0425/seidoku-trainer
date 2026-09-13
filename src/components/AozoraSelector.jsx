import { useState } from 'react';
import { splitSentences } from '../utils/textUtils';
import { fetchPreparedReading } from '../utils/prepareReadingApi';
import { useSimulatedProgress } from '../hooks/useSimulatedProgress';
import AozoraFullTextModal from './AozoraFullTextModal';

const START_MODE_OPTIONS = [
  { value: 'auto', label: 'AIにおまかせ' },
  { value: 'text', label: '文章で指定' },
  { value: 'offset', label: '本文から選ぶ' },
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

// 難易度に応じたおすすめ問題数（小学校は少なめ、上級ほど多め）
const QUESTION_COUNT_BY_DIFFICULTY = {
  '小学1〜2年生': 3,
  '小学3〜4年生': 3,
  '小学5〜6年生': 4,
  '中学1年生': 4,
  '中学2年生': 4,
  '中学3年生': 5,
  '高校1年生': 5,
  '高校2年生': 5,
  '高校3年生': 6,
  '大学1〜2年生': 6,
  '大学3〜4年生': 6,
};

export default function AozoraSelector({ onUseText }) {
  const [keyword, setKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [searchError, setSearchError] = useState(null);
  const [selectedWork, setSelectedWork] = useState(null);

  const [difficulty, setDifficulty] = useState('中学3年生');
  const [lengthMode, setLengthMode] = useState('simple');
  const [simpleLength, setSimpleLength] = useState('普通');
  const [customLength, setCustomLength] = useState(6);
  const [questionCountMode, setQuestionCountMode] = useState('auto');
  const [customQuestionCount, setCustomQuestionCount] = useState(5);

  const [startMode, setStartMode] = useState('auto');
  const [startText, setStartText] = useState('');
  const [startOffset, setStartOffset] = useState(null);
  const [startPreview, setStartPreview] = useState(null);
  const [showFullTextModal, setShowFullTextModal] = useState(false);

  const [excerpting, setExcerpting] = useState(false);
  const [excerptError, setExcerptError] = useState(null);
  const [excerpt, setExcerpt] = useState(null);
  const [preparedData, setPreparedData] = useState(null);
  const [preparingQuestions, setPreparingQuestions] = useState(false);

  const sentenceCount =
    lengthMode === 'custom'
      ? customLength
      : SIMPLE_LENGTHS.find((l) => l.label === simpleLength)?.sentences ?? 6;

  const questionCount =
    questionCountMode === 'custom'
      ? customQuestionCount
      : QUESTION_COUNT_BY_DIFFICULTY[difficulty] ?? 5;

  const excerptProgress = useSimulatedProgress(excerpting);
  const prepProgress = useSimulatedProgress(preparingQuestions);

  const canExcerpt =
    !excerpting &&
    (startMode !== 'text' || startText.trim().length > 0) &&
    (startMode !== 'offset' || startOffset != null);

  const handleSearch = async () => {
    if (!keyword.trim()) return;
    setSearching(true);
    setSearchError(null);
    setResults([]);
    setSelectedWork(null);
    setExcerpt(null);
    try {
      const res = await fetch(`/api/aozora-search?q=${encodeURIComponent(keyword.trim())}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setResults(data.results ?? []);
      if ((data.results ?? []).length === 0) {
        setSearchError('該当する作品が見つかりませんでした。');
      }
    } catch {
      setSearchError('検索に失敗しました。もう一度お試しください。');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectWork = (work) => {
    setSelectedWork(work);
    setExcerpt(null);
    setExcerptError(null);
    setStartMode('auto');
    setStartText('');
    setStartOffset(null);
    setStartPreview(null);
  };

  const handleExcerpt = async () => {
    if (!selectedWork) return;
    setExcerpting(true);
    setExcerptError(null);
    setExcerpt(null);
    setPreparedData(null);
    try {
      const res = await fetch('/api/aozora-excerpt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workId: selectedWork.workId,
          difficulty,
          sentenceCount,
          startMode,
          startText: startMode === 'text' ? startText.trim() : null,
          startOffset: startMode === 'offset' ? startOffset : null,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!data.content) throw new Error();
      setExcerpt(data);
      setPreparingQuestions(true);
      fetchPreparedReading({
        content: data.content,
        title: data.title,
        difficulty,
        questionCount,
        leadText: data.leadText,
      }).then((prepared) => {
        setPreparedData(prepared);
        setPreparingQuestions(false);
      });
    } catch {
      setExcerptError('抜粋の作成に失敗しました。もう一度お試しください。');
    } finally {
      setExcerpting(false);
    }
  };

  const handleUse = () => {
    if (!excerpt || !preparedData) return;
    onUseText({
      id: `aozora-${selectedWork.workId}`,
      title: excerpt.title,
      level: difficulty,
      source: excerpt.source,
      questionCount,
      leadText: excerpt.leadText,
      content: excerpt.content,
      sentences: splitSentences(excerpt.content),
      ...preparedData,
    });
  };

  return (
    <div className="aozora-selector">
      {/* 検索 */}
      <div className="aozora-search-row">
        <input
          type="text"
          className="text-input"
          placeholder="作品名・作者名で検索（例: 芥川龍之介、こころ）"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
        />
        <button className="btn-primary aozora-search-btn" onClick={handleSearch} disabled={searching || !keyword.trim()}>
          {searching ? '検索中...' : '検索'}
        </button>
      </div>
      <p className="aozora-note">※ 著作権が切れている作品のみを検索します（青空文庫）</p>

      {searchError && <p className="error-message">{searchError}</p>}

      {results.length > 0 && (
        <div className="aozora-results">
          {results.map((work) => (
            <label
              key={work.workId}
              className={`aozora-result-card ${selectedWork?.workId === work.workId ? 'selected' : ''}`}
              onClick={() => handleSelectWork(work)}
            >
              <input
                type="radio"
                name="aozora-work"
                checked={selectedWork?.workId === work.workId}
                onChange={() => handleSelectWork(work)}
              />
              <div className="aozora-result-info">
                <span className="aozora-result-title">{work.title}</span>
                <span className="aozora-result-author">
                  {work.author}
                  {work.note ? `（${work.note}）` : ''}
                </span>
              </div>
            </label>
          ))}
        </div>
      )}

      {/* 抜粋設定 */}
      {selectedWork && (
        <div className="aozora-excerpt-settings">
          <h3>抜粋の設定</h3>

          <div className="gen-field">
            <label className="gen-label">難易度</label>
            <select
              className="gen-select"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
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

          <div className="gen-field">
            <div className="gen-label-row">
              <label className="gen-label">文章の分量</label>
              <button
                className="detail-toggle"
                onClick={() => setLengthMode((m) => (m === 'simple' ? 'custom' : 'simple'))}
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
                </div>
                <input
                  type="range"
                  min={3}
                  max={15}
                  value={customLength}
                  onChange={(e) => setCustomLength(Number(e.target.value))}
                  className="length-slider"
                />
                <div className="slider-endpoints">
                  <span>3文（短め）</span>
                  <span>15文（長め）</span>
                </div>
              </div>
            )}
          </div>

          <div className="gen-field">
            <div className="gen-label-row">
              <label className="gen-label">問題数</label>
              <button
                className="detail-toggle"
                onClick={() => setQuestionCountMode((m) => (m === 'auto' ? 'custom' : 'auto'))}
              >
                {questionCountMode === 'auto' ? 'カスタム設定を開く ▾' : '自動設定に戻す ▴'}
              </button>
            </div>

            {questionCountMode === 'auto' ? (
              <p className="question-count-auto">
                難易度に合わせて自動設定: <strong>{questionCount}問</strong>
              </p>
            ) : (
              <div className="custom-length-slider">
                <div className="slider-value-display">
                  <span className="slider-current">{customQuestionCount}問</span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={8}
                  value={customQuestionCount}
                  onChange={(e) => setCustomQuestionCount(Number(e.target.value))}
                  className="length-slider"
                />
                <div className="slider-endpoints">
                  <span>3問</span>
                  <span>8問</span>
                </div>
              </div>
            )}
          </div>

          <div className="gen-field">
            <label className="gen-label">抜粋の開始位置</label>
            <div className="simple-length-tabs">
              {START_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`length-tab ${startMode === opt.value ? 'active' : ''}`}
                  onClick={() => setStartMode(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {startMode === 'text' && (
              <input
                type="text"
                className="text-input"
                placeholder="例: 主人公が学校に着いたところから"
                value={startText}
                onChange={(e) => setStartText(e.target.value)}
              />
            )}

            {startMode === 'offset' && (
              <div className="start-offset-picker">
                {startPreview ? (
                  <p className="start-offset-preview">選択中: 「{startPreview}」</p>
                ) : (
                  <p className="start-offset-preview empty">まだ選択されていません</p>
                )}
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowFullTextModal(true)}
                >
                  本文を開いて選ぶ
                </button>
              </div>
            )}
          </div>

          <button className="btn-primary" onClick={handleExcerpt} disabled={!canExcerpt}>
            {excerpting ? `抜粋を作成中... ${excerptProgress}%` : 'この作品から抜粋する'}
          </button>

          {excerptError && <p className="error-message">{excerptError}</p>}
        </div>
      )}

      {showFullTextModal && selectedWork && (
        <AozoraFullTextModal
          workId={selectedWork.workId}
          onClose={() => setShowFullTextModal(false)}
          onSelect={(offset, sentenceText) => {
            setStartOffset(offset);
            setStartPreview(sentenceText);
            setShowFullTextModal(false);
          }}
        />
      )}

      {/* 抜粋プレビュー */}
      {excerpt && (
        <div className="aozora-excerpt-preview">
          <h3>抜粋プレビュー</h3>
          <p className="aozora-excerpt-source">{excerpt.source}</p>
          {excerpt.leadText && <p className="lead-text">{excerpt.leadText}</p>}
          <p className="aozora-excerpt-text">{excerpt.content}</p>
          <button className="btn-primary" onClick={handleUse} disabled={!preparedData}>
            {preparedData ? 'この文章で精読練習を始める →' : `問題を準備しています... ${prepProgress}%`}
          </button>
        </div>
      )}
    </div>
  );
}
