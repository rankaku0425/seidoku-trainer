import { useState, useEffect, useRef } from 'react';
import { saveSession } from '../utils/growthHistory';
import { useSimulatedProgress } from '../hooks/useSimulatedProgress';

export default function ResultSummary({ text, result, onRestart, onViewDashboard }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const savedRef = useRef(false);
  const summaryProgress = useSimulatedProgress(loading);

  useEffect(() => {
    fetchSummary();
  }, []);

  useEffect(() => {
    if (savedRef.current) return;
    savedRef.current = true;

    const items = result.feedbackItems ?? [];
    const questions = result.questions ?? [];
    const categories = {};
    items.forEach((fi) => {
      const q = questions.find((qq) => qq.id === fi.id);
      const key = q?.category ?? 'main_idea';
      if (!categories[key]) categories[key] = { correct: 0, total: 0 };
      categories[key].total += 1;
      if (fi.correct) categories[key].correct += 1;
    });

    saveSession({
      title: text.title,
      correctCount: items.filter((f) => f.correct).length,
      totalCount: items.length,
      categories,
    });
  }, []);

  const fetchSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: text.title,
          content: text.content,
          result,
          leadText: text.leadText ?? null,
        }),
      });
      if (!res.ok) throw new Error();
      setSummary(await res.json());
    } catch {
      setError('総評の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const items = result.feedbackItems ?? [];
  const correctCount = items.filter((f) => f.correct).length;

  return (
    <div className="result-summary">
      <h2>精読完了！</h2>
      <p className="text-title">「{text.title}」</p>

      {/* スコア */}
      <div className="score-card">
        <div className="score-counts">
          <div className="score-count correct">
            <span className="count-mark">○</span>
            <span className="count-num">{correctCount}</span>
            <span className="count-label">正解</span>
          </div>
          <span className="score-sep">|</span>
          <div className="score-count incorrect">
            <span className="count-mark">×</span>
            <span className="count-num">{items.length - correctCount}</span>
            <span className="count-label">不正解</span>
          </div>
        </div>
        {!loading && summary?.score != null && (
          <p className="score-points">
            {summary.score}<span className="score-points-unit">点</span>
          </p>
        )}
        <p className="score-detail">全{items.length}問</p>
        {result.hintsUsedCount > 0 && (
          <p className="hint-usage-badge">ヒント使用回数: {result.hintsUsedCount}回</p>
        )}
      </div>

      {/* 問題ごとの振り返り */}
      <h3>問題ごとの振り返り</h3>
      <div className="sentence-review-list">
        {items.map((fi, i) => {
          const question = (result.questions ?? []).find((q) => q.id === fi.id);
          return (
            <div
              key={fi.id}
              className={`sentence-review-card ${fi.correct ? 'all-correct' : 'has-mistake'}`}
            >
              <div className="review-header">
                <span className="review-num">Q{i + 1}</span>
                <span className="review-status">
                  {fi.correct ? '正解' : '要復習'}
                </span>
              </div>
              {question && (
                <p className="review-sentence">{question.question}</p>
              )}
              <div className="review-details-text">
                <span className="feedback-answer">
                  あなたの回答: {result.answers?.[fi.id] || '（未回答）'}
                </span>
                {fi.actual && (
                  <span className="feedback-model-answer">模範解答: {fi.actual}</span>
                )}
              </div>
              {fi.comment && (
                <p className="feedback-comment">{fi.comment}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* 講評 */}
      {loading && <p className="loading-message">講評を作成しています... {summaryProgress}%</p>}
      {error && (
        <div className="error-message">
          {error}
          <button
            onClick={fetchSummary}
            style={{ marginLeft: 12, textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: 'inherit', fontFamily: 'inherit' }}
          >
            再試行
          </button>
        </div>
      )}
      {summary && (
        <div className="ai-summary">
          <h3>講評</h3>
          <div className="summary-pattern">
            <span className="pattern-label">あなたの読解スタイル</span>
            <p>{summary.readingPattern}</p>
          </div>
          <div className="summary-grid">
            {summary.strongPoints.length > 0 && (
              <div className="summary-strong">
                <h4>よかった点</h4>
                <ul>
                  {summary.strongPoints.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            {summary.weakPoints.length > 0 && (
              <div className="summary-weak">
                <h4>改善点</h4>
                <ul>
                  {summary.weakPoints.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="next-steps">
            <h4>次の練習で意識すること</h4>
            <p>{summary.nextSteps}</p>
          </div>
        </div>
      )}

      <div className="result-actions">
        <button className="btn-primary" onClick={onRestart}>
          別のテキストに挑戦
        </button>
        <button
          className="btn-secondary"
          onClick={() => window.location.reload()}
        >
          同じテキストを再挑戦
        </button>
        {onViewDashboard && (
          <button className="btn-secondary" onClick={onViewDashboard}>
            成長記録を見る
          </button>
        )}
      </div>
    </div>
  );
}
