import { useRef, useState } from 'react';
import { useSimulatedProgress } from '../hooks/useSimulatedProgress';

export default function QuestionPanel({ questions, answers, onChange, onSubmit, loading, error, hintUsedIds, onUseHint, onFocusQuestion }) {
  const submitProgress = useSimulatedProgress(loading);
  const [showMissing, setShowMissing] = useState(false);
  const blockRefs = useRef({});

  const isAnswered = (q) => {
    const a = answers[q.id];
    return a !== undefined && a.trim().length > 0;
  };
  const allAnswered = questions.length > 0 && questions.every(isAnswered);

  const handleChange = (id, value) => {
    onChange({ ...answers, [id]: value });
  };

  const handleSubmitClick = () => {
    if (loading) return;
    if (!allAnswered) {
      setShowMissing(true);
      const firstMissing = questions.find((q) => !isAnswered(q));
      if (firstMissing) {
        blockRefs.current[firstMissing.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    setShowMissing(false);
    onSubmit();
  };

  const hasAnyHint = questions.some((q) => q.hint);

  return (
    <div className="question-panel">
      <h3>問題</h3>
      {hasAnyHint && <p className="hint-note">ヒント使用回数は成長記録に記録されます</p>}

      {questions.map((q, index) => (
        <div
          key={q.id}
          ref={(el) => { blockRefs.current[q.id] = el; }}
          className={`question-block ${showMissing && !isAnswered(q) ? 'question-block-missing' : ''}`}
          onFocus={() => q.markerRef != null && onFocusQuestion?.(q.markerRef)}
          onMouseEnter={() => q.markerRef != null && onFocusQuestion?.(q.markerRef)}
          onMouseLeave={() => onFocusQuestion?.(null)}
        >
          <div className="question-header">
            <span className="q-number">Q{index + 1}</span>
            <span className="q-text">{q.question}</span>
          </div>
          {showMissing && !isAnswered(q) && (
            <p className="q-missing-note">この設問にまだ回答していません</p>
          )}

          {q.hint && (
            hintUsedIds?.has(q.id) ? (
              <p className="q-hint revealed">ヒント: {q.hint}</p>
            ) : (
              <button
                type="button"
                className="hint-toggle-btn"
                onClick={() => onUseHint?.(q.id)}
                disabled={loading}
              >
                ヒントを見る
              </button>
            )
          )}

          {q.type === 'text' && hasCharLimit(q.charLimit) && (
            <div className="char-limit-field">
              <textarea
                className="text-input textarea-input"
                rows={3}
                placeholder="答えを入力してください"
                value={answers[q.id] ?? ''}
                onChange={(e) => handleChange(q.id, e.target.value)}
                disabled={loading}
              />
              <CharCounter value={answers[q.id] ?? ''} limit={q.charLimit} />
            </div>
          )}

          {q.type === 'text' && !hasCharLimit(q.charLimit) && (
            <input
              type="text"
              className="text-input"
              placeholder="答えを入力してください"
              value={answers[q.id] ?? ''}
              onChange={(e) => handleChange(q.id, e.target.value)}
              disabled={loading}
            />
          )}

          {q.type === 'radio' && (
            <div className="radio-group">
              {(q.options ?? []).map((opt) => (
                <label
                  key={opt}
                  className={`radio-card ${answers[q.id] === opt ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name={q.id}
                    value={opt}
                    checked={answers[q.id] === opt}
                    onChange={(e) => handleChange(q.id, e.target.value)}
                    disabled={loading}
                  />
                  <span className="radio-label">{opt}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ))}

      {error && <p className="error-message">{error}</p>}

      <button
        className="btn-primary submit-btn"
        onClick={handleSubmitClick}
        disabled={loading || questions.length === 0}
      >
        {loading ? (
          <span className="btn-loading">
            <span className="loading-spinner-sm" />
            採点しています... {submitProgress}%
          </span>
        ) : '回答する →'}
      </button>
    </div>
  );
}

function hasCharLimit(charLimit) {
  return !!charLimit && (charLimit.min != null || charLimit.max != null);
}

function CharCounter({ value, limit }) {
  const len = value.length;
  const { min, max } = limit;
  const ok = (min == null || len >= min) && (max == null || len <= max);
  const label = min != null && max != null
    ? `${min}〜${max}字`
    : max != null ? `${max}字以内`
    : `${min}字以上`;

  return (
    <p className={`char-counter ${ok ? 'ok' : 'over'}`}>
      {len}字 / {label}
    </p>
  );
}
