import { useEffect, useMemo, useState } from 'react';

// 文ごとに、原文（content）中での開始位置（文字インデックス）を計算する
function splitSentencesWithOffsets(content) {
  const rawSegments = content.split(/(?<=。)/);
  const sentences = [];
  let cursor = 0;
  for (const raw of rawSegments) {
    const leadingWhitespace = raw.match(/^\s*/)[0].length;
    const trimmed = raw.trim();
    if (trimmed.length > 0) {
      sentences.push({ text: trimmed, offset: cursor + leadingWhitespace });
    }
    cursor += raw.length;
  }
  return sentences;
}

export default function AozoraFullTextModal({ workId, onSelect, onClose }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedOffset, setSelectedOffset] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/aozora-fulltext?workId=${encodeURIComponent(workId)}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setContent(data.content);
      } catch {
        if (!cancelled) setError('全文の取得に失敗しました。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workId]);

  const sentences = useMemo(() => (content ? splitSentencesWithOffsets(content) : []), [content]);

  const handleConfirm = () => {
    const sentence = sentences.find((s) => s.offset === selectedOffset);
    if (sentence) onSelect(selectedOffset, sentence.text);
  };

  return (
    <div className="aozora-fulltext-overlay" onClick={onClose}>
      <div className="aozora-fulltext-modal" onClick={(e) => e.stopPropagation()}>
        <div className="aozora-fulltext-header">
          <h3>本文から開始位置を選ぶ</h3>
          <button type="button" className="aozora-fulltext-close" onClick={onClose}>✕</button>
        </div>
        <p className="aozora-fulltext-hint">抜粋を始めたい文をクリックして選んでください。</p>

        {loading && <p className="loading-message">本文を読み込んでいます...</p>}
        {error && <p className="error-message">{error}</p>}

        {!loading && !error && (
          <div className="aozora-fulltext-body">
            {sentences.map((s) => (
              <span
                key={s.offset}
                role="button"
                tabIndex={0}
                className={`aozora-fulltext-sentence ${selectedOffset === s.offset ? 'selected' : ''}`}
                onClick={() => setSelectedOffset(s.offset)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedOffset(s.offset);
                  }
                }}
              >
                {s.text}
              </span>
            ))}
          </div>
        )}

        <div className="aozora-fulltext-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleConfirm}
            disabled={selectedOffset == null}
          >
            ここから抜粋する
          </button>
        </div>
      </div>
    </div>
  );
}
